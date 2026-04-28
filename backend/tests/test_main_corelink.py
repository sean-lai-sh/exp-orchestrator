"""Integration-style tests for /deploy/execute/v2 + DELETE /deployments/{id}.

Mocks corelink_admin and the executor so these tests don't need Docker or a
running Corelink server.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import corelink_admin
import main as main_module
from executors import ContainerStatus
from executors.noop import NoopExecutor


def _workflow_payload():
    return {
        "nodes": [
            {"id": "src", "type": "sender", "out_streams": ["json"]},
            {"id": "plg", "type": "plugin", "runtime": "corelink_demo:latest",
             "in_streams": ["json"], "out_streams": ["json"]},
            {"id": "rcv", "type": "receiver", "in_streams": ["json"]},
        ],
        "edges": [
            {"source": "src", "target": "plg", "data": "json"},
            {"source": "plg", "target": "rcv", "data": "json"},
        ],
    }


@pytest.fixture
def client(monkeypatch):
    # Mock provisioning
    async def fake_provision(deploy_id):
        return corelink_admin.CorelinkProvisionResult(
            workspace=f"workflow_{deploy_id}",
            host="1.2.3.4", port=20012,
            username="Testuser", password="Testpassword",
        )
    async def fake_unprovision(deploy_id): return None

    monkeypatch.setattr(corelink_admin, "provision_deployment", fake_provision)
    monkeypatch.setattr(corelink_admin, "unprovision_deployment", fake_unprovision)
    # Force noop executor (no Docker)
    monkeypatch.setenv("EXECUTOR_BACKEND", "noop")

    # Reset deployments dict between tests
    main_module.deployments.clear()
    return TestClient(main_module.app)


def test_deploy_v2_provisions_workspace_and_returns_corelink_block(client):
    resp = client.post("/deploy/execute/v2", json=_workflow_payload(),
                       params={"executor": "noop", "inject_env": "false"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "deploy_id" in body
    deploy_id = body["deploy_id"]
    assert body["plan"]["workspace"] == f"workflow_{deploy_id}"

    # Sender credentials response includes the new corelink block
    cred = client.get(f"/deployments/{deploy_id}/credentials", params={"role": "sender"}).json()
    assert cred["corelink"]["host"] == "1.2.3.4"
    assert cred["corelink"]["port"] == 20012
    assert cred["corelink"]["username"] == "Testuser"
    assert cred["credentials"]["json"]["workspace"] == f"workflow_{deploy_id}"


def test_deploy_v2_returns_503_when_provision_fails(client, monkeypatch):
    async def boom(deploy_id):
        raise corelink_admin.CorelinkAdminError("corelink unreachable: timeout")
    monkeypatch.setattr(corelink_admin, "provision_deployment", boom)

    resp = client.post("/deploy/execute/v2", json=_workflow_payload(),
                       params={"executor": "noop", "inject_env": "false"})
    assert resp.status_code == 503
    assert "corelink unreachable" in resp.json()["detail"]


def test_delete_deployment_unprovisions_and_removes(client):
    resp = client.post("/deploy/execute/v2", json=_workflow_payload(),
                       params={"executor": "noop", "inject_env": "false"})
    deploy_id = resp.json()["deploy_id"]
    assert deploy_id in main_module.deployments

    del_resp = client.delete(f"/deployments/{deploy_id}")
    assert del_resp.status_code == 200
    assert deploy_id not in main_module.deployments
