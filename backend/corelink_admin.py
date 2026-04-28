"""HTTP client for the corelink-server provisioning routes.

All Corelink-specific deploy-time logic lives here. Removing this file is
step 1 of ripping Corelink out of the backend.
"""

from __future__ import annotations

from dataclasses import dataclass


class CorelinkAdminError(Exception):
    """Raised when provisioning/unprovisioning a deployment fails."""


@dataclass
class CorelinkProvisionResult:
    workspace: str
    host: str
    port: int
    username: str
    password: str
