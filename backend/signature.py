import hashlib
import json
from workflow_types import Workflow


def compute_node_signatures(workflow: Workflow) -> None:
    """
    Compute a signature for each node in the workflow based on its configuration.
    Stores the signature as a dynamic attribute on each node: node.signature
    """
    for node in workflow.nodes.values():
        # Serialize node configuration relevant for signature
        value = {
            "type": node.type,
            "runtime": node.runtime,
            "deps": sorted(node.deps),
            "needs_gpu": node.needs_gpu,
            "cpu": node.cpu,
            "mem_mb": node.mem_mb,
            "io_format": node.io_format,
        }
        dumped = json.dumps(value, sort_keys=True)
        sig = hashlib.sha256(dumped.encode("utf-8")).hexdigest()
        setattr(node, "signature", sig)
