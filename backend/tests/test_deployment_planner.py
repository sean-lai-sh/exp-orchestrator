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
    first = deployment.deploy(linear_workflow, inject_env=False)
    second = deployment.deploy(linear_workflow, inject_env=False)

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
    assert plugin_a_env["IN_JSON_STREAM_ID"] == "source_plugin-a_json_stream"
    assert plugin_a_env["OUT_BYTES_STREAM_ID"] == "plugin-a_plugin-b_bytes_stream"

    plugin_b_env = first["env_plan"]["plugin-b"]
    assert plugin_b_env["PLUGIN_B"] == "ready"
    assert plugin_b_env["IN_BYTES_STREAM_ID"] == "plugin-a_plugin-b_bytes_stream"

    assert first["credentials_by_node"]["source"]["out_creds"]["json"]["workspace"] == (
        "source_plugin-a_json_workspace"
    )
    assert first["credentials_by_node"]["plugin-b"]["in_creds"]["bytes"]["stream_id"] == (
        "plugin-a_plugin-b_bytes_stream"
    )


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
        deployment.deploy(workflow)


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
        deployment.deploy(workflow)


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
        deployment.deploy(workflow)


def test_deploy_infers_streams_when_edge_contract_is_present() -> None:
    workflow = DeployWorkflow(
        nodes=[
            DeployNode(id="source", type="sender"),
            DeployNode(id="plugin-a", type="plugin", runtime="test/plugin-a:latest"),
        ],
        edges=[DeployEdge(source="source", target="plugin-a", data="parquet")],
    )

    result = deployment.deploy(workflow)

    assert result["topological_order"] == ["source", "plugin-a"]
    assert result["env_plan"]["plugin-a"]["IN_PARQUET_STREAM_ID"] == "source_plugin-a_parquet_stream"
    assert result["credentials_by_node"]["source"]["out_creds"]["parquet"]["data_type"] == "parquet"


def test_deploy_injects_env_only_for_plugins_with_images(
    linear_workflow: DeployWorkflow, monkeypatch: pytest.MonkeyPatch
) -> None:
    injected = []

    def fake_inject(env_vars: dict[str, str], image_name: str) -> None:
        injected.append((image_name, env_vars.copy()))

    monkeypatch.setattr(deployment, "inject_vars_to_image", fake_inject)

    result = deployment.deploy(linear_workflow, inject_env=True)

    assert [image_name for image_name, _ in injected] == ["test/plugin-a:latest"]
    assert result["injected_nodes"] == ["plugin-a"]
    assert result["skipped_nodes"] == [
        {"node_id": "plugin-b", "reason": "No runtime/container image found"}
    ]
    assert injected[0][1]["IN_JSON_STREAM_ID"] == "source_plugin-a_json_stream"
    assert injected[0][1]["OUT_BYTES_STREAM_ID"] == "plugin-a_plugin-b_bytes_stream"


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
        {"NODE_ID": "plugin-a", "IN_JSON_STREAM_ID": "stream-1"},
        "repo/image:latest",
    )

    compose_file = captured["compose_file"]
    assert captured["check"] is True
    assert captured["exists_during_run"] is True
    assert "image: repo/image:latest" in captured["content"]
    assert "- NODE_ID=plugin-a" in captured["content"]
    assert "- IN_JSON_STREAM_ID=stream-1" in captured["content"]
    assert not compose_file.exists()
