#!/usr/bin/env python3
"""
Corelink pub/sub integration test:
  publisher -> Corelink server -> subscriber

Validates that the Dockerized Corelink primitives can establish
end-to-end pub/sub communication using the same env var contract
that deployment.py generates.

Install color support in dev only:
  pip install -r backend/requirements-dev.txt
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Dict, List

try:
    from colorama import Fore, Style, init as colorama_init
except ImportError:
    class _NoColor:
        BLACK = RED = GREEN = YELLOW = BLUE = MAGENTA = CYAN = WHITE = RESET_ALL = ""

    def colorama_init(*_args, **_kwargs) -> None:
        return None

    Fore = Style = _NoColor()  # type: ignore[assignment]

colorama_init(autoreset=True)


CORELINK_TEST_DIR = Path(__file__).resolve().parent.parent / "docker_images" / "corelink_test"
CERTS_DIR = CORELINK_TEST_DIR / "certs"
CORELINK_SERVER_PATH = os.environ.get("CORELINK_SERVER_PATH", str(Path.home() / "corelink-server"))
NETWORK = "corelink-test-net"

TEST_NODES: Dict[str, Dict] = {
    "corelink-server": {
        "image": "corelink-server-test",
        "is_server": True,
        "host_port": 20012,
        "container_port": 20012,
        "env_vars": {},
    },
    "subscriber": {
        "image": "corelink-test-subscriber",
        "is_server": True,
        "host_port": 3011,
        "container_port": 3000,
        "env_vars": {
            "CORELINK_HOST": "corelink-server",
            "CORELINK_PORT": "20012",
            "CORELINK_USERNAME": "Testuser",
            "CORELINK_PASSWORD": "Testpassword",
            "NODE_ID": "subscriber-1",
            "IN_JSON_WORKSPACE": "test-workspace",
            "IN_JSON_PROTOCOL": "ws",
            "CA_PATH": "/app/certs/ca-crt.pem",
        },
    },
    "publisher": {
        "image": "corelink-test-publisher",
        "is_server": True,
        "host_port": 3010,
        "container_port": 3000,
        "env_vars": {
            "CORELINK_HOST": "corelink-server",
            "CORELINK_PORT": "20012",
            "CORELINK_USERNAME": "admin",
            "CORELINK_PASSWORD": "Testpassword",
            "NODE_ID": "publisher-1",
            "OUT_JSON_WORKSPACE": "test-workspace",
            "OUT_JSON_PROTOCOL": "ws",
            "CA_PATH": "/app/certs/ca-crt.pem",
        },
    },
}


def _color(level: str) -> str:
    if level == "OK":
        return Fore.GREEN
    if level == "WARN":
        return Fore.YELLOW
    if level == "FAIL":
        return Fore.RED
    if level == "STEP":
        return Fore.CYAN
    return ""


def _status(level: str, label: str, detail: str = "") -> None:
    color = _color(level)
    reset = Style.RESET_ALL
    suffix = f" | {detail}" if detail else ""
    print(f"{color}[{level}] {label}{suffix}{reset}")


def _tail(text: str, lines: int = 8) -> str:
    parts = [line for line in text.strip().splitlines() if line.strip()]
    return "\n".join(parts[-lines:]) if parts else ""


def _run(cmd: List[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if check and result.returncode != 0:
        stderr_tail = _tail(result.stderr)
        stdout_tail = _tail(result.stdout)
        extra = stderr_tail or stdout_tail or "No command output available."
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(cmd)}\n{extra}")
    return result


def _container_name(node_id: str) -> str:
    return f"corelink-test-{node_id.replace('_', '-')}"


def _wait_for_health(url: str, node_id: str, timeout: int = 30) -> bool:
    for _ in range(timeout):
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    _status("OK", f"{node_id} health", url)
                    return True
        except Exception:
            pass
        time.sleep(1)
    _status("FAIL", f"{node_id} health timeout", url)
    return False


def generate_certs() -> None:
    if (CERTS_DIR / "ca-crt.pem").exists() and (CERTS_DIR / "server-crt.pem").exists():
        _status("OK", "Certs exist", str(CERTS_DIR))
        return
    _status("STEP", "Generating certs")
    _run([str(CERTS_DIR / "generate-certs.sh")])
    _status("OK", "Certs generated")


def build_images() -> None:
    _status("STEP", "Building Corelink server image")
    _run([
        "docker", "build",
        "-t", TEST_NODES["corelink-server"]["image"],
        "-f", str(CORELINK_TEST_DIR / "server" / "Dockerfile"),
        "--build-context", f"certs={CERTS_DIR}",
        "--build-context", f"server-config={CORELINK_TEST_DIR / 'server'}",
        CORELINK_SERVER_PATH,
    ])
    _status("OK", "Server image built")

    _status("STEP", "Building publisher image")
    _run([
        "docker", "build",
        "-t", TEST_NODES["publisher"]["image"],
        "-f", str(CORELINK_TEST_DIR / "publisher" / "Dockerfile"),
        str(CORELINK_TEST_DIR),
    ])
    _status("OK", "Publisher image built")

    _status("STEP", "Building subscriber image")
    _run([
        "docker", "build",
        "-t", TEST_NODES["subscriber"]["image"],
        "-f", str(CORELINK_TEST_DIR / "subscriber" / "Dockerfile"),
        str(CORELINK_TEST_DIR),
    ])
    _status("OK", "Subscriber image built")


def deploy() -> None:
    existing = _run(
        ["docker", "network", "ls", "--filter", f"name=^{NETWORK}$", "--format", "{{.Name}}"]
    )
    if NETWORK not in existing.stdout.split():
        _run(["docker", "network", "create", NETWORK])
        _status("OK", "Network created", NETWORK)
    else:
        _status("OK", "Network reused", NETWORK)

    # Start server first
    node_id = "corelink-server"
    node = TEST_NODES[node_id]
    cname = _container_name(node_id)
    _run(["docker", "rm", "-f", cname], check=False)
    cmd = [
        "docker", "run", "-d",
        "--name", cname,
        "--network", NETWORK,
        "-p", f"{node['host_port']}:{node['container_port']}",
        "-v", f"{CERTS_DIR / 'ca-crt.pem'}:/app/config/ca-crt.pem:ro",
        "-v", f"{CERTS_DIR / 'ca-key.pem'}:/app/config/ca-key.pem:ro",
        "-v", f"{CERTS_DIR / 'server-key.pem'}:/app/config/server-key.pem:ro",
        "-v", f"{CERTS_DIR / 'server-crt.pem'}:/app/config/server-crt.pem:ro",
        "-v", f"{CORELINK_TEST_DIR / 'server' / 'default.json5'}:/app/config/default.json5:ro",
        node["image"],
    ]
    _run(cmd)
    _status("OK", f"Container up: {node_id}", cname)

    # Wait for server health (TCP probe on control port)
    _status("STEP", "Waiting for Corelink server")
    time.sleep(5)
    for attempt in range(1, 31):
        try:
            import socket
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2)
            s.connect(("127.0.0.1", 20012))
            s.close()
            _status("OK", "Corelink server ready", f"port 20012 (attempt {attempt})")
            break
        except Exception:
            if attempt == 30:
                _status("FAIL", "Corelink server not ready after 30 attempts")
                return
            time.sleep(1)

    # Start subscriber before publisher so it's listening first
    for node_id in ["subscriber", "publisher"]:
        node = TEST_NODES[node_id]
        cname = _container_name(node_id)
        _run(["docker", "rm", "-f", cname], check=False)
        cmd = [
            "docker", "run", "-d",
            "--name", cname,
            "--network", NETWORK,
            "-p", f"{node['host_port']}:{node['container_port']}",
            "-v", f"{CERTS_DIR}:/app/certs:ro",
        ]
        for key, value in node["env_vars"].items():
            cmd += ["-e", f"{key}={value}"]
        cmd.append(node["image"])
        _run(cmd)
        _status("OK", f"Container up: {node_id}", cname)


def run_chain_test() -> bool:
    _status("STEP", "Test", "publisher -> Corelink server -> subscriber")
    try:
        generate_certs()
        build_images()
        deploy()

        # Wait for subscriber health
        if not _wait_for_health("http://127.0.0.1:3011/health", "subscriber", timeout=30):
            return False

        # Wait for publisher health
        if not _wait_for_health("http://127.0.0.1:3010/health", "publisher", timeout=30):
            return False

        # Poll subscriber status until messages are received
        _status("STEP", "Polling subscriber for received messages")
        for attempt in range(1, 31):
            try:
                with urllib.request.urlopen("http://127.0.0.1:3011/status", timeout=2) as response:
                    body = json.loads(response.read())
                    received = body.get("messagesReceived", 0)
                    if received > 0:
                        _status("OK", "Subscriber received messages",
                                f"count={received}, last={json.dumps(body.get('lastMessage', {}))} (attempt {attempt})")
                        return True
            except Exception:
                pass
            _status("WARN", "Subscriber status", f"messagesReceived=0 (attempt {attempt}/30)")
            time.sleep(2)

        _status("FAIL", "Subscriber did not receive messages in time")
        return False
    except Exception as exc:
        _status("FAIL", "Unhandled error", str(exc))
        return False
    finally:
        _status("STEP", "Dumping container logs")
        for node_id in TEST_NODES:
            cname = _container_name(node_id)
            logs = _run(["docker", "logs", "--tail", "20", cname], check=False)
            if logs.stdout.strip():
                print(f"  --- {cname} ---")
                print(logs.stdout.strip())

        _status("STEP", "Cleanup")
        for node_id in TEST_NODES:
            _run(["docker", "rm", "-f", _container_name(node_id)], check=False)
        _run(["docker", "network", "rm", NETWORK], check=False)
        _status("STEP", "Cleanup", "containers + network removed")


if __name__ == "__main__":
    ok = run_chain_test()
    if ok:
        _status("OK", "TEST PASSED")
        sys.exit(0)
    _status("FAIL", "TEST FAILED")
    sys.exit(1)
