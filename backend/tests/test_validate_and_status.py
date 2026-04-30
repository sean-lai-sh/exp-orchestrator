"""Tests for POST /deploy/validate (#49) and GET /deployments/{id} (#48)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import broker_admin
import main as main_module


def _three_node_payload():
    return {
        "nodes": [
            {"id": "src", "type": "sender", "out_streams": ["json"]},
            {"id": "plg", "type": "plugin", "runtime": "img:latest",
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


# ── /deploy/validate ────────────────────────────────────────────────────────

def test_validate_valid_workflow(client):
    resp = client.post("/deploy/validate", json=_three_node_payload())
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is True
    assert body["errors"] == []
    assert "topological_order" in body


def test_validate_cycle_returns_422(client):
    payload = {
        "nodes": [
            {"id": "a", "type": "plugin", "runtime": "x", "in_streams": ["json"], "out_streams": ["json"]},
            {"id": "b", "type": "plugin", "runtime": "x", "in_streams": ["json"], "out_streams": ["json"]},
        ],
        "edges": [
            {"source": "a", "target": "b", "data": "json"},
            {"source": "b", "target": "a", "data": "json"},
        ],
    }
    resp = client.post("/deploy/validate", json=payload)
    assert resp.status_code == 422
    body = resp.json()
    assert body["detail"]["valid"] is False
    assert any("Cycle" in e for e in body["detail"]["errors"])


def test_validate_unknown_edge_node_returns_422(client):
    payload = {
        "nodes": [{"id": "src", "type": "sender", "out_streams": ["json"]}],
        "edges": [{"source": "src", "target": "ghost", "data": "json"}],
    }
    resp = client.post("/deploy/validate", json=payload)
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert not detail["valid"]
    assert any("ghost" in e for e in detail["errors"])


def test_validate_stream_mismatch_returns_422(client):
    payload = {
        "nodes": [
            {"id": "src", "type": "sender", "out_streams": ["json"]},
            {"id": "rcv", "type": "receiver", "in_streams": ["binary"]},
        ],
        "edges": [{"source": "src", "target": "rcv", "data": "json"}],
    }
    resp = client.post("/deploy/validate", json=payload)
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert not detail["valid"]
    assert any("binary" in e or "json" in e for e in detail["errors"])


def test_validate_plugin_without_runtime_returns_warning(client):
    payload = {
        "nodes": [
            {"id": "src", "type": "sender", "out_streams": ["json"]},
            {"id": "plg", "type": "plugin", "in_streams": ["json"], "out_streams": ["json"]},
            {"id": "rcv", "type": "receiver", "in_streams": ["json"]},
        ],
        "edges": [
            {"source": "src", "target": "plg", "data": "json"},
            {"source": "plg", "target": "rcv", "data": "json"},
        ],
    }
    resp = client.post("/deploy/validate", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is True
    assert any("plg" in w for w in body["warnings"])


# ── GET /deployments + GET /deployments/{id} ─────────────────────────────────

def _deploy(client):
    resp = client.post("/deploy/execute/v2", json=_three_node_payload(),
                       params={"executor": "noop", "inject_env": "false"})
    assert resp.status_code == 200
    return resp.json()["deploy_id"]


def test_list_deployments_includes_status_and_timestamps(client):
    did = _deploy(client)
    resp = client.get("/deployments")
    assert resp.status_code == 200
    entry = resp.json()[did]
    assert entry["status"] == "running"
    assert entry["started_at"] is not None
    assert entry["stopped_at"] is None


def test_get_deployment_detail(client):
    did = _deploy(client)
    resp = client.get(f"/deployments/{did}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["deploy_id"] == did
    assert body["status"] == "running"
    assert body["started_at"] is not None
    assert "plan" in body
    assert "execution" in body


def test_get_deployment_not_found(client):
    resp = client.get("/deployments/nonexistent")
    assert resp.status_code == 404


def test_delete_returns_stopped_at(client):
    did = _deploy(client)
    resp = client.delete(f"/deployments/{did}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "deleted"
    assert body["stopped_at"] is not None
