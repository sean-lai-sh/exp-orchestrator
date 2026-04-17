"""
Reference sender harness — use this to feed test data into the plugin's IN stream.

Usage:
    CORELINK_HOST=... CORELINK_USERNAME=... CORELINK_PASSWORD=... \\
    IN_JSON_WORKSPACE=<workspace> \\
    python tests/ref_sender.py [--count 5] [--interval 1.0]

The workspace and stream type must match what the plugin's IN_*_WORKSPACE env var is set to.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time


def _require_env(key: str) -> str:
    val = os.environ.get(key, "")
    if not val:
        raise SystemExit(f"[ref_sender] Required env var not set: {key}")
    return val


async def run(workspace: str, data_type: str, count: int, interval: float) -> None:
    import corelink

    host = _require_env("CORELINK_HOST")
    port = int(os.environ.get("CORELINK_PORT", "20010"))
    username = _require_env("CORELINK_USERNAME")
    password = _require_env("CORELINK_PASSWORD")

    await corelink.connect(username, password, host, port)
    print(f"[ref_sender] Connected to {host}:{port}")

    stream_id = await corelink.create_sender(
        workspace=workspace,
        protocol="tcp",
        data_type=data_type,
        sender="ref_sender",
    )
    print(f"[ref_sender] Created sender stream_id={stream_id} workspace={workspace} type={data_type}")

    for i in range(count):
        payload = json.dumps({
            "seq": i,
            "timestamp": time.time(),
            "value": f"test-message-{i}",
        }).encode()
        await corelink.send(stream_id, payload)
        print(f"[ref_sender] Sent message {i + 1}/{count}: {payload.decode()}")
        if i < count - 1:
            await asyncio.sleep(interval)

    print("[ref_sender] Done.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Reference Corelink sender for plugin testing")
    parser.add_argument("--workspace", default=os.environ.get("IN_JSON_WORKSPACE", ""),
                        help="Corelink workspace (falls back to IN_JSON_WORKSPACE env var)")
    parser.add_argument("--data-type", default="json", help="Stream data type (default: json)")
    parser.add_argument("--count", type=int, default=5, help="Number of messages to send")
    parser.add_argument("--interval", type=float, default=1.0, help="Seconds between messages")
    args = parser.parse_args()

    if not args.workspace:
        raise SystemExit("[ref_sender] --workspace or IN_JSON_WORKSPACE env var is required")

    corelink = __import__("corelink")
    corelink.run(run(args.workspace, args.data_type, args.count, args.interval))


if __name__ == "__main__":
    main()
