#!/usr/bin/env python3
"""Standalone sender that auto-connects via relay (default) or Corelink."""

from __future__ import annotations

import argparse
import asyncio
import sys

import requests


def fetch_credentials(host: str, deploy_id: str) -> dict:
    url = f"{host}/deployments/{deploy_id}/credentials"
    resp = requests.get(url, params={"role": "sender"}, timeout=10)
    if resp.status_code != 200:
        print(f"Error fetching credentials: {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)
    return resp.json()


async def run_relay(host: str, deploy_id: str) -> None:
    """Send messages through the backend HTTP relay (no Corelink needed)."""
    url = f"{host}/deployments/{deploy_id}/messages"

    print(f"Sender connected via relay (deployment: {deploy_id})")
    print("Type messages to send (Ctrl+C to quit):\n")

    try:
        while True:
            line = await asyncio.get_event_loop().run_in_executor(
                None, lambda: input("> ")
            )
            if not line:
                continue
            resp = requests.post(url, json={"data": line}, timeout=10)
            if resp.status_code == 200:
                info = resp.json()
                print(f"  sent ({info.get('listeners', 0)} listeners)")
            else:
                print(f"  error: {resp.status_code} {resp.text}", file=sys.stderr)
    except (KeyboardInterrupt, EOFError):
        print("\nDone.")


async def run_corelink(host: str, deploy_id: str) -> None:
    """Send messages through a live Corelink server."""
    import corelink  # noqa: delayed import — only needed in corelink mode

    data = fetch_credentials(host, deploy_id)
    creds = data["credentials"]

    if not creds:
        print("No sender credentials found in this deployment.", file=sys.stderr)
        sys.exit(1)

    stream_type = next(iter(creds))
    cred = creds[stream_type]
    workspace = cred["workspace"]
    protocol = cred.get("protocol", "pubsub")

    print(f"Connecting to Corelink as sender...")
    print(f"  Workspace : {workspace}")
    print(f"  Data type : {stream_type}\n")

    await corelink.connect("Corelink", "Corelink2023")
    sender = await corelink.create_sender(
        workspace=workspace, protocol=protocol, data_type=stream_type,
    )

    print("Connected! Type messages to send (Ctrl+C to quit):\n")

    try:
        while True:
            line = await asyncio.get_event_loop().run_in_executor(
                None, lambda: input("> ")
            )
            if not line:
                continue
            await sender.send(line.encode("utf-8"))
            print(f"  sent: {line}")
    except (KeyboardInterrupt, EOFError):
        print("\nDisconnecting...")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Auto-connect sender for a deployment")
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
        asyncio.run(run_relay(args.host, args.deploy_id))
