"""NATS broker health monitoring."""

from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from enum import Enum
from typing import Optional

try:
    import nats

    _HAS_NATS = True
except ImportError:
    nats = None  # type: ignore[assignment]
    _HAS_NATS = False


class BrokerStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNREACHABLE = "unreachable"
    UNCONFIGURED = "unconfigured"


@dataclass
class HealthReport:
    status: BrokerStatus
    latency_ms: Optional[float] = None
    error: Optional[str] = None


async def check_broker_health(timeout: float = 5.0) -> HealthReport:
    """Probe NATS by opening and closing a client connection."""
    host = os.getenv("NATS_HOST")
    port = os.getenv("NATS_PORT", "4222")

    if not host:
        return HealthReport(status=BrokerStatus.UNCONFIGURED)

    if not _HAS_NATS:
        return HealthReport(
            status=BrokerStatus.UNREACHABLE,
            error="nats-py package not installed",
        )

    token = os.getenv("NATS_TOKEN", "") or None
    url = f"nats://{host}:{port}"
    try:
        start = time.monotonic()
        nc = await nats.connect(
            url, token=token, connect_timeout=timeout, allow_reconnect=False
        )
        latency = (time.monotonic() - start) * 1000
        await nc.close()
        if latency > 2000:
            return HealthReport(status=BrokerStatus.DEGRADED, latency_ms=latency)
        return HealthReport(status=BrokerStatus.HEALTHY, latency_ms=latency)
    except asyncio.TimeoutError:
        return HealthReport(status=BrokerStatus.UNREACHABLE, error="timeout")
    except Exception as e:
        return HealthReport(status=BrokerStatus.UNREACHABLE, error=str(e))
