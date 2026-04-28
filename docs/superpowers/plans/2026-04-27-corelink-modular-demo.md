# Corelink-modular auto-connect demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an end-to-end Corelink demo (sender → plugin → receiver) where every Corelink-touching file lives behind a clean modular boundary so post-demo rip-out is a small enumerated set of file deletes/edits.

**Architecture:** Variant A from the spec — orchestrator backend talks to a new HTTP provisioning endpoint on the corelink-server (no WSS admin protocol speaking). One workspace per deployment (`workflow_<deploy_id>`). Both `--mode corelink` (default) and `--mode relay` exist in new Node sender/receiver scripts. Corelink-aware code is isolated in named files (`corelink_admin.py`, `corelink-transport.js`, `plugins/corelink_demo/`).

**Tech Stack:**
- corelink-server: Node 16+, `https.createServer` + `knex` + sqlite3 (already in repo)
- Backend: FastAPI, Python 3.11+, `httpx`, `pytest`/`pytest-asyncio` (already in deps)
- Plugin: Python 3.11-slim Docker image with `corelink` PyPI + `fastapi`/`uvicorn`
- Scripts: Node 16+, `@corelinkhub/corelink-client` (a.k.a. `corelink.lib.js`)

**Spec:** `docs/superpowers/specs/2026-04-27-corelink-modular-demo-design.md`

**Repos involved:**
- `/Users/kaikaidu/Documents/GitHub/exp-orchestrator` (this repo) — backend, plugins, scripts, docs
- `/Users/kaikaidu/documents/github/corelink-server` — provisioning routes added here

---

## Phase 1 — corelink-server provisioning routes

Foundation for everything downstream. Implements the HTTP API the orchestrator backend will call.

### Task 1: Add JSON-body helper and route skeleton on corelink-server

**Files:**
- Modify: `/Users/kaikaidu/documents/github/corelink-server/corelink.js` (around line 4562)
- Create: `/Users/kaikaidu/documents/github/corelink-server/tests/test-provision.js`

- [ ] **Step 1: Write the failing test**

Create `/Users/kaikaidu/documents/github/corelink-server/tests/test-provision.js`:

```js
// Standalone test: requires corelink-server to be running on :20012.
// Run: node tests/test-provision.js
const https = require('https')

const HOST = process.env.CL_HOST || '127.0.0.1'
const PORT = parseInt(process.env.CL_PORT || '20012', 10)
const TOKEN = process.env.CL_PROVISION_TOKEN || 'test-token'

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : ''
    const req = https.request({
      host: HOST, port: PORT, method, path,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Provision-Token': TOKEN,
      },
      rejectUnauthorized: false,
    }, (res) => {
      let chunks = ''
      res.on('data', (c) => { chunks += c })
      res.on('end', () => resolve({ status: res.statusCode, body: chunks }))
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

async function main() {
  // Skeleton check: route exists, returns 200 (full behavior added in later tasks)
  const res = await request('POST', '/api/provision', { deploy_id: 'test1234' })
  console.log('POST /api/provision →', res.status, res.body)
  if (res.status !== 200) {
    console.error('FAIL: expected 200')
    process.exit(1)
  }
  console.log('PASS')
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run the test against the unchanged server to verify it fails**

Run (in a separate terminal, start corelink-server first):
```bash
cd /Users/kaikaidu/documents/github/corelink-server
npm start &
sleep 2
node tests/test-provision.js
```
Expected: non-200 status (likely a static-file 404 or connection drop). Stop the server (`fg`, Ctrl-C) before continuing.

- [ ] **Step 3: Add JSON-body helper + route dispatcher**

In `/Users/kaikaidu/documents/github/corelink-server/corelink.js`, find the existing `httpsControlServer` callback (around line 4562). Replace its body to add a top-level dispatcher for `/api/*`:

Locate this block:
```js
  const httpsControlServer = https.createServer(httpsOptions, (req, res) => {
    if (req.url === '/version') {
      res.writeHead(200)
      res.end(`Corelink Server ${serverVersion}`)
    } else {
      log.info(`${req.socket.remoteAddress} ${req.method} ${req.url}`)
      req.addListener('end', () => {
        fileServer.serve(req, res)
      }).resume()
    }
  })
```

Replace with:
```js
  // Helper: read full request body, parse as JSON. Resolves to {} for empty body.
  function readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let chunks = ''
      req.on('data', (c) => { chunks += c })
      req.on('end', () => {
        if (!chunks) return resolve({})
        try { resolve(JSON.parse(chunks)) } catch (e) { reject(e) }
      })
      req.on('error', reject)
    })
  }

  function sendJson(res, status, body) {
    const text = JSON.stringify(body)
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(text),
    })
    res.end(text)
  }

  const httpsControlServer = https.createServer(httpsOptions, async (req, res) => {
    if (req.url === '/version') {
      res.writeHead(200)
      res.end(`Corelink Server ${serverVersion}`)
      return
    }
    if (req.url && req.url.startsWith('/api/')) {
      try {
        await handleApi(req, res)
      } catch (e) {
        log.error(e, 'api handler error')
        sendJson(res, 500, { error: 'internal_error', detail: String(e) })
      }
      return
    }
    log.info(`${req.socket.remoteAddress} ${req.method} ${req.url}`)
    req.addListener('end', () => {
      fileServer.serve(req, res)
    }).resume()
  })

  // Skeleton: returns 200 unconditionally for now. Auth + handlers added in next tasks.
  async function handleApi(req, res) {
    sendJson(res, 200, { skeleton: true })
  }
```

- [ ] **Step 4: Run the test to verify it now passes**

```bash
cd /Users/kaikaidu/documents/github/corelink-server
npm start &
sleep 2
node tests/test-provision.js
```
Expected: `POST /api/provision → 200 {"skeleton":true}` then `PASS`. Kill the server (`fg`, Ctrl-C).

- [ ] **Step 5: Commit**

```bash
cd /Users/kaikaidu/documents/github/corelink-server
git add corelink.js tests/test-provision.js
git commit -m "Add /api dispatcher skeleton on httpsControlServer"
```

---

### Task 2: Add token authentication to /api routes

**Files:**
- Modify: `/Users/kaikaidu/documents/github/corelink-server/corelink.js` (`handleApi` function)
- Modify: `/Users/kaikaidu/documents/github/corelink-server/tests/test-provision.js`

- [ ] **Step 1: Extend the test**

Replace the `main()` function in `tests/test-provision.js` with:

```js
async function main() {
  // 1. Missing token → 401
  let res = await new Promise((resolve, reject) => {
    const req = https.request({
      host: HOST, port: PORT, method: 'POST', path: '/api/provision',
      headers: { 'Content-Type': 'application/json' },
      rejectUnauthorized: false,
    }, (r) => {
      let c = ''; r.on('data', (x) => { c += x }); r.on('end', () => resolve({ status: r.statusCode, body: c }))
    })
    req.on('error', reject)
    req.write(JSON.stringify({ deploy_id: 'test1234' }))
    req.end()
  })
  console.log('no token →', res.status)
  if (res.status !== 401) { console.error('FAIL: expected 401, got', res.status); process.exit(1) }

  // 2. Wrong token → 401
  res = await request('POST', '/api/provision', { deploy_id: 'test1234' })
  // overwrite token for this call only by using request() with a temporary env override
  const wrongTokenRes = await new Promise((resolve, reject) => {
    const req = https.request({
      host: HOST, port: PORT, method: 'POST', path: '/api/provision',
      headers: { 'Content-Type': 'application/json', 'X-Provision-Token': 'wrong' },
      rejectUnauthorized: false,
    }, (r) => {
      let c = ''; r.on('data', (x) => { c += x }); r.on('end', () => resolve({ status: r.statusCode, body: c }))
    })
    req.on('error', reject)
    req.write(JSON.stringify({ deploy_id: 'test1234' }))
    req.end()
  })
  console.log('wrong token →', wrongTokenRes.status)
  if (wrongTokenRes.status !== 401) { console.error('FAIL: wrong token should give 401'); process.exit(1) }

  // 3. Correct token → 200 (skeleton still returns {skeleton: true})
  const ok = await request('POST', '/api/provision', { deploy_id: 'test1234' })
  console.log('correct token →', ok.status, ok.body)
  if (ok.status !== 200) { console.error('FAIL: correct token should give 200'); process.exit(1) }

  console.log('PASS')
}
```

- [ ] **Step 2: Run the test, expect it to fail**

```bash
cd /Users/kaikaidu/documents/github/corelink-server
CL_PROVISION_TOKEN=test-token npm start &
sleep 2
CL_PROVISION_TOKEN=test-token node tests/test-provision.js
```
Expected: `no token → 200` then FAIL (the skeleton accepts everything). Kill server.

- [ ] **Step 3: Add token check to `handleApi`**

In `corelink.js`, replace the skeleton `handleApi` with:

```js
  const PROVISION_TOKEN = process.env.CL_PROVISION_TOKEN || ''

  async function handleApi(req, res) {
    if (!PROVISION_TOKEN) {
      return sendJson(res, 503, { error: 'provisioning_disabled',
        detail: 'CL_PROVISION_TOKEN env var not set on corelink-server' })
    }
    if (req.headers['x-provision-token'] !== PROVISION_TOKEN) {
      return sendJson(res, 401, { error: 'unauthorized' })
    }
    // Delegate to per-route handlers (added in next tasks)
    return sendJson(res, 200, { authenticated: true })
  }
```

- [ ] **Step 4: Run the test, expect PASS**

```bash
cd /Users/kaikaidu/documents/github/corelink-server
CL_PROVISION_TOKEN=test-token npm start &
sleep 2
CL_PROVISION_TOKEN=test-token node tests/test-provision.js
```
Expected: `no token → 401`, `wrong token → 401`, `correct token → 200`, then `PASS`. Kill server.

- [ ] **Step 5: Commit**

```bash
cd /Users/kaikaidu/documents/github/corelink-server
git add corelink.js tests/test-provision.js
git commit -m "Add X-Provision-Token auth to /api routes"
```

---

### Task 3: Implement POST /api/provision happy path

**Files:**
- Modify: `/Users/kaikaidu/documents/github/corelink-server/corelink.js`
- Modify: `/Users/kaikaidu/documents/github/corelink-server/tests/test-provision.js`

- [ ] **Step 1: Replace test main() with happy-path assertion**

Update `main()` in `tests/test-provision.js`:

```js
async function main() {
  const deployId = `t${Date.now()}`
  const res = await request('POST', '/api/provision', { deploy_id: deployId })
  console.log('POST →', res.status, res.body)
  if (res.status !== 200) { console.error('FAIL: expected 200'); process.exit(1) }
  const body = JSON.parse(res.body)
  if (body.workspace !== `workflow_${deployId}`) { console.error('FAIL: workspace name'); process.exit(1) }
  if (!body.host || !body.port) { console.error('FAIL: missing host/port'); process.exit(1) }
  if (body.username !== 'Testuser' || body.password !== 'Testpassword') {
    console.error('FAIL: expected Testuser/Testpassword'); process.exit(1)
  }
  console.log('PASS')
}
```

- [ ] **Step 2: Run the test, expect it to fail**

```bash
cd /Users/kaikaidu/documents/github/corelink-server
CL_PROVISION_TOKEN=test-token npm start &
sleep 2
CL_PROVISION_TOKEN=test-token node tests/test-provision.js
```
Expected: 200 but body is `{authenticated: true}` — FAIL on workspace check. Kill server.

- [ ] **Step 3: Implement provisioning logic**

In `corelink.js`, replace `handleApi` with the routing version:

```js
  const PROVISION_TOKEN = process.env.CL_PROVISION_TOKEN || ''
  const DEMO_USERNAME = process.env.CL_DEMO_USERNAME || 'Testuser'
  const DEMO_PASSWORD = process.env.CL_DEMO_PASSWORD || 'Testpassword'

  async function handleApi(req, res) {
    if (!PROVISION_TOKEN) {
      return sendJson(res, 503, { error: 'provisioning_disabled',
        detail: 'CL_PROVISION_TOKEN env var not set on corelink-server' })
    }
    if (req.headers['x-provision-token'] !== PROVISION_TOKEN) {
      return sendJson(res, 401, { error: 'unauthorized' })
    }

    // Routing
    const url = req.url || ''
    if (req.method === 'POST' && url === '/api/provision') {
      return handleProvision(req, res)
    }
    // DELETE handled in next task
    return sendJson(res, 404, { error: 'not_found' })
  }

  async function handleProvision(req, res) {
    let body
    try {
      body = await readJsonBody(req)
    } catch (e) {
      return sendJson(res, 400, { error: 'invalid_json', detail: String(e) })
    }
    const deployId = body.deploy_id
    if (!deployId || typeof deployId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(deployId)) {
      return sendJson(res, 400, { error: 'invalid_deploy_id',
        detail: 'deploy_id must be an alphanumeric/dash/underscore string' })
    }
    const workspaceName = `workflow_${deployId}`

    // Look up the seeded admin user once, use as owner.
    const admin = await knex('users').first('id').where('username', 'admin').catch(() => null)
    if (!admin) {
      return sendJson(res, 500, { error: 'no_admin_user',
        detail: 'admin user not seeded on corelink-server' })
    }

    // Check existing workspace (idempotent on repeat).
    const existing = await knex('workspaces')
      .first('id').where('workspace_name', workspaceName).catch(() => null)
    if (!existing) {
      await knex('workspaces').insert({ owner_id: admin.id, workspace_name: workspaceName })
      // Mirror the in-memory legacy structure addWorkspace maintains
      if (typeof workspaces[workspaceName] === 'undefined') {
        workspaces[workspaceName] = []
        workspaces[workspaceName].owner = admin.id
        workspaces[workspaceName].users = [admin.id]
      }
    }

    // Determine the public host the orchestrator should hand to clients.
    const publicHost = process.env.CL_PUBLIC_HOST || req.socket.localAddress || '127.0.0.1'
    const publicPort = WSControl

    return sendJson(res, 200, {
      workspace: workspaceName,
      host: publicHost,
      port: publicPort,
      username: DEMO_USERNAME,
      password: DEMO_PASSWORD,
    })
  }
```

Note: `WSControl` and `workspaces` are existing in-scope variables in this function. `knex` is the module-level imported instance.

- [ ] **Step 4: Run the test, expect PASS**

```bash
cd /Users/kaikaidu/documents/github/corelink-server
CL_PROVISION_TOKEN=test-token npm start &
sleep 2
CL_PROVISION_TOKEN=test-token node tests/test-provision.js
```
Expected: `POST → 200 {"workspace":"workflow_t…","host":"…","port":20012,"username":"Testuser","password":"Testpassword"}` then `PASS`. Kill server.

- [ ] **Step 5: Commit**

```bash
cd /Users/kaikaidu/documents/github/corelink-server
git add corelink.js tests/test-provision.js
git commit -m "Implement POST /api/provision (workspace creation, admin-owned)"
```

---

### Task 4: Make POST /api/provision idempotent

**Files:**
- Modify: `/Users/kaikaidu/documents/github/corelink-server/tests/test-provision.js`

(The handler in Task 3 already short-circuits when the workspace exists, so this is a verification task — no production code changes needed if the existing-row check works.)

- [ ] **Step 1: Add idempotency assertion to test**

Append to `main()` after the first happy-path block:

```js
  // Idempotency: second call with same deploy_id returns the same blob, status 200
  const res2 = await request('POST', '/api/provision', { deploy_id: deployId })
  console.log('POST (repeat) →', res2.status, res2.body)
  if (res2.status !== 200) { console.error('FAIL: repeat should be 200'); process.exit(1) }
  const body2 = JSON.parse(res2.body)
  if (body2.workspace !== body.workspace) { console.error('FAIL: workspace mismatch'); process.exit(1) }
```

- [ ] **Step 2: Run the test, expect PASS without code changes**

```bash
cd /Users/kaikaidu/documents/github/corelink-server
CL_PROVISION_TOKEN=test-token npm start &
sleep 2
CL_PROVISION_TOKEN=test-token node tests/test-provision.js
```
Expected: PASS (the `existing` check in handler already short-circuits). Kill server.

- [ ] **Step 3: Commit**

```bash
cd /Users/kaikaidu/documents/github/corelink-server
git add tests/test-provision.js
git commit -m "Verify POST /api/provision idempotency"
```

---

### Task 5: Implement DELETE /api/provision/:deploy_id

**Files:**
- Modify: `/Users/kaikaidu/documents/github/corelink-server/corelink.js`
- Modify: `/Users/kaikaidu/documents/github/corelink-server/tests/test-provision.js`

- [ ] **Step 1: Add DELETE happy-path + 404 idempotency to test**

Append to `main()`:

```js
  // DELETE: success on existing
  const del = await request('DELETE', `/api/provision/${deployId}`, null)
  console.log('DELETE →', del.status)
  if (del.status !== 200) { console.error('FAIL: expected 200'); process.exit(1) }

  // DELETE: 200 (treated as success on already-gone)
  const del2 = await request('DELETE', `/api/provision/${deployId}`, null)
  console.log('DELETE (repeat) →', del2.status)
  if (del2.status !== 200 && del2.status !== 404) {
    console.error('FAIL: expected 200 or 404'); process.exit(1)
  }
```

Also update `request()` to handle a `null` body cleanly — replace its body block with:

```js
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : ''
    const headers = {
      'Content-Type': 'application/json',
      'X-Provision-Token': TOKEN,
    }
    if (data) headers['Content-Length'] = Buffer.byteLength(data)
    const req = https.request({
      host: HOST, port: PORT, method, path, headers,
      rejectUnauthorized: false,
    }, (res) => {
      let chunks = ''
      res.on('data', (c) => { chunks += c })
      res.on('end', () => resolve({ status: res.statusCode, body: chunks }))
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}
```

- [ ] **Step 2: Run the test, expect it to fail**

```bash
cd /Users/kaikaidu/documents/github/corelink-server
CL_PROVISION_TOKEN=test-token npm start &
sleep 2
CL_PROVISION_TOKEN=test-token node tests/test-provision.js
```
Expected: DELETE returns 404 (the route handler returns `not_found` for unknown methods). Kill server.

- [ ] **Step 3: Implement DELETE handler**

In `handleApi`, add a DELETE branch before the final `not_found` return:

```js
    if (req.method === 'DELETE' && /^\/api\/provision\/[A-Za-z0-9_-]+$/.test(url)) {
      return handleUnprovision(req, res)
    }
```

Then add the handler function (next to `handleProvision`):

```js
  async function handleUnprovision(req, res) {
    const url = req.url || ''
    const deployId = url.replace('/api/provision/', '')
    const workspaceName = `workflow_${deployId}`

    const existing = await knex('workspaces')
      .first('id').where('workspace_name', workspaceName).catch(() => null)
    if (!existing) {
      // Treat as success (idempotent). 200 keeps the contract simple for the orchestrator.
      return sendJson(res, 200, { workspace: workspaceName, removed: false, reason: 'not_found' })
    }
    await knex('workspaces').where('id', existing.id).delete()
    delete workspaces[workspaceName]
    return sendJson(res, 200, { workspace: workspaceName, removed: true })
  }
```

- [ ] **Step 4: Run the test, expect PASS**

```bash
cd /Users/kaikaidu/documents/github/corelink-server
CL_PROVISION_TOKEN=test-token npm start &
sleep 2
CL_PROVISION_TOKEN=test-token node tests/test-provision.js
```
Expected: full PASS through DELETE + repeat. Kill server.

- [ ] **Step 5: Commit**

```bash
cd /Users/kaikaidu/documents/github/corelink-server
git add corelink.js tests/test-provision.js
git commit -m "Implement DELETE /api/provision/:deploy_id (idempotent)"
```

---

## Phase 2 — backend `corelink_admin.py` HTTP client

A thin async client over `httpx` that talks to the Phase 1 routes. All Corelink-specific provisioning logic lives in this one file; rip-out = delete the file.

### Task 6: Create CorelinkAdminError + CorelinkProvisionResult dataclass

**Files:**
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/corelink_admin.py`
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/tests/test_corelink_admin.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_corelink_admin.py`:

```python
"""Unit tests for corelink_admin (mocked HTTP)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_provision_result_dataclass_shape():
    from corelink_admin import CorelinkProvisionResult

    r = CorelinkProvisionResult(
        workspace="workflow_abc",
        host="localhost",
        port=20012,
        username="Testuser",
        password="Testpassword",
    )
    assert r.workspace == "workflow_abc"
    assert r.port == 20012


def test_admin_error_is_exception():
    from corelink_admin import CorelinkAdminError

    assert issubclass(CorelinkAdminError, Exception)
```

- [ ] **Step 2: Run the test, expect import failure**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest tests/test_corelink_admin.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'corelink_admin'`.

- [ ] **Step 3: Create the module skeleton**

Create `backend/corelink_admin.py`:

```python
"""HTTP client for the corelink-server provisioning routes.

All Corelink-specific deploy-time logic lives here. Removing this file is
step 1 of ripping Corelink out of the backend.
"""

from __future__ import annotations

from dataclasses import dataclass


class CorelinkAdminError(Exception):
    """Raised when provisioning/unprovisioning a deployment fails."""


@dataclass
class CorelinkProvisionResult:
    workspace: str
    host: str
    port: int
    username: str
    password: str
```

- [ ] **Step 4: Run the test, expect PASS**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest tests/test_corelink_admin.py -v
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add backend/corelink_admin.py backend/tests/test_corelink_admin.py
git commit -m "Add corelink_admin types: CorelinkAdminError, CorelinkProvisionResult"
```

---

### Task 7: Implement provision_deployment happy path

**Files:**
- Modify: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/corelink_admin.py`
- Modify: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/tests/test_corelink_admin.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_corelink_admin.py`:

```python
@pytest.mark.asyncio
async def test_provision_deployment_happy_path(monkeypatch):
    import corelink_admin as ca

    monkeypatch.setenv("CORELINK_HOST", "localhost")
    monkeypatch.setenv("CORELINK_PORT", "20012")
    monkeypatch.setenv("CORELINK_PROVISION_TOKEN", "secret")

    captured = {}

    class FakeResponse:
        def __init__(self, status_code, payload):
            self.status_code = status_code
            self._payload = payload

        def json(self):
            return self._payload

        @property
        def text(self):
            import json
            return json.dumps(self._payload)

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            captured["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, json=None, headers=None):
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers
            return FakeResponse(200, {
                "workspace": "workflow_abc12345",
                "host": "1.2.3.4",
                "port": 20012,
                "username": "Testuser",
                "password": "Testpassword",
            })

    monkeypatch.setattr(ca, "httpx", type("M", (), {"AsyncClient": FakeAsyncClient}))

    result = await ca.provision_deployment("abc12345")

    assert result.workspace == "workflow_abc12345"
    assert result.host == "1.2.3.4"
    assert result.port == 20012
    assert result.username == "Testuser"
    assert captured["url"] == "https://localhost:20012/api/provision"
    assert captured["json"] == {"deploy_id": "abc12345"}
    assert captured["headers"]["X-Provision-Token"] == "secret"
```

- [ ] **Step 2: Run the test, expect AttributeError on `provision_deployment`**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest tests/test_corelink_admin.py::test_provision_deployment_happy_path -v
```
Expected: FAIL.

- [ ] **Step 3: Implement provision_deployment**

Append to `backend/corelink_admin.py`:

```python
import os

import httpx

_DEFAULT_TIMEOUT = 5.0


def _server_url() -> str:
    host = os.getenv("CORELINK_HOST")
    port = os.getenv("CORELINK_PORT", "20012")
    if not host:
        raise CorelinkAdminError("CORELINK_HOST not set")
    return f"https://{host}:{port}"


def _provision_token() -> str:
    token = os.getenv("CORELINK_PROVISION_TOKEN")
    if not token:
        raise CorelinkAdminError("CORELINK_PROVISION_TOKEN not set")
    return token


async def provision_deployment(deploy_id: str) -> CorelinkProvisionResult:
    """POST /api/provision on corelink-server. Idempotent: server returns same blob on repeat."""
    url = f"{_server_url()}/api/provision"
    headers = {"X-Provision-Token": _provision_token(), "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(verify=False, timeout=_DEFAULT_TIMEOUT) as client:
            resp = await client.post(url, json={"deploy_id": deploy_id}, headers=headers)
    except httpx.HTTPError as e:
        raise CorelinkAdminError(f"corelink unreachable: {e}") from e

    if resp.status_code == 401 or resp.status_code == 403:
        raise CorelinkAdminError(f"corelink rejected provision token (HTTP {resp.status_code})")
    if resp.status_code != 200:
        raise CorelinkAdminError(f"provision failed: HTTP {resp.status_code} {resp.text}")

    body = resp.json()
    return CorelinkProvisionResult(
        workspace=body["workspace"],
        host=body["host"],
        port=int(body["port"]),
        username=body["username"],
        password=body["password"],
    )
```

- [ ] **Step 4: Run the test, expect PASS**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest tests/test_corelink_admin.py -v
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add backend/corelink_admin.py backend/tests/test_corelink_admin.py
git commit -m "Implement provision_deployment HTTP client (happy path)"
```

---

### Task 8: provision_deployment error paths (timeout, 401, 5xx)

**Files:**
- Modify: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/tests/test_corelink_admin.py`

(Code already handles these — tests confirm behavior.)

- [ ] **Step 1: Write three failing-path tests**

Append to `backend/tests/test_corelink_admin.py`:

```python
@pytest.mark.asyncio
async def test_provision_deployment_timeout(monkeypatch):
    import corelink_admin as ca

    monkeypatch.setenv("CORELINK_HOST", "localhost")
    monkeypatch.setenv("CORELINK_PORT", "20012")
    monkeypatch.setenv("CORELINK_PROVISION_TOKEN", "secret")

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *exc): return False
        async def post(self, *args, **kwargs):
            raise __import__("httpx").ConnectTimeout("timeout")

    monkeypatch.setattr(ca, "httpx", type("M", (), {
        "AsyncClient": FakeAsyncClient,
        "HTTPError": ca.httpx.HTTPError,
        "ConnectTimeout": ca.httpx.ConnectTimeout,
    }))

    with pytest.raises(ca.CorelinkAdminError, match="corelink unreachable"):
        await ca.provision_deployment("abc")


@pytest.mark.asyncio
async def test_provision_deployment_unauthorized(monkeypatch):
    import corelink_admin as ca

    monkeypatch.setenv("CORELINK_HOST", "localhost")
    monkeypatch.setenv("CORELINK_PORT", "20012")
    monkeypatch.setenv("CORELINK_PROVISION_TOKEN", "wrong")

    class FakeResponse:
        status_code = 401
        text = '{"error":"unauthorized"}'
        def json(self): return {"error": "unauthorized"}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *exc): return False
        async def post(self, *a, **k): return FakeResponse()

    monkeypatch.setattr(ca, "httpx", type("M", (), {
        "AsyncClient": FakeAsyncClient,
        "HTTPError": ca.httpx.HTTPError,
    }))

    with pytest.raises(ca.CorelinkAdminError, match="rejected provision token"):
        await ca.provision_deployment("abc")


@pytest.mark.asyncio
async def test_provision_deployment_server_error(monkeypatch):
    import corelink_admin as ca

    monkeypatch.setenv("CORELINK_HOST", "localhost")
    monkeypatch.setenv("CORELINK_PORT", "20012")
    monkeypatch.setenv("CORELINK_PROVISION_TOKEN", "secret")

    class FakeResponse:
        status_code = 500
        text = '{"error":"oops"}'
        def json(self): return {"error": "oops"}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *exc): return False
        async def post(self, *a, **k): return FakeResponse()

    monkeypatch.setattr(ca, "httpx", type("M", (), {
        "AsyncClient": FakeAsyncClient,
        "HTTPError": ca.httpx.HTTPError,
    }))

    with pytest.raises(ca.CorelinkAdminError, match="HTTP 500"):
        await ca.provision_deployment("abc")
```

- [ ] **Step 2: Run the tests, expect PASS (handler already covers these)**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest tests/test_corelink_admin.py -v
```
Expected: 6 passed.

- [ ] **Step 3: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add backend/tests/test_corelink_admin.py
git commit -m "Cover provision_deployment timeout/401/5xx error paths"
```

---

### Task 9: Implement unprovision_deployment

**Files:**
- Modify: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/corelink_admin.py`
- Modify: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/tests/test_corelink_admin.py`

- [ ] **Step 1: Write failing tests for happy + 404**

Append to `backend/tests/test_corelink_admin.py`:

```python
@pytest.mark.asyncio
async def test_unprovision_deployment_happy(monkeypatch):
    import corelink_admin as ca

    monkeypatch.setenv("CORELINK_HOST", "localhost")
    monkeypatch.setenv("CORELINK_PORT", "20012")
    monkeypatch.setenv("CORELINK_PROVISION_TOKEN", "secret")

    captured = {}

    class FakeResponse:
        status_code = 200
        text = "{}"
        def json(self): return {}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *exc): return False
        async def delete(self, url, headers=None):
            captured["url"] = url
            captured["headers"] = headers
            return FakeResponse()

    monkeypatch.setattr(ca, "httpx", type("M", (), {
        "AsyncClient": FakeAsyncClient,
        "HTTPError": ca.httpx.HTTPError,
    }))

    await ca.unprovision_deployment("abc12345")
    assert captured["url"] == "https://localhost:20012/api/provision/abc12345"
    assert captured["headers"]["X-Provision-Token"] == "secret"


@pytest.mark.asyncio
async def test_unprovision_deployment_404_is_success(monkeypatch):
    import corelink_admin as ca

    monkeypatch.setenv("CORELINK_HOST", "localhost")
    monkeypatch.setenv("CORELINK_PORT", "20012")
    monkeypatch.setenv("CORELINK_PROVISION_TOKEN", "secret")

    class FakeResponse:
        status_code = 404
        text = "{}"
        def json(self): return {}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *exc): return False
        async def delete(self, *a, **k): return FakeResponse()

    monkeypatch.setattr(ca, "httpx", type("M", (), {
        "AsyncClient": FakeAsyncClient,
        "HTTPError": ca.httpx.HTTPError,
    }))

    # Should NOT raise
    await ca.unprovision_deployment("abc")
```

- [ ] **Step 2: Run, expect failure (function not defined)**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest tests/test_corelink_admin.py -v
```
Expected: 2 errors on `unprovision_deployment`.

- [ ] **Step 3: Implement unprovision_deployment**

Append to `backend/corelink_admin.py`:

```python
async def unprovision_deployment(deploy_id: str) -> None:
    """DELETE /api/provision/<deploy_id>. Treats 200 and 404 as success."""
    url = f"{_server_url()}/api/provision/{deploy_id}"
    headers = {"X-Provision-Token": _provision_token()}
    try:
        async with httpx.AsyncClient(verify=False, timeout=_DEFAULT_TIMEOUT) as client:
            resp = await client.delete(url, headers=headers)
    except httpx.HTTPError as e:
        raise CorelinkAdminError(f"corelink unreachable: {e}") from e

    if resp.status_code in (200, 404):
        return
    if resp.status_code in (401, 403):
        raise CorelinkAdminError(f"corelink rejected provision token (HTTP {resp.status_code})")
    raise CorelinkAdminError(f"unprovision failed: HTTP {resp.status_code} {resp.text}")
```

- [ ] **Step 4: Run, expect PASS**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest tests/test_corelink_admin.py -v
```
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add backend/corelink_admin.py backend/tests/test_corelink_admin.py
git commit -m "Implement unprovision_deployment (404 treated as success)"
```

---

## Phase 3 — backend deployment.py changes

Thread `deploy_id` and `workspace` into the planner. Inject `CORELINK_*` into plugin nodes' env_plan.

### Task 10: Update existing test assertions for deploy-id-scoped workspace

**Files:**
- Modify: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/tests/test_deployment_planner.py`

The existing test at line 64 asserts `workspace == "source_plugin-a_json_workspace"`. We're changing the scheme to `workflow_<deploy_id>`. Update assertions before changing code (TDD: make the test match the desired behavior, watch it fail, then change code).

- [ ] **Step 1: Update the assertion**

Open `backend/tests/test_deployment_planner.py`. Find:

```python
def test_deploy_returns_deterministic_idempotent_plan(linear_workflow: DeployWorkflow) -> None:
    first = deployment.deploy(linear_workflow, inject_env=False)
    second = deployment.deploy(linear_workflow, inject_env=False)
```

Change the call to pass `deploy_id` and `workspace`:

```python
def test_deploy_returns_deterministic_idempotent_plan(linear_workflow: DeployWorkflow) -> None:
    first = deployment.deploy(linear_workflow, deploy_id="abc12345",
                              workspace="workflow_abc12345", inject_env=False)
    second = deployment.deploy(linear_workflow, deploy_id="abc12345",
                               workspace="workflow_abc12345", inject_env=False)
```

Find:

```python
    assert first["credentials_by_node"]["source"]["out_creds"]["json"]["workspace"] == (
        "source_plugin-a_json_workspace"
    )
```

Replace with:

```python
    assert first["credentials_by_node"]["source"]["out_creds"]["json"]["workspace"] == (
        "workflow_abc12345"
    )
    # Every credential in the plan uses the same deploy-scoped workspace
    for node_creds in first["credentials_by_node"].values():
        for stream_creds in (node_creds["in_creds"], node_creds["out_creds"]):
            for cred in stream_creds.values():
                assert cred["workspace"] == "workflow_abc12345"
```

Also find any other call sites of `deployment.deploy(` in the same file — update each to pass `deploy_id` and `workspace`. Use `grep -n "deployment.deploy(" backend/tests/test_deployment_planner.py` to find them.

For tests that don't care about the workspace (rejection tests, etc.), pass `deploy_id="test"` and `workspace="workflow_test"`.

- [ ] **Step 2: Run the test, expect failure**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest tests/test_deployment_planner.py -v
```
Expected: FAIL with `TypeError: deploy() got an unexpected keyword argument 'deploy_id'`.

- [ ] **Step 3: No code changes yet — this task is just the test update.**

- [ ] **Step 4: Commit the test update on its own**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add backend/tests/test_deployment_planner.py
git commit -m "Update planner tests for deploy-id-scoped workspace naming"
```

---

### Task 11: Modify deploy() to accept deploy_id + workspace; thread through credentials

**Files:**
- Modify: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/deployment.py`

- [ ] **Step 1: Update deploy() signature and credential generation**

Open `backend/deployment.py`. Find:

```python
def generate_pub_sub_cred(
    stream_type: str, src: DeployNode, dst: DeployNode
) -> StreamCredential:
    return StreamCredential(
        workspace=f"{src.id}_{dst.id}_{stream_type}_workspace",
        protocol="pubsub",
        stream_id=f"{src.id}_{dst.id}_{stream_type}_stream",
        data_type=stream_type,
        metadata={},
    )
```

Replace with:

```python
def generate_pub_sub_cred(
    stream_type: str, src: DeployNode, dst: DeployNode, workspace: str
) -> StreamCredential:
    return StreamCredential(
        workspace=workspace,
        protocol="pubsub",
        stream_id=f"{src.id}_{dst.id}_{stream_type}_stream",
        data_type=stream_type,
        metadata={},
    )
```

Find:

```python
def process_workflow(edges: List[DeployEdge], nodes_by_id: Dict[str, DeployNode]) -> int:
```

Replace with:

```python
def process_workflow(
    edges: List[DeployEdge], nodes_by_id: Dict[str, DeployNode], workspace: str
) -> int:
```

Inside `process_workflow`, find:

```python
        cred = generate_pub_sub_cred(stream_type, src, dst)
```

Replace with:

```python
        cred = generate_pub_sub_cred(stream_type, src, dst, workspace)
```

Find:

```python
def deploy(workflow: DeployWorkflow, inject_env: bool = False) -> Dict[str, Any]:
    nodes_by_id = {node.id: node.model_copy(deep=True) for node in workflow.nodes}
```

Replace with:

```python
def deploy(
    workflow: DeployWorkflow,
    deploy_id: str = "local",
    workspace: str | None = None,
    inject_env: bool = False,
) -> Dict[str, Any]:
    if workspace is None:
        workspace = f"workflow_{deploy_id}"
    nodes_by_id = {node.id: node.model_copy(deep=True) for node in workflow.nodes}
```

Find:

```python
    process_workflow(workflow.edges, nodes_by_id)
```

Replace with:

```python
    process_workflow(workflow.edges, nodes_by_id, workspace)
```

Find the `__main__` block at the bottom:

```python
if __name__ == "__main__":
    example_workflow = DeployWorkflow(
        ...
    )
    print(deploy(example_workflow, inject_env=False))
```

Update the call:

```python
    print(deploy(example_workflow, deploy_id="example", inject_env=False))
```

- [ ] **Step 2: Update the planner result to include deploy_id + workspace**

In the same file, find:

```python
    return {
        "node_count": len(nodes_by_id),
        "edge_count": len(workflow.edges),
        ...
        "credentials_by_node": creds_by_node,
    }
```

Add two fields at the top:

```python
    return {
        "deploy_id": deploy_id,
        "workspace": workspace,
        "node_count": len(nodes_by_id),
        "edge_count": len(workflow.edges),
        ...
        "credentials_by_node": creds_by_node,
    }
```

- [ ] **Step 3: Run the planner tests, expect PASS**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest tests/test_deployment_planner.py -v
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add backend/deployment.py
git commit -m "Thread deploy_id + workspace through deploy planner"
```

---

### Task 12: Inject CORELINK_* env vars into plugin nodes' env_plan

**Files:**
- Modify: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/deployment.py`
- Modify: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/tests/test_deployment_planner.py`

- [ ] **Step 1: Write failing tests for the new behavior**

Append to `backend/tests/test_deployment_planner.py`:

```python
def test_corelink_env_injected_for_plugins_only(linear_workflow: DeployWorkflow) -> None:
    corelink = {
        "host": "1.2.3.4",
        "port": 20012,
        "username": "Testuser",
        "password": "Testpassword",
    }
    plan = deployment.deploy(
        linear_workflow,
        deploy_id="abc",
        workspace="workflow_abc",
        corelink_creds=corelink,
        inject_env=False,
    )
    plugin_a = plan["env_plan"]["plugin-a"]
    assert plugin_a["CORELINK_HOST"] == "1.2.3.4"
    assert plugin_a["CORELINK_PORT"] == "20012"
    assert plugin_a["CORELINK_USERNAME"] == "Testuser"
    assert plugin_a["CORELINK_PASSWORD"] == "Testpassword"

    # Sender/receiver nodes don't get plugin-only injection
    # In the linear_workflow fixture there's no receiver, but plugin-b is type=plugin too.
    # Just confirm no extraneous keys leaked.


def test_corelink_env_omitted_when_creds_not_provided(linear_workflow: DeployWorkflow) -> None:
    plan = deployment.deploy(
        linear_workflow,
        deploy_id="abc",
        workspace="workflow_abc",
        inject_env=False,
    )
    plugin_a = plan["env_plan"]["plugin-a"]
    assert "CORELINK_HOST" not in plugin_a
    assert "CORELINK_PASSWORD" not in plugin_a
```

- [ ] **Step 2: Run, expect failure (`corelink_creds` kwarg not accepted)**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest tests/test_deployment_planner.py::test_corelink_env_injected_for_plugins_only -v
```
Expected: FAIL.

- [ ] **Step 3: Implement injection**

In `backend/deployment.py`, find:

```python
def deploy(
    workflow: DeployWorkflow,
    deploy_id: str = "local",
    workspace: str | None = None,
    inject_env: bool = False,
) -> Dict[str, Any]:
```

Replace with:

```python
def deploy(
    workflow: DeployWorkflow,
    deploy_id: str = "local",
    workspace: str | None = None,
    corelink_creds: Dict[str, Any] | None = None,
    inject_env: bool = False,
) -> Dict[str, Any]:
```

Find the env_plan loop:

```python
    for node in deployment_queue:
        env_vars = build_env_vars(node)
        env_plan[node.id] = env_vars
        image_name = fetch_image_name(node)
```

Insert a corelink injection step right after `env_vars = build_env_vars(node)` and before `env_plan[node.id] = env_vars`:

```python
    for node in deployment_queue:
        env_vars = build_env_vars(node)
        if corelink_creds and node.type == "plugin":
            env_vars["CORELINK_HOST"] = str(corelink_creds["host"])
            env_vars["CORELINK_PORT"] = str(corelink_creds["port"])
            env_vars["CORELINK_USERNAME"] = str(corelink_creds["username"])
            env_vars["CORELINK_PASSWORD"] = str(corelink_creds["password"])
        env_plan[node.id] = env_vars
        image_name = fetch_image_name(node)
```

- [ ] **Step 4: Run, expect PASS**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest tests/test_deployment_planner.py -v
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add backend/deployment.py backend/tests/test_deployment_planner.py
git commit -m "Inject CORELINK_* env vars into plugin-node env_plan"
```

---

## Phase 4 — backend main.py changes

Wire provisioning into `/deploy/execute/v2`, surface corelink creds in `/credentials`, add `DELETE /deployments/{id}`, update allowlist + run.sh.

### Task 13: Allowlist the corelink_demo image

**Files:**
- Modify: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/config/allowed_images.json`

- [ ] **Step 1: Update allowlist**

Replace the contents of `backend/config/allowed_images.json` (currently `{}`):

```json
{
  "corelink_demo:latest": {
    "approved": true,
    "added_by": "corelink-modular-demo",
    "notes": "Demo plugin: subscribes to IN streams, transforms, publishes to OUT streams via Corelink."
  }
}
```

- [ ] **Step 2: Verify with the existing allowlist test**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest tests/test_allowlist_executor.py -v
```
Expected: existing tests still pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add backend/config/allowed_images.json
git commit -m "Allowlist corelink_demo:latest runtime image"
```

---

### Task 14: Update run.sh env vars

**Files:**
- Modify: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/run.sh`

- [ ] **Step 1: Replace the env block**

Open `backend/run.sh`. Find:

```bash
export CORELINK_HOST="${CORELINK_HOST:-host.docker.internal}"
export CORELINK_PORT="${CORELINK_PORT:-20012}"
export CORELINK_USERNAME="${CORELINK_USERNAME:-Testuser}"
export CORELINK_PASSWORD="${CORELINK_PASSWORD:-Testpassword}"
```

Replace with:

```bash
# Corelink integration. Provisioning credentials come back from the corelink-server's
# /api/provision response — we don't carry CORELINK_USERNAME/PASSWORD here.
export CORELINK_HOST="${CORELINK_HOST:-host.docker.internal}"
export CORELINK_PORT="${CORELINK_PORT:-20012}"
export CORELINK_PROVISION_TOKEN="${CORELINK_PROVISION_TOKEN:-test-token}"
```

- [ ] **Step 2: Smoke-test the script syntax**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
bash -n run.sh && echo "syntax ok"
```
Expected: `syntax ok`.

- [ ] **Step 3: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add backend/run.sh
git commit -m "Replace USERNAME/PASSWORD env with CORELINK_PROVISION_TOKEN in run.sh"
```

---

### Task 15: Wire /deploy/execute/v2 to provisioning + add DELETE /deployments/{id}

**Files:**
- Modify: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/main.py`
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend/tests/test_main_corelink.py`

- [ ] **Step 1: Write failing integration tests**

Create `backend/tests/test_main_corelink.py`:

```python
"""Integration-style tests for /deploy/execute/v2 + DELETE /deployments/{id}.

Mocks corelink_admin and the executor so these tests don't need Docker or a
running Corelink server.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import corelink_admin
import main as main_module
from executors import ContainerStatus
from executors.noop import NoopExecutor


def _workflow_payload():
    return {
        "nodes": [
            {"id": "src", "type": "sender", "out_streams": ["json"]},
            {"id": "plg", "type": "plugin", "runtime": "corelink_demo:latest",
             "in_streams": ["json"], "out_streams": ["json"]},
            {"id": "rcv", "type": "receiver", "in_streams": ["json"]},
        ],
        "edges": [
            {"source": "src", "target": "plg", "data": "json"},
            {"source": "plg", "target": "rcv", "data": "json"},
        ],
    }


@pytest.fixture
def client(monkeypatch):
    # Mock provisioning
    async def fake_provision(deploy_id):
        return corelink_admin.CorelinkProvisionResult(
            workspace=f"workflow_{deploy_id}",
            host="1.2.3.4", port=20012,
            username="Testuser", password="Testpassword",
        )
    async def fake_unprovision(deploy_id): return None

    monkeypatch.setattr(corelink_admin, "provision_deployment", fake_provision)
    monkeypatch.setattr(corelink_admin, "unprovision_deployment", fake_unprovision)
    # Force noop executor (no Docker)
    monkeypatch.setenv("EXECUTOR_BACKEND", "noop")

    # Reset deployments dict between tests
    main_module.deployments.clear()
    return TestClient(main_module.app)


def test_deploy_v2_provisions_workspace_and_returns_corelink_block(client):
    resp = client.post("/deploy/execute/v2", json=_workflow_payload(),
                       params={"executor": "noop", "inject_env": "false"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "deploy_id" in body
    deploy_id = body["deploy_id"]
    assert body["plan"]["workspace"] == f"workflow_{deploy_id}"

    # Sender credentials response includes the new corelink block
    cred = client.get(f"/deployments/{deploy_id}/credentials", params={"role": "sender"}).json()
    assert cred["corelink"]["host"] == "1.2.3.4"
    assert cred["corelink"]["port"] == 20012
    assert cred["corelink"]["username"] == "Testuser"
    assert cred["credentials"]["json"]["workspace"] == f"workflow_{deploy_id}"


def test_deploy_v2_returns_503_when_provision_fails(client, monkeypatch):
    async def boom(deploy_id):
        raise corelink_admin.CorelinkAdminError("corelink unreachable: timeout")
    monkeypatch.setattr(corelink_admin, "provision_deployment", boom)

    resp = client.post("/deploy/execute/v2", json=_workflow_payload(),
                       params={"executor": "noop", "inject_env": "false"})
    assert resp.status_code == 503
    assert "corelink unreachable" in resp.json()["detail"]


def test_delete_deployment_unprovisions_and_removes(client):
    resp = client.post("/deploy/execute/v2", json=_workflow_payload(),
                       params={"executor": "noop", "inject_env": "false"})
    deploy_id = resp.json()["deploy_id"]
    assert deploy_id in main_module.deployments

    del_resp = client.delete(f"/deployments/{deploy_id}")
    assert del_resp.status_code == 200
    assert deploy_id not in main_module.deployments
```

- [ ] **Step 2: Run, expect failure**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest tests/test_main_corelink.py -v
```
Expected: tests fail (no provisioning, no DELETE endpoint).

- [ ] **Step 3: Update main.py**

Open `backend/main.py`. At the top, add to the imports near `from corelink_health import …`:

```python
import corelink_admin
```

Find:

```python
@app.post("/deploy/execute/v2")
async def deploy_and_execute_v2(
    payload: DeployWorkflow, executor: str = "local", inject_env: bool = True
):
    """Plan deployment and execute containers via the pluggable executor abstraction."""
    # Never inject env vars into Docker images when using noop executor
    effective_inject = inject_env and executor != "noop"
    try:
        plan = deploy(payload, inject_env=effective_inject)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
```

Replace the body up through the deploy call with:

```python
@app.post("/deploy/execute/v2")
async def deploy_and_execute_v2(
    payload: DeployWorkflow, executor: str = "local", inject_env: bool = True
):
    """Plan deployment and execute containers via the pluggable executor abstraction."""
    # Mint the deploy_id up-front so it can be the workspace key
    deploy_id = uuid.uuid4().hex[:8]

    # Provision a Corelink workspace + creds for this deployment
    try:
        provisioning = await corelink_admin.provision_deployment(deploy_id)
    except corelink_admin.CorelinkAdminError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    corelink_creds = {
        "host": provisioning.host,
        "port": provisioning.port,
        "username": provisioning.username,
        "password": provisioning.password,
    }

    effective_inject = inject_env and executor != "noop"
    try:
        plan = deploy(
            payload,
            deploy_id=deploy_id,
            workspace=provisioning.workspace,
            corelink_creds=corelink_creds,
            inject_env=effective_inject,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
```

Find the deploy_id line further down and remove the duplicate uuid call:

```python
    deploy_id = uuid.uuid4().hex[:8]
    deployments[deploy_id] = {
        "plan": plan,
        "execution": results,
        "workflow": payload.model_dump(),
    }
```

Replace with:

```python
    deployments[deploy_id] = {
        "plan": plan,
        "execution": results,
        "workflow": payload.model_dump(),
        "provisioning": {
            "workspace": provisioning.workspace,
            "host": provisioning.host,
            "port": provisioning.port,
            "username": provisioning.username,
            "password": provisioning.password,
        },
    }
```

Update the response dict:

```python
    return {
        "message": "Deploy executed",
        "deploy_id": deploy_id,
        "plan": plan,
        "execution": results,
    }
```

Now find the `/deployments/{deploy_id}/credentials` endpoint and add the corelink block. Find:

```python
    return {
        "deploy_id": deploy_id,
        "role": role,
        "node_id": node_id,
        "credentials": stream_creds,
    }
```

Replace with:

```python
    provisioning = dep.get("provisioning", {})
    corelink_block = None
    if provisioning:
        corelink_block = {
            "host": provisioning["host"],
            "port": provisioning["port"],
            "username": provisioning["username"],
            "password": provisioning["password"],
        }
    return {
        "deploy_id": deploy_id,
        "role": role,
        "node_id": node_id,
        "corelink": corelink_block,
        "credentials": stream_creds,
    }
```

Add a new endpoint at the bottom of `main.py`:

```python
@app.delete("/deployments/{deploy_id}")
async def delete_deployment(deploy_id: str):
    """Stop containers, unprovision Corelink workspace, remove deployment record."""
    if deploy_id not in deployments:
        raise HTTPException(status_code=404, detail=f"Deployment '{deploy_id}' not found")

    dep = deployments[deploy_id]
    warnings: list[str] = []

    # Stop running containers (best-effort)
    ex = get_executor()
    for status in dep.get("execution", []):
        cid = status.get("container_id")
        if not cid:
            continue
        try:
            await ex.stop(cid)
        except Exception as e:
            warnings.append(f"stop {cid} failed: {e}")

    # Unprovision Corelink workspace
    try:
        await corelink_admin.unprovision_deployment(deploy_id)
    except corelink_admin.CorelinkAdminError as e:
        warnings.append(f"unprovision failed: {e}")

    deployments.pop(deploy_id, None)
    return {"status": "deleted", "deploy_id": deploy_id, "warnings": warnings}
```

- [ ] **Step 4: Run, expect PASS**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest tests/test_main_corelink.py -v
```
Expected: 3 passed.

- [ ] **Step 5: Run all backend tests for regressions**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
.venv/bin/pytest -v
```
Expected: all pass (modulo unrelated failures in tests that already failed before this work — note any).

- [ ] **Step 6: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add backend/main.py backend/tests/test_main_corelink.py
git commit -m "Wire /deploy/execute/v2 to provisioning; add DELETE /deployments/{id}"
```

---

## Phase 5 — corelink_demo plugin Docker image

A new plugin image that mirrors `reference_plugin` but with a real transform.

### Task 16: Create plugin source files (main.py, requirements, transform tests)

**Files:**
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/plugins/corelink_demo/main.py`
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/plugins/corelink_demo/requirements.txt`
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/plugins/corelink_demo/tests/test_transform.py`
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/plugins/corelink_demo/pytest.ini`

- [ ] **Step 1: Write the transform test**

Create `plugins/corelink_demo/tests/test_transform.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_transform_uppercases_text():
    from main import _transform
    assert _transform(b"hello world") == b"HELLO WORLD"


def test_transform_handles_empty():
    from main import _transform
    assert _transform(b"") == b""


def test_transform_passes_through_non_utf8():
    from main import _transform
    # Non-UTF-8 bytes pass through unchanged
    assert _transform(b"\xff\xfe") == b"\xff\xfe"
```

- [ ] **Step 2: Create pytest config**

Create `plugins/corelink_demo/pytest.ini`:

```ini
[pytest]
testpaths = tests
```

- [ ] **Step 3: Run, expect import failure**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/plugins/corelink_demo
python3 -m pytest tests/ -v
```
Expected: FAIL.

- [ ] **Step 4: Create requirements.txt**

Create `plugins/corelink_demo/requirements.txt`:

```
fastapi==0.115.0
uvicorn==0.30.6
corelink
```

- [ ] **Step 5: Create main.py**

Create `plugins/corelink_demo/main.py` (close clone of `reference_plugin/main.py` with a real transform):

```python
"""
corelink_demo plugin.

Subscribes to all IN_* streams, runs `_transform` on each message, publishes
to all OUT_* streams. Mirrors plugins/reference_plugin/main.py — keep them
in sync if reference_plugin's structure changes.

This entire directory is part of the Corelink rip-out: deleting
plugins/corelink_demo/ removes the plugin without affecting other code.
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

import corelink
import uvicorn
from fastapi import FastAPI

_out_senders: dict[str, int] = {}


def _parse_stream_env(prefix: str) -> dict[str, dict]:
    streams: dict[str, dict] = {}
    for key, val in os.environ.items():
        if key.startswith(prefix) and key.endswith("_WORKSPACE"):
            stream_type = key[len(prefix): -len("_WORKSPACE")]
            streams[stream_type] = {
                "workspace": val,
                "stream_id": os.environ.get(f"{prefix}{stream_type}_STREAM_ID", ""),
                "protocol": os.environ.get(f"{prefix}{stream_type}_PROTOCOL", "pubsub"),
            }
    return streams


def _transform(data: bytes) -> bytes:
    """Demo transform: uppercase UTF-8 text. Non-UTF-8 passes through."""
    try:
        return data.decode("utf-8").upper().encode("utf-8")
    except UnicodeDecodeError:
        return data


async def _on_data(data: bytes, stream_id: int, header: dict) -> None:
    try:
        result = _transform(data)
    except Exception as e:
        print(f"[demo-plugin] transform error: {e}")
        return
    for sid in _out_senders.values():
        await corelink.send(sid, result)


async def _corelink_loop() -> None:
    host = os.environ.get("CORELINK_HOST", "")
    port = int(os.environ.get("CORELINK_PORT", "20012"))
    username = os.environ.get("CORELINK_USERNAME", "")
    password = os.environ.get("CORELINK_PASSWORD", "")

    if not (host and username and password):
        print("[demo-plugin] CORELINK_HOST/USERNAME/PASSWORD not set — idle")
        return

    await corelink.connect(username, password, host, port)
    print(f"[demo-plugin] Connected to Corelink at {host}:{port}")

    await corelink.set_data_callback(_on_data)

    in_streams = _parse_stream_env("IN_")
    for stream_type, cfg in in_streams.items():
        stream_ids = [cfg["stream_id"]] if cfg["stream_id"] else []
        await corelink.create_receiver(
            workspace=cfg["workspace"],
            protocol="ws",
            data_type=stream_type.lower(),
            stream_ids=stream_ids,
            alert=True,
        )
        print(f"[demo-plugin] Receiver ready: {stream_type} @ {cfg['workspace']}")

    out_streams = _parse_stream_env("OUT_")
    for stream_type, cfg in out_streams.items():
        sid = await corelink.create_sender(
            workspace=cfg["workspace"],
            protocol="ws",
            data_type=stream_type.lower(),
        )
        _out_senders[stream_type] = sid
        print(f"[demo-plugin] Sender ready: {stream_type} @ {cfg['workspace']} (sid={sid})")

    await asyncio.sleep(float("inf"))


@asynccontextmanager
async def _lifespan(app: FastAPI):
    print(f"[demo-plugin] NODE_ID={os.environ.get('NODE_ID', '')}")
    task = asyncio.create_task(_corelink_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(lifespan=_lifespan)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/run")
def run_status():
    return {
        "node_id": os.environ.get("NODE_ID", ""),
        "in_streams": _parse_stream_env("IN_"),
        "out_streams": _parse_stream_env("OUT_"),
        "out_sender_ids": _out_senders,
        "corelink_connected": bool(_out_senders),
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
```

- [ ] **Step 6: Run transform tests, expect PASS**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/plugins/corelink_demo
python3 -m pytest tests/ -v
```
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add plugins/corelink_demo/
git commit -m "Add corelink_demo plugin: source, transform tests, requirements"
```

---

### Task 17: Create plugin Dockerfile and build the image

**Files:**
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/plugins/corelink_demo/Dockerfile`

- [ ] **Step 1: Create Dockerfile**

Create `plugins/corelink_demo/Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .

EXPOSE 8080

CMD ["python", "main.py"]
```

- [ ] **Step 2: Build the image**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/plugins/corelink_demo
docker build -t corelink_demo:latest .
```
Expected: image builds successfully. (Requires Docker daemon running.)

- [ ] **Step 3: Verify image is tagged**

```bash
docker image inspect corelink_demo:latest --format '{{.Id}}' | head -c 30
```
Expected: a sha256 prefix.

- [ ] **Step 4: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add plugins/corelink_demo/Dockerfile
git commit -m "Add Dockerfile for corelink_demo plugin"
```

---

## Phase 6 — Node sender/receiver scripts

Modular scripts with two transports (corelink default, relay fallback). Corelink-touching code lives in one file (`lib/corelink-transport.js`).

### Task 18: Initialize Node script package + relay-transport (TDD-first)

**Files:**
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts/package.json`
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts/lib/relay-transport.js`
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts/lib/__tests__/relay-transport.test.js`
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts/.gitignore`

- [ ] **Step 1: Create package.json**

Create `scripts/package.json`:

```json
{
  "name": "exp-orchestrator-scripts",
  "version": "0.1.0",
  "description": "Node sender/receiver scripts for the auto-connect demo",
  "private": true,
  "scripts": {
    "test": "node --test lib/__tests__"
  },
  "dependencies": {
    "@corelinkhub/corelink-client": "^5.1.2"
  }
}
```

Create `scripts/.gitignore`:

```
node_modules/
.venv/
```

- [ ] **Step 2: Write the failing relay-transport test**

Create `scripts/lib/__tests__/relay-transport.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')

test('relay-transport exports the expected interface', () => {
  const t = require('../relay-transport')
  assert.equal(typeof t.connect, 'function')
  assert.equal(typeof t.send, 'function')
  assert.equal(typeof t.subscribe, 'function')
  assert.equal(typeof t.close, 'function')
})

test('relay-transport.send POSTs to backend with the message', async () => {
  const calls = []
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts })
    return { ok: true, status: 200, json: async () => ({ status: 'ok', listeners: 1 }) }
  }
  const t = require('../relay-transport')
  const handle = await t.connect({
    host: 'http://localhost:8000',
    deployId: 'abc',
    role: 'sender',
    credentials: {},
    _fetch: fakeFetch,
  })
  await t.send(handle, 'hello')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'http://localhost:8000/deployments/abc/messages')
  assert.deepEqual(JSON.parse(calls[0].opts.body), { data: 'hello' })
})
```

- [ ] **Step 3: Run, expect failure**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts
npm install --silent
npm test 2>&1 | tail -20
```
Expected: tests fail (`relay-transport` not found).

- [ ] **Step 4: Implement relay-transport**

Create `scripts/lib/relay-transport.js`:

```js
/**
 * Relay transport — sends/subscribes via the orchestrator backend's HTTP/SSE
 * endpoints. No Corelink dependency; this is the long-term path that remains
 * after Corelink is ripped out.
 */

const httpStream = require('http')
const httpsStream = require('https')

async function connect({ host, deployId, role, credentials, _fetch = globalThis.fetch }) {
  return { host, deployId, role, _fetch }
}

async function send(handle, message) {
  const url = `${handle.host}/deployments/${handle.deployId}/messages`
  const resp = await handle._fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: message }),
  })
  if (!resp.ok) {
    throw new Error(`relay POST failed: ${resp.status}`)
  }
  return resp.json()
}

async function subscribe(handle, onMessage) {
  // Stream Server-Sent Events from /deployments/{id}/messages.
  const url = new URL(`${handle.host}/deployments/${handle.deployId}/messages`)
  const isHttps = url.protocol === 'https:'
  const lib = isHttps ? httpsStream : httpStream
  return new Promise((resolve, reject) => {
    const req = lib.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`relay subscribe failed: ${res.statusCode}`))
        return
      }
      let buffer = ''
      res.on('data', (chunk) => {
        buffer += chunk.toString('utf-8')
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6))
              if (payload.message != null) onMessage(payload.message)
            } catch { /* ignore malformed line */ }
          }
        }
      })
      res.on('end', () => resolve(() => req.destroy()))
      res.on('error', reject)
    })
    req.on('error', reject)
    // Resolve immediately with an unsubscribe — caller blocks elsewhere
    setImmediate(() => resolve(() => req.destroy()))
  })
}

async function close(handle) { /* nothing to close on relay side */ }

module.exports = { connect, send, subscribe, close }
```

- [ ] **Step 5: Run tests, expect PASS**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts
npm test 2>&1 | tail -20
```
Expected: 2 tests passing.

- [ ] **Step 6: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add scripts/package.json scripts/.gitignore scripts/lib/relay-transport.js scripts/lib/__tests__/
git commit -m "Add Node scripts package + relay-transport with tests"
```

---

### Task 19: Implement corelink-transport.js

**Files:**
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts/lib/corelink-transport.js`
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts/lib/__tests__/interface.test.js`

- [ ] **Step 1: Write an interface conformance test**

Create `scripts/lib/__tests__/interface.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')

test('corelink-transport exports the same shape as relay-transport', () => {
  const corelink = require('../corelink-transport')
  const relay = require('../relay-transport')
  for (const fn of ['connect', 'send', 'subscribe', 'close']) {
    assert.equal(typeof corelink[fn], 'function', `corelink-transport missing ${fn}`)
    assert.equal(typeof relay[fn], 'function', `relay-transport missing ${fn}`)
  }
})
```

- [ ] **Step 2: Run, expect failure (corelink-transport missing)**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts
npm test 2>&1 | tail -20
```
Expected: FAIL on the new test.

- [ ] **Step 3: Implement corelink-transport.js**

Create `scripts/lib/corelink-transport.js`:

```js
/**
 * Corelink transport — wraps @corelinkhub/corelink-client.
 *
 * This file is the ONLY place in scripts/ that imports `corelink`.
 * Deleting this file (and removing the require() ternary in sender.js/receiver.js)
 * is the rip-out path.
 */

const corelink = require('@corelinkhub/corelink-client')

async function connect({ host, deployId, role, credentials, corelinkBlock }) {
  if (!corelinkBlock) {
    throw new Error('corelink block missing from credentials response')
  }
  await corelink.connect(
    { username: corelinkBlock.username, password: corelinkBlock.password },
    { ControlIP: corelinkBlock.host, ControlPort: corelinkBlock.port },
  )

  const streamTypes = Object.keys(credentials || {})
  if (streamTypes.length === 0) {
    throw new Error(`no ${role} credentials found in deployment ${deployId}`)
  }
  const streamType = streamTypes[0]
  const cred = credentials[streamType]

  if (role === 'sender') {
    const sendId = await corelink.createSender({
      workspace: cred.workspace,
      protocol: 'ws',
      type: cred.data_type,
    })
    return { role, sendId, cred, streamType }
  }
  // receiver
  return { role, cred, streamType }
}

async function send(handle, message) {
  if (handle.role !== 'sender') throw new Error('send() called on non-sender handle')
  await corelink.send(handle.sendId, Buffer.from(message, 'utf-8'))
}

async function subscribe(handle, onMessage) {
  if (handle.role !== 'receiver') throw new Error('subscribe() called on non-receiver handle')
  corelink.on('receiver', async (data) => {
    const streamIDs = [data.streamID]
    await corelink.subscribe({ streamIDs })
  })
  corelink.on('data', (streamID, data) => {
    onMessage(data.toString('utf-8'))
  })
  await corelink.createReceiver({
    workspace: handle.cred.workspace,
    streamIDs: handle.cred.stream_id ? [handle.cred.stream_id] : [],
    type: handle.cred.data_type,
    protocol: 'ws',
    alert: true,
  })
  return async () => { await corelink.exit() }
}

async function close(handle) {
  await corelink.exit()
}

module.exports = { connect, send, subscribe, close }
```

- [ ] **Step 4: Run, expect PASS**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts
npm test 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add scripts/lib/corelink-transport.js scripts/lib/__tests__/interface.test.js
git commit -m "Add corelink-transport.js (modular Corelink wrapper)"
```

---

### Task 20: Implement sender.js CLI

**Files:**
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts/sender.js`

- [ ] **Step 1: Create sender.js**

```js
#!/usr/bin/env node
/**
 * Standalone sender that auto-connects via corelink (default) or relay.
 * Usage: node sender.js <deploy_id> [--mode corelink|relay] [--host URL]
 */

const readline = require('readline')

function parseArgs(argv) {
  const args = { mode: 'corelink', host: 'http://localhost:8000' }
  const positional = []
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--mode') args.mode = argv[++i]
    else if (a === '--host') args.host = argv[++i]
    else if (a.startsWith('--')) { console.error(`unknown flag: ${a}`); process.exit(2) }
    else positional.push(a)
  }
  if (positional.length !== 1) {
    console.error('usage: sender.js <deploy_id> [--mode corelink|relay] [--host URL]')
    process.exit(2)
  }
  args.deployId = positional[0]
  return args
}

async function fetchCredentials(host, deployId, role) {
  const url = `${host}/deployments/${deployId}/credentials?role=${role}`
  const resp = await fetch(url)
  if (!resp.ok) {
    console.error(`Error fetching credentials: ${resp.status} ${await resp.text()}`)
    process.exit(1)
  }
  return resp.json()
}

async function main() {
  const args = parseArgs(process.argv)
  const transport = args.mode === 'corelink'
    ? require('./lib/corelink-transport')
    : require('./lib/relay-transport')

  console.log(`Mode: ${args.mode}`)
  const cred = await fetchCredentials(args.host, args.deployId, 'sender')

  let handle
  try {
    handle = await transport.connect({
      host: args.host,
      deployId: args.deployId,
      role: 'sender',
      credentials: cred.credentials,
      corelinkBlock: cred.corelink,
    })
  } catch (e) {
    console.error(`Connect failed (${args.mode}): ${e.message}`)
    if (args.mode === 'corelink') console.error('Try --mode relay as a fallback.')
    process.exit(1)
  }

  console.log(`Sender connected (deployment: ${args.deployId})`)
  console.log('Type messages to send (Ctrl+C to quit):\n')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.setPrompt('> ')
  rl.prompt()
  rl.on('line', async (line) => {
    if (line) {
      try {
        await transport.send(handle, line)
        console.log(`  sent: ${line}`)
      } catch (e) {
        console.error(`  send error: ${e.message}`)
      }
    }
    rl.prompt()
  })
  rl.on('close', async () => {
    await transport.close(handle).catch(() => {})
    console.log('\nDone.')
    process.exit(0)
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Verify it parses args**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts
node sender.js 2>&1 | head -3
```
Expected: usage error message.

```bash
node sender.js --help 2>&1 | head -3
```
Expected: `unknown flag: --help`.

- [ ] **Step 3: Verify imports load (without invoking corelink connect)**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts
node -e "require('./lib/corelink-transport'); require('./lib/relay-transport'); console.log('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add scripts/sender.js
git commit -m "Add Node sender CLI (modular --mode corelink|relay)"
```

---

### Task 21: Implement receiver.js CLI

**Files:**
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts/receiver.js`

- [ ] **Step 1: Create receiver.js**

```js
#!/usr/bin/env node
/**
 * Standalone receiver that auto-connects via corelink (default) or relay.
 * Usage: node receiver.js <deploy_id> [--mode corelink|relay] [--host URL]
 */

function parseArgs(argv) {
  const args = { mode: 'corelink', host: 'http://localhost:8000' }
  const positional = []
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--mode') args.mode = argv[++i]
    else if (a === '--host') args.host = argv[++i]
    else if (a.startsWith('--')) { console.error(`unknown flag: ${a}`); process.exit(2) }
    else positional.push(a)
  }
  if (positional.length !== 1) {
    console.error('usage: receiver.js <deploy_id> [--mode corelink|relay] [--host URL]')
    process.exit(2)
  }
  args.deployId = positional[0]
  return args
}

async function fetchCredentials(host, deployId, role) {
  const url = `${host}/deployments/${deployId}/credentials?role=${role}`
  const resp = await fetch(url)
  if (!resp.ok) {
    console.error(`Error fetching credentials: ${resp.status} ${await resp.text()}`)
    process.exit(1)
  }
  return resp.json()
}

async function main() {
  const args = parseArgs(process.argv)
  const transport = args.mode === 'corelink'
    ? require('./lib/corelink-transport')
    : require('./lib/relay-transport')

  console.log(`Mode: ${args.mode}`)
  const cred = await fetchCredentials(args.host, args.deployId, 'receiver')

  let handle
  try {
    handle = await transport.connect({
      host: args.host,
      deployId: args.deployId,
      role: 'receiver',
      credentials: cred.credentials,
      corelinkBlock: cred.corelink,
    })
  } catch (e) {
    console.error(`Connect failed (${args.mode}): ${e.message}`)
    if (args.mode === 'corelink') console.error('Try --mode relay as a fallback.')
    process.exit(1)
  }

  console.log(`Receiver connected (deployment: ${args.deployId})`)
  console.log('Listening for messages (Ctrl+C to quit)...\n')

  await transport.subscribe(handle, (msg) => {
    console.log(`[received] ${msg}`)
  })

  // Keep alive
  process.on('SIGINT', async () => {
    await transport.close(handle).catch(() => {})
    console.log('\nDone.')
    process.exit(0)
  })
  await new Promise(() => {})
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Verify it parses args**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts
node receiver.js 2>&1 | head -3
```
Expected: usage error.

- [ ] **Step 3: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add scripts/receiver.js
git commit -m "Add Node receiver CLI (modular --mode corelink|relay)"
```

---

### Task 22: Add shell wrappers run_sender.js.sh and run_receiver.js.sh

**Files:**
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts/run_sender.js.sh`
- Create: `/Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts/run_receiver.js.sh`

- [ ] **Step 1: Create run_sender.js.sh**

```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  npm install --silent
fi

exec node sender.js "$@"
```

- [ ] **Step 2: Create run_receiver.js.sh**

```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  npm install --silent
fi

exec node receiver.js "$@"
```

- [ ] **Step 3: Make them executable**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts
chmod +x run_sender.js.sh run_receiver.js.sh
./run_sender.js.sh 2>&1 | head -3
```
Expected: usage error from sender.js.

- [ ] **Step 4: Commit**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git add scripts/run_sender.js.sh scripts/run_receiver.js.sh
git commit -m "Add npm-install + node wrapper scripts for Node sender/receiver"
```

---

## Phase 7 — manual demo runbook + final verification

Demo runbook lives in the spec; this phase verifies the end-to-end flow works against a live corelink-server. No new code — verification only.

### Task 23: Run end-to-end verification (corelink mode)

This is a manual smoke test. Mark each step `[x]` only after the expected outcome is observed.

- [ ] **Step 1: Start the corelink-server**

```bash
cd /Users/kaikaidu/documents/github/corelink-server
CL_PROVISION_TOKEN=test-token CL_PUBLIC_HOST=127.0.0.1 npm start
```
Expected: `ws control server listening 0.0.0.0:20012`. Leave running.

- [ ] **Step 2: Start the orchestrator backend (new terminal)**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/backend
CORELINK_HOST=127.0.0.1 CORELINK_PORT=20012 CORELINK_PROVISION_TOKEN=test-token ./run.sh
```
Expected: uvicorn listening on :8000. Leave running.

- [ ] **Step 3: Submit the demo workflow**

Create a temp file `/tmp/demo-workflow.json`:

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

Then:

```bash
curl -X POST 'http://localhost:8000/deploy/execute/v2?executor=local&inject_env=true' \
  -H 'Content-Type: application/json' \
  -d @/tmp/demo-workflow.json
```
Expected: 200 with `{"deploy_id": "...", "plan": {"workspace": "workflow_..."}, "execution": [...]}`. Note the `deploy_id`.

- [ ] **Step 4: Verify credentials endpoint includes corelink block**

```bash
curl -s "http://localhost:8000/deployments/<DEPLOY_ID>/credentials?role=sender" | python3 -m json.tool
```
Expected: response has both `corelink: {host, port, username, password}` and `credentials: {json: {workspace, ...}}`.

- [ ] **Step 5: Run sender (new terminal)**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts
./run_sender.js.sh <DEPLOY_ID>
```
Expected: `Mode: corelink` then `Sender connected (deployment: <id>)` then prompt.

- [ ] **Step 6: Run receiver (new terminal)**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator/scripts
./run_receiver.js.sh <DEPLOY_ID>
```
Expected: `Mode: corelink` then `Receiver connected (deployment: <id>)` then `Listening for messages...`.

- [ ] **Step 7: Send a message**

In the sender terminal, type `hello` and Enter.
Expected: receiver terminal prints `[received] HELLO`.

- [ ] **Step 8: Cleanup**

Ctrl-C the sender and receiver. Then:

```bash
curl -X DELETE "http://localhost:8000/deployments/<DEPLOY_ID>"
```
Expected: 200 with `{"status": "deleted", "deploy_id": "...", "warnings": []}`.

- [ ] **Step 9: Verify workspace removed**

```bash
sqlite3 /Users/kaikaidu/documents/github/corelink-server/data/sqlite.db \
  "SELECT workspace_name FROM workspaces WHERE workspace_name='workflow_<DEPLOY_ID>';"
```
Expected: empty result.

(If the sqlite path differs, locate the configured `knexfile.js` to find it.)

---

### Task 24: Run end-to-end verification (relay mode)

Confirm the relay path also still works (regression check).

- [ ] **Step 1: Submit a fresh workflow** (corelink-server can be down for this; if so, set `CORELINK_PROVISION_TOKEN` to a bogus value and skip provisioning by temporarily commenting it — or restart with mocked provisioning. Easier: leave corelink-server up.)

```bash
curl -X POST 'http://localhost:8000/deploy/execute/v2?executor=noop&inject_env=false' \
  -H 'Content-Type: application/json' \
  -d @/tmp/demo-workflow.json
```
Note the `deploy_id`.

- [ ] **Step 2: Run sender + receiver in --mode relay**

```bash
# Terminal A
./run_sender.js.sh <DEPLOY_ID> --mode relay
# Terminal B
./run_receiver.js.sh <DEPLOY_ID> --mode relay
```

- [ ] **Step 3: Send a message**

Type `hello` in sender. Expected: receiver prints `[received] hello` (relay mode does NOT run plugin transforms unless plugins are configured in `apply_pipeline`; this is acceptable for the regression check).

- [ ] **Step 4: Cleanup**

Ctrl-C scripts. `curl -X DELETE` the deployment.

---

### Task 25: Final commit (no-op tag)

- [ ] **Step 1: Verify the working tree is clean**

```bash
cd /Users/kaikaidu/Documents/GitHub/exp-orchestrator
git status
```
Expected: clean working tree.

- [ ] **Step 2: Tag the demo-ready state**

```bash
git tag corelink-demo-ready -m "End-to-end Corelink demo verified (sender → plugin → receiver)"
git tag --list | grep corelink-demo
```
Expected: tag listed.

---

## Self-review checklist (post-plan)

Spec coverage check (each spec section maps to at least one task):

- [x] Spec §Architecture / §Data flow → Tasks 11, 12, 15
- [x] Spec §Components: new files → Tasks 6, 16, 17, 18, 19, 20, 21, 22 + corelink-server tasks 1-5
- [x] Spec §Components: rip-out checklist → covered by file-isolation discipline; not implemented as a task
- [x] Spec §Interfaces: Node transport → Tasks 18, 19
- [x] Spec §Interfaces: Python plugin → Task 16
- [x] Spec §Interfaces: corelink_admin → Tasks 6-9
- [x] Spec §Interfaces: corelink-server provisioning routes → Tasks 1-5
- [x] Spec §Data flow: deploy → Task 15
- [x] Spec §Data flow: credentials response (corelink block) → Task 15
- [x] Spec §Data flow: cleanup → Task 15 (DELETE endpoint)
- [x] Spec §Error handling: 503 on provision failure → Task 15 test
- [x] Spec §Error handling: 401 token rejection → Tasks 2, 8
- [x] Spec §Error handling: cleanup partial failure (warnings) → Task 15
- [x] Spec §Testing: backend unit tests → Tasks 6-15
- [x] Spec §Testing: corelink-server route tests → Tasks 1-5 (test-provision.js)
- [x] Spec §Testing: Node interface conformance → Task 19
- [x] Spec §Testing: plugin transform tests → Task 16
- [x] Spec §Testing: manual demo runbook → Tasks 23-24

No placeholders detected on review. Type names consistent across tasks: `CorelinkProvisionResult`, `CorelinkAdminError`, `provision_deployment(deploy_id)`, `unprovision_deployment(deploy_id)`, transport interface (`connect/send/subscribe/close`).
