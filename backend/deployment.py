import os
import re
import subprocess
import tempfile
from collections import deque
from typing import Any, Deque, Dict, List, Tuple

from dag import topological_order
from workflow_types import (
    DeployEdge,
    DeployNode,
    DeployWorkflow,
    Edge as DagEdge,
    StreamCredential,
)


def _normalize_stream(stream_type: str) -> str:
    return stream_type or "json"


def _normalize_env_key(stream_type: str) -> str:
    normalized = re.sub(r"[^A-Z0-9]+", "_", stream_type.upper()).strip("_")
    return normalized or "JSON"


def process_workflow(edges: List[DeployEdge], nodes_by_id: Dict[str, DeployNode]) -> int:
    for edge in edges:
        if edge.source not in nodes_by_id:
            raise ValueError(f"Unknown source node '{edge.source}'")
        if edge.target not in nodes_by_id:
            raise ValueError(f"Unknown target node '{edge.target}'")

        src = nodes_by_id[edge.source]
        dst = nodes_by_id[edge.target]
        stream_type = _normalize_stream(edge.data or "json")

        # If stream maps are omitted in incoming payload, infer the stream type from the edge.
        if not src.out_streams:
            src.out_streams.append(stream_type)
        if not dst.in_streams:
            dst.in_streams.append(stream_type)

        if stream_type not in src.out_streams:
            raise ValueError(
                f"Stream type {stream_type} not found in source {src.id} out streams"
            )
        if stream_type not in dst.in_streams:
            raise ValueError(
                f"Stream type {stream_type} not found in destination {dst.id} in streams"
            )

        cred = generate_pub_sub_cred(stream_type, src, dst)
        src.out_creds[stream_type] = cred
        dst.in_creds[stream_type] = cred

    return 200


def queue_deployments(node_list: List[DeployNode], deployment_queue: Deque[DeployNode]) -> int:
    for node in node_list:
        if node.type == "plugin":
            deployment_queue.append(node)
    return 200


def assign_deployment(deployment_queue: Deque[DeployNode]) -> List[str]:
    # Placeholder for scheduler placement. Today this only returns queued plugin IDs.
    return [node.id for node in deployment_queue]


def generate_pub_sub_cred(
    stream_type: str, src: DeployNode, dst: DeployNode
) -> StreamCredential:
    return StreamCredential(
        workspace=f"{src.id}_{dst.id}_{stream_type}_workspace",
        protocol="pubsub",
        stream_id=f"{src.id}_{dst.id}_{stream_type}_stream",
        data_type=stream_type,
        metadata={},
    )


def build_env_vars(node: DeployNode) -> Dict[str, str]:
    env_vars = dict(node.env_vars)
    env_vars["NODE_ID"] = node.id
    env_vars["NODE_TYPE"] = node.type

    for stream_type, cred in node.in_creds.items():
        stream_key = _normalize_env_key(stream_type)
        env_vars[f"IN_{stream_key}_STREAM_ID"] = cred.stream_id
        env_vars[f"IN_{stream_key}_WORKSPACE"] = cred.workspace
        env_vars[f"IN_{stream_key}_PROTOCOL"] = cred.protocol

    for stream_type, cred in node.out_creds.items():
        stream_key = _normalize_env_key(stream_type)
        env_vars[f"OUT_{stream_key}_STREAM_ID"] = cred.stream_id
        env_vars[f"OUT_{stream_key}_WORKSPACE"] = cred.workspace
        env_vars[f"OUT_{stream_key}_PROTOCOL"] = cred.protocol

    return env_vars


def fetch_image_name(node: DeployNode) -> str:
    return node.runtime or node.data.get("runtime") or node.data.get("containerImage") or ""


def inject_vars_to_image(env_vars: Dict[str, str], image_name: str) -> None:
    """
    Inject env_vars via docker compose into the specified image.
    This allows us to set environment variables that can be used by the application
    running in the container.
    """
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yml", delete=False) as tmp_file:
        compose_file = tmp_file.name
        tmp_file.write("services:\n")
        tmp_file.write("  app:\n")
        tmp_file.write(f"    image: {image_name}\n")
        tmp_file.write("    environment:\n")
        for key, value in env_vars.items():
            tmp_file.write(f"      - {key}={value}\n")

    try:
        subprocess.run(["docker", "compose", "-f", compose_file, "up", "-d"], check=True)
    finally:
        if os.path.exists(compose_file):
            os.remove(compose_file)


def _build_adjacency(edges: List[DeployEdge], nodes_by_id: Dict[str, DeployNode]) -> Dict[str, List[str]]:
    adjacency = {node_id: [] for node_id in nodes_by_id.keys()}
    for edge in edges:
        adjacency.setdefault(edge.source, []).append(edge.target)
    return adjacency


def _compute_topological_order(
    nodes_by_id: Dict[str, DeployNode], edges: List[DeployEdge]
) -> Tuple[List[str], Dict[str, List[str]]]:
    dag_edges = [DagEdge(src=edge.source, dst=edge.target) for edge in edges]
    order, graph = topological_order(nodes_by_id.keys(), dag_edges)
    return order, dict(graph)


def deploy(workflow: DeployWorkflow, inject_env: bool = False) -> Dict[str, Any]:
    nodes_by_id = {node.id: node.model_copy(deep=True) for node in workflow.nodes}

    for edge in workflow.edges:
        if edge.source not in nodes_by_id:
            raise ValueError(f"Edge source '{edge.source}' not found in nodes")
        if edge.target not in nodes_by_id:
            raise ValueError(f"Edge target '{edge.target}' not found in nodes")

    topo_order, dag_graph = _compute_topological_order(nodes_by_id, workflow.edges)
    process_workflow(workflow.edges, nodes_by_id)

    ordered_nodes = [nodes_by_id[node_id] for node_id in topo_order]
    deployment_queue: Deque[DeployNode] = deque()
    queue_deployments(ordered_nodes, deployment_queue)
    assigned_nodes = assign_deployment(deployment_queue)

    env_plan: Dict[str, Dict[str, str]] = {}
    injected_nodes: List[str] = []
    skipped_nodes: List[Dict[str, str]] = []

    for node in deployment_queue:
        env_vars = build_env_vars(node)
        env_plan[node.id] = env_vars
        image_name = fetch_image_name(node)

        if not inject_env:
            continue
        if not image_name:
            skipped_nodes.append(
                {"node_id": node.id, "reason": "No runtime/container image found"}
            )
            continue

        inject_vars_to_image(env_vars, image_name)
        injected_nodes.append(node.id)

    creds_by_node: Dict[str, Dict[str, Dict[str, Dict[str, Any]]]] = {}
    for node_id, node in nodes_by_id.items():
        creds_by_node[node_id] = {
            "in_creds": {stream: cred.model_dump() for stream, cred in node.in_creds.items()},
            "out_creds": {stream: cred.model_dump() for stream, cred in node.out_creds.items()},
        }

    return {
        "node_count": len(nodes_by_id),
        "edge_count": len(workflow.edges),
        "topological_order": topo_order,
        "dag_graph": dag_graph,
        "adjacency_list": _build_adjacency(workflow.edges, nodes_by_id),
        "queued_plugins": [node.id for node in deployment_queue],
        "assigned_nodes": assigned_nodes,
        "env_plan": env_plan,
        "injected_nodes": injected_nodes,
        "skipped_nodes": skipped_nodes,
        "credentials_by_node": creds_by_node,
    }

if __name__ == "__main__":
    example_workflow = DeployWorkflow(
        nodes=[
            DeployNode(id="source", type="sender", out_streams=["json"]),
            DeployNode(id="plugin-a", type="plugin", runtime="test_image", in_streams=["json"]),
        ],
        edges=[DeployEdge(source="source", target="plugin-a", data="json")],
    )
    print(deploy(example_workflow, inject_env=False))
