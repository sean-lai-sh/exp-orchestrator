#!/usr/bin/env python3
"""Standalone receiver that auto-connects via relay (default) or Corelink."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

import requests


def fetch_credentials(host: str, deploy_id: str) -> dict:
    url = f"{host}/deployments/{deploy_id}/credentials"
    resp = requests.get(url, params={"role": "receiver"}, timeout=10)
    if resp.status_code != 200:
        print(f"Error fetching credentials: {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)
    return resp.json()


def run_relay(host: str, deploy_id: str) -> None:
    """Receive messages from the backend SSE relay (no Corelink needed)."""
    url = f"{host}/deployments/{deploy_id}/messages"

    print(f"Receiver connected via relay (deployment: {deploy_id})")
    print("Listening for messages (Ctrl+C to quit)...\n")

    try:
        with requests.get(url, stream=True, timeout=None) as resp:
            if resp.status_code != 200:
                print(f"Error: {resp.status_code} {resp.text}", file=sys.stderr)
                sys.exit(1)
            for line in resp.iter_lines(decode_unicode=True):
                if not line:
                    continue
                if line.startswith("data: "):
                    payload = json.loads(line[6:])
                    print(f"[received] {payload.get('message', '')}")
    except KeyboardInterrupt:
        print("\nDone.")


async def run_corelink(host: str, deploy_id: str) -> None:
    """Receive messages from a live Corelink server."""
    import corelink  # noqa: delayed import — only needed in corelink mode

    data = fetch_credentials(host, deploy_id)
    creds = data["credentials"]

    if not creds:
        print("No receiver credentials found in this deployment.", file=sys.stderr)
        sys.exit(1)

    stream_type = next(iter(creds))
    cred = creds[stream_type]
    workspace = cred["workspace"]
    protocol = cred.get("protocol", "pubsub")

    print(f"Connecting to Corelink as receiver...")
    print(f"  Workspace : {workspace}")
    print(f"  Data type : {stream_type}\n")

    await corelink.connect("Corelink", "Corelink2023")

    async def callback(data: bytes, _streamID, _header) -> None:
        try:
            message = data.decode("utf-8")
        except UnicodeDecodeError:
            message = repr(data)
        print(f"[received] {message}")

    await corelink.create_receiver(
        workspace=workspace, protocol=protocol,
        data_type=stream_type, on_data=callback,
    )

    print("Connected! Listening for messages (Ctrl+C to quit)...\n")

    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("\nDisconnecting...")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Auto-connect receiver for a deployment")
    parser.add_argument("deploy_id", help="Deployment ID from the orchestrator")
    parser.add_argument(
        "--host", default="http://localhost:8000",
        help="Backend URL (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--mode", choices=["relay", "corelink"], default="relay",
        help="Message transport (default: relay — no Corelink server needed)",
    )
    args = parser.parse_args()

    if args.mode == "corelink":
        asyncio.run(run_corelink(args.host, args.deploy_id))
    else:
        run_relay(args.host, args.deploy_id)
