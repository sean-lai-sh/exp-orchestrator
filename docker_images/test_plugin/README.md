# test-plugin

A Dockerized test plugin that receives data on input streams, applies a simple
transform, and publishes the result to output streams — validating the full
plugin lifecycle in orchestrator-driven DAG integration tests.

## Transform

For every inbound JSON message the plugin adds two fields:

```json
{
  "...original fields...",
  "processed_by": "<NODE_ID>",
  "processed_at": 1713900000000
}
```

Non-JSON payloads are wrapped in `{"raw": "..."}` before the fields are added.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ID` | `test-plugin` | Unique node identifier injected by the orchestrator |
| `NODE_TYPE` | `plugin` | Node role (informational) |
| `CORELINK_HOST` | _(empty)_ | Corelink server hostname |
| `CORELINK_PORT` | `20010` | Corelink server port |
| `CORELINK_USERNAME` | _(empty)_ | Corelink auth username |
| `CORELINK_PASSWORD` | _(empty)_ | Corelink auth password |
| `IN_<TYPE>_WORKSPACE` | _(empty)_ | Corelink workspace for input stream of `<TYPE>` |
| `IN_<TYPE>_STREAM_ID` | _(empty)_ | Stream ID for input stream of `<TYPE>` |
| `IN_<TYPE>_PROTOCOL` | `pubsub` | Protocol for input stream of `<TYPE>` |
| `OUT_<TYPE>_WORKSPACE` | _(empty)_ | Corelink workspace for output stream of `<TYPE>` |
| `OUT_<TYPE>_STREAM_ID` | _(empty)_ | Stream ID for output stream of `<TYPE>` |
| `OUT_<TYPE>_PROTOCOL` | `pubsub` | Protocol for output stream of `<TYPE>` |

When `CORELINK_HOST`, `CORELINK_USERNAME`, and `CORELINK_PASSWORD` are absent
the container starts in **HTTP-only mode** — the Corelink loop is skipped but
`/health` and `/status` remain available.

## HTTP endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Liveness probe — returns `{"ok": true}` |
| `GET /status` | Connection state, message counts, last I/O, and stream config |

## Allowlist

Add `test-plugin:latest` to `backend/config/allowed_images.json` so the
executor accepts it:

```json
{
  "test-plugin:latest": { "approved": true, "notes": "Integration test plugin" }
}
```

## Quick start

```bash
docker build -t test-plugin .

# HTTP-only smoke test (no Corelink required)
docker run -d -p 3002:3000 \
  -e NODE_ID=plugin-1 \
  -e NODE_TYPE=plugin \
  -e IN_JSON_WORKSPACE=test-ws \
  -e IN_JSON_STREAM_ID=stream-in \
  -e OUT_JSON_WORKSPACE=test-ws \
  -e OUT_JSON_STREAM_ID=stream-out \
  test-plugin

curl http://localhost:3002/health
curl http://localhost:3002/status
```
