"""Workflow allocation: decide where plugin nodes should run."""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional

from corelink_health import CorelinkStatus, HealthReport
from inventory import ManagedServer, ServerStatus, load_inventory


class AllocationStrategy(str, Enum):
    MANAGED = "managed"
    LOCAL = "local"
    DEFERRED = "deferred"


@dataclass
class AllocationDecision:
    node_id: str
    server_id: Optional[str]
    strategy: AllocationStrategy
    reason: str


def _filter_available(
    servers: List[ManagedServer],
    required_labels: Optional[List[str]] = None,
) -> List[ManagedServer]:
    """Return healthy/unknown servers matching label requirements, sorted by load."""
    available = [
        s for s in servers
        if s.status in (ServerStatus.HEALTHY, ServerStatus.UNKNOWN)
    ]
    if required_labels:
        available = [
            s for s in available if all(label in s.labels for label in required_labels)
        ]
    return sorted(available, key=lambda s: s.current_load)


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
                    strategy=AllocationStrategy.DEFERRED,
                    reason="corelink_unreachable",
                )
            )
        return decisions

    servers = load_inventory()

    for node_id in queued_plugins:
        reqs = node_requirements.get(node_id, {})
        labels = reqs.get("labels", [])

        available = _filter_available(servers, required_labels=labels if labels else None)

        if available:
            server = available[0]
            decisions.append(
                AllocationDecision(
                    node_id=node_id,
                    server_id=server.id,
                    strategy=AllocationStrategy.MANAGED,
                    reason=f"assigned to {server.hostname} (load: {server.current_load:.0%})",
                )
            )
            server.running_nodes.append(node_id)
            server.current_load = min(1.0, server.current_load + 0.1)
        else:
            decisions.append(
                AllocationDecision(
                    node_id=node_id,
                    server_id=None,
                    strategy=AllocationStrategy.LOCAL,
                    reason="no_managed_capacity_available",
                )
            )

    return decisions
