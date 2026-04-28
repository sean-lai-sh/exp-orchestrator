#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  npm install --silent
fi

exec node sender.js "$@"
