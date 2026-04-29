# Backend TODO

- [x] Add deploy-focused workflow models in `workflow_types.py` for DAG + env-var orchestration.
- [x] Create a concrete `deploy()` function that runs DAG ordering, stream credential generation, and deployment queueing.
- [x] Wire FastAPI `/deploy` endpoint to call the shared `deploy()` function.
- [ ] Align frontend deploy payload shape with backend `DeployWorkflow` contract end-to-end.
- [x] Add broker provider module (`broker_admin.py`) for deploy-time NATS provisioning.
- [x] During deploy, resolve and inject `NATS_URL` for each assigned plugin node.
- [ ] Add server capability/config matching before assignment (runtime/modules/resource checks).
- [ ] If no existing server can run the workflow, trigger provisioning flow and return a new candidate server list.
- [ ] Persist assignment decision + capability reason in deploy response for observability/debugging.
