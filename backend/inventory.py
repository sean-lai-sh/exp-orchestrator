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

    @classmethod
    def from_str(cls, value: str) -> "ServerStatus":
        try:
            return cls(value)
        except ValueError:
            return cls.UNKNOWN


@dataclass
class ManagedServer:
    id: str
    hostname: str
    capacity: dict
    labels: List[str] = field(default_factory=list)
    current_load: float = 0.0
    status: ServerStatus = ServerStatus.UNKNOWN
    running_nodes: List[str] = field(default_factory=list)


INVENTORY_PATH = Path(__file__).parent / "config" / "server_inventory.json"


def load_inventory(path: Optional[Path] = None) -> List[ManagedServer]:
    """Load server inventory from JSON config file."""
    inventory_path = path or INVENTORY_PATH
    try:
        data = json.loads(inventory_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    servers = []
    for entry in data:
        entry["status"] = ServerStatus.from_str(entry.get("status", "unknown"))
        servers.append(ManagedServer(**entry))
    return servers


def get_available_servers(
    required_labels: Optional[List[str]] = None,
    path: Optional[Path] = None,
) -> List[ManagedServer]:
    """Return servers that are healthy/unknown and match label requirements."""
    servers = load_inventory(path)
    available = [
        s
        for s in servers
        if s.status in (ServerStatus.HEALTHY, ServerStatus.UNKNOWN)
    ]
    if required_labels:
        available = [
            s for s in available if all(label in s.labels for label in required_labels)
        ]
    return sorted(available, key=lambda s: s.current_load)
