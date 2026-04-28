"""Docker image allowlist for runtime safety."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from workflow_types import DeployNode

ALLOWLIST_PATH = Path(__file__).parent / "config" / "allowed_images.json"


def load_allowlist() -> dict[str, dict[str, Any]]:
    """Load the persisted image allowlist."""
    try:
        content = ALLOWLIST_PATH.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return {}

    if not content:
        return {}

    return json.loads(content)


def is_approved(image_ref: str, allowlist: dict[str, dict[str, Any]] | None = None) -> bool:
    """Return whether a runtime image reference is approved for execution."""
    if allowlist is None:
        allowlist = load_allowlist()

    if image_ref in allowlist:
        return bool(allowlist[image_ref].get("approved", False))

    for pattern, entry in allowlist.items():
        if pattern.endswith("*") and image_ref.startswith(pattern[:-1]):
            return bool(entry.get("approved", False))

    return False


def check_workflow_images(nodes: list[DeployNode]) -> dict[str, dict[str, Any]]:
    """Inspect workflow runtime images and report whether each one is approved."""
    allowlist = load_allowlist()
    results: dict[str, dict[str, Any]] = {}

    for node in nodes:
        runtime = node.resolve_runtime()
        if runtime is None:
            continue

        approved = is_approved(runtime, allowlist)
        results[node.id] = {
            "image": runtime,
            "approved": approved,
            "reason": "on_allowlist" if approved else "not_on_allowlist",
        }

    return results
