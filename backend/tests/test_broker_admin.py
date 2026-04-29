"""Unit tests for broker_admin (mocked NATS client)."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_provision_result_dataclass_shape():
    from broker_admin import BrokerProvisionResult

    r = BrokerProvisionResult(
        workspace="workflow_abc",
        host="localhost",
        port=4222,
        token="tok",
        subject_prefix="deploy.abc",
    )
    assert r.workspace == "workflow_abc"
    assert r.port == 4222
    assert r.subject_prefix == "deploy.abc"


def test_admin_error_is_exception():
    from broker_admin import BrokerAdminError

    assert issubclass(BrokerAdminError, Exception)


@pytest.mark.asyncio
async def test_provision_deployment_happy_path(monkeypatch):
    import broker_admin as ba

    monkeypatch.setenv("NATS_HOST", "localhost")
    monkeypatch.setenv("NATS_PORT", "4222")
    monkeypatch.setenv("NATS_TOKEN", "secret")

    captured = {}

    async def fake_connect(url, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        nc = AsyncMock()
        nc.close = AsyncMock()
        return nc

    monkeypatch.setattr(ba, "nats", type("M", (), {"connect": fake_connect}))

    result = await ba.provision_deployment("abc12345")

    assert result.workspace == "workflow_abc12345"
    assert result.host == "localhost"
    assert result.port == 4222
    assert result.token == "secret"
    assert result.subject_prefix == "deploy.abc12345"
    assert captured["url"] == "nats://localhost:4222"
    assert captured["kwargs"]["token"] == "secret"


@pytest.mark.asyncio
async def test_provision_deployment_missing_host(monkeypatch):
    import broker_admin as ba

    monkeypatch.delenv("NATS_HOST", raising=False)

    with pytest.raises(ba.BrokerAdminError, match="NATS_HOST not set"):
        await ba.provision_deployment("abc")


@pytest.mark.asyncio
async def test_provision_deployment_unreachable(monkeypatch):
    import broker_admin as ba

    monkeypatch.setenv("NATS_HOST", "localhost")
    monkeypatch.setenv("NATS_PORT", "4222")

    async def fake_connect(*args, **kwargs):
        raise OSError("connection refused")

    monkeypatch.setattr(ba, "nats", type("M", (), {"connect": fake_connect}))

    with pytest.raises(ba.BrokerAdminError, match="nats unreachable"):
        await ba.provision_deployment("abc")


@pytest.mark.asyncio
async def test_provision_deployment_passes_no_token_when_unset(monkeypatch):
    import broker_admin as ba

    monkeypatch.setenv("NATS_HOST", "localhost")
    monkeypatch.setenv("NATS_PORT", "4222")
    monkeypatch.delenv("NATS_TOKEN", raising=False)

    captured = {}

    async def fake_connect(url, **kwargs):
        captured["kwargs"] = kwargs
        nc = AsyncMock()
        nc.close = AsyncMock()
        return nc

    monkeypatch.setattr(ba, "nats", type("M", (), {"connect": fake_connect}))

    result = await ba.provision_deployment("abc")
    assert result.token == ""
    assert captured["kwargs"]["token"] is None


@pytest.mark.asyncio
async def test_unprovision_deployment_is_noop():
    import broker_admin as ba

    # Pure no-op — must not raise even if NATS_HOST unset.
    await ba.unprovision_deployment("anything")


@pytest.mark.asyncio
async def test_provision_returns_public_host_when_set(monkeypatch):
    import broker_admin as ba

    monkeypatch.setenv("NATS_HOST", "localhost")
    monkeypatch.setenv("NATS_PUBLIC_HOST", "host.docker.internal")
    monkeypatch.setenv("NATS_PORT", "4222")

    captured = {}

    async def fake_connect(url, **kwargs):
        captured["url"] = url
        nc = AsyncMock()
        nc.close = AsyncMock()
        return nc

    monkeypatch.setattr(ba, "nats", type("M", (), {"connect": fake_connect}))

    result = await ba.provision_deployment("abc")
    # Backend connects to the private host
    assert captured["url"] == "nats://localhost:4222"
    # But returns the public host so plugins/scripts can reach the same broker
    assert result.host == "host.docker.internal"
