"""Workflow allocation: decide where plugin nodes should run."""

from dataclasses import dataclass
from typing import Dict, List, Optional

from corelink_health import CorelinkStatus, HealthReport
from inventory import ManagedServer, get_available_servers


@dataclass
class AllocationDecision:
    node_id: str
    server_id: Optional[str]
    strategy: str  # "managed", "local", "deferred"
    reason: str


def allocate_nodes(
    queued_plugins: List[str],
    node_requirements: Dict[str, dict],
    corelink_health: HealthReport,
) -> List[AllocationDecision]:
    """Decide placement for each queued plugin node.

    Strategies:
      - "deferred": Corelink is unreachable, cannot safely place nodes
      - "managed": Assigned to a managed server from inventory
      - "local": No managed capacity available, fall back to local Docker
    """
    decisions: List[AllocationDecision] = []

    if corelink_health.status == CorelinkStatus.UNREACHABLE:
        for node_id in queued_plugins:
            decisions.append(
                AllocationDecision(
                    node_id=node_id,
                    server_id=None,
                    strategy="deferred",
                    reason="corelink_unreachable",
                )
            )
        return decisions

    for node_id in queued_plugins:
        reqs = node_requirements.get(node_id, {})
        labels = reqs.get("labels", [])

        available = get_available_servers(required_labels=labels if labels else None)

        if available:
            server = available[0]  # Least loaded
            decisions.append(
                AllocationDecision(
                    node_id=node_id,
                    server_id=server.id,
                    strategy="managed",
                    reason=f"assigned to {server.hostname} (load: {server.current_load:.0%})",
                )
            )
        else:
            decisions.append(
                AllocationDecision(
                    node_id=node_id,
                    server_id=None,
                    strategy="local",
                    reason="no_managed_capacity_available",
                )
            )

    return decisions
