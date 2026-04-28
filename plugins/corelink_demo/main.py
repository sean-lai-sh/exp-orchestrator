"""
corelink_demo plugin.

Subscribes to all IN_* streams, runs `_transform` on each message, publishes
to all OUT_* streams. Mirrors plugins/reference_plugin/main.py — keep them
in sync if reference_plugin's structure changes.

This entire directory is part of the Corelink rip-out: deleting
plugins/corelink_demo/ removes the plugin without affecting other code.
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

import corelink
import uvicorn
from fastapi import FastAPI

_out_senders: dict[str, int] = {}
# data_type (lowercase) → receiver_id, populated as create_receiver returns.
# Used to route stream-alert subscriptions to the correct receiver.
_in_receivers: dict[str, int] = {}
_connected: bool = False


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


def _transform(data: bytes) -> bytes:
    """Demo transform: uppercase UTF-8 text. Non-UTF-8 passes through."""
    try:
        return data.decode("utf-8").upper().encode("utf-8")
    except UnicodeDecodeError:
        return data


async def _on_data(data: bytes, stream_id: int, header: dict) -> None:
    try:
        result = _transform(data)
    except Exception as e:
        print(f"[demo-plugin] transform error on stream_id={stream_id}: {e}")
        return
    # Python corelink.send expects str (it calls .encode() internally).
    # _transform returns bytes; decode with `replace` so non-UTF-8 still ships.
    text = result.decode("utf-8", errors="replace")
    for sid in _out_senders.values():
        await corelink.send(sid, text)


async def _on_stream_update(message: dict, key: str) -> None:
    """Subscribe to new senders that arrive after we created our receiver.

    Corelink fires this callback (key='update') for every alert. Stream-alert
    messages carry a `streamID` and a `type` indicating which of our receivers
    should subscribe. The Python corelink client's API is
    subscribe_to_stream(receiver_id, stream_id) — we look up the receiver_id
    by data type (the message's 'type' field, mirroring create_receiver's
    data_type).
    """
    sid = message.get("streamID")
    if sid is None:
        return
    msg_type = (message.get("type") or "").lower()
    receiver_id = _in_receivers.get(msg_type)
    if receiver_id is None:
        # Fall back to subscribing on every receiver we have, in case the
        # type field is missing or differently cased.
        targets = list(_in_receivers.values())
    else:
        targets = [receiver_id]
    for rid in targets:
        try:
            await corelink.subscribe_to_stream(rid, sid)
            print(f"[demo-plugin] subscribed receiver {rid} to stream {sid} (type={msg_type})")
        except Exception as e:
            print(f"[demo-plugin] subscribe error r={rid} s={sid}: {e}")


async def _corelink_loop() -> None:
    host = os.environ.get("CORELINK_HOST", "")
    port = int(os.environ.get("CORELINK_PORT", "20012"))
    username = os.environ.get("CORELINK_USERNAME", "")
    password = os.environ.get("CORELINK_PASSWORD", "")

    if not (host and username and password):
        print("[demo-plugin] CORELINK_HOST/USERNAME/PASSWORD not set — idle")
        return

    await corelink.connect(username, password, host, port)
    global _connected
    _connected = True
    print(f"[demo-plugin] Connected to Corelink at {host}:{port}")

    await corelink.set_data_callback(_on_data)
    # Subscribe to senders that arrive after the receiver is set up.
    # The Python corelink client doesn't auto-subscribe via alert=True;
    # we have to explicitly handle the 'update' callback.
    await corelink.set_server_callback(_on_stream_update, "update")

    in_streams = _parse_stream_env("IN_")
    for stream_type, cfg in in_streams.items():
        # stream_ids MUST be empty — they filter by NUMERIC server-assigned IDs,
        # not the orchestrator's logical stream_id string. The alert=True flag
        # delivers receiver-callbacks for matching senders.
        receiver_id = await corelink.create_receiver(
            workspace=cfg["workspace"],
            protocol="ws",
            data_type=stream_type.lower(),
            stream_ids=[],
            alert=True,
        )
        _in_receivers[stream_type.lower()] = receiver_id
        print(f"[demo-plugin] Receiver ready: {stream_type} @ {cfg['workspace']} (rid={receiver_id})")

    out_streams = _parse_stream_env("OUT_")
    for stream_type, cfg in out_streams.items():
        sid = await corelink.create_sender(
            workspace=cfg["workspace"],
            protocol="ws",
            data_type=stream_type.lower(),
        )
        _out_senders[stream_type] = sid
        print(f"[demo-plugin] Sender ready: {stream_type} @ {cfg['workspace']} (sid={sid})")

    await asyncio.sleep(float("inf"))


@asynccontextmanager
async def _lifespan(app: FastAPI):
    print(f"[demo-plugin] NODE_ID={os.environ.get('NODE_ID', '')}")
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
    # Returns 503 when Corelink isn't connected so that the orchestrator
    # (and human operators) can distinguish "container running" from
    # "container running AND data plane wired up". Liveness-style probes
    # should use a different endpoint if they want process-only health.
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
        "in_streams": _parse_stream_env("IN_"),
        "out_streams": _parse_stream_env("OUT_"),
        "out_sender_ids": _out_senders,
        "corelink_connected": _connected,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
