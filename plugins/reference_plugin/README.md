# Reference Plugin

Canonical plugin implementation for the orchestrator. Use this as the template for new plugins.

## Plugin Contract

The orchestrator injects the following environment variables at deploy time:

### Orchestrator-injected (always present)

| Variable | Description |
|----------|-------------|
| `NODE_ID` | Unique node identifier within the workflow |
| `NODE_TYPE` | Node type (always `"plugin"` for plugins) |
| `IN_<STREAM>_STREAM_ID` | Inbound stream ID for stream type `<STREAM>` |
| `IN_<STREAM>_WORKSPACE` | Inbound Corelink workspace |
| `IN_<STREAM>_PROTOCOL` | Inbound protocol |
| `OUT_<STREAM>_STREAM_ID` | Outbound stream ID for stream type `<STREAM>` |
| `OUT_<STREAM>_WORKSPACE` | Outbound Corelink workspace |
| `OUT_<STREAM>_PROTOCOL` | Outbound protocol |

`<STREAM>` is the normalized stream type from the workflow edge (e.g. `JSON`, `BYTES`, `PARQUET`).

### Corelink connection (set in your deployment environment)

| Variable | Description |
|----------|-------------|
| `CORELINK_HOST` | Corelink server hostname |
| `CORELINK_PORT` | Corelink server port (default: `20010`) |
| `CORELINK_USERNAME` | Corelink auth username |
| `CORELINK_PASSWORD` | Corelink auth password |

If Corelink vars are absent, the plugin starts in **HTTP-only mode** — useful for local dev and upload validation without a live Corelink server.

## Data Flow

```
[IN_* stream] ──corelink receive──► _on_data() ──► _transform() ──corelink send──► [OUT_* stream]
```

`_transform()` is the stub to replace with real processing logic. It has access to `_params` which can be updated live.

## Fanned Parameter Updates

The orchestrator (or a controller node) can broadcast parameter changes to all running plugins simultaneously without redeployment. The plugin handles these via the Corelink server callback mechanism:

```
server sends: key="update", message={"params": {"scale": 2.0, "threshold": 0.8}}
                    ↓
_on_server_msg() merges into _params
                    ↓
next _transform() call uses the new values immediately
```

## Required Endpoints

Every plugin must expose:

- `GET /health` → `{"ok": true}` — orchestrator liveness check
- `GET /run` → current stream config + live `params` state

## Build & Run

```bash
# Build
docker build -t ref-plugin .

# Run in HTTP-only mode (no Corelink, for local dev)
docker run --rm -p 8080:8080 ref-plugin

# Run with full orchestrator env
docker run --rm -p 8080:8080 \
  -e NODE_ID=plugin-a \
  -e NODE_TYPE=plugin \
  -e IN_JSON_STREAM_ID=source_plugin-a_json_stream \
  -e IN_JSON_WORKSPACE=source_plugin-a_json_workspace \
  -e IN_JSON_PROTOCOL=pubsub \
  -e OUT_JSON_STREAM_ID=plugin-a_sink_json_stream \
  -e OUT_JSON_WORKSPACE=plugin-a_sink_json_workspace \
  -e OUT_JSON_PROTOCOL=pubsub \
  -e CORELINK_HOST=corelink.hsrn.nyu.edu \
  -e CORELINK_PORT=20010 \
  -e CORELINK_USERNAME=myuser \
  -e CORELINK_PASSWORD=mypass \
  ref-plugin
```

Verify:
```bash
curl http://localhost:8080/health   # {"ok":true}
curl http://localhost:8080/run      # stream state + params
```

## Writing a Real Plugin

1. Copy this directory.
2. Replace `_transform(data: bytes) -> bytes` with your processing logic.
3. Add any initial processing params to the `_params` dict.
4. The fanned-message handler `_on_server_msg` already merges `{"params": {...}}` updates — no changes needed unless you need custom message keys.
5. Build, zip, and upload via `POST /upload/plugin` to register with the orchestrator.

## Upload for Deploy

```bash
zip -r ref-plugin.zip .
curl -X POST http://localhost:8000/upload/plugin -F "file=@ref-plugin.zip"
# returns {"valid": true, "image_ref": "<registry>/plugin-<id>:<sha>", ...}
```

Use the returned `image_ref` as the `runtime` field on a `DeployNode`.
