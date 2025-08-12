# Backend Orchestrator Package

This package provides a complete orchestration pipeline for workflows defined via JSON APIs. The key modules include:

- **fetcher.py**: Fetch and ingest workflow definitions from an API endpoint.
- **signature.py**: Compute unique signatures for workflow nodes based on config.
- **planner.py**: Group nodes by signature and generate container specs.
- **docker_utils.py**: Build and push Docker images for each container spec.
- **registry.py**: Insert or update container metadata in a Postgres registry.
- **workflowprocessor.py**: Master function `orchestrate_workflow` tying all steps together.

## Usage

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Set the registry database URL:
   ```bash
   export REGISTRY_DB_URL="postgres://user:pass@host:port/db"
   ```
3. Call `orchestrate_workflow(api_url, workflow_id)` to execute the full pipeline.

## Development

Add your Postgres schema for the `containers` table and ensure Docker Daemon is running.