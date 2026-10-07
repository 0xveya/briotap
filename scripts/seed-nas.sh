#!/usr/bin/env bash
set -euo pipefail

nas_data=/srv/dev-disk-by-uuid-5aef6871-c178-4eba-a09c-22b258f91e50/briotap
ssh -o BatchMode=yes nas "test ! -e '$nas_data/enrichment-cursor.json' && test ! -e '$nas_data/enrichment-worker.sqlite' && mkdir -p '$nas_data' /opt/briotap"

temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
bun build scripts/collect-enrichment.ts --target=node --outfile="$temporary/collect-enrichment.mjs"
bun build scripts/reorder-enrichment.ts --target=node --outfile="$temporary/reorder-enrichment.mjs"
curl --fail --location --retry 3 --silent --show-error --output "$temporary/popular-purls.json" \
  https://raw.githubusercontent.com/aboutcode-org/popular-package-purls/main/popular-purls.json

rsync -av --partial --append-verify data/module-index.jsonl "nas:$nas_data/module-index.jsonl"
rsync -av "$temporary/collect-enrichment.mjs" nas:/opt/briotap/collect-enrichment.mjs
rsync -av "$temporary/reorder-enrichment.mjs" nas:/opt/briotap/reorder-enrichment.mjs
rsync -av "$temporary/popular-purls.json" nas:/opt/briotap/popular-purls.json
rsync -av ops/nas-seed.sh nas:/opt/briotap/seed.sh
rsync -av ops/priority-modules.txt nas:/opt/briotap/priority-modules.txt
rsync -av ops/briotap-nas-seed.service nas:/etc/systemd/system/briotap-nas-seed.service
rsync -av ops/briotap-enrich.service nas:/etc/systemd/system/briotap-enrich.service
ssh -o BatchMode=yes nas 'systemctl daemon-reload && systemctl enable briotap-enrich.service && systemctl start --no-block briotap-nas-seed.service'
