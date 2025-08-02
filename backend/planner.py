from typing import Dict, List
from workflow_types import Workflow

def plan_groups(workflow: Workflow) -> Dict[str, List[str]]:
    """
    Group nodes with the same signature into build groups.
    Returns a mapping from signature hash to list of node IDs.
    """
    groups: Dict[str, List[str]] = {}
    for node_id, node in workflow.nodes.items():
        sig = getattr(node, "signature", None)
        if sig is None:
            raise ValueError(f"Node '{node_id}' missing signature. Call compute_node_signatures first.")
        groups.setdefault(sig, []).append(node_id)
    return groups


def generate_container_specs(workflow: Workflow, groups: Dict[str, List[str]]) -> List[Dict]:
    """
    Generate container specifications for each group of nodes.
    Each spec contains the image name, grouped node IDs, and metadata.
    """
    specs: List[Dict] = []
    for sig, node_ids in groups.items():
        # Use node type and signature prefix to form image tag
        node_type = workflow.nodes[node_ids[0]].type
        tag = sig[:8]
        image_name = f"{node_type}:{tag}"
        spec = {
            "signature": sig,
            "node_ids": node_ids,
            "image_name": image_name,
        }
        specs.append(spec)
    return specs
