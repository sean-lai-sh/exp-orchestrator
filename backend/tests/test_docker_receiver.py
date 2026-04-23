"""Smoke tests for the test-receiver Docker image.

These tests import the receiver's FastAPI app directly (without Docker) to
validate the HTTP contract and env-var parsing logic in a fast, dependency-free
way.  Full Docker build / run smoke tests are handled in CI via the
``test-receiver-docker-build`` workflow job.
"""

from __future__ import annotations

import importlib.util
import os

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_receiver_app(env: dict[str, str] | None = None):
    """Load the receiver app module with optional env overrides."""
    for k, v in (env or {}).items():
        os.environ[k] = v

    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    receiver_path = os.path.join(repo_root, "docker_images", "test_receiver", "main.py")

    spec = importlib.util.spec_from_file_location("test_receiver_main", receiver_path)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_health_endpoint_returns_ok() -> None:
    """GET /health returns {"ok": true}."""
    module = _load_receiver_app({"NODE_ID": "recv-test", "CORELINK_HOST": ""})
    client = TestClient(module.app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_status_endpoint_returns_node_id() -> None:
    """GET /status includes the configured NODE_ID."""
    module = _load_receiver_app({"NODE_ID": "recv-smoke", "CORELINK_HOST": ""})
    client = TestClient(module.app)
    resp = client.get("/status")
    assert resp.status_code == 200
    assert resp.json()["node_id"] == "recv-smoke"


def test_status_endpoint_includes_in_streams(monkeypatch: pytest.MonkeyPatch) -> None:
    """GET /status reflects IN_* env vars in in_streams."""
    monkeypatch.setenv("IN_JSON_WORKSPACE", "recv-ws")
    monkeypatch.setenv("IN_JSON_STREAM_ID", "stream-recv")
    monkeypatch.setenv("CORELINK_HOST", "")

    module = _load_receiver_app()
    client = TestClient(module.app)
    resp = client.get("/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "JSON" in data["in_streams"]
    assert data["in_streams"]["JSON"]["workspace"] == "recv-ws"


def test_status_initial_messages_received_is_zero() -> None:
    """GET /status shows messages_received == 0 before any data arrives."""
    module = _load_receiver_app({"CORELINK_HOST": ""})
    client = TestClient(module.app)
    resp = client.get("/status")
    assert resp.status_code == 200
    assert resp.json()["messages_received"] == 0
