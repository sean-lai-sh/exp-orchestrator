"""
caesar_cipher plugin.

Subscribes to all IN_*_STREAM_ID NATS subjects, applies a Caesar cipher
(shift configurable via CAESAR_SHIFT env var, default 10) to each message,
and publishes to all OUT_*_STREAM_ID subjects.

Lives behind the same modular boundary as the rest of the plugin tree:
deleting plugins/caesar_cipher/ removes it without affecting the orchestrator.
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

import nats
import uvicorn
from fastapi import FastAPI

_in_subjects: dict[str, str] = {}   # stream_type -> subject
_out_subjects: dict[str, str] = {}  # stream_type -> subject
_nc = None  # active NATS connection
_connected: bool = False
_SHIFT: int = int(os.environ.get("CAESAR_SHIFT", "10"))


def _parse_stream_env(prefix: str) -> dict[str, str]:
    """Return {stream_type: subject} for every {prefix}_<TYPE>_STREAM_ID env var."""
    streams: dict[str, str] = {}
    for key, val in os.environ.items():
        if key.startswith(prefix) and key.endswith("_STREAM_ID"):
            stream_type = key[len(prefix): -len("_STREAM_ID")]
            streams[stream_type.lower()] = val
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


async def _on_message(msg) -> None:
    global _nc
    try:
        result = _transform(msg.data)
    except Exception as e:
        print(f"[caesar] transform error on subject={msg.subject}: {e}")
        return
    if _nc is None:
        return
    for subject in _out_subjects.values():
        await _nc.publish(subject, result)


async def _nats_loop() -> None:
    global _nc, _connected

    url = os.environ.get("NATS_URL", "")
    token = os.environ.get("NATS_TOKEN", "") or None

    if not url:
        print("[caesar] NATS_URL not set — idle")
        return

    _in_subjects.update(_parse_stream_env("IN_"))
    _out_subjects.update(_parse_stream_env("OUT_"))

    _nc = await nats.connect(url, token=token, allow_reconnect=True)
    _connected = True
    print(f"[caesar] Connected to NATS at {url} (shift={_SHIFT})")

    for stream_type, subject in _in_subjects.items():
        await _nc.subscribe(subject, cb=_on_message)
        print(f"[caesar] Subscribed: {stream_type} @ {subject}")

    for stream_type, subject in _out_subjects.items():
        print(f"[caesar] Publishing: {stream_type} @ {subject}")

    await asyncio.sleep(float("inf"))


@asynccontextmanager
async def _lifespan(app: FastAPI):
    print(f"[caesar] NODE_ID={os.environ.get('NODE_ID', '')} shift={_SHIFT}")
    task = asyncio.create_task(_nats_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    if _nc is not None:
        try:
            await _nc.drain()
        except Exception:
            pass


app = FastAPI(lifespan=_lifespan)


@app.get("/health")
def health():
    if not _connected:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={"ok": False, "reason": "nats_disconnected"},
        )
    return {"ok": True}


@app.get("/run")
def run_status():
    return {
        "node_id": os.environ.get("NODE_ID", ""),
        "shift": _SHIFT,
        "in_subjects": _in_subjects,
        "out_subjects": _out_subjects,
        "nats_connected": _connected,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
