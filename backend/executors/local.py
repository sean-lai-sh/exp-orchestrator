"""Local Docker executor implementation."""

import subprocess
from typing import Optional

from .base import ContainerSpec, ContainerStatus, Executor


class LocalDockerExecutor(Executor):
    """Executor that runs containers on the local Docker daemon."""

    async def start(self, spec: ContainerSpec) -> ContainerStatus:
        """Start a container locally via docker run."""
        container_name = f"orch-{spec.node_id[:12]}"
        cmd = ["docker", "run", "-d", "--name", container_name]

        if spec.network:
            cmd.extend(["--network", spec.network])
        if spec.cpu:
            cmd.extend(["--cpus", str(spec.cpu)])
        if spec.memory_mb:
            cmd.extend(["--memory", f"{spec.memory_mb}m"])
        for container_port, host_port in spec.ports.items():
            cmd.extend(["-p", f"{host_port}:{container_port}"])
        for key, value in spec.env_vars.items():
            cmd.extend(["-e", f"{key}={value}"])

        cmd.append(spec.image)

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=60
            )
        except subprocess.TimeoutExpired:
            return ContainerStatus(
                node_id=spec.node_id,
                container_id="",
                status="failed",
                error="docker run timed out after 60s",
            )

        if result.returncode == 0:
            container_id = result.stdout.strip()
            return ContainerStatus(
                node_id=spec.node_id,
                container_id=container_id,
                status="running",
                host="localhost",
            )

        return ContainerStatus(
            node_id=spec.node_id,
            container_id="",
            status="failed",
            error=result.stderr.strip(),
        )

    async def stop(self, container_id: str) -> bool:
        """Stop and remove a local container.

        `docker stop` alone leaves the container in Exited state still claiming
        the name and (sometimes) ports. The orchestrator should fully release
        the resource on teardown — `docker rm -f` is the idempotent equivalent
        of stop+rm, so use that to ensure the next deploy starts clean.
        """
        try:
            result = subprocess.run(
                ["docker", "rm", "-f", container_id],
                capture_output=True,
                timeout=30,
            )
            return result.returncode == 0
        except subprocess.TimeoutExpired:
            return False

    async def status(self, container_id: str) -> ContainerStatus:
        """Get status of a local container via docker inspect."""
        try:
            result = subprocess.run(
                [
                    "docker", "inspect",
                    "--format", "{{.State.Status}}",
                    container_id,
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
        except subprocess.TimeoutExpired:
            return ContainerStatus(
                node_id="", container_id=container_id, status="unknown"
            )

        if result.returncode == 0:
            return ContainerStatus(
                node_id="",
                container_id=container_id,
                status=result.stdout.strip(),
                host="localhost",
            )

        return ContainerStatus(
            node_id="",
            container_id=container_id,
            status="unknown",
            error=result.stderr.strip(),
        )

    async def logs(self, container_id: str, tail: int = 100) -> str:
        """Get logs from a local container."""
        try:
            result = subprocess.run(
                ["docker", "logs", "--tail", str(tail), container_id],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            return ""

    async def health_check(self) -> bool:
        """Check if local Docker daemon is reachable."""
        try:
            result = subprocess.run(
                ["docker", "info"],
                capture_output=True,
                timeout=5,
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False
