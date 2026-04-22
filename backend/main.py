from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import asdict

from fastapi import FastAPI, HTTPException, UploadFile

from allowlist import check_workflow_images
from allocator import allocate_nodes
from corelink_health import check_corelink_health
from deployment import deploy
from executor import execute_dag
from inventory import load_inventory
from plugin_validation import ValidationResult, registry_login, validate_plugin_upload
from workflow_types import DeployWorkflow


@asynccontextmanager
async def _lifespan(app: FastAPI):
    registry_login()
    yield


app = FastAPI(lifespan=_lifespan)


@app.post("/deploy")
async def deploy_graph(payload: DeployWorkflow, inject_env: bool = False):
    try:
        result = deploy(payload, inject_env=inject_env)
        return {"message": "Deploy plan generated", **result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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

        approved_images = {
            details["image"] for details in image_results.values() if details["approved"]
        }
        execution_result = execute_dag(deploy_result, payload.nodes, approved_images)
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
        raise HTTPException(status_code=422, detail=result.errors)
    return result


@app.get("/health/corelink")
async def corelink_health():
    """Check Corelink server health."""
    report = await check_corelink_health()
    return report.to_dict()


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

    health = await check_corelink_health()
    node_requirements = {node.id: node.data.get("requirements", {}) for node in payload.nodes}
    allocation = allocate_nodes(result["queued_plugins"], node_requirements, health)

    result["allocation"] = [asdict(d) for d in allocation]
    result["corelink_health"] = health.to_dict()
    return {"message": "Deploy plan with allocation generated", **result}
