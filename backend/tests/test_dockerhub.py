"""Tests for the Docker Hub search proxy (backend/dockerhub.py).

All external HTTP calls are mocked so the suite runs without network access.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import allowlist
import dockerhub
import main


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_response(payload: dict, status_code: int = 200) -> MagicMock:
    """Return a mock httpx.Response-like object."""
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = payload
    mock.raise_for_status = MagicMock()
    return mock


def _write_allowlist(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


# ---------------------------------------------------------------------------
# search_images unit tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_search_images_returns_annotated_results(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """search_images annotates results with allowlist approval status."""
    allowlist_path = tmp_path / "config" / "allowed_images.json"
    _write_allowlist(allowlist_path, {"nginx:latest": {"approved": True}})
    monkeypatch.setattr(allowlist, "ALLOWLIST_PATH", allowlist_path)

    fake_payload = {
        "count": 2,
        "results": [
            {"repo_name": "nginx:latest", "description": "Official nginx"},
            {"repo_name": "redis:latest", "description": "Official redis"},
        ],
    }

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=_mock_response(fake_payload))

    with patch("dockerhub.httpx.AsyncClient", return_value=mock_client):
        result = await dockerhub.search_images("nginx")

    assert result["count"] == 2
    results = result["results"]
    nginx_result = next(r for r in results if r["repo_name"] == "nginx:latest")
    redis_result = next(r for r in results if r["repo_name"] == "redis:latest")
    assert nginx_result["approved"] is True
    assert redis_result["approved"] is False


@pytest.mark.asyncio
async def test_search_images_passes_pagination_params(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """search_images forwards page and page_size to Docker Hub."""
    allowlist_path = tmp_path / "config" / "allowed_images.json"
    _write_allowlist(allowlist_path, {})
    monkeypatch.setattr(allowlist, "ALLOWLIST_PATH", allowlist_path)

    fake_payload = {"count": 0, "results": []}

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=_mock_response(fake_payload))

    with patch("dockerhub.httpx.AsyncClient", return_value=mock_client):
        await dockerhub.search_images("python", page=3, page_size=10)

    call_kwargs = mock_client.get.call_args
    params = call_kwargs[1]["params"] if "params" in call_kwargs[1] else call_kwargs[0][1]
    assert params["page"] == 3
    assert params["page_size"] == 10


# ---------------------------------------------------------------------------
# get_image_tags unit tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_image_tags_returns_tags() -> None:
    """get_image_tags returns the raw Docker Hub tags payload."""
    fake_payload = {
        "count": 2,
        "results": [
            {"name": "latest", "full_size": 123456},
            {"name": "1.25", "full_size": 123000},
        ],
    }

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=_mock_response(fake_payload))

    with patch("dockerhub.httpx.AsyncClient", return_value=mock_client):
        result = await dockerhub.get_image_tags("library", "nginx")

    assert result["count"] == 2
    tag_names = [t["name"] for t in result["results"]]
    assert "latest" in tag_names
    assert "1.25" in tag_names


@pytest.mark.asyncio
async def test_get_image_tags_builds_correct_url() -> None:
    """get_image_tags constructs the correct Docker Hub URL."""
    fake_payload = {"count": 0, "results": []}

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=_mock_response(fake_payload))

    with patch("dockerhub.httpx.AsyncClient", return_value=mock_client):
        await dockerhub.get_image_tags("myorg", "myrepo")

    called_url = mock_client.get.call_args[0][0]
    assert "myorg" in called_url
    assert "myrepo" in called_url


# ---------------------------------------------------------------------------
# API endpoint tests (via FastAPI TestClient)
# ---------------------------------------------------------------------------

@pytest.fixture()
def client() -> TestClient:
    return TestClient(main.app)


def test_dockerhub_search_endpoint_returns_results(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """GET /dockerhub/search returns annotated results."""
    allowlist_path = tmp_path / "config" / "allowed_images.json"
    _write_allowlist(allowlist_path, {})
    monkeypatch.setattr(allowlist, "ALLOWLIST_PATH", allowlist_path)

    fake_payload = {
        "count": 1,
        "results": [{"repo_name": "alpine", "description": "Alpine Linux"}],
    }

    async def _mock_search(query: str, page: int = 1, page_size: int = 20) -> dict:
        return {**fake_payload, "results": [{**fake_payload["results"][0], "approved": False}]}

    monkeypatch.setattr(main, "search_images", _mock_search)

    resp = client.get("/dockerhub/search", params={"query": "alpine"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1
    assert data["results"][0]["repo_name"] == "alpine"


def test_dockerhub_search_endpoint_propagates_502_on_error(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GET /dockerhub/search returns 502 when Docker Hub is unreachable."""

    async def _failing_search(*_args, **_kwargs):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(main, "search_images", _failing_search)

    resp = client.get("/dockerhub/search", params={"query": "alpine"})
    assert resp.status_code == 502


def test_dockerhub_tags_endpoint_returns_tags(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GET /dockerhub/tags/{namespace}/{repo} returns tag list."""
    fake_payload = {"count": 1, "results": [{"name": "latest"}]}

    async def _mock_tags(namespace: str, repo: str, page: int = 1) -> dict:
        return fake_payload

    monkeypatch.setattr(main, "get_image_tags", _mock_tags)

    resp = client.get("/dockerhub/tags/library/nginx")
    assert resp.status_code == 200
    assert resp.json()["results"][0]["name"] == "latest"
