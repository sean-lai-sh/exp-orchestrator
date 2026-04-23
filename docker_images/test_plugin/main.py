"""Test plugin — receives, transforms, and publishes data via Corelink.

Lifecycle
---------
1. On startup, reads orchestrator-injected env vars (NODE_ID, IN_*/OUT_* stream
   creds, Corelink connection details) and starts a background Corelink loop.
2. For every inbound message on any IN_* stream, applies a simple transform
   (adds ``processed_by`` and ``processed_at`` fields) and publishes the result
   to every OUT_* stream.
3. If Corelink credentials are absent, the container starts in HTTP-only mode
   and still exposes /health and /status — useful for smoke tests.

HTTP endpoints
--------------
GET /health  →  {"ok": true}
GET /status  →  connection state, message counts, and stream config
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

# ---------------------------------------------------------------------------
# Configuration from orchestrator-injected env vars
# ---------------------------------------------------------------------------

NODE_ID: str = os.getenv("NODE_ID", "test-plugin")
NODE_TYPE: str = os.getenv("NODE_TYPE", "plugin")

CORELINK_HOST: str = os.getenv("CORELINK_HOST", "")
CORELINK_PORT: int = int(os.getenv("CORELINK_PORT", "20010"))
CORELINK_USERNAME: str = os.getenv("CORELINK_USERNAME", "")
CORELINK_PASSWORD: str = os.getenv("CORELINK_PASSWORD", "")

# ---------------------------------------------------------------------------
# Stream env var parsing (same pattern as reference plugin)
# ---------------------------------------------------------------------------


def _parse_stream_env(prefix: str) -> dict[str, dict]:
    """Scan env for IN_/OUT_<TYPE>_WORKSPACE / _STREAM_ID / _PROTOCOL groups."""
    streams: dict[str, dict] = {}
    for key, val in os.environ.items():
        if key.startswith(prefix) and key.endswith("_WORKSPACE"):
            stream_type = key[len(prefix): -len("_WORKSPACE")]
            streams[stream_type] = {
                "workspace": val,
                "stream_id": os.getenv(f"{prefix}{stream_type}_STREAM_ID", ""),
                "protocol": os.getenv(f"{prefix}{stream_type}_PROTOCOL", "pubsub"),
            }
    return streams


# ---------------------------------------------------------------------------
# Shared mutable state
# ---------------------------------------------------------------------------

_state: dict = {
    "connected": False,
    "messages_received": 0,
    "messages_sent": 0,
    "last_input": None,
    "last_output": None,
    "last_error": None,
}

# Corelink sender stream IDs (stream_type → corelink stream_id)
_out_senders: dict[str, int] = {}


# ---------------------------------------------------------------------------
# Transform
# ---------------------------------------------------------------------------


def _transform(data: bytes) -> bytes:
    """Add ``processed_by`` and ``processed_at`` fields to a JSON payload.

    Falls back to wrapping non-JSON data in a ``{"raw": ...}`` envelope so the
    plugin never drops messages.
    """
    try:
        payload = json.loads(data.decode("utf-8", errors="replace"))
    except Exception:  # noqa: BLE001
        payload = {"raw": data.decode("utf-8", errors="replace")}

    payload["processed_by"] = NODE_ID
    payload["processed_at"] = int(time.time() * 1000)
    return json.dumps(payload).encode()


# ---------------------------------------------------------------------------
# Corelink callbacks
# ---------------------------------------------------------------------------


async def _on_data(data: bytes, stream_id: int, header: dict) -> None:
    """Called for every inbound message across all subscribed IN streams."""
    _state["messages_received"] += 1
    try:
        _state["last_input"] = json.loads(data.decode("utf-8", errors="replace"))
    except Exception:  # noqa: BLE001
        _state["last_input"] = {"raw_bytes": len(data)}

    result = _transform(data)

    try:
        _state["last_output"] = json.loads(result.decode())
    except Exception:  # noqa: BLE001
        pass

    for sid in _out_senders.values():
        await _corelink_module.send(sid, result)  # type: ignore[name-defined]
    _state["messages_sent"] += len(_out_senders)


# We store the corelink module reference here so _on_data can call send().
_corelink_module = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Corelink connection loop
# ---------------------------------------------------------------------------


async def _corelink_loop() -> None:
    """Connect to Corelink, subscribe to IN streams, create OUT senders."""
    global _corelink_module  # noqa: PLW0603

    if not (CORELINK_HOST and CORELINK_USERNAME and CORELINK_PASSWORD):
        print(f"[test-plugin] CORELINK_HOST/USERNAME/PASSWORD not set — HTTP-only mode")
        return

    try:
        import corelink  # noqa: PLC0415

        _corelink_module = corelink

        await corelink.connect(CORELINK_USERNAME, CORELINK_PASSWORD, CORELINK_HOST, CORELINK_PORT)
        print(f"[test-plugin] Connected to Corelink at {CORELINK_HOST}:{CORELINK_PORT}")
        _state["connected"] = True

        await corelink.set_data_callback(_on_data)

        in_streams = _parse_stream_env("IN_")
        for stream_type, cfg in in_streams.items():
            stream_ids = [cfg["stream_id"]] if cfg["stream_id"] else []
            await corelink.create_receiver(
                workspace=cfg["workspace"],
                protocol="tcp",
                data_type=stream_type.lower(),
                stream_ids=stream_ids,
                alert=True,
            )
            print(f"[test-plugin] Receiver ready: {stream_type} @ {cfg['workspace']}")

        out_streams = _parse_stream_env("OUT_")
        for stream_type, cfg in out_streams.items():
            sid = await corelink.create_sender(
                workspace=cfg["workspace"],
                protocol="tcp",
                data_type=stream_type.lower(),
            )
            _out_senders[stream_type] = sid
            print(f"[test-plugin] Sender ready: {stream_type} @ {cfg['workspace']} (stream_id={sid})")

        # Stay alive — Corelink delivers data via callbacks
        await asyncio.sleep(float("inf"))

    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        _state["last_error"] = str(exc)
        print(f"[test-plugin] ERROR: {exc}")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------


@asynccontextmanager
async def _lifespan(app: FastAPI):
    _log_startup()
    task = asyncio.create_task(_corelink_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(lifespan=_lifespan)


def _log_startup() -> None:
    print(f"[test-plugin] NODE_ID={NODE_ID} NODE_TYPE={NODE_TYPE}")
    for k, v in os.environ.items():
        if k.startswith("IN_") or k.startswith("OUT_"):
            print(f"[test-plugin]   {k}={v}")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/status")
def status():
    return {
        **_state,
        "node_id": NODE_ID,
        "node_type": NODE_TYPE,
        "in_streams": _parse_stream_env("IN_"),
        "out_streams": _parse_stream_env("OUT_"),
        "out_sender_ids": _out_senders,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
