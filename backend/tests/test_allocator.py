"""Tests for workflow allocation planner."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from allocator import AllocationDecision, allocate_nodes
from corelink_health import CorelinkStatus, HealthReport


@pytest.fixture
def healthy_corelink() -> HealthReport:
    return HealthReport(status=CorelinkStatus.HEALTHY, latency_ms=50.0)


@pytest.fixture
def unreachable_corelink() -> HealthReport:
    return HealthReport(status=CorelinkStatus.UNREACHABLE, error="timeout")


@pytest.fixture
def unconfigured_corelink() -> HealthReport:
    return HealthReport(status=CorelinkStatus.UNCONFIGURED)


@pytest.fixture
def inventory_with_servers(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    data = [
        {
            "id": "server-1",
            "hostname": "gpu-box",
            "capacity": {"cpu_cores": 16, "memory_gb": 64, "gpu": "a100"},
            "labels": ["gpu", "prod"],
            "current_load": 0.2,
            "status": "healthy",
            "running_nodes": [],
        },
        {
            "id": "server-2",
            "hostname": "cpu-box",
            "capacity": {"cpu_cores": 8, "memory_gb": 16, "gpu": None},
            "labels": ["cpu", "dev"],
            "current_load": 0.5,
            "status": "healthy",
            "running_nodes": [],
        },
    ]
    path = tmp_path / "inventory.json"
    path.write_text(json.dumps(data))
    monkeypatch.setattr("inventory.INVENTORY_PATH", path)
    return path


@pytest.fixture
def empty_inventory(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "inventory.json"
    path.write_text("[]")
    monkeypatch.setattr("inventory.INVENTORY_PATH", path)
    return path


def test_allocate_defers_when_corelink_unreachable(
    unreachable_corelink: HealthReport, inventory_with_servers: Path
) -> None:
    decisions = allocate_nodes(
        queued_plugins=["plugin-a", "plugin-b"],
        node_requirements={},
        corelink_health=unreachable_corelink,
    )
    assert len(decisions) == 2
    assert all(d.strategy == "deferred" for d in decisions)
    assert all(d.reason == "corelink_unreachable" for d in decisions)
    assert all(d.server_id is None for d in decisions)


def test_allocate_managed_when_servers_available(
    healthy_corelink: HealthReport, inventory_with_servers: Path
) -> None:
    decisions = allocate_nodes(
        queued_plugins=["plugin-a"],
        node_requirements={"plugin-a": {}},
        corelink_health=healthy_corelink,
    )
    assert len(decisions) == 1
    assert decisions[0].strategy == "managed"
    assert decisions[0].server_id == "server-1"  # Least loaded
    assert "gpu-box" in decisions[0].reason


def test_allocate_with_label_filter(
    healthy_corelink: HealthReport, inventory_with_servers: Path
) -> None:
    decisions = allocate_nodes(
        queued_plugins=["plugin-gpu"],
        node_requirements={"plugin-gpu": {"labels": ["gpu"]}},
        corelink_health=healthy_corelink,
    )
    assert len(decisions) == 1
    assert decisions[0].strategy == "managed"
    assert decisions[0].server_id == "server-1"


def test_allocate_local_when_no_matching_servers(
    healthy_corelink: HealthReport, inventory_with_servers: Path
) -> None:
    decisions = allocate_nodes(
        queued_plugins=["plugin-special"],
        node_requirements={"plugin-special": {"labels": ["nonexistent"]}},
        corelink_health=healthy_corelink,
    )
    assert len(decisions) == 1
    assert decisions[0].strategy == "local"
    assert decisions[0].server_id is None
    assert "no_managed_capacity" in decisions[0].reason


def test_allocate_local_when_inventory_empty(
    healthy_corelink: HealthReport, empty_inventory: Path
) -> None:
    decisions = allocate_nodes(
        queued_plugins=["plugin-a"],
        node_requirements={},
        corelink_health=healthy_corelink,
    )
    assert len(decisions) == 1
    assert decisions[0].strategy == "local"


def test_allocate_with_unconfigured_corelink_still_allocates(
    unconfigured_corelink: HealthReport, inventory_with_servers: Path
) -> None:
    """Unconfigured != unreachable. Still allocate if servers are available."""
    decisions = allocate_nodes(
        queued_plugins=["plugin-a"],
        node_requirements={},
        corelink_health=unconfigured_corelink,
    )
    assert len(decisions) == 1
    assert decisions[0].strategy == "managed"


def test_allocate_multiple_plugins(
    healthy_corelink: HealthReport, inventory_with_servers: Path
) -> None:
    decisions = allocate_nodes(
        queued_plugins=["p1", "p2", "p3"],
        node_requirements={},
        corelink_health=healthy_corelink,
    )
    assert len(decisions) == 3
    assert all(d.strategy == "managed" for d in decisions)
