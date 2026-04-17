from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile

from deployment import deploy
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
