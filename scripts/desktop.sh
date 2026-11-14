#!/usr/bin/env bash
# One command to run Bob as a desktop app: Bob's Next server (the brain) plus the Electron app in dev mode.
# Usage: pnpm desktop   (or: bash scripts/desktop.sh)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
BUN_VERSION="1.4.2"

need() { command -v "$1" >/dev/null 2>&1; }

if ! need node; then
  echo "Node 24 is required: https://nodejs.org (or: brew install node@24)" >&2
  exit 1
fi
if ! need pnpm; then
  corepack enable pnpm
fi
if ! need bun || [ "$(bun --version)" != "$BUN_VERSION" ]; then
  echo "Installing bun $BUN_VERSION into ~/.bun"
  curl -fsSL https://bun.sh/install | bash -s "bun-v$BUN_VERSION"
  export PATH="$HOME/.bun/bin:$PATH"
fi

cd "$ROOT"
[ -d node_modules ] || pnpm install --frozen-lockfile
[ -f .env.local ] || echo "No .env.local: Bob's brain runs on the scripted sample. Add AI_GATEWAY_API_KEY to .env.local for the model brain."
(cd desktop && { [ -d node_modules ] || bun install --frozen-lockfile; })

PORT="$PORT" pnpm dev > "$ROOT/.desktop-brain.log" 2>&1 &
BRAIN=$!
trap 'kill $BRAIN 2>/dev/null' EXIT INT TERM

echo "Starting Bob's brain on http://localhost:$PORT (log: .desktop-brain.log)"
for _ in $(seq 1 60); do
  curl -sf "http://localhost:$PORT/api/state" >/dev/null && break
  sleep 1
done

cd desktop
BOB_URL="http://localhost:$PORT" bun run dev
