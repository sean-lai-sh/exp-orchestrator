import json
import os
import sys
from typing import Any, Dict

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from deployment import deploy  # noqa: E402
from workflow_types import DeployWorkflow  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"valid": False, "error": "Expected a single JSON payload file path argument."}))
        return 1

    payload_path = sys.argv[1]

    try:
        with open(payload_path, "r", encoding="utf-8") as handle:
            payload: Dict[str, Any] = json.load(handle)

        workflow = DeployWorkflow.model_validate(payload)
        result = deploy(workflow, inject_env=False)
        print(json.dumps({"valid": True, "result": result}))
        return 0
    except Exception as exc:  # pragma: no cover - surfaced to caller
        print(json.dumps({"valid": False, "error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
