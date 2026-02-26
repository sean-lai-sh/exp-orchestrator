# Backend Organization

This document groups backend files by responsibility and proposes a cleaner target structure.

## Current Responsibility Split

### 1) API + Server

- `main.py`
  - FastAPI server.
  - Exposes `POST /deploy`.
  - Converts `ValueError` from deploy logic to HTTP 400.

### 2) Core Deployment Functionality

- `deployment.py`
  - Main deploy planner and optional env injection.
  - Stream credential generation and env var expansion.
  - Plugin queue + assignment placeholder.
- `workflow_types.py`
  - Deploy payload and workflow models.
- `dag.py`
  - Topological order + cycle detection utility.

### 3) Orchestration Pipeline Utilities

- `fetcher.py`
  - Pull workflow JSON from remote API.
- `signature.py`
  - Compute deterministic node signatures.
- `planner.py`
  - Group nodes and generate container specs.
- `docker_utils.py`
  - Build/push container images.
- `registry.py`
  - Upsert container metadata into Postgres registry.

### 4) Tests / Validation

- `test_deploy.py`
  - End-to-end Docker chain test for service-to-service flow.

### 5) Placeholder / Pending

- `workflowprocessor.py`
  - Currently empty; natural place to orchestrate full pipeline end-to-end.

## Suggested Target Structure

If you want to physically reorganize files, this split keeps ownership clear:

```text
backend/
  api/
    server.py              # from main.py
    routes/
      deploy.py
  deployment/
    core.py                # from deployment.py
    dag.py                 # from dag.py
    models.py              # deploy-focused models from workflow_types.py
  orchestration/
    fetcher.py
    signature.py
    planner.py
    docker_utils.py
    registry.py
    processor.py           # from workflowprocessor.py when implemented
  tests/
    test_deploy_chain.py   # from test_deploy.py
```

## Recommended Migration Order

1. Move files while keeping backward-compatible imports (re-export old paths).
2. Update `main.py` imports first (`deploy`, `DeployWorkflow`).
3. Move models and update all references in deployment + tests.
4. Move utilities and keep behavior unchanged.
5. Remove compatibility shims after callers switch to new paths.

## Practical Rule of Thumb

- API folder owns HTTP-only concerns.
- Deployment core owns graph validation, credential generation, env planning.
- Orchestration utilities own build/push/registry automation.
- Tests validate end-to-end behavior independently of route layer.
