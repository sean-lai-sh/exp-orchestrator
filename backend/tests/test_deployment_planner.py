from pathlib import Path
from types import SimpleNamespace

import pytest

import deployment
from workflow_types import DeployEdge, DeployNode, DeployWorkflow


@pytest.fixture
def linear_workflow() -> DeployWorkflow:
    return DeployWorkflow(
        nodes=[
            DeployNode(id="source", type="sender", out_streams=["json"]),
            DeployNode(
                id="plugin-a",
                type="plugin",
                runtime="test/plugin-a:latest",
                in_streams=["json"],
                out_streams=["bytes"],
                env_vars={"EXISTING": "1"},
            ),
            DeployNode(
                id="plugin-b",
                type="plugin",
                in_streams=["bytes"],
                env_vars={"PLUGIN_B": "ready"},
            ),
        ],
        edges=[
            DeployEdge(source="source", target="plugin-a", data="json"),
            DeployEdge(source="plugin-a", target="plugin-b", data="bytes"),
        ],
    )


def test_deploy_returns_deterministic_idempotent_plan(linear_workflow: DeployWorkflow) -> None:
    first = deployment.deploy(linear_workflow, deploy_id="abc12345",
                              workspace="workflow_abc12345", inject_env=False)
    second = deployment.deploy(linear_workflow, deploy_id="abc12345",
                               workspace="workflow_abc12345", inject_env=False)

    assert first == second
    assert first["node_count"] == 3
    assert first["edge_count"] == 2
    assert first["topological_order"] == ["source", "plugin-a", "plugin-b"]
    assert first["queued_plugins"] == ["plugin-a", "plugin-b"]
    assert first["assigned_nodes"] == ["plugin-a", "plugin-b"]
    assert first["adjacency_list"] == {
        "source": ["plugin-a"],
        "plugin-a": ["plugin-b"],
        "plugin-b": [],
    }

    plugin_a_env = first["env_plan"]["plugin-a"]
    assert plugin_a_env["EXISTING"] == "1"
    assert plugin_a_env["NODE_ID"] == "plugin-a"
    assert plugin_a_env["NODE_TYPE"] == "plugin"
    assert plugin_a_env["IN_JSON_FROM_SOURCE_STREAM_ID"] == "deploy.abc12345.source_plugin-a_json"
    assert plugin_a_env["OUT_BYTES_TO_PLUGIN_B_STREAM_ID"] == "deploy.abc12345.plugin-a_plugin-b_bytes"
    assert plugin_a_env["IN_JSON_PEERS"] == "SOURCE"
    assert plugin_a_env["OUT_BYTES_PEERS"] == "PLUGIN_B"

    plugin_b_env = first["env_plan"]["plugin-b"]
    assert plugin_b_env["PLUGIN_B"] == "ready"
    assert plugin_b_env["IN_BYTES_FROM_PLUGIN_A_STREAM_ID"] == "deploy.abc12345.plugin-a_plugin-b_bytes"
    assert plugin_b_env["IN_BYTES_PEERS"] == "PLUGIN_A"

    source_out = first["credentials_by_node"]["source"]["out_creds"]
    assert isinstance(source_out, list) and len(source_out) == 1
    assert source_out[0]["workspace"] == "workflow_abc12345"
    assert source_out[0]["peer_id"] == "plugin-a"
    assert source_out[0]["data_type"] == "json"

    # Every credential in the plan uses the same deploy-scoped workspace
    for node_creds in first["credentials_by_node"].values():
        for cred_list in (node_creds["in_creds"], node_creds["out_creds"]):
            for cred in cred_list:
                assert cred["workspace"] == "workflow_abc12345"

    plugin_b_in = first["credentials_by_node"]["plugin-b"]["in_creds"]
    assert len(plugin_b_in) == 1
    assert plugin_b_in[0]["stream_id"] == "deploy.abc12345.plugin-a_plugin-b_bytes"
    assert plugin_b_in[0]["peer_id"] == "plugin-a"


@pytest.mark.parametrize(
    ("edge", "message"),
    [
        (DeployEdge(source="missing", target="plugin-a", data="json"), "Edge source 'missing' not found in nodes"),
        (DeployEdge(source="source", target="missing", data="json"), "Edge target 'missing' not found in nodes"),
    ],
)
def test_deploy_rejects_unknown_edge_endpoints(edge: DeployEdge, message: str) -> None:
    workflow = DeployWorkflow(
        nodes=[
            DeployNode(id="source", type="sender", out_streams=["json"]),
            DeployNode(id="plugin-a", type="plugin", in_streams=["json"]),
        ],
        edges=[edge],
    )

    with pytest.raises(ValueError, match=message):
        deployment.deploy(workflow, deploy_id="test", workspace="workflow_test")


def test_deploy_rejects_cycles() -> None:
    workflow = DeployWorkflow(
        nodes=[
            DeployNode(id="plugin-a", type="plugin", in_streams=["json"], out_streams=["json"]),
            DeployNode(id="plugin-b", type="plugin", in_streams=["json"], out_streams=["json"]),
        ],
        edges=[
            DeployEdge(source="plugin-a", target="plugin-b", data="json"),
            DeployEdge(source="plugin-b", target="plugin-a", data="json"),
        ],
    )

    with pytest.raises(ValueError, match="Cycle detected"):
        deployment.deploy(workflow, deploy_id="test", workspace="workflow_test")


def test_deploy_rejects_stream_contract_mismatch() -> None:
    workflow = DeployWorkflow(
        nodes=[
            DeployNode(id="source", type="sender", out_streams=["json"]),
            DeployNode(id="plugin-a", type="plugin", in_streams=["bytes"]),
        ],
        edges=[DeployEdge(source="source", target="plugin-a", data="json")],
    )

    with pytest.raises(
        ValueError,
        match="Stream type json not found in destination plugin-a in streams",
    ):
        deployment.deploy(workflow, deploy_id="test", workspace="workflow_test")


def test_deploy_infers_streams_when_edge_contract_is_present() -> None:
    workflow = DeployWorkflow(
        nodes=[
            DeployNode(id="source", type="sender"),
            DeployNode(id="plugin-a", type="plugin", runtime="test/plugin-a:latest"),
        ],
        edges=[DeployEdge(source="source", target="plugin-a", data="parquet")],
    )

    result = deployment.deploy(workflow, deploy_id="test", workspace="workflow_test")

    assert result["topological_order"] == ["source", "plugin-a"]
    assert result["env_plan"]["plugin-a"]["IN_PARQUET_FROM_SOURCE_STREAM_ID"] == "deploy.test.source_plugin-a_parquet"
    source_out = result["credentials_by_node"]["source"]["out_creds"]
    assert source_out[0]["data_type"] == "parquet"
    assert source_out[0]["peer_id"] == "plugin-a"


def test_deploy_injects_env_only_for_plugins_with_images(
    linear_workflow: DeployWorkflow, monkeypatch: pytest.MonkeyPatch
) -> None:
    injected = []

    def fake_inject(env_vars: dict[str, str], image_name: str) -> None:
        injected.append((image_name, env_vars.copy()))

    monkeypatch.setattr(deployment, "inject_vars_to_image", fake_inject)

    result = deployment.deploy(linear_workflow, deploy_id="test", workspace="workflow_test", inject_env=True)

    assert [image_name for image_name, _ in injected] == ["test/plugin-a:latest"]
    assert result["injected_nodes"] == ["plugin-a"]
    assert result["skipped_nodes"] == [
        {"node_id": "plugin-b", "reason": "No runtime/container image found"}
    ]
    assert injected[0][1]["IN_JSON_FROM_SOURCE_STREAM_ID"] == "deploy.test.source_plugin-a_json"
    assert injected[0][1]["OUT_BYTES_TO_PLUGIN_B_STREAM_ID"] == "deploy.test.plugin-a_plugin-b_bytes"


def test_inject_vars_to_image_uses_disposable_compose_file(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def fake_run(args: list[str], check: bool) -> SimpleNamespace:
        compose_file = Path(args[3])
        captured["compose_file"] = compose_file
        captured["exists_during_run"] = compose_file.exists()
        captured["content"] = compose_file.read_text()
        captured["check"] = check
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(deployment.subprocess, "run", fake_run)

    deployment.inject_vars_to_image(
        {"NODE_ID": "plugin-a", "IN_JSON_FROM_SOURCE_STREAM_ID": "stream-1"},
        "repo/image:latest",
    )

    compose_file = captured["compose_file"]
    assert captured["check"] is True
    assert captured["exists_during_run"] is True
    assert "image: repo/image:latest" in captured["content"]
    assert "- NODE_ID=plugin-a" in captured["content"]
    assert "- IN_JSON_FROM_SOURCE_STREAM_ID=stream-1" in captured["content"]
    assert not compose_file.exists()


def test_broker_env_injected_for_plugins_only(linear_workflow: DeployWorkflow) -> None:
    broker = {
        "url": "nats://1.2.3.4:4222",
        "token": "secret",
    }
    plan = deployment.deploy(
        linear_workflow,
        deploy_id="abc",
        workspace="workflow_abc",
        broker_creds=broker,
        inject_env=False,
    )
    plugin_a = plan["env_plan"]["plugin-a"]
    assert plugin_a["NATS_URL"] == "nats://1.2.3.4:4222"
    assert plugin_a["NATS_TOKEN"] == "secret"


def test_broker_env_omitted_when_creds_not_provided(linear_workflow: DeployWorkflow) -> None:
    plan = deployment.deploy(
        linear_workflow,
        deploy_id="abc",
        workspace="workflow_abc",
        inject_env=False,
    )
    plugin_a = plan["env_plan"]["plugin-a"]
    assert "NATS_URL" not in plugin_a
    assert "NATS_TOKEN" not in plugin_a


def test_fan_out_same_stream_type_keeps_both_subjects() -> None:
    """One sender publishing the same stream type to two receivers must yield
    two distinct OUT subjects on the source. Regression test for #78."""
    workflow = DeployWorkflow(
        nodes=[
            DeployNode(id="src", type="sender", out_streams=["json"]),
            DeployNode(id="dst-a", type="plugin", in_streams=["json"]),
            DeployNode(id="dst-b", type="plugin", in_streams=["json"]),
        ],
        edges=[
            DeployEdge(source="src", target="dst-a", data="json"),
            DeployEdge(source="src", target="dst-b", data="json"),
        ],
    )

    plan = deployment.deploy(workflow, deploy_id="dep", workspace="ws")
    src_out = plan["credentials_by_node"]["src"]["out_creds"]
    assert len(src_out) == 2
    assert {c["peer_id"] for c in src_out} == {"dst-a", "dst-b"}
    assert {c["stream_id"] for c in src_out} == {
        "deploy.dep.src_dst-a_json",
        "deploy.dep.src_dst-b_json",
    }

    src_env = plan["env_plan"].get("src", {})
    # Sender isn't queued as a plugin so env_plan['src'] is empty; check via
    # build_env_vars directly to confirm env emission for the sender.
    from workflow_types import DeployNode as _DN  # noqa: F401
    src_node = next(n for n in workflow.nodes if n.id == "src")
    # Re-run wiring to get a populated node (deploy() works on a deep copy).
    nodes_by_id = {n.id: n.model_copy(deep=True) for n in workflow.nodes}
    deployment.process_workflow(workflow.edges, nodes_by_id, "ws", "dep")
    env = deployment.build_env_vars(nodes_by_id["src"])
    assert env["OUT_JSON_TO_DST_A_STREAM_ID"] == "deploy.dep.src_dst-a_json"
    assert env["OUT_JSON_TO_DST_B_STREAM_ID"] == "deploy.dep.src_dst-b_json"
    assert set(env["OUT_JSON_PEERS"].split(",")) == {"DST_A", "DST_B"}


def test_fan_in_same_stream_type_keeps_both_subjects() -> None:
    """One receiver fed by two senders of the same stream type must subscribe
    to both subjects. Regression test for #78."""
    workflow = DeployWorkflow(
        nodes=[
            DeployNode(id="src-a", type="sender", out_streams=["json"]),
            DeployNode(id="src-b", type="sender", out_streams=["json"]),
            DeployNode(id="sink", type="plugin", in_streams=["json"]),
        ],
        edges=[
            DeployEdge(source="src-a", target="sink", data="json"),
            DeployEdge(source="src-b", target="sink", data="json"),
        ],
    )

    plan = deployment.deploy(workflow, deploy_id="dep", workspace="ws")
    sink_in = plan["credentials_by_node"]["sink"]["in_creds"]
    assert len(sink_in) == 2
    assert {c["peer_id"] for c in sink_in} == {"src-a", "src-b"}

    sink_env = plan["env_plan"]["sink"]
    assert sink_env["IN_JSON_FROM_SRC_A_STREAM_ID"] == "deploy.dep.src-a_sink_json"
    assert sink_env["IN_JSON_FROM_SRC_B_STREAM_ID"] == "deploy.dep.src-b_sink_json"
    assert set(sink_env["IN_JSON_PEERS"].split(",")) == {"SRC_A", "SRC_B"}


def test_diamond_topology_wires_all_four_edges() -> None:
    """Diamond: A -> B, A -> C, B -> D, C -> D. Every node sees both peers."""
    workflow = DeployWorkflow(
        nodes=[
            DeployNode(id="A", type="sender", out_streams=["json"]),
            DeployNode(id="B", type="plugin", in_streams=["json"], out_streams=["json"]),
            DeployNode(id="C", type="plugin", in_streams=["json"], out_streams=["json"]),
            DeployNode(id="D", type="plugin", in_streams=["json"]),
        ],
        edges=[
            DeployEdge(source="A", target="B", data="json"),
            DeployEdge(source="A", target="C", data="json"),
            DeployEdge(source="B", target="D", data="json"),
            DeployEdge(source="C", target="D", data="json"),
        ],
    )

    plan = deployment.deploy(workflow, deploy_id="dep", workspace="ws")
    creds = plan["credentials_by_node"]

    # A fans out to B and C
    assert {c["peer_id"] for c in creds["A"]["out_creds"]} == {"B", "C"}
    # D fans in from B and C
    assert {c["peer_id"] for c in creds["D"]["in_creds"]} == {"B", "C"}
    # B and C each have one in and one out
    assert {c["peer_id"] for c in creds["B"]["in_creds"]} == {"A"}
    assert {c["peer_id"] for c in creds["B"]["out_creds"]} == {"D"}
    assert {c["peer_id"] for c in creds["C"]["in_creds"]} == {"A"}
    assert {c["peer_id"] for c in creds["C"]["out_creds"]} == {"D"}

    d_env = plan["env_plan"]["D"]
    assert "IN_JSON_FROM_B_STREAM_ID" in d_env
    assert "IN_JSON_FROM_C_STREAM_ID" in d_env
