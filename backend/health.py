"""Liveness and readiness checks for the backend API."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import Optional


@dataclass
class CheckResult:
    ok: bool
    error: Optional[str] = None


def check_docker(timeout: float = 3.0) -> CheckResult:
    """Return whether the Docker daemon is reachable via `docker info`."""
    try:
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError:
        return CheckResult(ok=False, error="docker binary not found")
    except subprocess.TimeoutExpired:
        return CheckResult(ok=False, error="docker info timed out")
    except OSError as exc:
        return CheckResult(ok=False, error=str(exc) or "failed to execute docker info")

    if result.returncode == 0:
        return CheckResult(ok=True)

    stderr = result.stderr.decode("utf-8", errors="replace").strip()
    return CheckResult(ok=False, error=stderr or f"docker info exited {result.returncode}")
