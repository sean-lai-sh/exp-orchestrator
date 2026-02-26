# Backend

This backend currently has two active tracks:

1. FastAPI deployment planning (`main.py` + `deployment.py`)
2. Earlier orchestration pipeline utilities (`fetcher.py`, `signature.py`, `planner.py`, `docker_utils.py`, `registry.py`)

## Docs

- [Using `deploy()`](./docs/DEPLOYMENT.md)
- [Backend organization map](./docs/BACKEND_ORGANIZATION.md)

## Quick Start (Deployment API)

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Run API server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
3. Call deploy endpoint:
   ```bash
   curl -X POST "http://127.0.0.1:8000/deploy" \
     -H "Content-Type: application/json" \
     -d '{"nodes":[{"id":"source","type":"sender","out_streams":["json"]},{"id":"plugin-a","type":"plugin","runtime":"test_image","in_streams":["json"]}],"edges":[{"source":"source","target":"plugin-a","data":"json"}]}'
   ```

## Deploy Usage (Inline)

Core function:

```python
deploy(workflow: DeployWorkflow, inject_env: bool = False) -> dict
```

Input model:

- `workflow.nodes`: list of `DeployNode`
- `workflow.edges`: list of `DeployEdge`

Important node/edge fields:

- `DeployNode.id`, `DeployNode.type`, `DeployNode.runtime`
- `DeployNode.in_streams`, `DeployNode.out_streams`, `DeployNode.env_vars`
- `DeployEdge.source`, `DeployEdge.target`, `DeployEdge.data` (defaults to `json`)

What `deploy()` returns:

- `topological_order`, `dag_graph`, `adjacency_list`
- `queued_plugins`, `assigned_nodes`
- `env_plan`
- `injected_nodes`, `skipped_nodes`
- `credentials_by_node`

Behavior summary:

- Validates all edge endpoints exist.
- Computes DAG order (fails on cycle).
- Generates per-edge stream credentials.
- Queues only `type == "plugin"` nodes for deployment.
- Builds env vars per queued plugin.
- If `inject_env=true`, attempts Docker env injection into runtime image.

For complete details and examples:

- [Using `deploy()`](./docs/DEPLOYMENT.md)

## Current Module Breakdown

- `main.py`: FastAPI app and `POST /deploy` route.
- `deployment.py`: Core deploy planner (DAG order, stream creds, plugin queue, env var plan, optional Docker env injection).
- `workflow_types.py`: Pydantic models for workflow and deploy payloads.
- `dag.py`: Topological sort utility with cycle detection.
- `test_deploy.py`: Docker-based chain integration test script.
- `fetcher.py`, `signature.py`, `planner.py`, `docker_utils.py`, `registry.py`: Utility modules for broader orchestration pipeline.
- `workflowprocessor.py`: Placeholder (currently empty).
