"""
Reference receiver harness — subscribe to the plugin's OUT stream and print messages.

Usage:
    CORELINK_HOST=... CORELINK_USERNAME=... CORELINK_PASSWORD=... \\
    OUT_JSON_WORKSPACE=<workspace> \\
    python tests/ref_receiver.py [--timeout 30]

Ctrl-C to stop. Set --timeout to auto-exit after N seconds of no messages.
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
        raise SystemExit(f"[ref_receiver] Required env var not set: {key}")
    return val


_received: list[dict] = []
_last_received_at: float = 0.0


async def _on_data(data: bytes, stream_id: int, header: dict) -> None:
    global _last_received_at
    _last_received_at = time.time()
    try:
        decoded = json.loads(data)
    except Exception:
        decoded = data.decode(errors="replace")
    _received.append({"stream_id": stream_id, "data": decoded, "header": header})
    print(f"[ref_receiver] Received (stream={stream_id}): {decoded}")


async def run(workspace: str, data_type: str, stream_id_filter: str, timeout: float) -> None:
    import corelink

    host = _require_env("CORELINK_HOST")
    port = int(os.environ.get("CORELINK_PORT", "20010"))
    username = _require_env("CORELINK_USERNAME")
    password = _require_env("CORELINK_PASSWORD")

    await corelink.connect(username, password, host, port)
    print(f"[ref_receiver] Connected to {host}:{port}")

    await corelink.set_data_callback(_on_data)

    stream_ids = [stream_id_filter] if stream_id_filter else []
    await corelink.create_receiver(
        workspace=workspace,
        protocol="tcp",
        data_type=data_type,
        stream_ids=stream_ids,
        alert=True,
        receiver_id="ref_receiver",
    )
    print(f"[ref_receiver] Subscribed: workspace={workspace} type={data_type} "
          f"stream_ids={stream_ids or 'any'}")
    print("[ref_receiver] Waiting for messages (Ctrl-C to stop) ...")

    global _last_received_at
    _last_received_at = time.time()

    while True:
        await asyncio.sleep(1)
        if timeout > 0 and (time.time() - _last_received_at) > timeout:
            print(f"[ref_receiver] No messages for {timeout}s — exiting.")
            break

    print(f"[ref_receiver] Total received: {len(_received)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Reference Corelink receiver for plugin testing")
    parser.add_argument("--workspace", default=os.environ.get("OUT_JSON_WORKSPACE", ""),
                        help="Corelink workspace (falls back to OUT_JSON_WORKSPACE env var)")
    parser.add_argument("--data-type", default="json", help="Stream data type (default: json)")
    parser.add_argument("--stream-id", default="", help="Optional: subscribe to a specific stream ID")
    parser.add_argument("--timeout", type=float, default=30.0,
                        help="Exit after N seconds of no messages (0 = run forever)")
    args = parser.parse_args()

    if not args.workspace:
        raise SystemExit("[ref_receiver] --workspace or OUT_JSON_WORKSPACE env var is required")

    corelink = __import__("corelink")
    corelink.run(run(args.workspace, args.data_type, args.stream_id, args.timeout))


if __name__ == "__main__":
    main()
