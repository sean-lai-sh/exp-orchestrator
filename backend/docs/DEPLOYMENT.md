`deploy(workflow: DeployWorkflow, inject_env: bool = False)` builds a deployment plan from a node-and-edge DAG, while the allowlist and executor modules extend that plan into a runtime safety and execution workflow.

The deployment planner validates edge endpoints against known nodes, computes a topological order, generates per-stream pub/sub credentials, queues plugin nodes for deployment, and builds per-node environment-variable plans. When `inject_env=True`, it can also run Docker Compose to inject generated variables into queued runtime images.

## Input Contract

`deploy()` expects a `DeployWorkflow` from `workflow_types.py`. The payload contains a list of `DeployNode` entries and a list of `DeployEdge` entries.

| Model | Key fields | Purpose |
| --- | --- | --- |
| `DeployNode` | `id`, `type`, `runtime`, `in_streams`, `out_streams`, `env_vars`, `data` | Represents a runtime-capable node in the workflow. Only `plugin` nodes are queued for deployment. |
| `DeployEdge` | `source`, `target`, `data` | Connects two nodes and optionally names the stream type, which defaults to `json` when omitted. |

## Python Usage

```python
from deployment import deploy
from workflow_types import DeployEdge, DeployNode, DeployWorkflow

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

## API Usage

The backend now exposes three deployment-oriented endpoints. The original planning endpoint remains unchanged, while the new image-inspection and local-execution endpoints build on top of the deployment plan.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/deploy` | `POST` | Generates a deployment plan and, optionally, injects environment variables into images. |
| `/deploy/check-images` | `POST` | Performs a read-only allowlist inspection for each workflow node with a runtime image. |
| `/deploy/execute` | `POST` | Generates a deployment plan, rejects unapproved images, pulls approved images, and starts local containers. |

A typical image-check request looks like this:

```bash
curl -X POST "http://127.0.0.1:8000/deploy/check-images" \
  -H "Content-Type: application/json" \
  -d '{"nodes":[{"id":"plugin-a","type":"plugin","runtime":"test/plugin-a:latest"}],"edges":[]}'
```

A typical execution request looks like this:

```bash
curl -X POST "http://127.0.0.1:8000/deploy/execute" \
  -H "Content-Type: application/json" \
  -d '{"nodes":[{"id":"plugin-a","type":"plugin","runtime":"test/plugin-a:latest"}],"edges":[]}'
```

## Return Fields

The planner returns the same fields as before, including `topological_order`, `dag_graph`, `adjacency_list`, `queued_plugins`, `assigned_nodes`, `env_plan`, `injected_nodes`, `skipped_nodes`, and `credentials_by_node`.

The executor returns a structured runtime summary with the following fields.

| Field | Meaning |
| --- | --- |
| `fetched` | Image references successfully pulled before execution. |
| `started` | Containers successfully started, including node ID, image, and container ID. |
| `skipped` | Nodes skipped because no runtime was provided, image pull failed, or container start failed. |
| `rejected` | Nodes rejected because their runtime image was not approved. |

## Approval Model

The allowlist is stored at `backend/config/allowed_images.json`. Each key is either an exact image reference or a prefix pattern ending in `*`, and each value records whether the image is approved together with optional notes.

```json
{
  "trusted/plugin-a:1.0": {"approved": true, "notes": "Exact image approval"},
  "trusted/*": {"approved": true, "notes": "Namespace approval"},
  "blocked/*": {"approved": false, "notes": "Rejected namespace"}
}
```

The runtime image lookup order remains the same across planning, allowlist checks, and execution. The backend first uses `node.runtime`, then `node.data["runtime"]`, and finally `node.data["containerImage"]`. Nodes without any resolved runtime image are ignored by `/deploy/check-images` and recorded as skipped during `/deploy/execute`.

## Common Failures

Unknown edge endpoints still raise the same validation errors, stream mismatches still fail when the declared stream does not match the source or destination contract, and DAG cycles still raise `Cycle detected` from the topological sort utility.

The new execution flow also introduces runtime-safety failures. If `/deploy/execute` encounters any unapproved image, it returns an HTTP 400 response describing the rejected nodes. If an approved image cannot be pulled or its container cannot be started, execution continues but the node is recorded in the `skipped` list with the relevant reason.

## Notes

If stream lists are omitted, the planner infers them from the edge `data` value, defaulting to `json`. Stream environment keys are normalized, for example `image/jpeg` becomes `IMAGE_JPEG`. Scheduler assignment is still a placeholder implemented by `assign_deployment()`, which means the new executor currently runs containers locally after the deployment plan has already decided which plugin nodes are required.
