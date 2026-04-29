"""NATS broker provisioning for deployments.

Each deployment maps to a logical workspace (``workflow_<deploy_id>``) and a
subject prefix (``deploy.<deploy_id>``). Provisioning verifies the broker is
reachable; subjects themselves are ephemeral and require no server-side state
for the demo's pub/sub flow.

JetStream durability can be layered on later by creating a stream over
``deploy.<deploy_id>.>`` here — for now core NATS keeps the path short.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import nats

_DEFAULT_TIMEOUT = 5.0


class BrokerAdminError(Exception):
    """Raised when provisioning/unprovisioning a deployment fails."""


@dataclass
class BrokerProvisionResult:
    workspace: str
    host: str
    port: int
    token: str
    subject_prefix: str


def _nats_host() -> str:
    """Host the backend uses to reach NATS itself (e.g. localhost)."""
    host = os.getenv("NATS_HOST")
    if not host:
        raise BrokerAdminError("NATS_HOST not set")
    return host


def _nats_public_host() -> str:
    """Host returned to plugins / sender / receiver. Defaults to NATS_HOST.

    When the backend runs on the host but plugins run in Docker, set
    NATS_PUBLIC_HOST=host.docker.internal so plugins can reach the same broker.
    """
    return os.getenv("NATS_PUBLIC_HOST") or _nats_host()


def _nats_port() -> int:
    return int(os.getenv("NATS_PORT", "4222"))


def _nats_token() -> str:
    return os.getenv("NATS_TOKEN", "")


def _nats_url() -> str:
    return f"nats://{_nats_host()}:{_nats_port()}"


async def _connect():
    token = _nats_token()
    try:
        return await nats.connect(
            _nats_url(),
            token=token or None,
            connect_timeout=_DEFAULT_TIMEOUT,
            allow_reconnect=False,
        )
    except Exception as e:
        raise BrokerAdminError(f"nats unreachable: {e}") from e


async def provision_deployment(deploy_id: str) -> BrokerProvisionResult:
    """Verify the broker is reachable and return a connect block for this deploy.

    Idempotent: subjects are ephemeral so re-provisioning a deploy_id is a no-op
    on the server side.
    """
    nc = await _connect()
    try:
        return BrokerProvisionResult(
            workspace=f"workflow_{deploy_id}",
            host=_nats_public_host(),
            port=_nats_port(),
            token=_nats_token(),
            subject_prefix=f"deploy.{deploy_id}",
        )
    finally:
        await nc.close()


async def unprovision_deployment(deploy_id: str) -> None:
    """No-op for core NATS — subjects are ephemeral with no server-side state.

    Kept to preserve the admin interface; when JetStream is added this will
    delete the per-deploy stream.
    """
    return None
