# Using `deploy()` in `deployment.py`

`deploy(workflow: DeployWorkflow, inject_env: bool = False)` builds a deployment plan from a node/edge DAG.

It does all of the following:

- Validates edge endpoints against known nodes.
- Computes topological order (and detects cycles).
- Generates per-stream pub/sub credentials for each edge.
- Queues plugin nodes for deployment.
- Builds per-node environment-variable plans from generated credentials.
- Optionally runs Docker Compose to inject env vars into runtime images (`inject_env=True`).

## Input Contract

`deploy()` expects a `DeployWorkflow` from `workflow_types.py`:

- `nodes: List[DeployNode]`
- `edges: List[DeployEdge]`

### `DeployNode` (key fields)

- `id: str`
- `type: str` (only `plugin` nodes are queued for deployment)
- `runtime: Optional[str]` (container image fallback source)
- `in_streams: List[str]`
- `out_streams: List[str]`
- `env_vars: Dict[str, str]` (user-defined vars merged into computed vars)
- `data: Dict[str, Any]` (alternate source for image name, e.g. `containerImage`)

### `DeployEdge` (key fields)

- `source: str`
- `target: str`
- `data: Optional[str]` stream type (`json` default when omitted)

## Python Usage

```python
from deployment import deploy
from workflow_types import DeployWorkflow, DeployNode, DeployEdge

workflow = DeployWorkflow(
    nodes=[
        DeployNode(id="source", type="sender", out_streams=["json"]),
        DeployNode(id="plugin-a", type="plugin", runtime="test_image", in_streams=["json"]),
    ],
    edges=[DeployEdge(source="source", target="plugin-a", data="json")],
)

result = deploy(workflow, inject_env=False)
print(result["topological_order"])
print(result["env_plan"])
```

## API Usage (`main.py`)

`POST /deploy` takes the same payload model and returns:

- `message: "Deploy plan generated"`
- full deploy result fields from `deployment.deploy()`

Example:

```bash
curl -X POST "http://127.0.0.1:8000/deploy?inject_env=false" \
  -H "Content-Type: application/json" \
  -d '{"nodes":[{"id":"source","type":"sender","out_streams":["json"]},{"id":"plugin-a","type":"plugin","runtime":"test_image","in_streams":["json"]}],"edges":[{"source":"source","target":"plugin-a","data":"json"}]}'
```

## Return Fields (Important)

- `topological_order`: DAG-safe node execution order.
- `dag_graph`: graph from topological sort utility.
- `adjacency_list`: source -> downstream list.
- `queued_plugins`: plugin node IDs selected for deployment.
- `assigned_nodes`: scheduler placeholder output (currently same IDs as queue).
- `env_plan`: computed env vars per queued plugin.
- `injected_nodes`: plugins where runtime env injection happened.
- `skipped_nodes`: plugins skipped during injection with reason.
- `credentials_by_node`: generated in/out stream credentials per node.

## Env Injection Behavior (`inject_env=True`)

When enabled, deploy tries to run each queued plugin image with generated env vars via a temporary Docker Compose file.

Image lookup order:

1. `node.runtime`
2. `node.data["runtime"]`
3. `node.data["containerImage"]`

If no image is found, node is added to `skipped_nodes`.

## Common Failures

- Unknown edge endpoints:
  - `"Edge source '...' not found in nodes"` or target equivalent.
- Stream mismatch:
  - stream type on edge not present in source `out_streams` or destination `in_streams`.
- DAG cycles:
  - `"Cycle detected"` from topological sort.

## Notes

- If stream lists are omitted, stream type is inferred from edge `data` (default `json`).
- Stream env keys are normalized (e.g. `image/jpeg` -> `IMAGE_JPEG`).
- Current scheduler assignment is a placeholder; `assign_deployment()` can be extended for real placement logic.
