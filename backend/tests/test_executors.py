"""Tests for the executor abstraction layer."""

import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from executors import ContainerSpec, ContainerStatus, get_executor
from executors.base import Executor
from executors.local import LocalDockerExecutor


class TestGetExecutor:
    def test_returns_local_by_default(self) -> None:
        ex = get_executor("local")
        assert isinstance(ex, LocalDockerExecutor)

    def test_returns_local_from_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("EXECUTOR_BACKEND", "local")
        ex = get_executor()
        assert isinstance(ex, LocalDockerExecutor)

    def test_returns_ecs(self) -> None:
        from executors.ecs import ECSExecutor

        ex = get_executor("ecs")
        assert isinstance(ex, ECSExecutor)

    def test_raises_on_unknown(self) -> None:
        with pytest.raises(ValueError, match="Unknown executor strategy"):
            get_executor("kubernetes")


class TestLocalDockerExecutor:
    @pytest.fixture
    def executor(self) -> LocalDockerExecutor:
        return LocalDockerExecutor()

    @pytest.mark.asyncio
    async def test_start_success(
        self, executor: LocalDockerExecutor, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_run(cmd, **kwargs):
            return SimpleNamespace(returncode=0, stdout="abc123def456\n", stderr="")

        monkeypatch.setattr(subprocess, "run", fake_run)

        spec = ContainerSpec(
            node_id="plugin-1",
            image="python:3.12-slim",
            env_vars={"NODE_ID": "plugin-1", "FOO": "bar"},
        )
        status = await executor.start(spec)

        assert status.status == "running"
        assert status.container_id == "abc123def456"
        assert status.host == "localhost"
        assert status.node_id == "plugin-1"

    @pytest.mark.asyncio
    async def test_start_failure(
        self, executor: LocalDockerExecutor, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_run(cmd, **kwargs):
            return SimpleNamespace(
                returncode=1, stdout="", stderr="Error: image not found"
            )

        monkeypatch.setattr(subprocess, "run", fake_run)

        spec = ContainerSpec(node_id="plugin-1", image="bad:image", env_vars={})
        status = await executor.start(spec)

        assert status.status == "failed"
        assert "image not found" in status.error
        assert status.container_id == ""

    @pytest.mark.asyncio
    async def test_start_timeout(
        self, executor: LocalDockerExecutor, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_run(cmd, **kwargs):
            raise subprocess.TimeoutExpired(cmd, 60)

        monkeypatch.setattr(subprocess, "run", fake_run)

        spec = ContainerSpec(node_id="plugin-1", image="slow:image", env_vars={})
        status = await executor.start(spec)

        assert status.status == "failed"
        assert "timed out" in status.error

    @pytest.mark.asyncio
    async def test_start_with_resource_limits(
        self, executor: LocalDockerExecutor, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured_cmd = []

        def fake_run(cmd, **kwargs):
            captured_cmd.extend(cmd)
            return SimpleNamespace(returncode=0, stdout="container-id\n", stderr="")

        monkeypatch.setattr(subprocess, "run", fake_run)

        spec = ContainerSpec(
            node_id="plugin-1",
            image="python:3.12-slim",
            env_vars={},
            cpu=2.0,
            memory_mb=1024,
            network="test-net",
            ports={3000: 8080},
        )
        await executor.start(spec)

        assert "--cpus" in captured_cmd
        assert "2.0" in captured_cmd
        assert "--memory" in captured_cmd
        assert "1024m" in captured_cmd
        assert "--network" in captured_cmd
        assert "test-net" in captured_cmd
        assert "-p" in captured_cmd
        assert "8080:3000" in captured_cmd

    @pytest.mark.asyncio
    async def test_stop_success(
        self, executor: LocalDockerExecutor, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_run(cmd, **kwargs):
            return SimpleNamespace(returncode=0)

        monkeypatch.setattr(subprocess, "run", fake_run)
        assert await executor.stop("abc123") is True

    @pytest.mark.asyncio
    async def test_stop_failure(
        self, executor: LocalDockerExecutor, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_run(cmd, **kwargs):
            return SimpleNamespace(returncode=1)

        monkeypatch.setattr(subprocess, "run", fake_run)
        assert await executor.stop("nonexistent") is False

    @pytest.mark.asyncio
    async def test_status_running(
        self, executor: LocalDockerExecutor, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_run(cmd, **kwargs):
            return SimpleNamespace(returncode=0, stdout="running\n", stderr="")

        monkeypatch.setattr(subprocess, "run", fake_run)
        result = await executor.status("abc123")
        assert result.status == "running"
        assert result.host == "localhost"

    @pytest.mark.asyncio
    async def test_logs(
        self, executor: LocalDockerExecutor, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_run(cmd, **kwargs):
            return SimpleNamespace(
                returncode=0, stdout="Starting server...\n", stderr=""
            )

        monkeypatch.setattr(subprocess, "run", fake_run)
        logs = await executor.logs("abc123", tail=50)
        assert "Starting server" in logs

    @pytest.mark.asyncio
    async def test_health_check_docker_available(
        self, executor: LocalDockerExecutor, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_run(cmd, **kwargs):
            return SimpleNamespace(returncode=0)

        monkeypatch.setattr(subprocess, "run", fake_run)
        assert await executor.health_check() is True

    @pytest.mark.asyncio
    async def test_health_check_docker_unavailable(
        self, executor: LocalDockerExecutor, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_run(cmd, **kwargs):
            return SimpleNamespace(returncode=1)

        monkeypatch.setattr(subprocess, "run", fake_run)
        assert await executor.health_check() is False


class TestECSExecutor:
    @pytest.mark.asyncio
    async def test_start_not_implemented(self) -> None:
        from executors.ecs import ECSExecutor

        ex = ECSExecutor()
        with pytest.raises(NotImplementedError):
            await ex.start(
                ContainerSpec(node_id="n1", image="python:3.12", env_vars={})
            )

    @pytest.mark.asyncio
    async def test_stop_not_implemented(self) -> None:
        from executors.ecs import ECSExecutor

        ex = ECSExecutor()
        with pytest.raises(NotImplementedError):
            await ex.stop("task-id")

    @pytest.mark.asyncio
    async def test_health_check_not_implemented(self) -> None:
        from executors.ecs import ECSExecutor

        ex = ECSExecutor()
        with pytest.raises(NotImplementedError):
            await ex.health_check()
