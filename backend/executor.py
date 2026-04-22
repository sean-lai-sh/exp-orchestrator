"""Local Docker executor for DAG-driven container spin-up."""

from __future__ import annotations

import subprocess
from dataclasses import asdict, dataclass, field
from typing import Any

from workflow_types import DeployNode


@dataclass
class ExecutionResult:
    fetched: list[str] = field(default_factory=list)
    started: list[dict[str, Any]] = field(default_factory=list)
    skipped: list[dict[str, str]] = field(default_factory=list)
    rejected: list[dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def resolve_images(deploy_result: dict[str, Any], nodes: list[DeployNode]) -> dict[str, str | None]:
    """Resolve required container images from the deploy queue."""
    node_map = {node.id: node for node in nodes}
    required: dict[str, str | None] = {}

    for node_id in deploy_result.get("queued_plugins", []):
        node = node_map[node_id]
        required[node_id] = node.resolve_runtime()

    return required


def pull_image(image_ref: str) -> bool:
    result = subprocess.run(
        ["docker", "pull", image_ref],
        capture_output=True,
        text=True,
        timeout=300,
    )
    return result.returncode == 0


def start_container(
    node_id: str, image: str, env_vars: dict[str, str], network: str | None = None
) -> str | None:
    cmd = ["docker", "run", "-d", "--name", f"orch-{node_id[:8]}"]
    if network:
        cmd.extend(["--network", network])
    for key, value in env_vars.items():
        cmd.extend(["-e", f"{key}={value}"])
    cmd.append(image)

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    return result.stdout.strip() if result.returncode == 0 else None


def execute_dag(
    deploy_result: dict[str, Any],
    nodes: list[DeployNode],
    approved_images: set[str] | None = None,
) -> ExecutionResult:
    """Execute a deployment plan locally via Docker.

    If ``approved_images`` is provided, it is used instead of re-checking the
    allowlist for every node.
    """
    from allowlist import is_approved, load_allowlist

    result = ExecutionResult()
    required = resolve_images(deploy_result, nodes)

    allowlist = load_allowlist() if approved_images is None else None

    for node_id, image in required.items():
        if image is None:
            result.skipped.append({"node_id": node_id, "reason": "no_runtime_specified"})
            continue

        if approved_images is not None:
            image_ok = image in approved_images
        else:
            image_ok = is_approved(image, allowlist)

        if not image_ok:
            result.rejected.append(
                {"node_id": node_id, "image": image, "reason": "not_on_allowlist"}
            )
            continue

        if not pull_image(image):
            result.skipped.append({"node_id": node_id, "reason": "pull_failed"})
            continue

        result.fetched.append(image)
        env_vars = deploy_result.get("env_plan", {}).get(node_id, {})
        container_id = start_container(node_id, image, env_vars)
        if container_id:
            result.started.append(
                {"node_id": node_id, "container_id": container_id, "image": image}
            )
        else:
            result.skipped.append({"node_id": node_id, "reason": "container_start_failed"})

    return result
