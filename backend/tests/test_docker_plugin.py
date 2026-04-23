"""Smoke tests for the test-plugin Docker image.

These tests import the plugin's FastAPI app directly (without Docker) to
validate the HTTP contract, env-var parsing, and the transform function in a
fast, dependency-free way.
"""

from __future__ import annotations

import importlib.util
import json
import os

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_plugin_app(env: dict[str, str] | None = None):
    """Load the plugin app module with optional env overrides."""
    _original_env = os.environ.copy()
    try:
        for k, v in (env or {}).items():
            os.environ[k] = v

        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        plugin_path = os.path.join(repo_root, "docker_images", "test_plugin", "main.py")

        spec = importlib.util.spec_from_file_location("test_plugin_main", plugin_path)
        assert spec is not None
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)  # type: ignore[union-attr]
        return module
    finally:
        os.environ.clear()
        os.environ.update(_original_env)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_health_endpoint_returns_ok() -> None:
    """GET /health returns {"ok": true}."""
    module = _load_plugin_app({"NODE_ID": "plugin-test", "CORELINK_HOST": ""})
    client = TestClient(module.app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_status_endpoint_returns_node_id() -> None:
    """GET /status includes the configured NODE_ID."""
    module = _load_plugin_app({"NODE_ID": "plugin-smoke", "CORELINK_HOST": ""})
    client = TestClient(module.app)
    resp = client.get("/status")
    assert resp.status_code == 200
    assert resp.json()["node_id"] == "plugin-smoke"


def test_status_endpoint_includes_in_and_out_streams(monkeypatch: pytest.MonkeyPatch) -> None:
    """GET /status reflects both IN_* and OUT_* env vars."""
    monkeypatch.setenv("IN_JSON_WORKSPACE", "in-ws")
    monkeypatch.setenv("IN_JSON_STREAM_ID", "stream-in")
    monkeypatch.setenv("OUT_JSON_WORKSPACE", "out-ws")
    monkeypatch.setenv("OUT_JSON_STREAM_ID", "stream-out")
    monkeypatch.setenv("CORELINK_HOST", "")

    module = _load_plugin_app()
    client = TestClient(module.app)
    resp = client.get("/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "JSON" in data["in_streams"]
    assert "JSON" in data["out_streams"]
    assert data["in_streams"]["JSON"]["workspace"] == "in-ws"
    assert data["out_streams"]["JSON"]["workspace"] == "out-ws"


def test_transform_adds_processed_fields() -> None:
    """_transform adds processed_by and processed_at to a JSON payload."""
    module = _load_plugin_app({"NODE_ID": "plugin-transform"})
    original = {"value": 42, "label": "test"}
    result_bytes = module._transform(json.dumps(original).encode())
    result = json.loads(result_bytes)
    assert result["value"] == 42
    assert result["label"] == "test"
    assert result["processed_by"] == "plugin-transform"
    assert isinstance(result["processed_at"], int)


def test_transform_handles_non_json_input() -> None:
    """_transform wraps non-JSON data in a raw envelope."""
    module = _load_plugin_app({"NODE_ID": "plugin-transform"})
    result_bytes = module._transform(b"not json at all")
    result = json.loads(result_bytes)
    assert "raw" in result
    assert result["processed_by"] == "plugin-transform"


def test_status_initial_message_counts_are_zero() -> None:
    """GET /status shows zero message counts before any data flows."""
    module = _load_plugin_app({"CORELINK_HOST": ""})
    client = TestClient(module.app)
    resp = client.get("/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["messages_received"] == 0
    assert data["messages_sent"] == 0


def test_test_plugin_is_on_allowlist() -> None:
    """test-plugin:latest must be on the allowlist for executor acceptance."""
    import allowlist  # noqa: PLC0415

    assert allowlist.is_approved("test-plugin:latest"), (
        "test-plugin:latest is not in backend/config/allowed_images.json — "
        "add it so the executor can start the container."
    )
