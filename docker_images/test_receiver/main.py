"""Test receiver — subscribes to Corelink streams using orchestrator env vars.

Lifecycle
---------
1. On startup, reads orchestrator-injected env vars (NODE_ID, IN_* stream creds,
   Corelink connection details) and starts a background subscribe loop.
2. For every message received on any IN_* stream, increments ``messages_received``
   and stores the decoded payload in ``last_message``.
3. If Corelink credentials are absent, the container starts in HTTP-only mode
   and still exposes /health and /status — useful for smoke tests.

HTTP endpoints
--------------
GET /health  →  {"ok": true}
GET /status  →  connection state, message count, last message, and stream config
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

# ---------------------------------------------------------------------------
# Configuration from orchestrator-injected env vars
# ---------------------------------------------------------------------------

NODE_ID: str = os.getenv("NODE_ID", "test-receiver")
NODE_TYPE: str = os.getenv("NODE_TYPE", "receiver")

CORELINK_HOST: str = os.getenv("CORELINK_HOST", "")
CORELINK_PORT: int = int(os.getenv("CORELINK_PORT", "20010"))
CORELINK_USERNAME: str = os.getenv("CORELINK_USERNAME", "")
CORELINK_PASSWORD: str = os.getenv("CORELINK_PASSWORD", "")

# ---------------------------------------------------------------------------
# Stream env var parsing (same pattern as reference plugin)
# ---------------------------------------------------------------------------


def _parse_stream_env(prefix: str) -> dict[str, dict]:
    """Scan env for IN_<TYPE>_WORKSPACE / _STREAM_ID / _PROTOCOL groups."""
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
    "last_message": None,
    "last_error": None,
}


# ---------------------------------------------------------------------------
# Corelink callbacks
# ---------------------------------------------------------------------------


async def _on_data(data: bytes, stream_id: int, header: dict) -> None:
    """Called for every inbound message across all subscribed IN streams."""
    _state["messages_received"] += 1
    try:
        _state["last_message"] = json.loads(data.decode("utf-8", errors="replace"))
    except Exception:  # noqa: BLE001
        _state["last_message"] = {"raw_bytes": len(data)}


# ---------------------------------------------------------------------------
# Subscribe loop
# ---------------------------------------------------------------------------


async def _subscribe_loop() -> None:
    """Connect to Corelink and subscribe to all configured IN_* streams."""
    if not (CORELINK_HOST and CORELINK_USERNAME and CORELINK_PASSWORD):
        print(f"[test-receiver] CORELINK_HOST/USERNAME/PASSWORD not set — HTTP-only mode")
        return

    try:
        import corelink  # noqa: PLC0415

        await corelink.connect(CORELINK_USERNAME, CORELINK_PASSWORD, CORELINK_HOST, CORELINK_PORT)
        print(f"[test-receiver] Connected to Corelink at {CORELINK_HOST}:{CORELINK_PORT}")
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
            print(f"[test-receiver] Receiver ready: {stream_type} @ {cfg['workspace']}")

        # Stay alive — Corelink delivers data via callbacks
        await asyncio.sleep(float("inf"))

    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        _state["last_error"] = str(exc)
        print(f"[test-receiver] ERROR: {exc}")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------


@asynccontextmanager
async def _lifespan(app: FastAPI):
    _log_startup()
    task = asyncio.create_task(_subscribe_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(lifespan=_lifespan)


def _log_startup() -> None:
    print(f"[test-receiver] NODE_ID={NODE_ID} NODE_TYPE={NODE_TYPE}")
    for k, v in os.environ.items():
        if k.startswith("IN_"):
            print(f"[test-receiver]   {k}={v}")


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
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
