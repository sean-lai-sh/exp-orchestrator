"""
Reference plugin for the orchestrator.

Lifecycle:
  1. On startup, reads orchestrator-injected env vars (NODE_ID, IN_*/OUT_* stream creds)
     and connects to Corelink.
  2. Creates a receiver for every IN_* stream and a sender for every OUT_* stream.
  3. Each inbound message is passed through `_transform()` and forwarded to all senders.
  4. Fanned server-initiated messages (key="update") can change `_params` at runtime
     without redeploying — useful for researchers tuning thresholds/weights live.

HTTP endpoints (for orchestrator liveness + visibility):
  GET /health  →  {"ok": true}
  GET /run     →  current stream state + active params
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

import corelink
import uvicorn
from fastapi import FastAPI

# ---------------------------------------------------------------------------
# Mutable processing parameters — updated at runtime via fanned messages
# ---------------------------------------------------------------------------
_params: dict = {"scale": 1.0}

# stream_id returned by create_sender for each OUT_* stream
_out_senders: dict[str, int] = {}  # stream_type → corelink stream_id


# ---------------------------------------------------------------------------
# Env var parsing
# ---------------------------------------------------------------------------

def _parse_stream_env(prefix: str) -> dict[str, dict]:
    """
    Scan env for IN_<TYPE>_WORKSPACE / _STREAM_ID / _PROTOCOL groups.
    Returns {stream_type: {workspace, stream_id, protocol}}.
    """
    streams: dict[str, dict] = {}
    for key, val in os.environ.items():
        if key.startswith(prefix) and key.endswith("_WORKSPACE"):
            stream_type = key[len(prefix) : -len("_WORKSPACE")]
            streams[stream_type] = {
                "workspace": val,
                "stream_id": os.environ.get(f"{prefix}{stream_type}_STREAM_ID", ""),
                "protocol": os.environ.get(f"{prefix}{stream_type}_PROTOCOL", "pubsub"),
            }
    return streams


# ---------------------------------------------------------------------------
# Corelink callbacks
# ---------------------------------------------------------------------------

async def _on_data(data: bytes, stream_id: int, header: dict) -> None:
    """Called for every inbound data message across all subscribed IN streams."""
    result = _transform(data)
    for sid in _out_senders.values():
        await corelink.send(sid, result)


async def _on_server_msg(message: dict, key: str) -> None:
    """
    Handle server-initiated (fanned) control messages.

    Orchestrators or peer controllers can broadcast parameter updates to all
    plugins simultaneously using key="update". The plugin merges the new values
    into `_params` and immediately applies them on the next message — no restart
    needed.
    """
    if key == "update":
        updates = message.get("params", {})
        _params.update(updates)
        print(f"[ref-plugin] Params updated via fanned message: {updates}")
    else:
        print(f"[ref-plugin] Unhandled server message key={key!r}: {message}")


# ---------------------------------------------------------------------------
# Data transform — replace this in real plugins
# ---------------------------------------------------------------------------

def _transform(data: bytes) -> bytes:
    """
    Reference transform: echo data unchanged.
    Real plugins replace this with their actual processing logic using _params.
    """
    return data


# ---------------------------------------------------------------------------
# Corelink connection loop (runs as a background asyncio task)
# ---------------------------------------------------------------------------

async def _corelink_loop() -> None:
    host = os.environ.get("CORELINK_HOST", "")
    port = int(os.environ.get("CORELINK_PORT", "20010"))
    username = os.environ.get("CORELINK_USERNAME", "")
    password = os.environ.get("CORELINK_PASSWORD", "")

    if not (host and username and password):
        print("[ref-plugin] CORELINK_HOST/USERNAME/PASSWORD not set — HTTP-only mode")
        return

    await corelink.connect(username, password, host, port)
    print(f"[ref-plugin] Connected to Corelink at {host}:{port}")

    # Register handler for fanned parameter-update messages from the server/orchestrator
    await corelink.set_server_callback(_on_server_msg, "update")

    # Register data callback before creating receivers
    await corelink.set_data_callback(_on_data)

    # Subscribe to every IN_* stream the orchestrator injected
    in_streams = _parse_stream_env("IN_")
    for stream_type, cfg in in_streams.items():
        stream_ids = [cfg["stream_id"]] if cfg["stream_id"] else []
        await corelink.create_receiver(
            workspace=cfg["workspace"],
            protocol="tcp",
            data_type=stream_type.lower(),
            stream_ids=stream_ids,
            alert=True,   # notify when a new stream of this type appears
        )
        print(f"[ref-plugin] Receiver ready: {stream_type} @ {cfg['workspace']}")

    # Create a sender for every OUT_* stream the orchestrator injected
    out_streams = _parse_stream_env("OUT_")
    for stream_type, cfg in out_streams.items():
        sid = await corelink.create_sender(
            workspace=cfg["workspace"],
            protocol="tcp",
            data_type=stream_type.lower(),
        )
        _out_senders[stream_type] = sid
        print(f"[ref-plugin] Sender ready: {stream_type} @ {cfg['workspace']} (stream_id={sid})")

    # Stay alive — Corelink delivers data via callbacks
    await asyncio.sleep(float("inf"))


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
    print(f"[ref-plugin] NODE_ID={os.environ.get('NODE_ID', '')} "
          f"NODE_TYPE={os.environ.get('NODE_TYPE', '')}")
    for k, v in os.environ.items():
        if k.startswith("IN_") or k.startswith("OUT_"):
            print(f"[ref-plugin]   {k}={v}")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/run")
def run_status():
    """Visibility endpoint: current stream config + live processing params."""
    return {
        "node_id": os.environ.get("NODE_ID", ""),
        "node_type": os.environ.get("NODE_TYPE", ""),
        "in_streams": _parse_stream_env("IN_"),
        "out_streams": _parse_stream_env("OUT_"),
        "out_sender_ids": _out_senders,
        "params": _params,
        "corelink_connected": bool(_out_senders),
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
