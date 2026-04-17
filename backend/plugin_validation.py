"""
Plugin upload validation: static checks + docker build + optional registry push.

Upload shapes accepted:
  - Single Dockerfile (raw bytes, filename must be "Dockerfile" or content starts with FROM)
  - Zip archive containing a Dockerfile at the root or one subdirectory level
"""

from __future__ import annotations

import hashlib
import io
import os
import shutil
import subprocess
import tempfile
import uuid
import zipfile
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ValidationResult:
    valid: bool
    image_ref: str | None
    build_log: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    detected_type: str = ""  # "dockerfile" | "directory"


def validate_plugin_upload(filename: str, content: bytes) -> ValidationResult:
    if filename.endswith(".zip"):
        return _handle_zip(content)
    return _handle_dockerfile(content)


# ---------------------------------------------------------------------------
# Upload type handlers
# ---------------------------------------------------------------------------

def _handle_dockerfile(content: bytes) -> ValidationResult:
    result = ValidationResult(valid=False, image_ref=None, build_log="", detected_type="dockerfile")
    errors = _static_check(content.decode("utf-8", errors="replace"))
    if errors:
        result.errors = errors
        return result

    tmpdir = tempfile.mkdtemp(prefix="plugin-build-")
    try:
        Path(tmpdir, "Dockerfile").write_bytes(content)
        return _build_and_push(tmpdir, content, result)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _handle_zip(content: bytes) -> ValidationResult:
    result = ValidationResult(valid=False, image_ref=None, build_log="", detected_type="directory")

    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        result.errors = ["Upload is not a valid zip file"]
        return result

    dockerfile_path = _find_dockerfile_in_zip(zf)
    if dockerfile_path is None:
        result.errors = ["No Dockerfile found in zip archive"]
        return result

    dockerfile_text = zf.read(dockerfile_path).decode("utf-8", errors="replace")
    errors = _static_check(dockerfile_text)
    if errors:
        result.errors = errors
        return result

    tmpdir = tempfile.mkdtemp(prefix="plugin-build-")
    try:
        zf.extractall(tmpdir)
        # If Dockerfile is nested, use its parent as build context
        build_context = str(Path(tmpdir, dockerfile_path).parent)
        return _build_and_push(build_context, dockerfile_text.encode(), result)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _find_dockerfile_in_zip(zf: zipfile.ZipFile) -> str | None:
    names = zf.namelist()
    # Prefer root-level Dockerfile
    for name in names:
        if Path(name).name == "Dockerfile" and name.count("/") <= 1:
            return name
    return None


# ---------------------------------------------------------------------------
# Static checks (no Docker)
# ---------------------------------------------------------------------------

_SECURITY_ERRORS = ["--privileged", "USER root"]


def _static_check(dockerfile_text: str) -> list[str]:
    errors: list[str] = []
    lines = dockerfile_text.splitlines()
    instructions = [l.strip() for l in lines if l.strip() and not l.strip().startswith("#")]

    if not any(l.upper().startswith("FROM") for l in instructions):
        errors.append("Dockerfile is missing a FROM instruction")

    for bad in _SECURITY_ERRORS:
        if any(bad in l for l in instructions):
            errors.append(f"Dockerfile contains disallowed instruction: {bad!r}")

    return errors


def _static_warnings(dockerfile_text: str) -> list[str]:
    warnings: list[str] = []
    lines = dockerfile_text.splitlines()
    instructions = [l.strip() for l in lines if l.strip() and not l.strip().startswith("#")]

    if not any(l.upper().startswith("EXPOSE") for l in instructions):
        warnings.append("No EXPOSE instruction — plugin contract requires an exposed port")
    if not any(l.upper().startswith("HEALTHCHECK") for l in instructions):
        warnings.append("No HEALTHCHECK instruction — consider adding one for orchestrator liveness checks")

    return warnings


# ---------------------------------------------------------------------------
# Docker build + push
# ---------------------------------------------------------------------------

def _build_and_push(build_context: str, dockerfile_bytes: bytes, result: ValidationResult) -> ValidationResult:
    tag = _generate_tag(dockerfile_bytes)

    build_proc = subprocess.run(
        ["docker", "build", "-t", tag, build_context],
        capture_output=True,
        text=True,
    )
    build_log = (build_proc.stdout + build_proc.stderr).strip()

    if build_proc.returncode != 0:
        result.build_log = build_log
        result.errors = [f"docker build failed: {_tail(build_log)}"]
        return result

    registry = os.environ.get("PLUGIN_REGISTRY", "")
    if registry:
        push_proc = subprocess.run(
            ["docker", "push", tag],
            capture_output=True,
            text=True,
        )
        build_log += "\n" + (push_proc.stdout + push_proc.stderr).strip()
        if push_proc.returncode != 0:
            result.build_log = build_log
            result.errors = [f"docker push failed: {_tail(push_proc.stdout + push_proc.stderr)}"]
            return result

    # Collect warnings from static analysis now that build passed
    dockerfile_text = dockerfile_bytes.decode("utf-8", errors="replace")
    result.warnings = _static_warnings(dockerfile_text)
    result.valid = True
    result.image_ref = tag
    result.build_log = build_log
    return result


def _generate_tag(content: bytes) -> str:
    digest = hashlib.sha256(content).hexdigest()[:8]
    uid = uuid.uuid4().hex[:8]
    registry = os.environ.get("PLUGIN_REGISTRY", "")
    base = f"{registry}/plugin-{uid}:{digest}" if registry else f"plugin-{uid}:{digest}"
    return base


def _tail(text: str, lines: int = 10) -> str:
    parts = [l for l in text.strip().splitlines() if l.strip()]
    return "\n".join(parts[-lines:])


# ---------------------------------------------------------------------------
# Registry login (call once at server startup)
# ---------------------------------------------------------------------------

def registry_login() -> None:
    registry = os.environ.get("PLUGIN_REGISTRY", "")
    username = os.environ.get("REGISTRY_USERNAME", "")
    password = os.environ.get("REGISTRY_PASSWORD", "")
    if not (registry and username and password):
        return
    subprocess.run(
        ["docker", "login", registry, "-u", username, "--password-stdin"],
        input=password,
        text=True,
        check=True,
    )
