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
| `in_creds` | `Record<string, StreamCredential>` | `{}` | Input stream credentials |
| `out_creds` | `Record<string, StreamCredential>` | `{}` | Output stream credentials |
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
| `workspace` | `string` | required |
| `protocol` | `string` | `"pubsub"` |
| `stream_id` | `string` | required |
| `data_type` | `string` | required |
| `metadata` | `Record<string, any>` | `{}` |

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
      "IN_JSON_STREAM_ID": "abc-123_def-456_json_stream",
      "EXISTING": "1"
    }
  },
  "credentials_by_node": {
    "abc-123": {
      "in_creds": {},
      "out_creds": {
        "json": {
          "workspace": "abc-123_def-456_json_workspace",
          "protocol": "pubsub",
          "stream_id": "abc-123_def-456_json_stream",
          "data_type": "json",
          "metadata": {}
        }
      }
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
