#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
fi

source .venv/bin/activate
pip install -q -r requirements.txt

# Corelink integration. Provisioning credentials come back from the corelink-server's
# /api/provision response — we don't carry CORELINK_USERNAME/PASSWORD here.
export CORELINK_HOST="${CORELINK_HOST:-host.docker.internal}"
export CORELINK_PORT="${CORELINK_PORT:-20012}"
export CORELINK_PROVISION_TOKEN="${CORELINK_PROVISION_TOKEN:-test-token}"

uvicorn main:app --reload --port "${PORT:-8000}"
