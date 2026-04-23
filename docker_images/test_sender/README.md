# test-sender

A minimal Dockerized sender used in backend-driven DAG integration tests.
It publishes configurable JSON messages to Corelink streams using
orchestrator-injected environment variables.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ID` | `test-sender` | Unique node identifier injected by the orchestrator |
| `NODE_TYPE` | `sender` | Node role (informational) |
| `SEND_INTERVAL_MS` | `2000` | Milliseconds between published messages |
| `CORELINK_HOST` | _(empty)_ | Corelink server hostname |
| `CORELINK_PORT` | `20010` | Corelink server port |
| `CORELINK_USERNAME` | _(empty)_ | Corelink auth username |
| `CORELINK_PASSWORD` | _(empty)_ | Corelink auth password |
| `OUT_<TYPE>_WORKSPACE` | _(empty)_ | Corelink workspace for output stream of `<TYPE>` |
| `OUT_<TYPE>_STREAM_ID` | _(empty)_ | Stream ID for output stream of `<TYPE>` |
| `OUT_<TYPE>_PROTOCOL` | `pubsub` | Protocol for output stream of `<TYPE>` |

When `CORELINK_HOST`, `CORELINK_USERNAME`, and `CORELINK_PASSWORD` are absent
the container starts in **HTTP-only mode** — the publish loop is skipped but
`/health` and `/status` remain available.

## HTTP endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Liveness probe — returns `{"ok": true}` |
| `GET /status` | Connection state, message count, and stream config |

## Published message format

```json
{
  "node_id": "<NODE_ID>",
  "seq": 42,
  "ts": 1713900000000
}
```

## Quick start

```bash
docker build -t test-sender .

# HTTP-only smoke test (no Corelink required)
docker run -d -p 3000:3000 \
  -e NODE_ID=sender-1 \
  -e OUT_JSON_WORKSPACE=test-ws \
  -e OUT_JSON_STREAM_ID=stream-1 \
  test-sender

curl http://localhost:3000/health
curl http://localhost:3000/status
```
