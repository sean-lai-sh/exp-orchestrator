# Post-Corelink architecture: NATS broker + S3 payload + scheduler-aware executors

**Date:** 2026-04-28
**Status:** Draft for discussion (not approved, not scheduled)
**Replaces:** Corelink-based wire transport from the demo branch (now on `main`)

## Motivation

We adopted Corelink for the auto-connect demo because it was already in the
NYU stack and gave us pub/sub primitives quickly. The demo works end-to-end
on `main`, but Corelink server v6 has well-understood limits that block the
real product roadmap:

- **State accumulation bug**: streamRelay sparse-array indexed by random 1–65535
  IDs eventually triggers ERR_OUT_OF_RANGE. We worked around it with a
  full-restart procedure for the demo.
- **Same-user notification suppression**: forced us to use three seeded users
  (Testuser/Testuser1/Testuser2) per deploy purely to dodge an alert filter.
- **Single point of failure for the data plane**: every message in every
  workflow flows through one Node.js process.
- **Not designed for ML payloads**: tensors and embeddings serialized through
  WebSocket frames are CPU-expensive and saturate the broker.

Concurrently, the product direction is clear: orchestrator-as-a-platform for
ML workflows where plugins are arbitrary Docker containers (Python, GPU,
PyTorch/TF/JAX/etc.) running on remote compute. Corelink is the wrong abstraction
for that future and we don't want to keep paying its tax.

The original demo spec (`docs/superpowers/specs/2026-04-27-corelink-modular-demo-design.md`)
deliberately scoped Corelink-touching code into named, deletable files so the
rip-out is a small enumerated checklist, not a refactor. This doc is the
post-rip-out target.

## Goals

1. **Plugins-as-containers preserved**: any language, any runtime, GPU-aware.
2. **Broker built for streaming + backpressure + durability**, not retrofitted
   pub/sub.
3. **Large payloads (tensors, frames, embeddings) carried out-of-band** — broker
   carries pointers, blob store carries bytes.
4. **Executor abstraction extended to real schedulers** (ECS, Kubernetes, Ray)
   without re-architecting plugins.
5. **Demo path stays simple**: one-binary local dev experience.

## Non-goals (for this doc)

- Multi-tenant auth/RBAC across users (separate spec).
- Versioned plugin registry / supply chain (separate spec).
- Cross-region / multi-cluster deploys.
- Observability stack (Prometheus/OTel) beyond what executors expose today.

## Architecture

```
                       ┌──────────────────────────┐
                       │  Frontend canvas (Next)  │
                       └────────────┬─────────────┘
                                    │ HTTP
                       ┌────────────▼─────────────┐
                       │  Orchestrator backend    │  control plane only;
                       │  (FastAPI, today)        │  not in the data path.
                       └─┬───────────┬────────────┘
            provision  /  \   credentials / GET /deployments/{id}/credentials
                      /    \                  ↓
        ┌────────────▼┐    ┌▼──────────────────────────────┐
        │  NATS +     │    │   Plugin / sender / receiver  │
        │  JetStream  │◄───┤   processes; speak NATS for   │
        │  (broker)   │    │   pointers, S3 for payloads   │
        └────────┬────┘    └──┬─────────────────────────────┘
                 │            │
                 │ pointers   │ blobs
                 ▼            ▼
        ┌─────────────────────────────────────────┐
        │  S3 / MinIO  (per-workspace buckets)    │
        └─────────────────────────────────────────┘

       executor abstraction (today: local docker; soon: ECS / Kubernetes / Ray)
       launches plugin containers with the same env-injection contract as today.
```

The orchestrator backend stays the **control plane / discovery service**:
provision a workspace, mint credentials, schedule containers, surface deploy_id.
It is **not on the data path** — that's the broker's job.

## Components

### Broker: NATS + JetStream

Why NATS over the alternatives:

| | NATS+JS | Redis Streams | Kafka | Ray |
|---|---|---|---|---|
| Single-binary dev | ✓ | ✓ (container) | ✗ (Zookeeper-class) | ✗ (Python-only) |
| Polyglot clients | ✓ | ✓ | ✓ | ✗ |
| Pull-based backpressure | ✓ | ✓ (consumer groups) | ✓ | n/a |
| At-least-once durability | ✓ (JS) | ✓ (consumer groups) | ✓ | n/a |
| Subject hierarchy / wildcards | ✓ | ✗ (key-pattern only) | ✗ | n/a |
| Replay / time-travel | ✓ (JS) | ✓ | ✓ (best-in-class) | ✗ |
| ML-pipeline first | ✗ | ✗ | ✗ | ✓ |

NATS hits the sweet spot for our stage: small ops surface, real backpressure,
durable streams, polyglot. Kafka is overkill for current scale. Ray is great
but would replace large parts of the orchestrator we've already built.

**Subjects:** `workspace.<deploy_id>.<edge_id>.<data_type>`. The deploy planner
emits subject names just like it emits Corelink stream names today —
`generate_pub_sub_cred` becomes `generate_subject_cred` with the same shape
behind the scenes.

**Streams:** one JetStream stream per deploy (`workflow_<deploy_id>`),
configured with `WorkQueuePolicy` so each plugin consumes its assigned subject
exactly once across replicas, plus a `MaxAge` of e.g. 1 hour for cleanup.

### Payload pattern: pointers on broker, blobs in object store

Brokers handle small messages well (tens of KB). Tensors don't fit that.
Standard pattern in modern MLOps (Kubeflow, Ray Data, BentoML):

1. **Producer** writes blob to S3/MinIO at
   `s3://workspace-<deploy_id>/<edge>/<msg_uuid>` and computes a checksum.
2. Producer publishes a small JSON envelope to NATS:
   ```json
   {
     "schema": "tensor[1024,768]/float16",
     "uri":    "s3://workspace-abc/plg_rcv/9b2e...uuid",
     "checksum": "sha256:...",
     "metadata": {"timestamp": "...", "trace_id": "..."}
   }
   ```
3. **Consumer** receives the envelope, fetches the blob, processes, writes its
   own blob, publishes its own envelope.

For tiny messages (chat-style "hello world" demo), producers can put the
payload inline in an `inline` field as a fast-path; consumers handle both forms.
The library hides this from plugin authors: `await broker.send(out_id, payload)`
chooses inline vs blob based on size.

**Bucket lifecycle:** create per-deploy bucket on provision; nuke on undeploy.
S3 lifecycle rules expire stragglers after 24h as a safety net.

**Local dev:** MinIO container, single bucket. No code changes between dev and
prod — just the endpoint URL.

### Executor abstraction (existing, extended)

Today's `backend/executors/base.py::Executor` already abstracts container
lifecycle: `start(spec)`, `stop(id)`, `status(id)`, `logs(id)`,
`health_check()`. Adding executors is a slot-fill:

| Executor | Status today | Required for this plan |
|---|---|---|
| `LocalDockerExecutor` | exists | no change |
| `NoopExecutor` | exists | no change |
| `ECSExecutor` | stub | flesh out: task-definition mint, run-task, log streaming |
| `KubernetesExecutor` | not started | new — uses k8s Python client; supports nodeSelectors / GPU resource requests |
| `RayExecutor` | not started | optional; only needed if we want Ray actor-style scheduling |

Plugin authors write the same plugin regardless of executor — env contract is
preserved. The orchestrator's deploy planner picks an executor per
`deploy/execute/v2?executor=...` query param (already in place).

GPU scheduling lives in the executor's `start()` implementation, fed by node
data on the canvas (e.g. `requirements: { gpu: "a100", count: 1 }`). The
canvas already accepts a `requirements` blob (see `backend/allocator.py`'s
hooks); executors translate it to backend-specific scheduling.

### Plugin contract

Same env-var shape as today, with broker URL added and corelink fields removed.

```
NODE_ID=<uuid>
NODE_TYPE=plugin

NATS_URL=nats://nats.<deployment>.local:4222
NATS_TOKEN=<per-deploy token>

S3_ENDPOINT=https://minio.<deployment>.local
S3_BUCKET=workspace-<deploy_id>
S3_ACCESS_KEY=<...>
S3_SECRET_KEY=<...>

IN_<TYPE>_SUBJECT=workspace.<deploy_id>.<edge_id>.<type>
IN_<TYPE>_CONSUMER=plg-<node_id>-<type>
IN_<TYPE>_SCHEMA=<schema>          # optional, for runtime validation

OUT_<TYPE>_SUBJECT=...
OUT_<TYPE>_SCHEMA=...
```

A reference Python plugin: ~30 lines using `nats-py` + `boto3`. JS, Rust,
Go versions are similar; clients exist for all.

```python
# minimal reference plugin
async def main():
    nats_client = await nats.connect(os.environ["NATS_URL"], token=os.environ["NATS_TOKEN"])
    s3 = boto3.client("s3", endpoint_url=os.environ["S3_ENDPOINT"], ...)

    in_subject = os.environ["IN_DATA_SUBJECT"]
    out_subject = os.environ["OUT_RESULT_SUBJECT"]
    bucket = os.environ["S3_BUCKET"]

    js = nats_client.jetstream()
    sub = await js.pull_subscribe(in_subject, durable=os.environ["IN_DATA_CONSUMER"])

    while True:
        msgs = await sub.fetch(batch=1, timeout=30)
        for msg in msgs:
            envelope = json.loads(msg.data)
            tensor = await fetch_blob(s3, bucket, envelope["uri"])
            result = transform(tensor)             # the user's actual logic
            uri = await put_blob(s3, bucket, result)
            await js.publish(out_subject, json.dumps({"uri": uri, "schema": ...}).encode())
            await msg.ack()
```

The bulk of the user-written plugin is `transform()`. Everything else is
boilerplate we can ship as a small helper library
(`pip install exp-orchestrator-plugin-py`).

## Demo path remains simple

Local dev brings up:
- Orchestrator backend (existing `bash backend/run.sh`)
- NATS server (one binary, ~10MB, `nats-server -js`)
- MinIO (one Docker container, `minio/minio server /data`)

Three processes vs today's two (orchestrator + corelink-server). NATS+MinIO are
both well-known one-line installs. A single `bash /tmp/dev-up.sh` would orchestrate.

Sender/receiver scripts likewise migrate to NATS clients (or stay on the
existing relay-transport.js since they're host-side and don't need broker-grade
transport).

## Migration plan

### Phase A — additive: bring up NATS path alongside Corelink (~3 days)

1. Add `backend/broker_admin.py` — provisions a JetStream stream per deploy,
   mints subjects, returns broker URL + token.
2. Add `backend/executors/start_with_broker_env.py` (or extend existing) to
   inject `NATS_URL`/`S3_*`/`IN_*_SUBJECT`/`OUT_*_SUBJECT` env vars.
3. Add `plugins/nats_demo/` — reference Python plugin using NATS + S3.
4. Add `scripts/lib/nats-transport.js` (or keep `relay-transport.js` if
   sender/receiver stay HTTP).
5. New `--mode nats` flag on sender/receiver scripts (alongside corelink and
   relay).
6. Verify end-to-end with existing demo workflow.

### Phase B — switch default (~1 day)

1. Frontend deploy default goes to `?broker=nats`.
2. Document the cutover in README.

### Phase C — rip Corelink (~1 day, mostly deletes)

Per the existing rip-out checklist in
`docs/superpowers/specs/2026-04-27-corelink-modular-demo-design.md`:

```
delete:
  backend/corelink_admin.py, backend/corelink_health.py
  backend/tests/test_corelink_admin.py, test_corelink_health.py
  plugins/corelink_demo/, plugins/caesar_cipher/, plugins/reference_plugin/
  scripts/lib/corelink-transport.js, scripts/lib/vendor/
  corelink-server's /api/provision routes
edit:
  backend/main.py — drop /health/corelink, drop provisioning calls in /deploy/execute/v2
  backend/allocator.py — drop corelink_unreachable defer branch
  backend/deployment.py — replace generate_pub_sub_cred with generate_subject_cred
  backend/run.sh — drop CORELINK_* env vars
  scripts/sender.js, receiver.js — drop --mode corelink branch
```

### Phase D — flesh out executors (~1–2 weeks per backend)

1. **ECS**: complete the existing stub. Task definitions per-image. Awsvpc networking. CloudWatch log streaming.
2. **Kubernetes**: new executor. PodSpec generation, GPU resource requests, log streaming via the k8s API.
3. **Ray (optional)**: actor-per-plugin model. Bypasses the broker entirely for the in-cluster fast path; broker for inter-cluster.

Each executor is a single file implementing the existing `Executor` ABC.

## Open questions

1. **Authn at the broker layer**: per-deploy NATS tokens, NKeys, or JWT?
   Trade-off between simplicity (token), forward-compat (JWT), and the
   "demo just works" goal.
2. **Schema validation at plugin boundaries**: opt-in JSON Schema /
   protobuf-style at runtime, or trust authoring-time canvas validation only?
3. **Backpressure visibility on the canvas**: should we surface a "this
   edge is backed up" indicator? Requires the orchestrator to poll
   JetStream consumer lag.
4. **Frontend changes**: minimal — the canvas doesn't care about transport.
   The deploy bridge `frontend/app/api/deploy/route.ts` keeps its current
   shape. Possibly add a `?broker=nats|corelink|relay` toggle for the
   transition period.

## Out-of-scope follow-ons

- **Versioned plugin registry**: today plugins are local OCI images. A real
  product wants a registry with signing, approval workflow, version pinning.
- **Multi-tenant resource quotas**: per-team GPU budgets, concurrent-deploy
  limits.
- **Workflow versioning + replay**: with JetStream's durable streams this
  becomes feasible — replay the source data through a new pipeline version.
- **Observability**: per-edge throughput, per-plugin GPU utilization,
  end-to-end latency. Hooks into Prometheus + OTel.

## Decision required before writing the implementation plan

- **Broker:** confirm NATS+JetStream as the choice (vs Redis Streams, Kafka,
  Ray).
- **Payload model:** confirm pointer-on-broker + blobs-in-S3 (vs inline
  payloads always).
- **First scheduler beyond local Docker:** ECS or Kubernetes for the next
  executor?

Once those three decisions are made, this doc gets handed to the
`writing-plans` flow to produce a concrete task list, and the implementation
follows the same Plan → Sprint → Review pattern as the corelink demo.
