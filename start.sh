#!/usr/bin/env bash
# Launcher for the Swarm Web Engine local server (macOS / Linux).
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to run the local server."
  echo "Install it from https://nodejs.org/ then run this script again."
  exit 1
fi

echo "Starting the Swarm Web Engine local server..."
echo "A browser tab will open automatically. Press Ctrl+C to stop."
exec node scripts/serve.mjs --open
