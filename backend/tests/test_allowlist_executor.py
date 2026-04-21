import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import allowlist
import executor
import main
from workflow_types import DeployEdge, DeployNode, DeployWorkflow


@pytest.fixture
def workflow_with_runtimes() -> DeployWorkflow:
    return DeployWorkflow(
        nodes=[
            DeployNode(id="source", type="sender", out_streams=["json"]),
            DeployNode(
                id="plugin-a",
                type="plugin",
                runtime="approved/plugin-a:1.0",
                in_streams=["json"],
                out_streams=["bytes"],
            ),
            DeployNode(
                id="plugin-b",
                type="plugin",
                runtime="blocked/plugin-b:2.0",
                in_streams=["bytes"],
            ),
            DeployNode(id="plugin-c", type="plugin", in_streams=["bytes"]),
        ],
        edges=[
            DeployEdge(source="source", target="plugin-a", data="json"),
            DeployEdge(source="plugin-a", target="plugin-b", data="bytes"),
            DeployEdge(source="plugin-a", target="plugin-c", data="bytes"),
        ],
    )


def _write_allowlist(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_load_allowlist_returns_empty_when_file_missing(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    allowlist_path = tmp_path / "config" / "allowed_images.json"
    monkeypatch.setattr(allowlist, "ALLOWLIST_PATH", allowlist_path)

    assert allowlist.load_allowlist() == {}


def test_is_approved_supports_exact_and_prefix_matches(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    allowlist_path = tmp_path / "config" / "allowed_images.json"
    _write_allowlist(
        allowlist_path,
        {
            "approved/plugin-a:1.0": {"approved": True, "notes": "exact"},
            "trusted/*": {"approved": True, "notes": "namespace"},
            "blocked/*": {"approved": False, "notes": "rejected"},
        },
    )
    monkeypatch.setattr(allowlist, "ALLOWLIST_PATH", allowlist_path)

    assert allowlist.is_approved("approved/plugin-a:1.0") is True
    assert allowlist.is_approved("trusted/plugin-b:latest") is True
    assert allowlist.is_approved("blocked/plugin-c:latest") is False
    assert allowlist.is_approved("unknown/plugin:latest") is False


def test_check_workflow_images_reports_approval_state(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, workflow_with_runtimes: DeployWorkflow
) -> None:
    allowlist_path = tmp_path / "config" / "allowed_images.json"
    _write_allowlist(
        allowlist_path,
        {
            "approved/plugin-a:1.0": {"approved": True, "notes": "approved"},
            "blocked/*": {"approved": False, "notes": "blocked"},
        },
    )
    monkeypatch.setattr(allowlist, "ALLOWLIST_PATH", allowlist_path)

    result = allowlist.check_workflow_images(workflow_with_runtimes.nodes)

    assert result == {
        "plugin-a": {
            "image": "approved/plugin-a:1.0",
            "approved": True,
            "reason": "on_allowlist",
        },
        "plugin-b": {
            "image": "blocked/plugin-b:2.0",
            "approved": False,
            "reason": "not_on_allowlist",
        },
    }


def test_resolve_images_uses_deploy_queue_order(workflow_with_runtimes: DeployWorkflow) -> None:
    deploy_result = {
        "queued_plugins": ["plugin-b", "plugin-a", "plugin-c"],
        "env_plan": {
            "plugin-a": {"IN_JSON_STREAM_ID": "stream-a"},
            "plugin-b": {"IN_BYTES_STREAM_ID": "stream-b"},
            "plugin-c": {"IN_BYTES_STREAM_ID": "stream-c"},
        },
    }

    result = executor.resolve_images(deploy_result, workflow_with_runtimes.nodes)

    assert result == {
        "plugin-b": "blocked/plugin-b:2.0",
        "plugin-a": "approved/plugin-a:1.0",
        "plugin-c": None,
    }


def test_execute_dag_records_started_rejected_and_skipped_nodes(
    workflow_with_runtimes: DeployWorkflow, monkeypatch: pytest.MonkeyPatch
) -> None:
    deploy_result = {
        "queued_plugins": ["plugin-a", "plugin-b", "plugin-c"],
        "env_plan": {
            "plugin-a": {"TOKEN": "alpha"},
            "plugin-b": {"TOKEN": "beta"},
        },
    }
    pulled_images: list[str] = []
    started_containers: list[tuple[str, str, dict[str, str], str | None]] = []

    monkeypatch.setattr(executor, "is_approved", lambda image: image.startswith("approved/"))

    def fake_pull_image(image_ref: str) -> bool:
        pulled_images.append(image_ref)
        return True

    def fake_start_container(
        node_id: str, image: str, env_vars: dict[str, str], network: str | None = None
    ) -> str | None:
        started_containers.append((node_id, image, env_vars.copy(), network))
        return f"container-{node_id}"

    monkeypatch.setattr(executor, "pull_image", fake_pull_image)
    monkeypatch.setattr(executor, "start_container", fake_start_container)

    result = executor.execute_dag(deploy_result, workflow_with_runtimes.nodes)

    assert result.fetched == ["approved/plugin-a:1.0"]
    assert result.started == [
        {
            "node_id": "plugin-a",
            "container_id": "container-plugin-a",
            "image": "approved/plugin-a:1.0",
        }
    ]
    assert result.rejected == [
        {
            "node_id": "plugin-b",
            "image": "blocked/plugin-b:2.0",
            "reason": "not_on_allowlist",
        }
    ]
    assert result.skipped == [
        {"node_id": "plugin-c", "reason": "no_runtime_specified"}
    ]
    assert pulled_images == ["approved/plugin-a:1.0"]
    assert started_containers == [
        ("plugin-a", "approved/plugin-a:1.0", {"TOKEN": "alpha"}, None)
    ]


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


def test_check_images_endpoint_returns_allowlist_report(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        main,
        "check_workflow_images",
        lambda nodes: {
            "plugin-a": {
                "image": "approved/plugin-a:1.0",
                "approved": True,
                "reason": "on_allowlist",
            }
        },
    )

    response = client.post(
        "/deploy/check-images",
        json={
            "nodes": [
                {"id": "plugin-a", "type": "plugin", "runtime": "approved/plugin-a:1.0"}
            ],
            "edges": [],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Image approval check completed",
        "results": {
            "plugin-a": {
                "image": "approved/plugin-a:1.0",
                "approved": True,
                "reason": "on_allowlist",
            }
        },
    }


def test_execute_endpoint_rejects_unapproved_images_before_running_executor(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    deploy_calls: list[bool] = []
    executor_called = {"value": False}

    def fake_deploy(payload: DeployWorkflow, inject_env: bool = False) -> dict:
        deploy_calls.append(inject_env)
        return {
            "queued_plugins": ["plugin-a"],
            "env_plan": {"plugin-a": {"TOKEN": "alpha"}},
        }

    monkeypatch.setattr(main, "deploy", fake_deploy)
    monkeypatch.setattr(
        main,
        "check_workflow_images",
        lambda nodes: {
            "plugin-a": {
                "image": "blocked/plugin-a:latest",
                "approved": False,
                "reason": "not_on_allowlist",
            }
        },
    )

    def fake_execute_dag(*args, **kwargs):
        executor_called["value"] = True
        raise AssertionError("execute_dag should not run when images are unapproved")

    monkeypatch.setattr(main, "execute_dag", fake_execute_dag)

    response = client.post(
        "/deploy/execute",
        json={
            "nodes": [
                {"id": "plugin-a", "type": "plugin", "runtime": "blocked/plugin-a:latest"}
            ],
            "edges": [],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == {
        "message": "Unapproved runtime images detected",
        "results": {
            "plugin-a": {
                "image": "blocked/plugin-a:latest",
                "approved": False,
                "reason": "not_on_allowlist",
            }
        },
    }
    assert deploy_calls == [False]
    assert executor_called["value"] is False


def test_execute_endpoint_returns_execution_summary(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        main,
        "deploy",
        lambda payload, inject_env=False: {
            "queued_plugins": ["plugin-a"],
            "env_plan": {"plugin-a": {"TOKEN": "alpha"}},
        },
    )
    monkeypatch.setattr(
        main,
        "check_workflow_images",
        lambda nodes: {
            "plugin-a": {
                "image": "approved/plugin-a:1.0",
                "approved": True,
                "reason": "on_allowlist",
            }
        },
    )
    monkeypatch.setattr(
        main,
        "execute_dag",
        lambda deploy_result, nodes: executor.ExecutionResult(
            fetched=["approved/plugin-a:1.0"],
            started=[
                {
                    "node_id": "plugin-a",
                    "container_id": "container-plugin-a",
                    "image": "approved/plugin-a:1.0",
                }
            ],
            skipped=[],
            rejected=[],
        ),
    )

    response = client.post(
        "/deploy/execute",
        json={
            "nodes": [
                {"id": "plugin-a", "type": "plugin", "runtime": "approved/plugin-a:1.0"}
            ],
            "edges": [],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Deploy plan generated and executed",
        "deploy_result": {
            "queued_plugins": ["plugin-a"],
            "env_plan": {"plugin-a": {"TOKEN": "alpha"}},
        },
        "execution_result": {
            "fetched": ["approved/plugin-a:1.0"],
            "started": [
                {
                    "node_id": "plugin-a",
                    "container_id": "container-plugin-a",
                    "image": "approved/plugin-a:1.0",
                }
            ],
            "skipped": [],
            "rejected": [],
        },
    }
