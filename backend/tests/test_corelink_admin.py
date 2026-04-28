"""Unit tests for corelink_admin (mocked HTTP)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_provision_result_dataclass_shape():
    from corelink_admin import CorelinkProvisionResult

    r = CorelinkProvisionResult(
        workspace="workflow_abc",
        host="localhost",
        port=20012,
        username="Testuser",
        password="Testpassword",
    )
    assert r.workspace == "workflow_abc"
    assert r.port == 20012


def test_admin_error_is_exception():
    from corelink_admin import CorelinkAdminError

    assert issubclass(CorelinkAdminError, Exception)
