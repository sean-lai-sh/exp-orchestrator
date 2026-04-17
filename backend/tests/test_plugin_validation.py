"""
Static validation unit tests — no Docker daemon required.
Build/push paths are covered by monkeypatching subprocess.run.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest

import plugin_validation
from plugin_validation import ValidationResult, validate_plugin_upload

VALID_DOCKERFILE = b"FROM python:3.11-slim\nEXPOSE 8080\nCMD [\"python\", \"main.py\"]\n"
MINIMAL_DOCKERFILE = b"FROM python:3.11-slim\nCMD [\"python\", \"main.py\"]\n"  # no EXPOSE


def _make_zip(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()


def _fake_build_success(tag: str):
    """Returns a monkeypatch factory that simulates successful docker build + push."""
    def fake_run(args: list[str], **_kwargs) -> SimpleNamespace:
        return SimpleNamespace(returncode=0, stdout=f"Successfully tagged {tag}", stderr="")
    return fake_run


# ---------------------------------------------------------------------------
# Dockerfile upload — static checks
# ---------------------------------------------------------------------------

class TestStaticChecks:
    def test_valid_dockerfile_passes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plugin_validation.subprocess, "run", _fake_build_success("test:abc"))
        result = validate_plugin_upload("Dockerfile", VALID_DOCKERFILE)
        assert result.errors == []

    def test_missing_from_is_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plugin_validation.subprocess, "run", _fake_build_success("test:abc"))
        result = validate_plugin_upload("Dockerfile", b"EXPOSE 8080\nCMD [\"python\", \"main.py\"]\n")
        assert any("FROM" in e for e in result.errors)
        assert result.valid is False
        assert result.image_ref is None

    def test_privileged_flag_is_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plugin_validation.subprocess, "run", _fake_build_success("test:abc"))
        dockerfile = b"FROM python:3.11-slim\nRUN --privileged apt-get install foo\n"
        result = validate_plugin_upload("Dockerfile", dockerfile)
        assert any("--privileged" in e for e in result.errors)
        assert result.valid is False

    def test_user_root_is_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plugin_validation.subprocess, "run", _fake_build_success("test:abc"))
        dockerfile = b"FROM python:3.11-slim\nUSER root\nCMD [\"python\", \"main.py\"]\n"
        result = validate_plugin_upload("Dockerfile", dockerfile)
        assert any("USER root" in e for e in result.errors)
        assert result.valid is False

    def test_missing_expose_is_warning_not_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plugin_validation.subprocess, "run", _fake_build_success("test:abc"))
        result = validate_plugin_upload("Dockerfile", MINIMAL_DOCKERFILE)
        assert result.errors == []
        assert result.valid is True
        assert any("EXPOSE" in w for w in result.warnings)

    def test_no_healthcheck_is_warning(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plugin_validation.subprocess, "run", _fake_build_success("test:abc"))
        result = validate_plugin_upload("Dockerfile", MINIMAL_DOCKERFILE)
        assert any("HEALTHCHECK" in w for w in result.warnings)

    def test_static_errors_short_circuit_before_docker(self, monkeypatch: pytest.MonkeyPatch) -> None:
        called = []
        monkeypatch.setattr(plugin_validation.subprocess, "run", lambda *a, **k: called.append(a))
        validate_plugin_upload("Dockerfile", b"EXPOSE 8080\n")  # no FROM → static error
        assert called == [], "docker must not be invoked when static checks fail"


# ---------------------------------------------------------------------------
# Zip upload
# ---------------------------------------------------------------------------

class TestZipUpload:
    def test_zip_with_root_dockerfile_passes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plugin_validation.subprocess, "run", _fake_build_success("test:abc"))
        content = _make_zip({"Dockerfile": VALID_DOCKERFILE, "main.py": b"print('hello')"})
        result = validate_plugin_upload("plugin.zip", content)
        assert result.detected_type == "directory"
        assert result.errors == []
        assert result.valid is True

    def test_zip_with_nested_dockerfile_passes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plugin_validation.subprocess, "run", _fake_build_success("test:abc"))
        content = _make_zip({"myplugin/Dockerfile": VALID_DOCKERFILE, "myplugin/main.py": b""})
        result = validate_plugin_upload("plugin.zip", content)
        assert result.valid is True

    def test_zip_without_dockerfile_is_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plugin_validation.subprocess, "run", _fake_build_success("test:abc"))
        content = _make_zip({"main.py": b"print('hello')"})
        result = validate_plugin_upload("plugin.zip", content)
        assert any("Dockerfile" in e for e in result.errors)
        assert result.valid is False

    def test_invalid_zip_bytes_is_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plugin_validation.subprocess, "run", _fake_build_success("test:abc"))
        result = validate_plugin_upload("plugin.zip", b"this is not a zip")
        assert any("zip" in e.lower() for e in result.errors)
        assert result.valid is False


# ---------------------------------------------------------------------------
# Build failure surfacing
# ---------------------------------------------------------------------------

class TestBuildFailure:
    def test_build_failure_returns_log_and_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def fake_run(args: list[str], **_kwargs) -> SimpleNamespace:
            return SimpleNamespace(returncode=1, stdout="", stderr="COPY failed: file not found")

        monkeypatch.setattr(plugin_validation.subprocess, "run", fake_run)
        result = validate_plugin_upload("Dockerfile", VALID_DOCKERFILE)
        assert result.valid is False
        assert result.image_ref is None
        assert any("docker build failed" in e for e in result.errors)
        assert "file not found" in result.build_log

    def test_successful_build_returns_image_ref(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(plugin_validation.subprocess, "run", _fake_build_success("test:abc"))
        result = validate_plugin_upload("Dockerfile", VALID_DOCKERFILE)
        assert result.valid is True
        assert result.image_ref is not None
        assert ":" in result.image_ref
