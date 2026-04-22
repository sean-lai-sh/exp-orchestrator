"""Executor factory — resolves the active executor from config/env."""

import os

from .base import ContainerSpec, ContainerStatus, Executor
from .local import LocalDockerExecutor

__all__ = ["ContainerSpec", "ContainerStatus", "Executor", "get_executor"]


def get_executor(strategy: str | None = None) -> Executor:
    """Get an executor instance based on strategy or EXECUTOR_BACKEND env var.

    Args:
        strategy: "local" or "ecs". Defaults to EXECUTOR_BACKEND env var or "local".

    Returns:
        An Executor instance for the requested backend.

    Raises:
        ValueError: If the strategy is not recognized.
    """
    strategy = strategy or os.getenv("EXECUTOR_BACKEND", "local")

    if strategy == "local":
        return LocalDockerExecutor()
    elif strategy == "ecs":
        from .ecs import ECSExecutor

        return ECSExecutor(
            cluster=os.getenv("ECS_CLUSTER"),
            region=os.getenv("AWS_REGION"),
            subnet=os.getenv("ECS_SUBNET"),
            security_group=os.getenv("ECS_SECURITY_GROUP"),
        )
    else:
        raise ValueError(
            f"Unknown executor strategy: '{strategy}'. "
            f"Supported: 'local', 'ecs'"
        )
