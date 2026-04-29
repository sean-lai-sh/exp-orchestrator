"""Integration-style tests for /deploy/execute/v2 + DELETE /deployments/{id}.

Mocks broker_admin and the executor so these tests don't need Docker or a
running NATS server.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import broker_admin
import main as main_module


def _workflow_payload():
    return {
        "nodes": [
            {"id": "src", "type": "sender", "out_streams": ["json"]},
            {"id": "plg", "type": "plugin", "runtime": "caesar_cipher:latest",
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
    async def fake_provision(deploy_id):
        return broker_admin.BrokerProvisionResult(
            workspace=f"workflow_{deploy_id}",
            host="1.2.3.4", port=4222,
            token="tok",
            subject_prefix=f"deploy.{deploy_id}",
        )
    async def fake_unprovision(deploy_id): return None

    monkeypatch.setattr(broker_admin, "provision_deployment", fake_provision)
    monkeypatch.setattr(broker_admin, "unprovision_deployment", fake_unprovision)
    monkeypatch.setenv("EXECUTOR_BACKEND", "noop")

    main_module.deployments.clear()
    return TestClient(main_module.app)


def test_deploy_v2_provisions_broker_and_returns_nats_block(client):
    resp = client.post("/deploy/execute/v2", json=_workflow_payload(),
                       params={"executor": "noop", "inject_env": "false"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "deploy_id" in body
    deploy_id = body["deploy_id"]
    assert body["plan"]["workspace"] == f"workflow_{deploy_id}"

    cred = client.get(f"/deployments/{deploy_id}/credentials", params={"role": "sender"}).json()
    assert cred["nats"]["host"] == "1.2.3.4"
    assert cred["nats"]["port"] == 4222
    assert cred["nats"]["url"] == "nats://1.2.3.4:4222"
    assert cred["nats"]["token"] == "tok"
    assert cred["credentials"]["json"]["workspace"] == f"workflow_{deploy_id}"
    # subject is deploy.<id>.<src>_<dst>_<type>
    assert cred["credentials"]["json"]["stream_id"] == f"deploy.{deploy_id}.src_plg_json"
    assert cred["credentials"]["json"]["protocol"] == "nats"

    rcv_cred = client.get(f"/deployments/{deploy_id}/credentials", params={"role": "receiver"}).json()
    assert rcv_cred["credentials"]["json"]["stream_id"] == f"deploy.{deploy_id}.plg_rcv_json"


def test_deploy_v2_returns_503_when_provision_fails(client, monkeypatch):
    async def boom(deploy_id):
        raise broker_admin.BrokerAdminError("nats unreachable: timeout")
    monkeypatch.setattr(broker_admin, "provision_deployment", boom)

    resp = client.post("/deploy/execute/v2", json=_workflow_payload(),
                       params={"executor": "noop", "inject_env": "false"})
    assert resp.status_code == 503
    assert "nats unreachable" in resp.json()["detail"]


def test_delete_deployment_unprovisions_and_removes(client):
    resp = client.post("/deploy/execute/v2", json=_workflow_payload(),
                       params={"executor": "noop", "inject_env": "false"})
    deploy_id = resp.json()["deploy_id"]
    assert deploy_id in main_module.deployments

    del_resp = client.delete(f"/deployments/{deploy_id}")
    assert del_resp.status_code == 200
    assert deploy_id not in main_module.deployments
