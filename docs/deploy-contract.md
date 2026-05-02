# Deploy Contract

The frontend and backend share a single deploy payload contract defined by the `DeployWorkflow` Pydantic model in `backend/workflow_types.py`.

## Schema

### DeployWorkflow

| Field | Type | Required |
|-------|------|----------|
| `nodes` | `DeployNode[]` | yes |
| `edges` | `DeployEdge[]` | yes |

### DeployNode

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | `string` | required | Unique node identifier |
| `type` | `string` | required | `"sender"`, `"receiver"`, or `"plugin"` |
| `runtime` | `string \| null` | `null` | Container image reference (e.g., `"my-plugin:latest"`) |
| `in_streams` | `string[]` | `[]` | Stream types this node accepts |
| `out_streams` | `string[]` | `[]` | Stream types this node produces |
| `in_creds` | `StreamCredential[]` | `[]` | Input stream credentials, one per inbound edge |
| `out_creds` | `StreamCredential[]` | `[]` | Output stream credentials, one per outbound edge |
| `env_vars` | `Record<string, string>` | `{}` | Environment variables |
| `data` | `Record<string, any>` | `{}` | Arbitrary metadata (name, description) |

### DeployEdge

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `source` | `string` | required | Source node ID |
| `target` | `string` | required | Target node ID |
| `data` | `string \| null` | `null` | Stream type (e.g., `"json"`, `"bytes"`, `"parquet"`) |

### StreamCredential

| Field | Type | Default |
|-------|------|---------|
| `peer_id` | `string` | `""` |
| `workspace` | `string` | required |
| `protocol` | `string` | `"pubsub"` |
| `stream_id` | `string` | required |
| `data_type` | `string` | required |
| `metadata` | `Record<string, any>` | `{}` |

`peer_id` is the counterparty node id: for an entry in `in_creds`, it is
the source node; for `out_creds`, it is the target node. This lets a node
distinguish multiple inbound or outbound edges of the same `data_type`
(fan-in / fan-out).

### Plugin env-var contract

For each cred, `build_env_vars` emits four variables. The peer id is
upper-cased and non-alphanumeric characters become `_`:

```
IN_<TYPE>_FROM_<PEER>_STREAM_ID
IN_<TYPE>_FROM_<PEER>_WORKSPACE
IN_<TYPE>_FROM_<PEER>_PROTOCOL
IN_<TYPE>_PEERS=peer1,peer2          # comma-separated list per type

OUT_<TYPE>_TO_<PEER>_STREAM_ID
OUT_<TYPE>_TO_<PEER>_WORKSPACE
OUT_<TYPE>_TO_<PEER>_PROTOCOL
OUT_<TYPE>_PEERS=peer3
```

Plugins that pattern-match on `IN_*_STREAM_ID` / `OUT_*_STREAM_ID` (the
recommended convention, used by `plugins/caesar_cipher`) automatically
handle fan-in and fan-out without code changes.

## Example Request

```
POST /deploy?inject_env=true
Content-Type: application/json
```

```json
{
  "nodes": [
    {
      "id": "abc-123",
      "type": "sender",
      "runtime": null,
      "in_streams": [],
      "out_streams": ["json"],
      "env_vars": {},
      "data": { "name": "Data Source" }
    },
    {
      "id": "def-456",
      "type": "plugin",
      "runtime": "my-org/transform:latest",
      "in_streams": ["json"],
      "out_streams": ["bytes"],
      "env_vars": {},
      "data": { "name": "Transform Plugin", "description": "Converts JSON to bytes" }
    }
  ],
  "edges": [
    { "source": "abc-123", "target": "def-456", "data": "json" }
  ]
}
```

## Example Success Response (200)

```json
{
  "message": "Deploy plan generated",
  "node_count": 2,
  "edge_count": 1,
  "topological_order": ["abc-123", "def-456"],
  "queued_plugins": ["def-456"],
  "assigned_nodes": ["def-456"],
  "adjacency_list": {
    "abc-123": ["def-456"],
    "def-456": []
  },
  "env_plan": {
    "def-456": {
      "NODE_ID": "def-456",
      "NODE_TYPE": "plugin",
      "IN_JSON_FROM_ABC_123_STREAM_ID": "deploy.dep.abc-123_def-456_json",
      "IN_JSON_FROM_ABC_123_WORKSPACE": "workflow_dep",
      "IN_JSON_FROM_ABC_123_PROTOCOL": "nats",
      "IN_JSON_PEERS": "ABC_123",
      "EXISTING": "1"
    }
  },
  "credentials_by_node": {
    "abc-123": {
      "in_creds": [],
      "out_creds": [
        {
          "peer_id": "def-456",
          "workspace": "workflow_dep",
          "protocol": "nats",
          "stream_id": "deploy.dep.abc-123_def-456_json",
          "data_type": "json",
          "metadata": {}
        }
      ]
    }
  },
  "injected_nodes": ["def-456"],
  "skipped_nodes": []
}
```

## Example Validation Error (422)

```json
{
  "detail": [
    {
      "loc": ["body", "nodes", 0, "id"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

## Example Business Logic Error (400)

```json
{
  "detail": "Edge source 'missing-node' not found in nodes"
}
```

## Frontend Field Mapping

| Frontend (React Flow) | Backend (DeployNode) |
|---|---|
| `node.id` | `id` |
| `node.data.nodeType` | `type` |
| `node.data.runtime` | `runtime` |
| `node.data.access_types.allowedReceiveTypes` | `in_streams` |
| `node.data.sources` | `out_streams` |
| `{ name, description }` | `data` |
| `edge.data.sourceHandle` | `DeployEdge.data` |
