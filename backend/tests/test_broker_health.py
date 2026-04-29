"""Tests for NATS broker health monitoring."""

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from broker_health import BrokerStatus, check_broker_health


@pytest.mark.asyncio
async def test_unconfigured_when_no_host(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("NATS_HOST", raising=False)
    report = await check_broker_health()
    assert report.status == BrokerStatus.UNCONFIGURED
    assert report.latency_ms is None


@pytest.mark.asyncio
async def test_healthy_connection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NATS_HOST", "localhost")
    monkeypatch.setenv("NATS_PORT", "4222")

    import broker_health

    monkeypatch.setattr(broker_health, "_HAS_NATS", True)

    async def fake_connect(*args, **kwargs):
        nc = AsyncMock()
        nc.close = AsyncMock()
        return nc

    monkeypatch.setattr(broker_health, "nats", type("M", (), {"connect": fake_connect}))

    report = await check_broker_health()
    assert report.status == BrokerStatus.HEALTHY
    assert report.latency_ms is not None


@pytest.mark.asyncio
async def test_unreachable_on_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NATS_HOST", "unreachable-host")

    import broker_health

    monkeypatch.setattr(broker_health, "_HAS_NATS", True)

    async def fake_connect(*args, **kwargs):
        raise asyncio.TimeoutError()

    monkeypatch.setattr(broker_health, "nats", type("M", (), {"connect": fake_connect}))

    report = await check_broker_health()
    assert report.status == BrokerStatus.UNREACHABLE
    assert report.error == "timeout"


@pytest.mark.asyncio
async def test_unreachable_on_connection_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NATS_HOST", "bad-host")

    import broker_health

    monkeypatch.setattr(broker_health, "_HAS_NATS", True)

    async def fake_connect(*args, **kwargs):
        raise ConnectionRefusedError("refused")

    monkeypatch.setattr(broker_health, "nats", type("M", (), {"connect": fake_connect}))

    report = await check_broker_health()
    assert report.status == BrokerStatus.UNREACHABLE
    assert "refused" in report.error


@pytest.mark.asyncio
async def test_nats_not_installed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NATS_HOST", "localhost")

    import broker_health

    monkeypatch.setattr(broker_health, "_HAS_NATS", False)

    report = await check_broker_health()
    assert report.status == BrokerStatus.UNREACHABLE
    assert "nats-py" in report.error
