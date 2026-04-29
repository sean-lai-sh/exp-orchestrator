#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
fi

source .venv/bin/activate
pip install -q -r requirements.txt

# NATS broker. NATS_HOST is what the backend uses to reach NATS itself.
# NATS_PUBLIC_HOST is what plugin containers (in Docker) and host-side scripts
# get injected/returned — defaults to host.docker.internal so plugins can
# reach the same broker the backend talks to over localhost.
export NATS_HOST="${NATS_HOST:-localhost}"
export NATS_PUBLIC_HOST="${NATS_PUBLIC_HOST:-host.docker.internal}"
export NATS_PORT="${NATS_PORT:-4222}"
export NATS_TOKEN="${NATS_TOKEN:-}"

uvicorn main:app --reload --port "${PORT:-8000}"
