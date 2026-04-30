"""Structured logging configuration for the FastAPI backend.

Configurable via env:
- LOG_LEVEL: DEBUG|INFO|WARNING|ERROR (default INFO)
- LOG_FORMAT: json|text (default json)

Adds request correlation IDs via a contextvar that the formatter injects
into every record. Middleware sets request_id for the duration of each
request; logs emitted outside a request still emit a "-" placeholder.

Sensitive-looking keys in structured `extra` fields are redacted before
serialization to avoid leaking tokens/credentials into logs.
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
import uuid
from contextvars import ContextVar
from typing import Any

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_SENSITIVE_KEY_PATTERN = re.compile(
    r"(?:^|[_-])(token|password|passwd|secret|authorization|api[_-]?key|access[_-]?key|cookie|credential)s?$",
    re.IGNORECASE,
)
_REDACTED = "***"


def _scrub(value: Any) -> Any:
    """Recursively redact values under sensitive-looking keys."""
    if isinstance(value, dict):
        return {
            k: (_REDACTED if _SENSITIVE_KEY_PATTERN.search(str(k)) else _scrub(v))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    if isinstance(value, tuple):
        return tuple(_scrub(v) for v in value)
    return value


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_var.get(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        # Anything passed via logger.info("...", extra={"foo": "bar"}) is merged.
        for key, value in record.__dict__.items():
            if key in payload or key in _LOG_RECORD_BUILTINS:
                continue
            if _SENSITIVE_KEY_PATTERN.search(str(key)):
                payload[key] = _REDACTED
            else:
                payload[key] = _scrub(value)
        return json.dumps(payload, default=str)


_LOG_RECORD_BUILTINS = frozenset(
    {
        "args", "asctime", "created", "exc_info", "exc_text", "filename",
        "funcName", "levelname", "levelno", "lineno", "message", "module",
        "msecs", "msg", "name", "pathname", "process", "processName",
        "relativeCreated", "stack_info", "thread", "threadName", "taskName",
    }
)


def configure_logging() -> None:
    """Install root-logger handlers based on env. Idempotent."""
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    fmt = os.environ.get("LOG_FORMAT", "json").lower()

    handler = logging.StreamHandler(sys.stdout)
    if fmt == "json":
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s",
                defaults={"request_id": "-"},
            )
        )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Tame noisy libraries by default; user can re-raise via LOG_LEVEL.
    logging.getLogger("uvicorn.access").setLevel(max(level, logging.INFO))


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Generate or propagate a request id on every request.

    Honors an inbound X-Request-ID header when present, otherwise mints a
    short UUID. The id is bound to the contextvar so log records emitted
    during the request carry it, and echoed in the response header.
    """

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["x-request-id"] = rid
        return response


def install(app: FastAPI) -> None:
    """Configure logging and attach request-id middleware to the app."""
    configure_logging()
    app.add_middleware(RequestIdMiddleware)


def configure_cors(app: FastAPI) -> None:
    """Attach CORSMiddleware with an explicit origin allowlist.

    Origins come from CORS_ALLOWED_ORIGINS (comma-separated). Default is
    http://localhost:3000 for local Next dev. A literal "*" is rejected
    because credentials cannot be combined with a wildcard origin.
    """
    from fastapi.middleware.cors import CORSMiddleware

    raw = os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    if "*" in origins:
        raise RuntimeError(
            "CORS_ALLOWED_ORIGINS contains '*'. Use an explicit allowlist; "
            "wildcard is incompatible with credentials and unsafe in prod."
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
