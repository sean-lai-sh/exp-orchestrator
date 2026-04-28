"""
caesar_cipher plugin.

Subscribes to all IN_* streams, applies a Caesar cipher (shift configurable
via the CAESAR_SHIFT env var, default 10) to each message, publishes to all
OUT_* streams. Same lifecycle/wiring as plugins/corelink_demo/main.py.

This plugin lives behind the same modular boundary: deleting
plugins/caesar_cipher/ removes it without affecting the orchestrator.
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

import corelink
import uvicorn
from fastapi import FastAPI

_out_senders: dict[str, int] = {}
_in_receivers: dict[str, int] = {}
# Track (receiver_id, sender_stream_id) pairs we've already subscribed to —
# corelink.create_receiver already auto-subscribes via subscribe=True for
# pre-existing matching senders, and same-user alerts can re-fire for senders
# we already see. Without dedupe, _on_data fires twice per message and we
# emit duplicate ciphertext.
_subscribed_pairs: set[tuple[int, int]] = set()
_connected: bool = False
_SHIFT: int = int(os.environ.get("CAESAR_SHIFT", "10"))


def _parse_stream_env(prefix: str) -> dict[str, dict]:
    streams: dict[str, dict] = {}
    for key, val in os.environ.items():
        if key.startswith(prefix) and key.endswith("_WORKSPACE"):
            stream_type = key[len(prefix): -len("_WORKSPACE")]
            streams[stream_type] = {
                "workspace": val,
                "stream_id": os.environ.get(f"{prefix}{stream_type}_STREAM_ID", ""),
                "protocol": os.environ.get(f"{prefix}{stream_type}_PROTOCOL", "pubsub"),
            }
    return streams


def _shift_char(c: str, shift: int) -> str:
    if "a" <= c <= "z":
        return chr((ord(c) - ord("a") + shift) % 26 + ord("a"))
    if "A" <= c <= "Z":
        return chr((ord(c) - ord("A") + shift) % 26 + ord("A"))
    return c


def _transform(data: bytes) -> bytes:
    """Apply Caesar cipher with shift=_SHIFT to UTF-8 text. Non-UTF-8 passes through."""
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data
    return "".join(_shift_char(ch, _SHIFT) for ch in text).encode("utf-8")


async def _on_data(data: bytes, stream_id: int, header: dict) -> None:
    try:
        result = _transform(data)
    except Exception as e:
        print(f"[caesar] transform error on stream_id={stream_id}: {e}")
        return
    text = result.decode("utf-8", errors="replace")
    for sid in _out_senders.values():
        await corelink.send(sid, text)


async def _on_stream_update(message: dict, key: str) -> None:
    sid = message.get("streamID")
    if sid is None:
        return
    msg_type = (message.get("type") or "").lower()
    receiver_id = _in_receivers.get(msg_type)
    targets = [receiver_id] if receiver_id is not None else list(_in_receivers.values())
    for rid in targets:
        if (rid, sid) in _subscribed_pairs:
            continue
        _subscribed_pairs.add((rid, sid))
        try:
            await corelink.subscribe_to_stream(rid, sid)
            print(f"[caesar] subscribed receiver {rid} to stream {sid} (type={msg_type})")
        except Exception as e:
            print(f"[caesar] subscribe error r={rid} s={sid}: {e}")


async def _corelink_loop() -> None:
    host = os.environ.get("CORELINK_HOST", "")
    port = int(os.environ.get("CORELINK_PORT", "20012"))
    username = os.environ.get("CORELINK_USERNAME", "")
    password = os.environ.get("CORELINK_PASSWORD", "")

    if not (host and username and password):
        print("[caesar] CORELINK_HOST/USERNAME/PASSWORD not set — idle")
        return

    await corelink.connect(username, password, host, port)
    global _connected
    _connected = True
    print(f"[caesar] Connected to Corelink at {host}:{port} (shift={_SHIFT})")

    await corelink.set_data_callback(_on_data)
    await corelink.set_server_callback(_on_stream_update, "update")

    in_streams = _parse_stream_env("IN_")
    for stream_type, cfg in in_streams.items():
        receiver_id = await corelink.create_receiver(
            workspace=cfg["workspace"],
            protocol="ws",
            data_type=stream_type.lower(),
            stream_ids=[],
            alert=True,
            # subscribe=False so the lib does NOT auto-subscribe to streams in
            # the initial streamList — _on_stream_update is the single source
            # of truth for subscriptions, dedupe-tracked in _subscribed_pairs.
            # Without this, the lib subscribes once via subscribe=True AND our
            # alert handler subscribes again, double-delivering each message.
            subscribe=False,
        )
        _in_receivers[stream_type.lower()] = receiver_id
        print(f"[caesar] Receiver ready: {stream_type} @ {cfg['workspace']} (rid={receiver_id})")

    out_streams = _parse_stream_env("OUT_")
    for stream_type, cfg in out_streams.items():
        sid = await corelink.create_sender(
            workspace=cfg["workspace"],
            protocol="ws",
            data_type=stream_type.lower(),
        )
        _out_senders[stream_type] = sid
        print(f"[caesar] Sender ready: {stream_type} @ {cfg['workspace']} (sid={sid})")

    await asyncio.sleep(float("inf"))


@asynccontextmanager
async def _lifespan(app: FastAPI):
    print(f"[caesar] NODE_ID={os.environ.get('NODE_ID', '')} shift={_SHIFT}")
    task = asyncio.create_task(_corelink_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(lifespan=_lifespan)


@app.get("/health")
def health():
    if not _connected:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={"ok": False, "reason": "corelink_disconnected"},
        )
    return {"ok": True}


@app.get("/run")
def run_status():
    return {
        "node_id": os.environ.get("NODE_ID", ""),
        "shift": _SHIFT,
        "in_streams": _parse_stream_env("IN_"),
        "out_streams": _parse_stream_env("OUT_"),
        "out_sender_ids": _out_senders,
        "corelink_connected": _connected,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
