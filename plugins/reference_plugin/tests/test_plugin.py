"""
Reference plugin unit + HTTP tests — no live Corelink server required.

Run from the plugins/reference_plugin/ directory:
    pip install -r requirements.txt pytest httpx
    pytest tests/test_plugin.py -v
"""

from __future__ import annotations

import os
import sys
import types
import unittest.mock as mock
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Stub out the `corelink` module before importing main, so tests never need
# a live Corelink server or network.
# ---------------------------------------------------------------------------
_corelink_stub = types.ModuleType("corelink")
_corelink_stub.connect = AsyncMock()
_corelink_stub.create_sender = AsyncMock(return_value=42)
_corelink_stub.create_receiver = AsyncMock()
_corelink_stub.set_data_callback = AsyncMock()
_corelink_stub.set_server_callback = AsyncMock()
_corelink_stub.send = AsyncMock()
sys.modules["corelink"] = _corelink_stub

import main  # noqa: E402  (must come after stub)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _with_env(**env_vars):
    """Decorator: runs test with specific env vars set."""
    return pytest.mark.usefixtures("_clean_env") if not env_vars else (
        lambda f: pytest.mark.usefixtures("_clean_env")(
            patch.dict(os.environ, env_vars, clear=False)(f)
        )
    )


@pytest.fixture(autouse=True)
def _reset_plugin_state():
    """Reset mutable plugin state between tests."""
    main._params.clear()
    main._params["scale"] = 1.0
    main._out_senders.clear()
    _corelink_stub.send.reset_mock()
    _corelink_stub.create_sender.reset_mock()
    _corelink_stub.create_receiver.reset_mock()
    _corelink_stub.connect.reset_mock()
    yield


# ---------------------------------------------------------------------------
# _parse_stream_env
# ---------------------------------------------------------------------------

class TestParseStreamEnv:
    def test_parses_in_streams(self):
        env = {
            "IN_JSON_WORKSPACE": "ws-a",
            "IN_JSON_STREAM_ID": "stream-1",
            "IN_JSON_PROTOCOL": "pubsub",
        }
        with patch.dict(os.environ, env, clear=True):
            result = main._parse_stream_env("IN_")
        assert result == {
            "JSON": {"workspace": "ws-a", "stream_id": "stream-1", "protocol": "pubsub"}
        }

    def test_parses_multiple_stream_types(self):
        env = {
            "IN_JSON_WORKSPACE": "ws-json",
            "IN_JSON_STREAM_ID": "s1",
            "IN_JSON_PROTOCOL": "pubsub",
            "IN_BYTES_WORKSPACE": "ws-bytes",
            "IN_BYTES_STREAM_ID": "s2",
            "IN_BYTES_PROTOCOL": "pubsub",
        }
        with patch.dict(os.environ, env, clear=True):
            result = main._parse_stream_env("IN_")
        assert set(result.keys()) == {"JSON", "BYTES"}

    def test_missing_stream_id_defaults_to_empty(self):
        with patch.dict(os.environ, {"IN_JSON_WORKSPACE": "ws"}, clear=True):
            result = main._parse_stream_env("IN_")
        assert result["JSON"]["stream_id"] == ""

    def test_empty_env_returns_empty(self):
        with patch.dict(os.environ, {}, clear=True):
            assert main._parse_stream_env("IN_") == {}


# ---------------------------------------------------------------------------
# _transform
# ---------------------------------------------------------------------------

class TestTransform:
    def test_echoes_bytes_unchanged(self):
        data = b"hello world"
        assert main._transform(data) == data

    def test_handles_empty_bytes(self):
        assert main._transform(b"") == b""


# ---------------------------------------------------------------------------
# _on_server_msg — fanned parameter updates
# ---------------------------------------------------------------------------

class TestOnServerMsg:
    @pytest.mark.asyncio
    async def test_update_key_merges_params(self):
        await main._on_server_msg({"params": {"scale": 2.5, "threshold": 0.8}}, "update")
        assert main._params["scale"] == 2.5
        assert main._params["threshold"] == 0.8

    @pytest.mark.asyncio
    async def test_update_is_additive_not_replacement(self):
        main._params["existing"] = "keep"
        await main._on_server_msg({"params": {"new_key": 99}}, "update")
        assert main._params["existing"] == "keep"
        assert main._params["new_key"] == 99

    @pytest.mark.asyncio
    async def test_unknown_key_does_not_raise(self):
        await main._on_server_msg({"some": "data"}, "unknown_key")
        # Should log and return cleanly — _params unchanged
        assert main._params == {"scale": 1.0}

    @pytest.mark.asyncio
    async def test_empty_params_dict_is_no_op(self):
        await main._on_server_msg({"params": {}}, "update")
        assert main._params == {"scale": 1.0}

    @pytest.mark.asyncio
    async def test_repeated_updates_accumulate(self):
        await main._on_server_msg({"params": {"a": 1}}, "update")
        await main._on_server_msg({"params": {"b": 2}}, "update")
        assert main._params["a"] == 1
        assert main._params["b"] == 2


# ---------------------------------------------------------------------------
# _on_data — inbound data routing
# ---------------------------------------------------------------------------

class TestOnData:
    @pytest.mark.asyncio
    async def test_forwards_to_all_senders(self):
        main._out_senders["JSON"] = 10
        main._out_senders["BYTES"] = 20
        await main._on_data(b"test", stream_id=1, header={})
        assert _corelink_stub.send.call_count == 2
        sent_ids = {call.args[0] for call in _corelink_stub.send.call_args_list}
        assert sent_ids == {10, 20}

    @pytest.mark.asyncio
    async def test_no_senders_does_not_raise(self):
        main._out_senders.clear()
        await main._on_data(b"test", stream_id=1, header={})
        _corelink_stub.send.assert_not_called()

    @pytest.mark.asyncio
    async def test_sends_transformed_data(self):
        main._out_senders["JSON"] = 42
        await main._on_data(b"payload", stream_id=1, header={})
        sent_data = _corelink_stub.send.call_args.args[1]
        assert sent_data == b"payload"  # reference transform echoes unchanged


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


class TestHealthEndpoint:
    def test_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}


class TestRunEndpoint:
    def test_returns_node_context(self, client):
        env = {"NODE_ID": "plugin-a", "NODE_TYPE": "plugin"}
        with patch.dict(os.environ, env):
            resp = client.get("/run")
        assert resp.status_code == 200
        body = resp.json()
        assert body["node_id"] == "plugin-a"
        assert body["node_type"] == "plugin"

    def test_returns_current_params(self, client):
        main._params["scale"] = 3.14
        resp = client.get("/run")
        assert resp.json()["params"]["scale"] == 3.14

    def test_connected_false_when_no_senders(self, client):
        main._out_senders.clear()
        resp = client.get("/run")
        assert resp.json()["corelink_connected"] is False

    def test_connected_true_when_sender_registered(self, client):
        main._out_senders["JSON"] = 42
        resp = client.get("/run")
        assert resp.json()["corelink_connected"] is True
        assert resp.json()["out_sender_ids"] == {"JSON": 42}

    def test_includes_stream_config_from_env(self, client):
        env = {
            "IN_JSON_WORKSPACE": "ws-in",
            "IN_JSON_STREAM_ID": "s1",
            "IN_JSON_PROTOCOL": "pubsub",
        }
        with patch.dict(os.environ, env):
            resp = client.get("/run")
        body = resp.json()
        assert "JSON" in body["in_streams"]
        assert body["in_streams"]["JSON"]["workspace"] == "ws-in"
