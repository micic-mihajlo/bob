#!/usr/bin/env bash
# Runs the single-request live flow N times back to back, each on fresh state, through merge.
# Usage: scripts/live-ten.sh <out-dir> [n]
set -u
out=${1:?out dir}; n=${2:-10}
mkdir -p "$out"
for i in $(seq 1 "$n"); do
  BOB_LIVE_MERGE=1 BOB_LIVE_OUT="$out/run-$i.json" pnpm exec vitest run --config vitest.live.config.ts live-run > "$out/run-$i.log" 2>&1
  echo "run $i exit $?" >> "$out/status.txt"
done
