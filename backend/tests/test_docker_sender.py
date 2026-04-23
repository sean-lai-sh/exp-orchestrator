"""Smoke tests for the test-sender Docker image.

These tests import the sender's FastAPI app directly (without Docker) to
validate the HTTP contract and env-var parsing logic in a fast, dependency-free
way.
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_client(env: dict[str, str] | None = None) -> TestClient:
    """Import the sender app with a custom environment and return a TestClient.

    We reload the module each time so that module-level env reads pick up the
    monkeypatched values.
    """
    import importlib.util
    import sys

    _original_env = os.environ.copy()
    try:
        # Patch os.environ before import
        for k, v in (env or {}).items():
            os.environ[k] = v

        # Force re-import so module-level constants are re-evaluated
        if "docker_images.test_sender.main" in sys.modules:
            del sys.modules["docker_images.test_sender.main"]

        # Add docker_images to path if needed
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        sender_dir = os.path.join(repo_root, "docker_images", "test_sender")
        if sender_dir not in sys.path:
            sys.path.insert(0, sender_dir)

        if "main" in sys.modules:
            # Avoid collision with backend/main.py
            del sys.modules["main"]

        spec = importlib.util.spec_from_file_location(
            "test_sender_main",
            os.path.join(sender_dir, "main.py"),
        )
        assert spec is not None
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)  # type: ignore[union-attr]

        return TestClient(module.app)
    finally:
        os.environ.clear()
        os.environ.update(_original_env)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_health_endpoint_returns_ok() -> None:
    """GET /health returns {"ok": true}."""
    client = _make_client({"NODE_ID": "sender-test", "CORELINK_HOST": ""})
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_status_endpoint_returns_node_id() -> None:
    """GET /status includes the configured NODE_ID."""
    client = _make_client({"NODE_ID": "sender-smoke", "CORELINK_HOST": ""})
    resp = client.get("/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["node_id"] == "sender-smoke"


def test_status_endpoint_includes_out_streams(monkeypatch: pytest.MonkeyPatch) -> None:
    """GET /status reflects OUT_* env vars in out_streams."""
    monkeypatch.setenv("OUT_JSON_WORKSPACE", "test-ws")
    monkeypatch.setenv("OUT_JSON_STREAM_ID", "stream-1")
    monkeypatch.setenv("CORELINK_HOST", "")

    client = _make_client()
    resp = client.get("/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "JSON" in data["out_streams"]
    assert data["out_streams"]["JSON"]["workspace"] == "test-ws"


def test_status_initial_messages_sent_is_zero() -> None:
    """GET /status shows messages_sent == 0 before any publish loop runs."""
    client = _make_client({"CORELINK_HOST": ""})
    resp = client.get("/status")
    assert resp.status_code == 200
    assert resp.json()["messages_sent"] == 0
