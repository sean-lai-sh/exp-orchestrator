"""Demo receiver: subscribes to Corelink stream and prints received messages."""

from __future__ import annotations

import asyncio
import json
import os

import corelink
import corelink.resources.variables as cl_vars


async def on_data(data: bytes, stream_id: int, header: dict) -> None:
    """Called for every inbound message."""
    try:
        msg = json.loads(data)
        text = msg.get("text", "<no text>")
        seq = msg.get("seq", "?")
        print(f"[receiver] RECEIVED [seq={seq}]: {text}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        print(f"[receiver] RECEIVED (raw): {data[:200]}")


async def on_update(message: dict, key: str) -> None:
    """New sender appeared — subscribe to it."""
    stream_id = message.get("streamID")
    print(f"[receiver] Update: new stream {stream_id}")
    if stream_id:
        for rid in list(cl_vars.receiver.keys()):
            try:
                await corelink.subscribe_to_stream(rid, stream_id)
                print(f"[receiver] Subscribed to stream {stream_id}")
            except Exception as exc:
                print(f"[receiver] Subscribe failed: {exc}")


async def on_subscriber(message: dict, key: str) -> None:
    """Auto-subscribe to sender streams."""
    sender_id = message.get("senderID")
    print(f"[receiver] Subscriber alert: senderID={sender_id}")
    if sender_id:
        for rid in list(cl_vars.receiver.keys()):
            try:
                await corelink.subscribe_to_stream(rid, sender_id)
                print(f"[receiver] Subscribed to stream {sender_id}")
            except Exception as exc:
                print(f"[receiver] Subscribe failed: {exc}")


async def main() -> None:
    host = os.environ.get("CORELINK_HOST", "")
    port = os.environ.get("CORELINK_PORT", "20012")
    username = os.environ.get("CORELINK_USERNAME", "")
    password = os.environ.get("CORELINK_PASSWORD", "")

    workspace = os.environ.get("IN_JSON_WORKSPACE", "")

    if not (host and username and password):
        print("[receiver] ERROR: CORELINK_HOST/USERNAME/PASSWORD not set")
        return

    if not workspace:
        print("[receiver] ERROR: IN_JSON_WORKSPACE not set")
        return

    cl_vars.loop = asyncio.get_event_loop()

    await corelink.connect(username, password, host, port)
    print(f"[receiver] Connected to Corelink at {host}:{port}")

    await corelink.set_data_callback(on_data)
    await corelink.set_server_callback(on_update, "update")
    await corelink.set_server_callback(on_subscriber, "subscriber")

    rid = await corelink.create_receiver(
        workspace=workspace,
        protocol="tcp",
        data_type="json",
        alert=True,
    )
    print(f"[receiver] Receiver ready: workspace={workspace} receiverID={rid}")

    # Explicitly subscribe to any existing senders returned in the streamList
    receiver_info = cl_vars.receiver.get(rid, {})
    stream_list = receiver_info.get("streamList", [])
    print(f"[receiver] Existing streams: {stream_list}")
    for stream_info in stream_list:
        sid = stream_info.get("streamID")
        if sid:
            try:
                await corelink.subscribe_to_stream(rid, sid)
                print(f"[receiver] Subscribed to existing stream {sid}")
            except Exception as exc:
                print(f"[receiver] Subscribe to {sid} failed: {exc}")

    # Stay alive — Corelink delivers data via callbacks
    await asyncio.sleep(float("inf"))


if __name__ == "__main__":
    asyncio.run(main())
