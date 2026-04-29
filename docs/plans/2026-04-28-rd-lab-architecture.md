# R&D lab architecture: instruments, agents, sessions

**Date:** 2026-04-28
**Status:** Draft for discussion (not approved, not scheduled)
**Relationship to other docs:**
- `2026-04-28-post-corelink-architecture.md` — narrowly scoped to the
  corelink → NATS broker swap. Still valid; this doc subsumes its goals
  and adds the product-shape framing.
- `2026-04-27-corelink-modular-demo-design.md` — the demo we shipped on
  `main`. The plumbing it built (executor abstraction, env-injected
  plugin contract, canvas UX) survives intact into this product shape.

## Product framing

The orchestrator's natural home is **R&D labs**: places where data
originates from instruments (microscopes, oscilloscopes, sequencers,
spectrometers, sensor rigs), needs lightweight transforms or inference,
and lands in lab-local archives.

The job-to-be-done is concrete: **a researcher has 5 little Python
scripts spread across 3 machines and an instrument's controller PC**.
Today they glue them together with bash, samba shares, and tribal
knowledge. They want to wire the same logic visually, run it on whatever
compute the lab has, and let their PI tweak a knob without becoming a
DevOps engineer.

This is a smaller, more defensible product than "general MLOps platform":

| | MLOps platform | R&D lab orchestrator |
|---|---|---|
| Buyer | Engineering org with a data team | PI / lab manager / staff scientist |
| Compute | K8s cluster | A few workstations + an instrument PC + maybe a small GPU box |
| Data sources | Warehouses, S3, Kafka | Microscopes, sensors, instrument-controller PCs |
| Data destinations | Cloud warehouses, feature stores | Lab NAS, optional S3 archive, sometimes LIMS |
| Compliance | SOC 2, GDPR | IRB, IP, sometimes air-gapped |
| Closest existing tools | Dagster, Airflow, Argo, Ray | NiFi, Node-RED, Meta's labgraph (none with a great canvas) |

We're closer to NiFi/Node-RED/labgraph in shape, with a polished
canvas-driven UX nobody else in this space has nailed.

## Goals

1. **Run anywhere a lab has compute.** Researcher's GPU workstation, a
   shared lab server, the controller PC for an instrument, optionally a
   cloud peering layer. Heterogeneous by default.
2. **Plugins as containers when possible, host processes when forced.**
   Vendor SDKs that only exist on a specific OS, USB-attached devices,
   licensing dongles — these are real and require host execution.
3. **Streaming AND batch in one product.** Live microscope preview is
   streaming; "reprocess yesterday's session through the new model" is
   batch. Both ship in v1.
4. **Session as the first-class run concept.** "Process the data from
   session 2024-04-28-mouse-3" beats "manage a long-running pipeline
   forever".
5. **On-prem-first deployment.** Many labs cannot ship raw data to
   cloud (IP, IRB). The whole stack runs inside a lab's network.

## Non-goals (for this doc)

- Multi-lab federation / shared workflows across institutions.
- Plugin marketplace / paid plugin distribution.
- Hosted SaaS pricing tier (this comes after on-prem credibility).
- Training (compute provided is for inference + transforms; training
  happens off-platform per the user's stated direction).

## Key concepts

### Workers

A **worker** is a registered process running somewhere in the lab — a
researcher's Mac mini, a Windows PC controlling a microscope, an Ubuntu
GPU box. Workers run a small **agent** that:

1. Connects out to the orchestrator backend (firewall-friendly).
2. Advertises its **capabilities**: `{cpu, ram, gpu, os, devices, mounts, network}`.
3. Heartbeats so the orchestrator knows it's alive.
4. Pulls work assignments and runs them — either by `docker run`-ing a
   container locally, or by spawning a host process when the plugin
   declares `runtime: "host"`.

```
                   ┌──────────────────────────┐
                   │  Orchestrator backend    │   on a small lab server,
                   │  (FastAPI + NATS, today) │   reachable from all workers
                   └──┬───────────────────────┘
                      │ outbound conn
        ┌─────────────┼─────────────┬──────────────┐
        ▼             ▼             ▼              ▼
   ┌─────────┐  ┌─────────┐   ┌───────────┐   ┌──────────────┐
   │ Mac M2  │  │ GPU box │   │ Win-10 PC │   │ Lab-NAS Linux│
   │ agent A │  │ agent B │   │ agent C   │   │ agent D      │
   │ {cpu:8} │  │ {gpu:   │   │ {os:win,  │   │ {disk:48TB,  │
   │         │  │  a100}  │   │  device:  │   │  mounts:nas} │
   │         │  │         │   │  scope-X} │   │              │
   └─────────┘  └─────────┘   └───────────┘   └──────────────┘
```

This **replaces "K8s executor"** as the v1 scheduling model. K8s comes
later for labs that already run it — we add a `KubernetesExecutor`
slot-in, but the worker-agent model is the simple default that fits a
lab who just wants to install an agent on three computers.

### Plugins

A plugin is **code that runs on a worker, wired into the workflow via
inputs and outputs**. Two runtime kinds:

| Kind | Use when | Examples |
|---|---|---|
| `container` | Plugin code is portable, no host-only deps | Caesar cipher, segmentation model in a CUDA container, ETL transforms |
| `host` | Plugin needs vendor SDK, USB device, OS-specific runtime | Microscope-X capture (vendor `.dll`), serial-port reader, fluorescence camera SDK |

Three semantic categories on the canvas:

| Category | Role | Examples |
|---|---|---|
| **Source** | Pulls data into the workflow | Microscope acquisition, file-watcher, API poller, MQTT subscriber |
| **Transform** | In → out, typed | Denoise, dimensionality reduction, model inference, format convert |
| **Sink** | Final destination | Lab NAS write, S3 archive, LIMS push, downstream service |

The canvas's existing `nodeTemplates.ts` grows source/sink categories;
backend's deploy planner stays unchanged in shape (still emits IN_*/OUT_*
env vars per node).

### Sessions and runs

A **session** is the user-meaningful unit of work: one mouse imaging
run, one PCR plate, one fluorescence experiment. Researchers think in
sessions.

A **run** is one execution of a workflow against a session. Runs have:

- A unique `run_id` and `session_id` (the latter chosen by the researcher).
- A start time, end time, status (`running`, `succeeded`, `failed`, `cancelled`).
- An output manifest (artifact URIs).
- Lineage (which inputs produced which outputs).
- Replayability ("re-run this session through the new pipeline version").

This is a meaningful upgrade over today's `deployment_id` / `deployments`
dict. Today's `deploy` ≈ "pipeline launched" with no run history. We'd
extend the schema to:

```
Pipeline (workflow definition)
   ├── version 1
   └── version 2
        ├── Run #1   on session X   (succeeded, artifacts at ...)
        ├── Run #2   on session Y   (failed, rerun)
        └── Run #3   on session Y   (succeeded, artifacts at ...)
```

For streaming pipelines (real-time microscope view), a "session" is the
duration of the live capture. For batch pipelines, it's the dataset
window the run covers.

### Deployment topology

```
   Lab network                                       Cloud (optional)
   ─────────────────────────────────                ─────────────────
                                                      ┌─────────────┐
   ┌──────────────────────────┐                       │ S3 archive  │ ← optional
   │ Orchestrator backend     │ ◄─── outbound ────► ──┤ for offsite │
   │ NATS                     │                       │ backup      │
   │ MinIO (lab blob store)   │                       └─────────────┘
   │ Postgres (run history)   │
   └────┬────┬────┬───────────┘
        │    │    │
        │    │    └────────── agent on Win-10 instrument PC
        │    │                (host plugin: microscope SDK)
        │    │
        │    └─────────────── agent on GPU workstation
        │                     (container plugin: model inference)
        │
        └──────────────────── agent on lab Mac
                              (container plugin: light transforms)
```

**One backend per lab.** Single small VM or even a Mac mini. NATS +
MinIO + Postgres are all single-binary-friendly. Researchers don't
operate Kubernetes; they install three things from a single installer.

## Streaming and batch in the same product

Both execution shapes are first-class.

### Streaming path (what's already built, modulo broker swap)

Plugin container is long-lived. Subscribes to a NATS subject, reacts to
each message, publishes outputs. Used for:

- Live microscope acquisition with on-the-fly preview/inference
- Real-time enrichment of sensor streams
- Routing / filtering messages between systems

Plugin lifecycle: starts at session-start, lives until session-end (or
until the user clicks "stop").

### Batch path (new)

Plugin container/host-process runs to completion on a finite dataset,
emits artifacts, exits. Used for:

- "Reprocess all images from session X through this new model"
- Daily ingestion from external API
- Periodic feature extraction over a time window
- Backfills

Plugin lifecycle: orchestrator schedules a run, agent dispatches it,
plugin reads input artifacts, writes output artifacts, exits with a
success/failure status. Outputs are addressable by run_id.

### Triggering

Streaming runs trigger on **session start** (manual or sensor-driven
"a new session began" event).

Batch runs trigger on:

- **Schedule** (cron: every hour, every day at 2am)
- **Upstream completion** (run B starts when run A finishes)
- **External event** (a new file landed in `/lab-nas/incoming/`,
  webhook from instrument software)
- **Manual / backfill** (researcher clicks "rerun this session")

The orchestrator backend grows a small **scheduler** subsystem (cron +
event-driven). Could be a thin layer over an existing tool (APScheduler
for cron, watchdog for files) or a small bespoke implementation.

## Plugin contract (extends the corelink-demo contract)

Streaming plugins (container or host) get the same shape as today, with
broker creds replacing corelink:

```
NODE_ID, NODE_TYPE
NATS_URL, NATS_TOKEN, S3_ENDPOINT, S3_BUCKET, S3_KEYS
IN_<TYPE>_SUBJECT, IN_<TYPE>_CONSUMER, IN_<TYPE>_SCHEMA
OUT_<TYPE>_SUBJECT, OUT_<TYPE>_SCHEMA
SESSION_ID, RUN_ID
```

Batch plugins get a different env shape (no streaming subjects; explicit
input/output URIs per run):

```
NODE_ID, NODE_TYPE
SESSION_ID, RUN_ID
S3_ENDPOINT, S3_BUCKET, S3_KEYS
IN_<NAME>_URIS=<json array of artifact URIs>     # produced by upstream runs
OUT_<NAME>_URI=<single URI to write to>
RUN_PARAMS=<json blob of user-set parameters from canvas>
```

When the batch plugin exits 0, the agent reads the OUT URIs that were
written, registers them as run artifacts in the orchestrator, and
flips the run state to succeeded.

Host-process plugins get the same env-var contract; they just run
without container isolation. The agent invokes them directly.

## Migration arc

This is not a big-bang rewrite. The current demo is small and
intentionally modular; growing it into the lab product is incremental.

### What stays unchanged

- **Canvas UX** (`frontend/components/canvas/`). Adding source/sink
  categories is data-only (`nodeTemplates.ts` extension).
- **Deploy planner shape** (`backend/deployment.py`). Still emits
  IN_*/OUT_* env vars per node. The "stream type" abstraction
  generalises to NATS subjects, S3 URIs, etc.
- **Executor abstraction** (`backend/executors/`). The `Executor` ABC
  becomes one of two parallel ABCs: `Executor` (container streaming) and
  `BatchExecutor` (run-to-completion). Adding a `WorkerAgentExecutor`
  is a slot-in.
- **Frontend ↔ backend deploy contract**. The `/deploy` endpoint
  evolves into `/runs` + `/pipelines`, but the canvas POSTs the same
  workflow shape.

### Step-by-step migration

**Step 0 (done):** corelink-modular demo on `main`.

**Step 1 — corelink rip-out + NATS swap** (per existing
`2026-04-28-post-corelink-architecture.md`). ~1 week.

**Step 2 — worker agent v0**. ~2 weeks.
- Tiny Python agent: registers via WS to orchestrator, heartbeats,
  receives `start_container(spec)` / `start_host_process(spec)` commands,
  reports back status + logs.
- New `WorkerAgentExecutor` in `backend/executors/agent.py` that picks
  a registered worker matching the node's `requirements`.
- Runs alongside `LocalDockerExecutor`. Researcher can pick "run on
  agent X" or "run locally".

**Step 3 — sessions and runs**. ~2 weeks.
- Backend schema: add `pipelines` (versioned workflow defs), `runs`
  (executions of a pipeline, scoped to a session), `artifacts` (URIs
  produced by runs).
- Postgres replaces in-memory `deployments` dict.
- Canvas grows a "Runs" view: history per pipeline, artifacts per run,
  rerun button.

**Step 4 — batch execution path**. ~3 weeks.
- New `BatchExecutor` ABC with `submit_job` / `wait` / `result`.
- Plugin contract additions for batch (URI-based env vars).
- Canvas: nodes can be marked `kind: batch` (default streaming).

**Step 5 — scheduler**. ~2 weeks.
- Cron triggers, file-landing triggers, upstream-completion triggers.
- Reuse APScheduler or build a small bespoke loop.

**Step 6 — host-process plugins on agents**. ~1 week.
- Agent supports `runtime: "host"` plugins: invokes the plugin's entrypoint
  directly with env vars set, captures stdout/stderr.
- Critical for instrument-PC plugins.

**Step 7 — installer / on-prem deployment story**. ~2 weeks.
- One-binary lab server bootstrap (orchestrator + NATS + MinIO +
  Postgres in compose / nomad / k3s).
- Agent installer (`curl | sh` style for Linux/Mac, `.msi` for Windows).
- Documentation: "from zero to first run in 30 minutes."

That's roughly 13 weeks of focused work to a credibly demoable lab
product. None of it requires throwing away the demo code we shipped.

## Open product questions

1. **Authentication for agents**: shared-secret tokens (simple), client
   certs (medium), JWT/OAuth (heavy). Labs vary in security posture.
2. **What to do about Windows-host plugins on Mac dev machines**: do we
   support cross-OS dev, or do plugin authors need a Windows worker for
   debugging?
3. **Versioning model for pipelines**: every save creates a new version,
   or explicit "publish" gesture? Affects UX and the runs table.
4. **Live-preview UX during streaming runs**: do we surface stream
   contents in the canvas (e.g., show the latest microscope frame
   inline)? Big UX win for researchers, real engineering investment.
5. **Where does the lab NAS sit in the model**: as a special filesystem
   sink, or as a generic `mount:` capability that an agent advertises
   and plugins use?

## Decision required before this becomes an implementation plan

- **Agent transport**: NATS (consistent with data plane) or HTTP/SSE
  (simpler, but two protocols)? Recommend NATS — same deployment, one
  cluster connection per agent.
- **Postgres for run history vs. continuing with in-memory + file
  artifacts**: real DB is necessary as soon as runs become first-class.
  Probably yes from step 3 onward.
- **Worker-agent v0 in Python or Go**: Python matches the rest of the
  backend; Go gives a smaller binary for `.msi` packaging on Windows.
  Recommend Python for v0 (faster to ship, agents can be re-implemented
  later if binary size matters).
- **Should batch jobs share the agent fleet, or run as ECS/K8s
  one-shot pods**: probably share the agent fleet for the lab-on-prem
  case; ECS/K8s for cloud-peered batches.

Once these are decided, this doc hands off to `writing-plans` to produce
a concrete task list, the same shape as the corelink-demo plan.
