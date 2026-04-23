# test-receiver

A minimal Dockerized receiver used in backend-driven DAG integration tests.
It subscribes to Corelink streams and collects messages, exposing counts and
the last received payload via HTTP so tests can assert end-to-end delivery.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ID` | `test-receiver` | Unique node identifier injected by the orchestrator |
| `NODE_TYPE` | `receiver` | Node role (informational) |
| `CORELINK_HOST` | _(empty)_ | Corelink server hostname |
| `CORELINK_PORT` | `20010` | Corelink server port |
| `CORELINK_USERNAME` | _(empty)_ | Corelink auth username |
| `CORELINK_PASSWORD` | _(empty)_ | Corelink auth password |
| `IN_<TYPE>_WORKSPACE` | _(empty)_ | Corelink workspace for input stream of `<TYPE>` |
| `IN_<TYPE>_STREAM_ID` | _(empty)_ | Stream ID for input stream of `<TYPE>` |
| `IN_<TYPE>_PROTOCOL` | `pubsub` | Protocol for input stream of `<TYPE>` |

When `CORELINK_HOST`, `CORELINK_USERNAME`, and `CORELINK_PASSWORD` are absent
the container starts in **HTTP-only mode** — the subscribe loop is skipped but
`/health` and `/status` remain available.

## HTTP endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Liveness probe — returns `{"ok": true}` |
| `GET /status` | Connection state, `messages_received`, `last_message`, and stream config |

## Quick start

```bash
docker build -t test-receiver .

# HTTP-only smoke test (no Corelink required)
docker run -d -p 3001:3000 \
  -e NODE_ID=recv-1 \
  -e IN_JSON_WORKSPACE=test-ws \
  -e IN_JSON_STREAM_ID=stream-1 \
  test-receiver

curl http://localhost:3001/health
curl http://localhost:3001/status
```
