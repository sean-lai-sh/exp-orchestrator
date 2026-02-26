#!/usr/bin/env python3
"""
Status-oriented chain integration test:
  js_client -> POST /check -> service_a -> POST /good -> service_b

Runs quietly (no raw docker command echo) and prints colored statuses.
Install color support in dev only:
  pip install -r backend/requirements-dev.txt
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

from dag import topological_order

try:
    from colorama import Fore, Style, init as colorama_init
except ImportError:  # optional dev dependency
    class _NoColor:
        BLACK = RED = GREEN = YELLOW = BLUE = MAGENTA = CYAN = WHITE = RESET_ALL = ""

    def colorama_init(*_args, **_kwargs) -> None:
        return None

    Fore = Style = _NoColor()  # type: ignore[assignment]

colorama_init(autoreset=True)


IMAGES_DIR = Path(__file__).resolve().parent.parent / "docker_images" / "test_images"
NETWORK = "test-chain-net"


TEST_NODES: Dict[str, Dict] = {
    "js_client": {
        "image": "test-js-client",
        "context": str(IMAGES_DIR / "js_client"),
        "is_server": False,
        "status": "online",
        "env_vars": {"TARGET_URL": "http://test-chain-service-a:3000"},
    },
    "service_a": {
        "image": "test-service-a",
        "context": str(IMAGES_DIR / "service_a"),
        "is_server": True,
        "host_port": 3001,
        "container_port": 3000,
        "status": "online",
        "env_vars": {"NEXT_SERVICE_URL": "http://test-chain-service-b:3000"},
    },
    "service_b": {
        "image": "test-service-b",
        "context": str(IMAGES_DIR / "service_b"),
        "is_server": True,
        "host_port": 3002,
        "container_port": 3000,
        "status": "online",
        "env_vars": {},
    },
}


@dataclass
class _Edge:
    src: str
    dst: str


TEST_EDGES: List[_Edge] = [
    _Edge(src="js_client", dst="service_a"),
    _Edge(src="service_a", dst="service_b"),
]


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
    return f"test-chain-{node_id.replace('_', '-')}"


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


def analyze_dag() -> Tuple[List[str], Dict[str, Dict[str, str]]]:
    offline = [node_id for node_id, node in TEST_NODES.items() if node.get("status") != "online"]
    if offline:
        raise RuntimeError(f"Deploy blocked; offline nodes: {offline}")

    _status("OK", "DAG gate", "all nodes online")
    topo_order, _graph = topological_order(list(TEST_NODES.keys()), TEST_EDGES)
    _status("OK", "Topological order", " -> ".join(topo_order))

    node_env_vars = {node_id: TEST_NODES[node_id].get("env_vars", {}) for node_id in TEST_NODES}
    for node_id, env in node_env_vars.items():
        _status("STEP", f"Seeded env vars: {node_id}", json.dumps(env))
    return topo_order, node_env_vars


def deploy(topo_order: List[str], node_env_vars: Dict[str, Dict[str, str]]) -> Dict[str, str]:
    existing = _run(
        ["docker", "network", "ls", "--filter", f"name=^{NETWORK}$", "--format", "{{.Name}}"]
    )
    if NETWORK not in existing.stdout.split():
        _run(["docker", "network", "create", NETWORK])
        _status("OK", "Network created", NETWORK)
    else:
        _status("OK", "Network reused", NETWORK)

    for node_id, node in TEST_NODES.items():
        _run(["docker", "build", "-t", node["image"], node["context"]])
        _status("OK", f"Image built: {node_id}", node["image"])

    server_start_order = [node_id for node_id in reversed(topo_order) if TEST_NODES[node_id]["is_server"]]
    _status("STEP", "Server start order", " -> ".join(server_start_order))

    for node_id in server_start_order:
        node = TEST_NODES[node_id]
        cname = _container_name(node_id)
        evars = node_env_vars[node_id]

        _run(["docker", "rm", "-f", cname], check=False)
        cmd = [
            "docker",
            "run",
            "-d",
            "--name",
            cname,
            "--network",
            NETWORK,
            "-p",
            f"{node['host_port']}:{node['container_port']}",
        ]
        for key, value in evars.items():
            cmd += ["-e", f"{key}={value}"]
        cmd.append(node["image"])

        run_res = _run(cmd)
        container_id = run_res.stdout.strip()[:12]
        _status("OK", f"Container up: {node_id}", f"{cname} ({container_id})")

    return {node_id: _container_name(node_id) for node_id in TEST_NODES}


def run_chain_test() -> bool:
    _status("STEP", "Test", "js_client -> /check -> service_a -> /good -> service_b")
    try:
        topo_order, node_env_vars = analyze_dag()
        deploy(topo_order, node_env_vars)

        for node_id, node in TEST_NODES.items():
            if not node["is_server"]:
                continue
            if not _wait_for_health(f"http://127.0.0.1:{node['host_port']}/health", node_id):
                return False

        js_node = TEST_NODES["js_client"]
        js_cmd = ["docker", "run", "--rm", "--name", _container_name("js_client"), "--network", NETWORK]
        for key, value in node_env_vars["js_client"].items():
            js_cmd += ["-e", f"{key}={value}"]
        js_cmd.append(js_node["image"])

        js_run = _run(js_cmd, check=False)
        if js_run.returncode != 0:
            _status("FAIL", "js_client execution", _tail(js_run.stderr) or "non-zero exit")
            return False
        _status("OK", "js_client execution", "POST /check returned 200")

        status_url = f"http://127.0.0.1:{TEST_NODES['service_b']['host_port']}/status"
        for attempt in range(1, 16):
            try:
                with urllib.request.urlopen(status_url, timeout=2) as response:
                    body = json.loads(response.read())
                    if body.get("received"):
                        _status("OK", "service_b status", f"received=true (attempt {attempt})")
                        return True
            except Exception:
                pass
            _status("WARN", "service_b status", f"received=false (attempt {attempt}/15)")
            time.sleep(1)

        _status("FAIL", "service_b status", "did not receive /good in time")
        return False
    except Exception as exc:
        _status("FAIL", "Unhandled error", str(exc))
        return False
    finally:
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
