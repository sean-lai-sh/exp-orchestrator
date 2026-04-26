"""Demo sender: publishes plaintext messages to Corelink."""

from __future__ import annotations

import asyncio
import json
import os
import time

import corelink
import corelink.resources.variables as cl_vars

MESSAGES = [
    "Hello World",
    "The quick brown fox jumps over the lazy dog",
    "Attack at dawn",
    "Corelink orchestration demo",
    "Data flows through plugins",
]


async def main() -> None:
    host = os.environ.get("CORELINK_HOST", "")
    port = os.environ.get("CORELINK_PORT", "20012")
    username = os.environ.get("CORELINK_USERNAME", "")
    password = os.environ.get("CORELINK_PASSWORD", "")

    workspace = os.environ.get("OUT_JSON_WORKSPACE", "")
    stream_id = os.environ.get("OUT_JSON_STREAM_ID", "")

    if not (host and username and password):
        print("[sender] ERROR: CORELINK_HOST/USERNAME/PASSWORD not set")
        return

    if not workspace:
        print("[sender] ERROR: OUT_JSON_WORKSPACE not set")
        return

    cl_vars.loop = asyncio.get_event_loop()

    await corelink.connect(username, password, host, port)
    print(f"[sender] Connected to Corelink at {host}:{port}")

    sid = await corelink.create_sender(
        workspace=workspace,
        protocol="tcp",
        data_type="json",
    )
    print(f"[sender] Sender ready: workspace={workspace} stream_id={sid}")

    seq = 0
    while True:
        text = MESSAGES[seq % len(MESSAGES)]
        msg = {"text": text, "timestamp": time.time(), "seq": seq}
        payload = json.dumps(msg)
        await corelink.send(sid, payload)
        print(f"[sender] SENT [seq={seq}]: {text}")
        seq += 1
        await asyncio.sleep(3)


if __name__ == "__main__":
    asyncio.run(main())
