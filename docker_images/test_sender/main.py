"""Test sender — publishes JSON messages to Corelink using orchestrator env vars.

Lifecycle
---------
1. On startup, reads orchestrator-injected env vars (NODE_ID, OUT_* stream creds,
   Corelink connection details) and starts a background publish loop.
2. Every SEND_INTERVAL_MS milliseconds, publishes a JSON message containing
   ``node_id``, a monotonically increasing ``seq`` counter, and a Unix timestamp
   to every configured OUT_* stream.
3. If Corelink credentials are absent, the container starts in HTTP-only mode
   and still exposes /health and /status — useful for smoke tests.

HTTP endpoints
--------------
GET /health  →  {"ok": true}
GET /status  →  current connection state, message count, and stream config
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

NODE_ID: str = os.getenv("NODE_ID", "test-sender")
NODE_TYPE: str = os.getenv("NODE_TYPE", "sender")
SEND_INTERVAL_MS: int = int(os.getenv("SEND_INTERVAL_MS", "2000"))

CORELINK_HOST: str = os.getenv("CORELINK_HOST", "")
CORELINK_PORT: int = int(os.getenv("CORELINK_PORT", "20010"))
CORELINK_USERNAME: str = os.getenv("CORELINK_USERNAME", "")
CORELINK_PASSWORD: str = os.getenv("CORELINK_PASSWORD", "")

# ---------------------------------------------------------------------------
# Stream env var parsing (same pattern as reference plugin)
# ---------------------------------------------------------------------------


def _parse_stream_env(prefix: str) -> dict[str, dict]:
    """Scan env for OUT_<TYPE>_WORKSPACE / _STREAM_ID / _PROTOCOL groups."""
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
    "messages_sent": 0,
    "last_message": None,
    "last_error": None,
}

# Corelink sender stream IDs (stream_type → corelink stream_id)
_out_senders: dict[str, int] = {}


# ---------------------------------------------------------------------------
# Publish loop
# ---------------------------------------------------------------------------


async def _publish_loop() -> None:
    """Connect to Corelink and publish messages at the configured interval."""
    if not (CORELINK_HOST and CORELINK_USERNAME and CORELINK_PASSWORD):
        print(f"[test-sender] CORELINK_HOST/USERNAME/PASSWORD not set — HTTP-only mode")
        return

    try:
        import corelink  # noqa: PLC0415

        await corelink.connect(CORELINK_USERNAME, CORELINK_PASSWORD, CORELINK_HOST, CORELINK_PORT)
        print(f"[test-sender] Connected to Corelink at {CORELINK_HOST}:{CORELINK_PORT}")
        _state["connected"] = True

        out_streams = _parse_stream_env("OUT_")
        for stream_type, cfg in out_streams.items():
            sid = await corelink.create_sender(
                workspace=cfg["workspace"],
                protocol="tcp",
                data_type=stream_type.lower(),
            )
            _out_senders[stream_type] = sid
            print(f"[test-sender] Sender ready: {stream_type} @ {cfg['workspace']} (stream_id={sid})")

        seq = 0
        while True:
            msg: dict = {
                "node_id": NODE_ID,
                "seq": seq,
                "ts": int(time.time() * 1000),
            }
            payload = json.dumps(msg).encode()
            for sid in _out_senders.values():
                await corelink.send(sid, payload)

            _state["messages_sent"] += 1
            _state["last_message"] = msg
            seq += 1
            await asyncio.sleep(SEND_INTERVAL_MS / 1000)

    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        _state["last_error"] = str(exc)
        print(f"[test-sender] ERROR: {exc}")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------


@asynccontextmanager
async def _lifespan(app: FastAPI):
    _log_startup()
    task = asyncio.create_task(_publish_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(lifespan=_lifespan)


def _log_startup() -> None:
    print(f"[test-sender] NODE_ID={NODE_ID} NODE_TYPE={NODE_TYPE}")
    for k, v in os.environ.items():
        if k.startswith("OUT_"):
            print(f"[test-sender]   {k}={v}")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/status")
def status():
    return {
        **_state,
        "node_id": NODE_ID,
        "node_type": NODE_TYPE,
        "out_streams": _parse_stream_env("OUT_"),
        "send_interval_ms": SEND_INTERVAL_MS,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
