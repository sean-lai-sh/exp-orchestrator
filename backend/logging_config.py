"""Structured logging configuration for the FastAPI backend.

Configurable via env:
- LOG_LEVEL: DEBUG|INFO|WARNING|ERROR (default INFO)
- LOG_FORMAT: json|text (default json)

Adds request correlation IDs via a contextvar that the formatter injects
into every record. Middleware sets request_id for the duration of each
request; logs emitted outside a request still emit a "-" placeholder.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import uuid
from contextvars import ContextVar

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


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
            payload[key] = value
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
