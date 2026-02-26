# Backend TODO

- [x] Add deploy-focused workflow models in `workflow_types.py` for DAG + env-var orchestration.
- [x] Create a concrete `deploy()` function that runs DAG ordering, stream credential generation, and deployment queueing.
- [x] Wire FastAPI `/deploy` endpoint to call the shared `deploy()` function.
- [ ] Align frontend deploy payload shape with backend `DeployWorkflow` contract end-to-end.
