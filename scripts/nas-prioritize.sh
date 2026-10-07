#!/usr/bin/env bash
set -euo pipefail

ssh -o BatchMode=yes nas 'test ! -e /srv/dev-disk-by-uuid-5aef6871-c178-4eba-a09c-22b258f91e50/briotap/enrichment-worker.sqlite' || {
  echo 'The durable worker owns the queue; do not reorder its backfill file.' >&2
  exit 1
}

temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
bun build scripts/reorder-enrichment.ts --target=node --outfile="$temporary/reorder-enrichment.mjs"
curl --fail --location --retry 3 --silent --show-error --output "$temporary/popular-purls.json" \
  https://raw.githubusercontent.com/aboutcode-org/popular-package-purls/main/popular-purls.json

rsync -av "$temporary/reorder-enrichment.mjs" nas:/opt/briotap/reorder-enrichment.mjs
rsync -av "$temporary/popular-purls.json" nas:/opt/briotap/popular-purls.json
rsync -av ops/priority-modules.txt nas:/opt/briotap/priority-modules.txt
ssh -o BatchMode=yes nas 'systemctl stop briotap-enrich.service; result=0; node /opt/briotap/reorder-enrichment.mjs /srv/dev-disk-by-uuid-5aef6871-c178-4eba-a09c-22b258f91e50/briotap /opt/briotap/popular-purls.json /opt/briotap/priority-modules.txt || result=$?; systemctl start briotap-enrich.service; exit "$result"'
