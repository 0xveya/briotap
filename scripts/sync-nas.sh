#!/usr/bin/env bash
set -euo pipefail

mkdir -p data
exec 9>data/enrichment-import.lock
flock --nonblock 9 || { echo 'An enrichment import is already running; retry after it finishes.' >&2; exit 1; }
bash scripts/pull-enrichment.sh
if [[ -f data/module-updates.jsonl ]]; then
  bun scripts/import-index.ts --input=data/module-updates.jsonl --source=nas-module-updates
fi
bun scripts/import-enrichment.ts
