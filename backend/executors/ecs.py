"""AWS ECS executor (stub for future implementation).

This executor will use boto3 to:
- Register task definitions from ContainerSpec
- Run tasks on a specified ECS cluster
- Monitor task status via describe_tasks
- Stream logs from CloudWatch Logs

Required environment variables (future):
  AWS_REGION        - AWS region for ECS cluster
  ECS_CLUSTER       - ECS cluster name or ARN
  ECS_SUBNET        - Subnet for awsvpc networking
  ECS_SECURITY_GROUP - Security group for tasks
  TASK_ROLE_ARN     - IAM role for task containers
  EXECUTION_ROLE_ARN - IAM role for ECS agent
"""

from typing import Optional

from .base import ContainerSpec, ContainerStatus, Executor


class ECSExecutor(Executor):
    """AWS ECS Fargate executor (not yet implemented)."""

    def __init__(
        self,
        cluster: Optional[str] = None,
        region: Optional[str] = None,
        subnet: Optional[str] = None,
        security_group: Optional[str] = None,
    ):
        self.cluster = cluster
        self.region = region
        self.subnet = subnet
        self.security_group = security_group

    async def start(self, spec: ContainerSpec) -> ContainerStatus:
        """Register task definition and run task on ECS."""
        raise NotImplementedError(
            "ECS executor not yet implemented. "
            "See docs/executor-abstraction.md for the planned approach."
        )

    async def stop(self, container_id: str) -> bool:
        """Stop an ECS task."""
        raise NotImplementedError("ECS executor not yet implemented.")

    async def status(self, container_id: str) -> ContainerStatus:
        """Get ECS task status via describe_tasks."""
        raise NotImplementedError("ECS executor not yet implemented.")

    async def logs(self, container_id: str, tail: int = 100) -> str:
        """Get logs from CloudWatch Logs."""
        raise NotImplementedError("ECS executor not yet implemented.")

    async def health_check(self) -> bool:
        """Check if ECS cluster is reachable via describe_clusters."""
        raise NotImplementedError("ECS executor not yet implemented.")
