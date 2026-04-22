"""Corelink server health monitoring."""

import asyncio
import os
import ssl
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional

try:
    import websockets

    _HAS_WEBSOCKETS = True
except ImportError:
    websockets = None  # type: ignore[assignment]
    _HAS_WEBSOCKETS = False


class CorelinkStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNREACHABLE = "unreachable"
    UNCONFIGURED = "unconfigured"


@dataclass
class HealthReport:
    status: CorelinkStatus
    latency_ms: Optional[float] = None
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {"status": self.status.value, "latency_ms": self.latency_ms, "error": self.error}


async def check_corelink_health(timeout: float = 5.0) -> HealthReport:
    """Probe Corelink server via WSS handshake.

    Returns a HealthReport indicating whether the server is reachable
    and how long the connection took.
    """
    host = os.getenv("CORELINK_HOST")
    port = os.getenv("CORELINK_PORT", "20012")

    if not host:
        return HealthReport(status=CorelinkStatus.UNCONFIGURED)

    if not _HAS_WEBSOCKETS:
        return HealthReport(
            status=CorelinkStatus.UNREACHABLE,
            error="websockets package not installed",
        )

    uri = f"wss://{host}:{port}"
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    try:
        start = time.monotonic()
        async with websockets.connect(uri, ssl=ssl_ctx, open_timeout=timeout):
            latency = (time.monotonic() - start) * 1000
            if latency > 2000:
                return HealthReport(
                    status=CorelinkStatus.DEGRADED, latency_ms=latency
                )
            return HealthReport(status=CorelinkStatus.HEALTHY, latency_ms=latency)
    except asyncio.TimeoutError:
        return HealthReport(status=CorelinkStatus.UNREACHABLE, error="timeout")
    except Exception as e:
        return HealthReport(status=CorelinkStatus.UNREACHABLE, error=str(e))
