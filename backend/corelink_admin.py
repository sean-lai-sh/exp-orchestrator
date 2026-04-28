"""HTTP client for the corelink-server provisioning routes.

All Corelink-specific deploy-time logic lives here. Removing this file is
step 1 of ripping Corelink out of the backend.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import httpx

_DEFAULT_TIMEOUT = 5.0


class CorelinkAdminError(Exception):
    """Raised when provisioning/unprovisioning a deployment fails."""


@dataclass
class CorelinkProvisionResult:
    workspace: str
    host: str
    port: int
    username: str
    password: str


def _server_url() -> str:
    host = os.getenv("CORELINK_HOST")
    port = os.getenv("CORELINK_PORT", "20012")
    if not host:
        raise CorelinkAdminError("CORELINK_HOST not set")
    return f"https://{host}:{port}"


def _provision_token() -> str:
    token = os.getenv("CORELINK_PROVISION_TOKEN")
    if not token:
        raise CorelinkAdminError("CORELINK_PROVISION_TOKEN not set")
    return token


async def provision_deployment(deploy_id: str) -> CorelinkProvisionResult:
    """POST /api/provision on corelink-server. Idempotent: server returns same blob on repeat."""
    url = f"{_server_url()}/api/provision"
    headers = {"X-Provision-Token": _provision_token(), "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(verify=False, timeout=_DEFAULT_TIMEOUT) as client:
            resp = await client.post(url, json={"deploy_id": deploy_id}, headers=headers)
    except httpx.HTTPError as e:
        raise CorelinkAdminError(f"corelink unreachable: {e}") from e

    if resp.status_code == 401 or resp.status_code == 403:
        raise CorelinkAdminError(f"corelink rejected provision token (HTTP {resp.status_code})")
    if resp.status_code != 200:
        raise CorelinkAdminError(f"provision failed: HTTP {resp.status_code} {resp.text}")

    body = resp.json()
    return CorelinkProvisionResult(
        workspace=body["workspace"],
        host=body["host"],
        port=int(body["port"]),
        username=body["username"],
        password=body["password"],
    )
