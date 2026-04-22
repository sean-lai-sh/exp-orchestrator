"""Abstract executor protocol for container runtimes."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class ContainerSpec:
    """Specification for a container to be started."""

    node_id: str
    image: str
    env_vars: Dict[str, str] = field(default_factory=dict)
    network: Optional[str] = None
    cpu: Optional[float] = None  # vCPUs
    memory_mb: Optional[int] = None
    gpu: Optional[str] = None  # GPU type identifier
    ports: Dict[int, int] = field(default_factory=dict)  # container:host


@dataclass
class ContainerStatus:
    """Status of a managed container."""

    node_id: str
    container_id: str
    status: str  # "running", "stopped", "failed", "pending"
    host: Optional[str] = None
    error: Optional[str] = None


class Executor(ABC):
    """Base executor interface for container runtimes.

    Implementations handle the lifecycle of containers on a specific
    backend (local Docker, ECS, Kubernetes, etc.).
    """

    @abstractmethod
    async def start(self, spec: ContainerSpec) -> ContainerStatus:
        """Start a container from spec. Returns status."""
        ...

    @abstractmethod
    async def stop(self, container_id: str) -> bool:
        """Stop a running container. Returns True on success."""
        ...

    @abstractmethod
    async def status(self, container_id: str) -> ContainerStatus:
        """Get current container status."""
        ...

    @abstractmethod
    async def logs(self, container_id: str, tail: int = 100) -> str:
        """Get container logs (stdout + stderr)."""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the executor backend is reachable and operational."""
        ...
