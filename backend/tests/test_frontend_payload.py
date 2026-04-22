"""Contract tests: verify the backend accepts payloads shaped exactly like the frontend produces."""

import deployment
from workflow_types import DeployWorkflow


def test_frontend_shaped_payload_accepted():
    raw = {
        "nodes": [
            {
                "id": "abc-123",
                "type": "sender",
                "runtime": None,
                "in_streams": [],
                "out_streams": ["json"],
                "env_vars": {},
                "data": {"name": "Data Source"},
            },
            {
                "id": "def-456",
                "type": "plugin",
                "runtime": "test/image:latest",
                "in_streams": ["json"],
                "out_streams": ["bytes"],
                "env_vars": {},
                "data": {"name": "My Plugin", "description": "Does stuff"},
            },
        ],
        "edges": [
            {"source": "abc-123", "target": "def-456", "data": "json"},
        ],
    }
    workflow = DeployWorkflow(**raw)
    result = deployment.deploy(workflow, inject_env=False)
    assert result["node_count"] == 2
    assert result["topological_order"] == ["abc-123", "def-456"]


def test_frontend_payload_with_null_edge_data():
    raw = {
        "nodes": [
            {"id": "a", "type": "sender", "out_streams": ["json"]},
            {"id": "b", "type": "plugin", "in_streams": ["json"]},
        ],
        "edges": [
            {"source": "a", "target": "b", "data": None},
        ],
    }
    workflow = DeployWorkflow(**raw)
    result = deployment.deploy(workflow, inject_env=False)
    assert result["node_count"] == 2


def test_frontend_payload_minimal_fields():
    raw = {
        "nodes": [
            {"id": "s1", "type": "sender"},
            {"id": "r1", "type": "receiver"},
        ],
        "edges": [
            {"source": "s1", "target": "r1"},
        ],
    }
    workflow = DeployWorkflow(**raw)
    result = deployment.deploy(workflow, inject_env=False)
    assert result["node_count"] == 2
    assert result["edge_count"] == 1
