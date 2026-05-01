from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Dict, List

from fastapi import FastAPI, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from allowlist import check_workflow_images
from transforms import apply_pipeline
from allocator import allocate_nodes
import broker_admin
from broker_health import check_broker_health
from deployment import deploy, validate_workflow
from executor import execute_dag
from executors import ContainerSpec, get_executor
from health import check_docker
from inventory import load_inventory
from logging_config import configure_cors, install as install_logging
from plugin_validation import ValidationResult, registry_login, validate_plugin_upload
from workflow_types import DeployWorkflow

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    registry_login()
    logger.info("backend.startup", extra={"event": "startup"})
    yield
    logger.info("backend.shutdown", extra={"event": "shutdown"})


app = FastAPI(lifespan=_lifespan)
configure_cors(app)
install_logging(app)

# In-memory store of deployment plans keyed by short deployment ID
deployments: Dict[str, dict] = {}

# Message relay: per-deployment list of subscriber queues
_relay_subscribers: Dict[str, List[asyncio.Queue]] = defaultdict(list)


class RelayMessage(BaseModel):
    data: str


@app.post("/deploy")
async def deploy_graph(payload: DeployWorkflow, inject_env: bool = False):
    try:
        result = deploy(payload, inject_env=inject_env)
        return {"message": "Deploy plan generated", **result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/deploy/validate")
async def validate_deploy(payload: DeployWorkflow):
    """Validate a workflow DAG before committing to deployment.

    Returns {valid, errors, warnings, topological_order} without touching
    NATS, Docker, or any other side-effecting resource.
    """
    result = validate_workflow(payload)
    if not result["valid"]:
        logger.info(
            "deploy.validate.failed",
            extra={
                "event": "deploy.validate.failed",
                "errors": result.get("errors"),
                "warnings": result.get("warnings"),
                "node_count": len(payload.nodes),
            },
        )
        raise HTTPException(status_code=422, detail=result)
    logger.info(
        "deploy.validate.ok",
        extra={"event": "deploy.validate.ok", "node_count": len(payload.nodes)},
    )
    return result


@app.post("/deploy/check-images")
async def check_deploy_images(payload: DeployWorkflow):
    results = check_workflow_images(payload.nodes)
    return {"message": "Image approval check completed", "results": results}


@app.post("/deploy/execute")
async def deploy_and_execute(payload: DeployWorkflow):
    try:
        deploy_result = deploy(payload, inject_env=False)
        image_results = check_workflow_images(payload.nodes)
        unapproved = {
            node_id: details
            for node_id, details in image_results.items()
            if not details["approved"]
        }
        if unapproved:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Unapproved runtime images detected",
                    "results": unapproved,
                },
            )

        execution_result = execute_dag(deploy_result, payload.nodes)
        return {
            "message": "Deploy plan generated and executed",
            "deploy_result": deploy_result,
            "execution_result": execution_result.to_dict(),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/upload/plugin")
async def upload_plugin(file: UploadFile) -> ValidationResult:
    content = await file.read()
    filename = file.filename or ""

    if not filename:
        raise HTTPException(status_code=400, detail="Upload must include a filename")

    is_dockerfile = filename == "Dockerfile" or content.lstrip().startswith(b"FROM")
    is_zip = filename.endswith(".zip")

    if not (is_dockerfile or is_zip):
        raise HTTPException(
            status_code=400,
            detail="Upload must be a Dockerfile or a .zip archive",
        )

    result = validate_plugin_upload(filename if is_zip else "Dockerfile", content)
    if not result.valid:
        logger.info(
            "plugin.upload.invalid",
            extra={
                "event": "plugin.upload.invalid",
                "filename": filename,
                "errors": result.errors,
            },
        )
        raise HTTPException(status_code=422, detail=result.errors)
    logger.info(
        "plugin.upload.ok",
        extra={"event": "plugin.upload.ok", "filename": filename},
    )
    return result


@app.get("/health")
async def health():
    """Liveness probe. Returns 200 if the process can serve requests."""
    return {"status": "ok"}


@app.get("/health/ready")
async def readiness():
    """Readiness probe. Verifies downstream dependencies are reachable."""
    docker = await asyncio.to_thread(check_docker)
    checks = {"docker": {"ok": docker.ok, "error": docker.error}}
    ready = all(c["ok"] for c in checks.values())
    if not ready:
        raise HTTPException(
            status_code=503,
            detail={"status": "not_ready", "checks": checks},
        )
    return {"status": "ready", "checks": checks}


@app.get("/health/broker")
async def broker_health():
    """Check NATS broker health."""
    report = await check_broker_health()
    return {"status": report.status.value, "latency_ms": report.latency_ms, "error": report.error}


@app.get("/inventory")
async def list_inventory():
    """List managed servers."""
    servers = load_inventory()
    return [asdict(s) for s in servers]


@app.post("/deploy/plan")
async def deploy_with_allocation(payload: DeployWorkflow, inject_env: bool = False):
    """Plan deployment with allocation decisions."""
    try:
        result = deploy(payload, inject_env=inject_env)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    health = await check_broker_health()
    node_requirements = {node.id: node.data.get("requirements", {}) for node in payload.nodes}
    allocation = allocate_nodes(result["queued_plugins"], node_requirements, health)

    result["allocation"] = [asdict(d) for d in allocation]
    result["broker_health"] = {
        "status": health.status.value,
        "latency_ms": health.latency_ms,
        "error": health.error,
    }
    return {"message": "Deploy plan with allocation generated", **result}


@app.post("/deploy/execute/v2")
async def deploy_and_execute_v2(
    payload: DeployWorkflow, executor: str = "local", inject_env: bool = True
):
    """Plan deployment and execute containers via the pluggable executor abstraction."""
    # Mint the deploy_id up-front so it can be the workspace key
    deploy_id = uuid.uuid4().hex[:8]

    # Provision broker (NATS) for this deployment
    try:
        provisioning = await broker_admin.provision_deployment(deploy_id)
    except broker_admin.BrokerAdminError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    nats_url = f"nats://{provisioning.host}:{provisioning.port}"
    broker_creds = {
        "url": nats_url,
        "token": provisioning.token,
    }

    effective_inject = inject_env and executor != "noop"
    try:
        plan = deploy(
            payload,
            deploy_id=deploy_id,
            workspace=provisioning.workspace,
            broker_creds=broker_creds,
            inject_env=effective_inject,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ex = get_executor(executor)

    if not await ex.health_check():
        raise HTTPException(
            status_code=503,
            detail=f"Executor '{executor}' is not available",
        )

    node_map = {node.id: node for node in payload.nodes}
    results = []

    for node_id in plan["queued_plugins"]:
        node = node_map[node_id]
        image = node.runtime or node.data.get("runtime") or node.data.get("containerImage")
        if not image:
            results.append(
                asdict(
                    ContainerSpec(node_id=node_id, image=""),
                )
                | {"status": "skipped", "reason": "no_runtime_image"}
            )
            continue

        spec = ContainerSpec(
            node_id=node_id,
            image=image,
            env_vars=plan.get("env_plan", {}).get(node_id, {}),
        )
        status = await ex.start(spec)
        results.append(asdict(status))

    # NOTE: demo-only — the provisioning blob (incl. NATS token) is stored
    # in process memory and re-emitted by /deployments/{id}/credentials, which has
    # no AuthN/AuthZ. Pre-prod hardening must gate that endpoint or scrub the
    # token before returning it.
    deployments[deploy_id] = {
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "stopped_at": None,
        "plan": plan,
        "execution": results,
        "workflow": payload.model_dump(),
        "provisioning": {
            "workspace": provisioning.workspace,
            "host": provisioning.host,
            "port": provisioning.port,
            "token": provisioning.token,
            "subject_prefix": provisioning.subject_prefix,
        },
    }

    logger.info(
        "deploy.executed",
        extra={
            "event": "deploy.executed",
            "deploy_id": deploy_id,
            "executor": executor,
            "node_count": plan["node_count"],
            "edge_count": plan["edge_count"],
            "queued": len(plan["queued_plugins"]),
        },
    )
    return {
        "message": "Deploy executed",
        "deploy_id": deploy_id,
        "plan": plan,
        "execution": results,
    }


@app.get("/deployments")
async def list_deployments():
    """List all tracked deployments with summary info."""
    return {
        deploy_id: {
            "status": dep.get("status", "unknown"),
            "started_at": dep.get("started_at"),
            "stopped_at": dep.get("stopped_at"),
            "node_count": dep["plan"]["node_count"],
            "edge_count": dep["plan"]["edge_count"],
            "queued_plugins": dep["plan"]["queued_plugins"],
        }
        for deploy_id, dep in deployments.items()
    }


@app.get("/deployments/{deploy_id}")
async def get_deployment(deploy_id: str):
    """Return full details for a single deployment."""
    if deploy_id not in deployments:
        raise HTTPException(status_code=404, detail=f"Deployment '{deploy_id}' not found")
    dep = deployments[deploy_id]
    return {
        "deploy_id": deploy_id,
        "status": dep.get("status", "unknown"),
        "started_at": dep.get("started_at"),
        "stopped_at": dep.get("stopped_at"),
        "plan": dep["plan"],
        "execution": dep["execution"],
    }


@app.get("/deployments/{deploy_id}/credentials")
async def get_deployment_credentials(
    deploy_id: str,
    role: str = Query(..., pattern="^(sender|receiver)$"),
):
    """Return NATS connection credentials for a sender or receiver in a deployment."""
    if deploy_id not in deployments:
        raise HTTPException(status_code=404, detail=f"Deployment '{deploy_id}' not found")

    dep = deployments[deploy_id]
    plan = dep["plan"]
    workflow = dep["workflow"]
    creds_by_node = plan["credentials_by_node"]
    nodes = workflow["nodes"]

    # Find the first node matching the requested role
    target_node = None
    for node in nodes:
        node_type = node.get("type", "")
        if role == "sender" and node_type == "sender":
            target_node = node
            break
        if role == "receiver" and node_type == "receiver":
            target_node = node
            break

    if not target_node:
        raise HTTPException(
            status_code=404,
            detail=f"No {role} node found in deployment '{deploy_id}'",
        )

    node_id = target_node["id"]
    node_creds = creds_by_node.get(node_id, {})

    # Sender needs out_creds to publish; receiver needs in_creds to subscribe
    if role == "sender":
        stream_creds = node_creds.get("out_creds", {})
    else:
        stream_creds = node_creds.get("in_creds", {})

    provisioning = dep.get("provisioning", {})
    nats_block = None
    if provisioning:
        nats_block = {
            "url": f"nats://{provisioning['host']}:{provisioning['port']}",
            "host": provisioning["host"],
            "port": provisioning["port"],
            "token": provisioning.get("token", ""),
        }
    return {
        "deploy_id": deploy_id,
        "role": role,
        "node_id": node_id,
        "nats": nats_block,
        "credentials": stream_creds,
    }


@app.post("/deployments/{deploy_id}/messages")
async def post_relay_message(deploy_id: str, msg: RelayMessage):
    """Sender pushes a message into the relay, applying plugin transforms."""
    if deploy_id not in deployments:
        raise HTTPException(status_code=404, detail=f"Deployment '{deploy_id}' not found")

    dep = deployments[deploy_id]
    topo_order = dep["plan"]["topological_order"]
    nodes_by_id = {n["id"]: n for n in dep["workflow"]["nodes"]}

    # Get plugin names in topological order (skip sender/receiver)
    plugin_names = [
        nodes_by_id[nid].get("data", {}).get("name", "")
        for nid in topo_order
        if nodes_by_id.get(nid, {}).get("type") == "plugin"
    ]

    transformed = apply_pipeline(plugin_names, msg.data)

    for queue in _relay_subscribers[deploy_id]:
        await queue.put(transformed)

    return {"status": "ok", "listeners": len(_relay_subscribers[deploy_id])}


@app.get("/deployments/{deploy_id}/messages")
async def stream_relay_messages(deploy_id: str):
    """Receiver subscribes to an SSE stream of relayed messages."""
    if deploy_id not in deployments:
        raise HTTPException(status_code=404, detail=f"Deployment '{deploy_id}' not found")

    queue: asyncio.Queue = asyncio.Queue()
    _relay_subscribers[deploy_id].append(queue)

    async def event_generator():
        try:
            while True:
                data = await queue.get()
                yield f"data: {json.dumps({'message': data})}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            _relay_subscribers[deploy_id].remove(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.delete("/deployments/{deploy_id}")
async def delete_deployment(deploy_id: str):
    """Stop containers, unprovision broker resources, remove deployment record."""
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
            logger.warning(
                "deploy.delete.stop_failed",
                extra={"event": "deploy.delete.stop_failed", "deploy_id": deploy_id, "container_id": cid},
                exc_info=True,
            )

    # Unprovision broker resources (no-op for core NATS)
    try:
        await broker_admin.unprovision_deployment(deploy_id)
    except broker_admin.BrokerAdminError as e:
        warnings.append(f"unprovision failed: {e}")
        logger.warning(
            "deploy.delete.unprovision_failed",
            extra={"event": "deploy.delete.unprovision_failed", "deploy_id": deploy_id},
            exc_info=True,
        )

    deployments.pop(deploy_id, None)
    logger.info(
        "deploy.deleted",
        extra={"event": "deploy.deleted", "deploy_id": deploy_id, "warnings_count": len(warnings)},
    )
    return {"status": "deleted", "deploy_id": deploy_id, "warnings": warnings, "stopped_at": datetime.now(timezone.utc).isoformat()}
