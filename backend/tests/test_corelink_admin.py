"""Unit tests for corelink_admin (mocked HTTP)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_provision_result_dataclass_shape():
    from corelink_admin import CorelinkProvisionResult

    r = CorelinkProvisionResult(
        workspace="workflow_abc",
        host="localhost",
        port=20012,
        username="Testuser",
        password="Testpassword",
    )
    assert r.workspace == "workflow_abc"
    assert r.port == 20012


def test_admin_error_is_exception():
    from corelink_admin import CorelinkAdminError

    assert issubclass(CorelinkAdminError, Exception)


@pytest.mark.asyncio
async def test_provision_deployment_happy_path(monkeypatch):
    import corelink_admin as ca

    monkeypatch.setenv("CORELINK_HOST", "localhost")
    monkeypatch.setenv("CORELINK_PORT", "20012")
    monkeypatch.setenv("CORELINK_PROVISION_TOKEN", "secret")

    captured = {}

    class FakeResponse:
        def __init__(self, status_code, payload):
            self.status_code = status_code
            self._payload = payload

        def json(self):
            return self._payload

        @property
        def text(self):
            import json
            return json.dumps(self._payload)

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            captured["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, json=None, headers=None):
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers
            return FakeResponse(200, {
                "workspace": "workflow_abc12345",
                "host": "1.2.3.4",
                "port": 20012,
                "username": "Testuser",
                "password": "Testpassword",
            })

    monkeypatch.setattr(ca, "httpx", type("M", (), {"AsyncClient": FakeAsyncClient}))

    result = await ca.provision_deployment("abc12345")

    assert result.workspace == "workflow_abc12345"
    assert result.host == "1.2.3.4"
    assert result.port == 20012
    assert result.username == "Testuser"
    assert captured["url"] == "https://localhost:20012/api/provision"
    assert captured["json"] == {"deploy_id": "abc12345"}
    assert captured["headers"]["X-Provision-Token"] == "secret"


@pytest.mark.asyncio
async def test_provision_deployment_timeout(monkeypatch):
    import corelink_admin as ca

    monkeypatch.setenv("CORELINK_HOST", "localhost")
    monkeypatch.setenv("CORELINK_PORT", "20012")
    monkeypatch.setenv("CORELINK_PROVISION_TOKEN", "secret")

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *exc): return False
        async def post(self, *args, **kwargs):
            raise __import__("httpx").ConnectTimeout("timeout")

    monkeypatch.setattr(ca, "httpx", type("M", (), {
        "AsyncClient": FakeAsyncClient,
        "HTTPError": ca.httpx.HTTPError,
        "ConnectTimeout": ca.httpx.ConnectTimeout,
    }))

    with pytest.raises(ca.CorelinkAdminError, match="corelink unreachable"):
        await ca.provision_deployment("abc")


@pytest.mark.asyncio
async def test_provision_deployment_unauthorized(monkeypatch):
    import corelink_admin as ca

    monkeypatch.setenv("CORELINK_HOST", "localhost")
    monkeypatch.setenv("CORELINK_PORT", "20012")
    monkeypatch.setenv("CORELINK_PROVISION_TOKEN", "wrong")

    class FakeResponse:
        status_code = 401
        text = '{"error":"unauthorized"}'
        def json(self): return {"error": "unauthorized"}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *exc): return False
        async def post(self, *a, **k): return FakeResponse()

    monkeypatch.setattr(ca, "httpx", type("M", (), {
        "AsyncClient": FakeAsyncClient,
        "HTTPError": ca.httpx.HTTPError,
    }))

    with pytest.raises(ca.CorelinkAdminError, match="rejected provision token"):
        await ca.provision_deployment("abc")


@pytest.mark.asyncio
async def test_provision_deployment_server_error(monkeypatch):
    import corelink_admin as ca

    monkeypatch.setenv("CORELINK_HOST", "localhost")
    monkeypatch.setenv("CORELINK_PORT", "20012")
    monkeypatch.setenv("CORELINK_PROVISION_TOKEN", "secret")

    class FakeResponse:
        status_code = 500
        text = '{"error":"oops"}'
        def json(self): return {"error": "oops"}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *exc): return False
        async def post(self, *a, **k): return FakeResponse()

    monkeypatch.setattr(ca, "httpx", type("M", (), {
        "AsyncClient": FakeAsyncClient,
        "HTTPError": ca.httpx.HTTPError,
    }))

    with pytest.raises(ca.CorelinkAdminError, match="HTTP 500"):
        await ca.provision_deployment("abc")
