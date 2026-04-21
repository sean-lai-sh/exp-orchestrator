"""Managed server inventory for workflow allocation."""

import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import List, Optional


class ServerStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    OFFLINE = "offline"
    UNKNOWN = "unknown"


@dataclass
class ManagedServer:
    id: str
    hostname: str
    capacity: dict
    labels: List[str] = field(default_factory=list)
    current_load: float = 0.0
    status: str = "unknown"
    running_nodes: List[str] = field(default_factory=list)

    @property
    def server_status(self) -> ServerStatus:
        try:
            return ServerStatus(self.status)
        except ValueError:
            return ServerStatus.UNKNOWN


INVENTORY_PATH = Path(__file__).parent / "config" / "server_inventory.json"


def load_inventory(path: Optional[Path] = None) -> List[ManagedServer]:
    """Load server inventory from JSON config file."""
    inventory_path = path or INVENTORY_PATH
    if not inventory_path.exists():
        return []
    data = json.loads(inventory_path.read_text())
    return [ManagedServer(**s) for s in data]


def get_available_servers(
    required_labels: Optional[List[str]] = None,
    path: Optional[Path] = None,
) -> List[ManagedServer]:
    """Return servers that are healthy/unknown and match label requirements."""
    servers = load_inventory(path)
    available = [
        s
        for s in servers
        if s.server_status in (ServerStatus.HEALTHY, ServerStatus.UNKNOWN)
    ]
    if required_labels:
        available = [
            s for s in available if all(label in s.labels for label in required_labels)
        ]
    return sorted(available, key=lambda s: s.current_load)
