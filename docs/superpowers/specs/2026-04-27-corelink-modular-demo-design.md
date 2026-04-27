# Corelink-modular auto-connect demo — Design

**Date**: 2026-04-27
**Branch**: `demo-auto-connect-scripts`
**Status**: Approved (brainstorming complete; awaiting implementation plan)

## Problem

The auto-connect sender/receiver demo currently flows through an HTTP/SSE
relay in the orchestrator backend (`/deployments/{id}/messages`). For an
upcoming presentation we want the demo to run end-to-end through a real
Corelink server (`corelink.js`, the NYU pub/sub framework), with a plugin
between sender and receiver. After the presentation we plan to remove
Corelink entirely; everything added for the demo must therefore live behind
a clean modular boundary so that ripping it out is a small, enumerated set
of file deletes and edits — not a refactor.

## Goals

1. End-to-end demo over Corelink: `sender → plugin → receiver`, three
   processes, all wire transport via Corelink pub/sub.
2. The relay path (`--mode relay`) continues to work unchanged.
3. Every file that imports or speaks Corelink is named, isolated, and
   listed in a rip-out checklist.
4. Per-deployment workspace isolation on Corelink (one workspace per
   deploy, named `workflow_<deploy_id>`).
5. The orchestrator backend does not speak the Corelink WSS admin protocol;
   it talks to a new HTTP provisioning endpoint on the Corelink server.

## Non-goals

- Multi-transport abstraction long-term (we are not building a permanent
  `Transport` interface; Corelink is going away).
- Corelink reachability monitoring beyond what `corelink_health.py`
  already does.
- Plugin restart / reconnect resilience.
- CI integration for Corelink end-to-end (manual runbook only).
- Anything in the frontend / Convex layer.

## Architecture

Five processes participate in a demo run:

```
[corelink-server]   ←—— POST /api/provision (admin token) —— [backend (FastAPI)]
       ↑                                                              ↑
       │ wss://, testuser/testpassword                                │ HTTP
       │                                                              │
[sender.js]  ──pub──►  workspace_<deploy_id> stream:in  ──►  [plugin container]
                                                                  │
                                                                  │ pub
                                                                  ▼
                       workspace_<deploy_id> stream:out  ──►  [receiver.js]
```

Lifecycle:

1. Operator submits a workflow (`sender → plugin → receiver`) to
   `POST /deploy/execute/v2`.
2. Backend mints `deploy_id`, calls `corelink_admin.provision_deployment`
   which issues a single HTTPS `POST /api/provision` to the Corelink server.
   Provisioning returns `{workspace, host, port, username, password}` —
   that blob is the single source of truth for Corelink connection info.
3. Backend runs the planner with the provisioned workspace. The planner's
   `generate_pub_sub_cred` emits `StreamCredential` records using
   `workspace_<deploy_id>`. `build_env_vars` emits `IN_*`/`OUT_*` triples
   plus `CORELINK_HOST/PORT/USERNAME/PASSWORD` for plugin nodes only.
4. Executor launches the plugin container with those env vars; the
   container's `main.py` (mirroring `plugins/reference_plugin/main.py`)
   connects to Corelink and wires its IN/OUT streams.
5. Operator runs `node scripts/sender.js <deploy_id>` and
   `node scripts/receiver.js <deploy_id>`. Each fetches credentials from
   `GET /deployments/{id}/credentials?role=…` (returned shape gains a
   `corelink: {host, port, username, password}` block) and connects via
   `scripts/lib/corelink-transport.js`.
6. Sender publishes → plugin transforms → receiver prints. Wire transport
   is Corelink pubsub end to end.
7. `DELETE /deployments/{deploy_id}` stops containers and calls
   `corelink_admin.unprovision_deployment(deploy_id)`, which issues
   `DELETE /api/provision/<id>` on the Corelink server.

Both `--mode corelink` (default) and `--mode relay` exist in the new Node
scripts. Relay mode reuses the existing backend `/deployments/{id}/messages`
endpoints and never touches Corelink.

## Components

### New files

| Path | Purpose |
|---|---|
| `scripts/sender.js` | Node sender CLI; `--mode corelink` (default) or `--mode relay`; `--corelink-host`, `--corelink-username` overrides |
| `scripts/receiver.js` | Node receiver CLI; same flags |
| `scripts/lib/corelink-transport.js` | All `corelink.lib.js` calls live here |
| `scripts/lib/relay-transport.js` | HTTP/SSE fallback; same exported function shape as corelink-transport |
| `scripts/package.json` | Pins `@corelinkhub/corelink-client` (or local file path to `corelink.lib.js`) |
| `scripts/run_sender.js.sh`, `scripts/run_receiver.js.sh` | `npm install` + `node` wrappers |
| `plugins/corelink_demo/Dockerfile` | New Python plugin image, `python:3.11-slim` base |
| `plugins/corelink_demo/main.py` | Subscribe IN_*, run `_transform`, publish OUT_* (mirrors `reference_plugin`) |
| `plugins/corelink_demo/requirements.txt` | `corelink`, `fastapi`, `uvicorn` |
| `plugins/corelink_demo/tests/test_transform.py` | Pure-function test of `_transform` |
| `backend/corelink_admin.py` | `provision_deployment(deploy_id, streams) -> CorelinkProvisionResult`, `unprovision_deployment(deploy_id)`. Thin HTTP client. |
| `backend/tests/test_corelink_admin.py` | Mocks HTTP; covers happy path, timeout, bad-token, idempotency |

### Files edited

| Path | Change |
|---|---|
| `backend/main.py` | `/deploy/execute/v2` calls `provision_deployment` first; threads workspace+creds into planner; `/deployments/{id}/credentials` response gains `corelink` block; new `DELETE /deployments/{id}` endpoint |
| `backend/deployment.py` | `deploy(workflow, deploy_id, workspace, inject_env)` signature gains `deploy_id` and `workspace`; `generate_pub_sub_cred` uses the deployment-scoped workspace; `build_env_vars` injects `CORELINK_*` vars for plugin nodes only (sourced from the provisioning blob, not `os.environ`) |
| `backend/allowlist.py` | Add `corelink_demo:latest` to runtime image allowlist |
| `backend/run.sh` | Add `CORELINK_PROVISION_TOKEN` (shared secret with the corelink server). Keep `CORELINK_HOST` / `CORELINK_PORT` (read by `corelink_admin` and `corelink_health`). Drop `CORELINK_USERNAME` / `CORELINK_PASSWORD` — they're returned by the provisioning response now and are not needed in the orchestrator process env. |
| `corelink-server/corelink.js` | Extend `httpsControlServer` callback at `~:4562` with two new branches: `POST /api/provision` and `DELETE /api/provision/<deploy_id>`. Both gated by `X-Provision-Token` header. Both idempotent. |
| `corelink-server/tests/tests.js` | Add provisioning route tests |

### Rip-out checklist (for after the demo)

**Delete:**
- `backend/corelink_health.py`, `backend/corelink_admin.py`
- `backend/tests/test_corelink_health.py`, `backend/tests/test_corelink_admin.py`
- `plugins/corelink_demo/`, `plugins/reference_plugin/`
- `scripts/lib/corelink-transport.js`
- `scripts/package.json` corelink-client dependency line
- The two `/api/provision` route branches in `corelink-server/corelink.js`
  (and their tests in `tests/tests.js`)

**Edit:**
- `backend/main.py` — remove `/health/corelink` endpoint, the
  `provision_deployment` call in `/deploy/execute/v2`, the
  `unprovision_deployment` call in `DELETE /deployments/{id}`, the
  `corelink_health` import, and remove corelink-related fields from
  `deploy_with_allocation`. The `corelink` block in the credentials
  response goes away.
- `backend/allocator.py` — remove `corelink_health` import and the
  `corelink_unreachable` defer branch.
- `backend/deployment.py` — remove `CORELINK_*` injection in
  `build_env_vars`; replace `generate_pub_sub_cred` body with a
  relay-only credential (or drop it if relay needs none).
- `backend/run.sh` — drop `CORELINK_*` env vars.
- `scripts/sender.js`, `scripts/receiver.js` — remove `--mode corelink`
  branch and the `require('./lib/corelink-transport')` ternary; only
  `relay-transport` remains. Optionally remove the mode flag entirely.

**Total**: ~7 files deleted, ~5 files edited.

## Interfaces

### Node transport interface

Both `corelink-transport.js` and `relay-transport.js` export the same
shape:

```js
module.exports = {
  async connect({ host, deployId, role, credentials }) { /* → handle */ },
  async send(handle, message) {},
  async subscribe(handle, onMessage) { /* → unsubscribe fn */ },
  async close(handle) {},
};
```

`sender.js` / `receiver.js` pick by `--mode`:

```js
const transport = mode === 'corelink'
  ? require('./lib/corelink-transport')
  : require('./lib/relay-transport');
```

The scripts never `require('corelink')` directly. Rip-out = delete
`corelink-transport.js`, delete the ternary.

### Python plugin (`plugins/corelink_demo/main.py`)

Mirrors `plugins/reference_plugin/main.py`. Differences:

- Real `_transform(data: bytes) -> bytes` (e.g., upper-case).
- `[demo-plugin]` log prefix.
- Same env contract: `CORELINK_HOST`, `CORELINK_PORT`,
  `CORELINK_USERNAME`, `CORELINK_PASSWORD`, `IN_<TYPE>_WORKSPACE/STREAM_ID/PROTOCOL`,
  `OUT_<TYPE>_WORKSPACE/STREAM_ID/PROTOCOL`.

All Corelink calls stay in `main.py` (no separate transport module — the
file is small, the rip-out is "delete the directory"). FastAPI `/health`
is kept for the executor's liveness check.

### Backend `corelink_admin.py`

```python
@dataclass
class CorelinkProvisionResult:
    workspace: str
    host: str
    port: int
    username: str
    password: str

class CorelinkAdminError(Exception): ...

async def provision_deployment(deploy_id: str) -> CorelinkProvisionResult:
    """POST /api/provision on corelink-server with X-Provision-Token. Idempotent.
    Creates the workspace `workflow_<deploy_id>` if it doesn't already exist."""

async def unprovision_deployment(deploy_id: str) -> None:
    """DELETE /api/provision/<deploy_id>. Treats 404 as success."""
```

Reads `CORELINK_HOST`, `CORELINK_PORT`, `CORELINK_PROVISION_TOKEN` from
env. Uses `httpx.AsyncClient` with TLS verification disabled (Corelink
server uses a self-signed cert in dev). Timeout 5 s.

### Corelink-server provisioning routes

Added to the existing `httpsControlServer` callback at
`corelink.js:4562`. No new dependency.

```
POST /api/provision
  Headers: X-Provision-Token: <shared secret>
  Body:    {"deploy_id": "a1b2c3d4"}
  Response 200: {"workspace": "workflow_a1b2c3d4",
                 "host": "<server-host>", "port": 20012,
                 "username": "testuser", "password": "testpassword"}
  Response 401: missing/wrong token
  Idempotent: second call with same deploy_id returns the same blob.

DELETE /api/provision/<deploy_id>
  Headers: X-Provision-Token: <shared secret>
  Response 200: workspace removed
  Response 404: workspace already gone (treated as success by the orchestrator)
```

The route handler internally calls the existing `addWorkspace` /
`rmWorkspace` admin functions. Stream IDs are not pre-registered — they
come into existence when senders connect and call `createSender`; the
orchestrator-generated `stream_id` strings in `StreamCredential` are
used as filter hints by receivers (`create_receiver(stream_ids=[...])`).

## Data flow & API contracts

### Deploy

`POST /deploy/execute/v2` (request unchanged):

```json
{
  "nodes": [
    {"id": "src", "type": "sender", "out_streams": ["json"]},
    {"id": "plg", "type": "plugin", "runtime": "corelink_demo:latest",
     "in_streams": ["json"], "out_streams": ["json"]},
    {"id": "rcv", "type": "receiver", "in_streams": ["json"]}
  ],
  "edges": [
    {"source": "src", "target": "plg", "data": "json"},
    {"source": "plg", "target": "rcv", "data": "json"}
  ]
}
```

Backend sequence:

1. `deploy_id = uuid4().hex[:8]`.
2. `provisioning = await corelink_admin.provision_deployment(deploy_id)`.
3. `plan = deploy(workflow, deploy_id=deploy_id, workspace=provisioning.workspace, inject_env=True)` — `generate_pub_sub_cred` uses the deploy-scoped workspace; `build_env_vars` injects `CORELINK_HOST/PORT/USERNAME/PASSWORD` into plugin nodes' env_plan from `provisioning`.
4. Executor starts the plugin container with that env_plan.
5. `deployments[deploy_id] = {plan, execution, workflow, provisioning}`.

Response:

```json
{"message": "Deploy executed", "deploy_id": "a1b2c3d4",
 "workspace": "workflow_a1b2c3d4", "plan": {...}, "execution": [...]}
```

### Credentials

`GET /deployments/a1b2c3d4/credentials?role=sender` — response gains a
`corelink` block sourced from the provisioning blob:

```json
{
  "deploy_id": "a1b2c3d4", "role": "sender", "node_id": "src",
  "corelink": {"host": "localhost", "port": 20012,
               "username": "testuser", "password": "testpassword"},
  "credentials": {
    "json": {"workspace": "workflow_a1b2c3d4", "protocol": "pubsub",
             "stream_id": "src_plg_json_stream",
             "data_type": "json", "metadata": {}}
  }
}
```

### Sender / receiver connect (corelink mode)

1. Fetch credentials.
2. `transport.connect({host, deployId, role, credentials})` →
   internally: `corelink.connect(corelink.username, corelink.password, corelink.host, corelink.port)`,
   then `corelink.createSender(...)` or sets up `corelink.subscribe(...)`.
3. REPL loop on sender; subscribe callback on receiver.

### Cleanup

`DELETE /deployments/a1b2c3d4`:

1. Stop plugin container via executor.
2. `await corelink_admin.unprovision_deployment(deploy_id)`.
3. Remove `deployments[deploy_id]`.
4. Return 200 with optional `warnings` array if any step soft-failed.

### Env var summary

| Var | Set by | Read by |
|---|---|---|
| `CORELINK_HOST`, `CORELINK_PORT` | `backend/run.sh` | `corelink_admin.py`, `corelink_health.py` |
| `CORELINK_PROVISION_TOKEN` | `backend/run.sh` (matches token on corelink-server) | `corelink_admin.py` |
| `CORELINK_USERNAME`, `CORELINK_PASSWORD` (defaults `testuser`/`testpassword`) | provisioning response | injected into plugin container's env_plan |
| `IN_<TYPE>_WORKSPACE/STREAM_ID/PROTOCOL` | `build_env_vars` | plugin container |
| `OUT_<TYPE>_WORKSPACE/STREAM_ID/PROTOCOL` | `build_env_vars` | plugin container |

## Error handling

| Failure | Detected by | Behavior | User sees |
|---|---|---|---|
| Corelink unreachable at provision time | `corelink_admin.provision_deployment` | `/deploy/execute/v2` returns 503 with `{detail: "corelink unreachable: <reason>"}`. Nothing launched. | HTTP 503. |
| Provision token rejected (401/403) | `corelink_admin.provision_deployment` | 502 with `{detail: "corelink rejected provision token"}`. | HTTP 502. |
| Workspace already exists on Corelink | `POST /api/provision` route | Idempotent — returns same blob. | Transparent. |
| Plugin container fails to connect to Corelink | Plugin's `_corelink_loop` raises → container exits | Executor reports `status: "exited"` for that node. Workspace not auto-cleaned. | Plugin shows `exited` in deploy response. |
| Sender/receiver can't reach orchestrator | `requests.get` / `fetch` fails | Print `Error fetching credentials: <code>`, exit 1. | CLI exits with message. |
| Sender/receiver can't connect to Corelink | `transport.connect` rejects | Print `Corelink connect failed: <error>`, exit 1. Suggest `--mode relay`. | CLI exits with hint. |
| Receiver started before sender | Normal Corelink flow | Receiver prints `Waiting for sender stream…`. No error. | Just waits; works on connect. |
| Mode mismatch (one corelink, one relay) | Not detectable from one side | Receiver hears nothing. Each script prints `Mode: corelink`/`Mode: relay` banner at startup. | Visible mode banner. |
| Plugin `_transform` throws | `try/except` in `_on_data` | Log `[demo-plugin] transform error: <e>`, drop message, keep running. | Container logs. |
| Cleanup partial failure | Each step independently | Stop + unprovision called separately. 404 from unprovision treated as success. Errors logged; state cleaned anyway; response includes `warnings`. | 200 + warnings array. |

Deliberately not handled (acceptable for a demo):

- Backend crash mid-deploy → orphaned workspace on Corelink. Document
  manual cleanup; rare in practice.
- Plugin restart resilience.
- Auth token rotation, replay, rate limits.
- Concurrent deploy races.

## Testing

### Automated

**Backend (Python, pytest)**

| Test | Coverage |
|---|---|
| `tests/test_corelink_admin.py` (new) | `provision_deployment` happy path, timeout → `CorelinkAdminError`, bad token raises specific error, idempotency, `unprovision_deployment` 404 treated as success. Mock HTTP via `respx` or `monkeypatch`. |
| `tests/test_deployment_planner.py` (extend) | `deploy(deploy_id, workspace)` puts the workspace in every `creds_by_node[*].in_creds/out_creds`; plugin nodes' `env_plan` contains `IN_*_WORKSPACE`, `OUT_*_WORKSPACE`, and `CORELINK_*`; sender/receiver nodes do **not** get `CORELINK_*`. |
| `tests/test_main.py` (new or extended) | `POST /deploy/execute/v2` happy path with mocked `corelink_admin`; provision failure → 503; `DELETE /deployments/{id}` calls `unprovision_deployment` and tolerates 404. FastAPI `TestClient`. |

**Corelink-server (Node)**

Add to `tests/tests.js`:
- `POST /api/provision` with valid token returns expected blob.
- Idempotent on repeat with same `deploy_id`.
- Missing/wrong `X-Provision-Token` returns 401.
- `DELETE /api/provision/<id>` succeeds; 404 on second call.

**Node scripts**

- `scripts/lib/relay-transport.js` — unit-tested against in-process
  mock fetch + EventSource. Long-term path; worth testing.
- `scripts/lib/corelink-transport.js` — **not unit-tested**; covered by
  manual demo run. Mocking Corelink is more risk than reward for a
  throwaway path.
- Interface conformance test: both transport modules export the same
  function names with matching arities.

**Plugin**

- `tests/test_transform.py` — pure-function test of `_transform`.
- `tests/test_env_parsing.py` — `_parse_stream_env("IN_")` against a
  fabricated env dict.

### Manual demo runbook (also serves as the demo-day script)

1. `cd corelink-server && npm start` — server up on :20012.
2. `cd backend && ./run.sh` — orchestrator on :8000. Verify
   `GET /health/corelink` returns `healthy`.
3. `curl -X POST localhost:8000/deploy/execute/v2 -d @demo-workflow.json`
   → returns `deploy_id`. Note the returned `workspace`.
4. (Optional) Verify workspace exists on Corelink.
5. Terminal A: `node scripts/sender.js <deploy_id>`. Terminal B:
   `node scripts/receiver.js <deploy_id>`. Both print
   `Mode: corelink` banner.
6. Type "hello" in sender → receiver prints `[received] HELLO` (or
   whichever transform the new plugin implements).
7. `curl -X DELETE localhost:8000/deployments/<deploy_id>`. Workspace
   removed on Corelink.
8. Repeat with `--mode relay` on both scripts; same flow without
   Corelink.

### Out of scope

- Live end-to-end Corelink in CI (no Corelink server in CI).
- Concurrent deploys / load.
- Plugin restart resilience.

## Open questions

None at design time. All design choices have been confirmed in
brainstorming. The implementation plan will resolve concrete details
(exact transform, exact protocol names, npm-package-vs-vendored copy of
`corelink.lib.js`, port bindings).
