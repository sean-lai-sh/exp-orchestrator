"""Tests for structured logging, request-id propagation, and CORS allowlist."""
from __future__ import annotations

import json
import logging
import os
from io import StringIO

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from logging_config import (
    _JsonFormatter,
    _scrub,
    configure_cors,
    install,
    request_id_var,
)


def test_scrub_redacts_top_level_sensitive_keys():
    assert _scrub({"token": "abc", "ok": "fine"}) == {"token": "***", "ok": "fine"}


def test_scrub_redacts_nested_sensitive_keys():
    payload = {
        "outer": {"api_key": "k", "value": 1},
        "items": [{"password": "p", "name": "x"}],
    }
    assert _scrub(payload) == {
        "outer": {"api_key": "***", "value": 1},
        "items": [{"password": "***", "name": "x"}],
    }


def test_scrub_handles_authorization_and_secret_variants():
    payload = {
        "Authorization": "Bearer xyz",
        "API-KEY": "k",
        "client_secret": "s",
        "access_token": "t",
        "tokens": "v",  # plural still matches
    }
    scrubbed = _scrub(payload)
    assert all(v == "***" for v in scrubbed.values())


def test_scrub_does_not_redact_innocuous_keys():
    payload = {"node_id": "n1", "count": 3, "tokenizer_name": "unrelated"}
    assert _scrub(payload) == payload


def test_scrub_redacts_keywords_when_separator_follows():
    # Keywords with a separator on the trailing side should also redact, e.g.
    # `password_hash`, `token_id`, `secret_value`.
    payload = {
        "password_hash": "h",
        "token_id": "t",
        "secret_value": "s",
        "api_key_v2": "k",
    }
    scrubbed = _scrub(payload)
    assert all(v == "***" for v in scrubbed.values())


def test_json_formatter_redacts_sensitive_extra_fields():
    formatter = _JsonFormatter()
    record = logging.LogRecord(
        name="test", level=logging.INFO, pathname=__file__, lineno=1,
        msg="hello", args=(), exc_info=None,
    )
    record.token = "secret-value"  # type: ignore[attr-defined]
    record.payload = {"password": "p", "ok": "v"}  # type: ignore[attr-defined]
    out = json.loads(formatter.format(record))
    assert out["token"] == "***"
    assert out["payload"] == {"password": "***", "ok": "v"}
    assert out["msg"] == "hello"


def test_request_id_middleware_round_trips_header():
    app = FastAPI()
    install(app)

    @app.get("/echo")
    def echo():
        return {"rid": request_id_var.get()}

    with TestClient(app) as client:
        r = client.get("/echo")
        assert r.status_code == 200
        rid_header = r.headers["x-request-id"]
        assert r.json()["rid"] == rid_header
        assert len(rid_header) >= 8


def test_request_id_middleware_honors_inbound_header():
    app = FastAPI()
    install(app)

    @app.get("/echo")
    def echo():
        return {"rid": request_id_var.get()}

    with TestClient(app) as client:
        r = client.get("/echo", headers={"X-Request-ID": "fixed-id-123"})
        assert r.headers["x-request-id"] == "fixed-id-123"
        assert r.json()["rid"] == "fixed-id-123"


@pytest.mark.parametrize(
    "malicious",
    [
        "bad id with spaces",
        "newline\ninjected",
        "ansi\x1b[31mred",
        "x" * 200,  # too long
        "drop;table",
        "",  # empty after strip
    ],
)
def test_request_id_middleware_rejects_malicious_inbound(malicious):
    app = FastAPI()
    install(app)

    @app.get("/echo")
    def echo():
        return {"rid": request_id_var.get()}

    with TestClient(app) as client:
        r = client.get("/echo", headers={"X-Request-ID": malicious})
        # The malicious value must not be reflected; a fresh id is minted.
        rid = r.headers["x-request-id"]
        assert rid != malicious
        assert "\n" not in rid and "\x1b" not in rid
        assert len(rid) <= 64
        assert r.json()["rid"] == rid


def test_configure_cors_rejects_wildcard(monkeypatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "*")
    app = FastAPI()
    with pytest.raises(RuntimeError, match="wildcard"):
        configure_cors(app)


def test_configure_cors_applies_explicit_origins(monkeypatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://app.example.com,http://localhost:3000")
    app = FastAPI()
    configure_cors(app)

    @app.get("/ping")
    def ping():
        return {"ok": True}

    with TestClient(app) as client:
        # Allowed origin
        r = client.options(
            "/ping",
            headers={
                "Origin": "https://app.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert r.headers.get("access-control-allow-origin") == "https://app.example.com"

        # Disallowed origin: middleware does not echo allow-origin back.
        r = client.options(
            "/ping",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert r.headers.get("access-control-allow-origin") != "https://evil.example.com"
