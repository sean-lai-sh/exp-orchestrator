"""No-op executor — records the plan without starting any containers."""

from .base import ContainerSpec, ContainerStatus, Executor


class NoopExecutor(Executor):
    """Executor that accepts every operation but does nothing.

    Useful for demos, dry-run deploys, or environments without Docker.
    """

    async def start(self, spec: ContainerSpec) -> ContainerStatus:
        return ContainerStatus(
            node_id=spec.node_id,
            container_id=f"noop-{spec.node_id[:12]}",
            status="simulated",
        )

    async def stop(self, container_id: str) -> bool:
        return True

    async def status(self, container_id: str) -> ContainerStatus:
        return ContainerStatus(
            node_id="", container_id=container_id, status="simulated",
        )

    async def logs(self, container_id: str, tail: int = 100) -> str:
        return ""

    async def health_check(self) -> bool:
        return True
