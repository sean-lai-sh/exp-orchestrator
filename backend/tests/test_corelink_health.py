"""Tests for Corelink health monitoring."""

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from corelink_health import CorelinkStatus, HealthReport, check_corelink_health


@pytest.mark.asyncio
async def test_unconfigured_when_no_host(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CORELINK_HOST", raising=False)
    report = await check_corelink_health()
    assert report.status == CorelinkStatus.UNCONFIGURED
    assert report.latency_ms is None


@pytest.mark.asyncio
async def test_healthy_connection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORELINK_HOST", "localhost")
    monkeypatch.setenv("CORELINK_PORT", "20012")

    import corelink_health

    monkeypatch.setattr(corelink_health, "_HAS_WEBSOCKETS", True)

    # Mock websockets.connect as an async context manager
    mock_ws = AsyncMock()
    mock_ws.__aenter__ = AsyncMock(return_value=mock_ws)
    mock_ws.__aexit__ = AsyncMock(return_value=False)

    mock_websockets = MagicMock()
    mock_websockets.connect.return_value = mock_ws
    monkeypatch.setattr(corelink_health, "websockets", mock_websockets)

    report = await check_corelink_health()

    assert report.status == CorelinkStatus.HEALTHY
    assert report.latency_ms is not None


@pytest.mark.asyncio
async def test_unreachable_on_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORELINK_HOST", "unreachable-host")
    monkeypatch.setenv("CORELINK_PORT", "20012")

    import corelink_health

    monkeypatch.setattr(corelink_health, "_HAS_WEBSOCKETS", True)

    mock_websockets = MagicMock()
    mock_websockets.connect.side_effect = asyncio.TimeoutError()
    monkeypatch.setattr(corelink_health, "websockets", mock_websockets)

    report = await check_corelink_health()

    assert report.status == CorelinkStatus.UNREACHABLE
    assert report.error == "timeout"


@pytest.mark.asyncio
async def test_unreachable_on_connection_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORELINK_HOST", "bad-host")
    monkeypatch.setenv("CORELINK_PORT", "20012")

    import corelink_health

    monkeypatch.setattr(corelink_health, "_HAS_WEBSOCKETS", True)

    mock_websockets = MagicMock()
    mock_websockets.connect.side_effect = ConnectionRefusedError("refused")
    monkeypatch.setattr(corelink_health, "websockets", mock_websockets)

    report = await check_corelink_health()

    assert report.status == CorelinkStatus.UNREACHABLE
    assert "refused" in report.error


@pytest.mark.asyncio
async def test_websockets_not_installed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORELINK_HOST", "localhost")

    import corelink_health

    monkeypatch.setattr(corelink_health, "_HAS_WEBSOCKETS", False)

    report = await check_corelink_health()

    assert report.status == CorelinkStatus.UNREACHABLE
    assert "websockets" in report.error
