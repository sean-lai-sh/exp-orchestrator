"""Tests for the /health liveness and /health/ready readiness endpoints."""

import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import health
from health import CheckResult, check_docker
from main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


class TestLivenessEndpoint:
    def test_returns_ok(self, client: TestClient) -> None:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_does_not_depend_on_docker(self, client: TestClient) -> None:
        with patch.object(
            health, "check_docker", return_value=CheckResult(ok=False, error="nope")
        ):
            response = client.get("/health")
        assert response.status_code == 200


class TestReadinessEndpoint:
    def test_ready_when_docker_ok(self, client: TestClient) -> None:
        with patch("main.check_docker", return_value=CheckResult(ok=True)):
            response = client.get("/health/ready")

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ready"
        assert body["checks"]["docker"] == {"ok": True, "error": None}

    def test_not_ready_when_docker_down(self, client: TestClient) -> None:
        with patch(
            "main.check_docker",
            return_value=CheckResult(ok=False, error="Cannot connect to Docker daemon"),
        ):
            response = client.get("/health/ready")

        assert response.status_code == 503
        detail = response.json()["detail"]
        assert detail["status"] == "not_ready"
        assert detail["checks"]["docker"]["ok"] is False
        assert "Cannot connect" in detail["checks"]["docker"]["error"]


class TestCheckDocker:
    def test_returns_ok_when_docker_info_succeeds(self) -> None:
        fake = subprocess.CompletedProcess(args=[], returncode=0, stdout=b"", stderr=b"")
        with patch("health.subprocess.run", return_value=fake) as mock_run:
            result = check_docker()

        assert result.ok is True
        assert result.error is None
        mock_run.assert_called_once()

    def test_returns_error_on_nonzero_exit(self) -> None:
        fake = subprocess.CompletedProcess(
            args=[], returncode=1, stdout=b"", stderr=b"Cannot connect to the Docker daemon\n"
        )
        with patch("health.subprocess.run", return_value=fake):
            result = check_docker()

        assert result.ok is False
        assert "Cannot connect to the Docker daemon" in result.error

    def test_returns_error_on_empty_stderr(self) -> None:
        fake = subprocess.CompletedProcess(args=[], returncode=2, stdout=b"", stderr=b"")
        with patch("health.subprocess.run", return_value=fake):
            result = check_docker()

        assert result.ok is False
        assert "exited 2" in result.error

    def test_returns_error_when_binary_missing(self) -> None:
        with patch("health.subprocess.run", side_effect=FileNotFoundError()):
            result = check_docker()

        assert result.ok is False
        assert "docker binary not found" in result.error

    def test_returns_error_on_timeout(self) -> None:
        with patch(
            "health.subprocess.run",
            side_effect=subprocess.TimeoutExpired(cmd="docker info", timeout=3.0),
        ):
            result = check_docker()

        assert result.ok is False
        assert "timed out" in result.error
