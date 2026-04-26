"""
Caesar cipher plugin for the orchestrator.

Lifecycle:
  1. On startup, reads orchestrator-injected env vars (NODE_ID, IN_*/OUT_* stream creds)
     and connects to Corelink.
  2. Creates a receiver for every IN_* stream and a sender for every OUT_* stream.
  3. Each inbound message is passed through `_transform()` and forwarded to all senders.
  4. Fanned server-initiated messages (key="update") can change `_params` at runtime
     without redeploying — useful for researchers tuning thresholds/weights live.

HTTP endpoints (for orchestrator liveness + visibility):
  GET /health  ->  {"ok": true}
  GET /run     ->  current stream state + active params
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager

import corelink
import uvicorn
from fastapi import FastAPI

# ---------------------------------------------------------------------------
# Mutable processing parameters — updated at runtime via fanned messages
# ---------------------------------------------------------------------------
_params: dict = {"shift": 3}

# stream_id returned by create_sender for each OUT_* stream
_out_senders: dict[str, int] = {}  # stream_type -> corelink stream_id


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
    if stream_id in _out_senders.values():
        return  # Skip our own output to prevent feedback loops
    result = _transform(data)
    for sid in _out_senders.values():
        await corelink.send(sid, result)


_our_username: str = ""


async def _on_subscriber(message: dict, key: str) -> None:
    """Informational: another client subscribed to our sender. No action needed."""
    print(f"[caesar] Subscriber info: {message}")


async def _on_update(message: dict, key: str) -> None:
    """New sender appeared — subscribe our receiver to it (skip our own user)."""
    stream_id = message.get("streamID")
    sender_user = message.get("user", "")
    receiver_id = message.get("receiverID")
    if sender_user == _our_username:
        return  # Don't subscribe to our own output
    if stream_id and receiver_id:
        try:
            await corelink.subscribe_to_stream(receiver_id, stream_id)
            print(f"[caesar] Subscribed receiver {receiver_id} to stream {stream_id} (user={sender_user})")
        except Exception as exc:
            print(f"[caesar] Subscribe to {stream_id} failed: {exc}")


# ---------------------------------------------------------------------------
# Data transform — Caesar cipher
# ---------------------------------------------------------------------------

def _caesar_shift(text: str, shift: int) -> str:
    """Apply a Caesar cipher shift to alphabetic characters, preserving case."""
    result = []
    for ch in text:
        if ch.isalpha():
            base = ord("A") if ch.isupper() else ord("a")
            result.append(chr((ord(ch) - base + shift) % 26 + base))
        else:
            result.append(ch)
    return "".join(result)


def _transform(data: bytes) -> str:
    """
    Parse incoming bytes as JSON. If a "text" field is present, apply the
    Caesar cipher using the current shift parameter and return JSON string.
    """
    try:
        payload = json.loads(data)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return data.decode() if isinstance(data, bytes) else str(data)

    if "text" in payload:
        shift = int(_params.get("shift", 3))
        original = payload["text"]
        ciphered = _caesar_shift(original, shift)
        payload["text"] = ciphered
        print(f"[caesar] '{original}' -> '{ciphered}' (shift={shift})")

    return json.dumps(payload)


# ---------------------------------------------------------------------------
# Corelink connection loop (runs as a background asyncio task)
# ---------------------------------------------------------------------------

async def _corelink_loop() -> None:
    host = os.environ.get("CORELINK_HOST", "")
    port = os.environ.get("CORELINK_PORT", "20012")
    username = os.environ.get("CORELINK_USERNAME", "")
    password = os.environ.get("CORELINK_PASSWORD", "")

    if not (host and username and password):
        print("[caesar] CORELINK_HOST/USERNAME/PASSWORD not set — HTTP-only mode")
        return

    global _our_username
    _our_username = username

    # The corelink library requires variables.loop to be set before create_receiver/sender
    import corelink.resources.variables as cl_vars
    cl_vars.loop = asyncio.get_event_loop()

    try:
        await corelink.connect(username, password, host, port)
    except Exception as exc:
        print(f"[caesar] Corelink connect failed: {exc}")
        return
    print(f"[caesar] Connected to Corelink at {host}:{port}")

    # Auto-subscribe to new sender streams when they appear
    await corelink.set_server_callback(_on_update, "update")
    await corelink.set_server_callback(_on_subscriber, "subscriber")

    # Register data callback before creating receivers
    await corelink.set_data_callback(_on_data)

    # Subscribe to every IN_* stream the orchestrator injected
    in_streams = _parse_stream_env("IN_")
    for stream_type, cfg in in_streams.items():
        await corelink.create_receiver(
            workspace=cfg["workspace"],
            protocol="tcp",
            data_type=stream_type.lower(),
            alert=True,   # notify when a new stream of this type appears
        )
        print(f"[caesar] Receiver ready: {stream_type} @ {cfg['workspace']}")

    # Create a sender for every OUT_* stream the orchestrator injected
    out_streams = _parse_stream_env("OUT_")
    for stream_type, cfg in out_streams.items():
        sid = await corelink.create_sender(
            workspace=cfg["workspace"],
            protocol="tcp",
            data_type=stream_type.lower(),
        )
        _out_senders[stream_type] = sid
        print(f"[caesar] Sender ready: {stream_type} @ {cfg['workspace']} (stream_id={sid})")

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
    print(f"[caesar] NODE_ID={os.environ.get('NODE_ID', '')} "
          f"NODE_TYPE={os.environ.get('NODE_TYPE', '')}")
    for k, v in os.environ.items():
        if k.startswith("IN_") or k.startswith("OUT_"):
            print(f"[caesar]   {k}={v}")


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
