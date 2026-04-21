"""Tests for server inventory management."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from inventory import ManagedServer, ServerStatus, get_available_servers, load_inventory


@pytest.fixture
def inventory_file(tmp_path: Path) -> Path:
    data = [
        {
            "id": "server-1",
            "hostname": "gpu-box-1",
            "capacity": {"cpu_cores": 16, "memory_gb": 64, "gpu": "nvidia-a100"},
            "labels": ["gpu", "high-memory"],
            "current_load": 0.3,
            "status": "healthy",
            "running_nodes": ["node-x"],
        },
        {
            "id": "server-2",
            "hostname": "cpu-box-1",
            "capacity": {"cpu_cores": 8, "memory_gb": 16, "gpu": None},
            "labels": ["cpu", "dev"],
            "current_load": 0.7,
            "status": "healthy",
            "running_nodes": [],
        },
        {
            "id": "server-3",
            "hostname": "offline-box",
            "capacity": {"cpu_cores": 4, "memory_gb": 8, "gpu": None},
            "labels": ["cpu"],
            "current_load": 0.0,
            "status": "offline",
            "running_nodes": [],
        },
    ]
    path = tmp_path / "inventory.json"
    path.write_text(json.dumps(data))
    return path


def test_load_inventory(inventory_file: Path) -> None:
    servers = load_inventory(inventory_file)
    assert len(servers) == 3
    assert servers[0].id == "server-1"
    assert servers[0].hostname == "gpu-box-1"
    assert servers[0].capacity["gpu"] == "nvidia-a100"


def test_load_inventory_missing_file(tmp_path: Path) -> None:
    servers = load_inventory(tmp_path / "nonexistent.json")
    assert servers == []


def test_get_available_servers_excludes_offline(inventory_file: Path) -> None:
    available = get_available_servers(path=inventory_file)
    assert len(available) == 2
    assert all(s.id != "server-3" for s in available)


def test_get_available_servers_sorted_by_load(inventory_file: Path) -> None:
    available = get_available_servers(path=inventory_file)
    assert available[0].id == "server-1"  # 0.3 load
    assert available[1].id == "server-2"  # 0.7 load


def test_get_available_servers_filter_by_labels(inventory_file: Path) -> None:
    available = get_available_servers(required_labels=["gpu"], path=inventory_file)
    assert len(available) == 1
    assert available[0].id == "server-1"


def test_get_available_servers_no_match(inventory_file: Path) -> None:
    available = get_available_servers(
        required_labels=["nonexistent-label"], path=inventory_file
    )
    assert available == []


def test_server_status_property() -> None:
    server = ManagedServer(
        id="test", hostname="h", capacity={}, status="healthy"
    )
    assert server.server_status == ServerStatus.HEALTHY

    server_unknown = ManagedServer(
        id="test", hostname="h", capacity={}, status="invalid_value"
    )
    assert server_unknown.server_status == ServerStatus.UNKNOWN
