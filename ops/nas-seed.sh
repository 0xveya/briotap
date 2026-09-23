#!/usr/bin/env bash
set -euo pipefail

data=/srv/dev-disk-by-uuid-5aef6871-c178-4eba-a09c-22b258f91e50/briotap
if [[ -e "$data/enrichment-cursor.json" ]]; then
  printf 'NAS enrichment already started; use mise run nas-prioritize to reorder pending paths\n' >&2
  exit 1
fi
rm -f "$data/module-paths.txt.next"
jq -r .Path "$data/module-index.jsonl" |
  LC_ALL=C sort -u -S 4G --parallel=4 -T "$data" > "$data/module-paths.txt.next"
mv "$data/module-paths.txt.next" "$data/module-paths.txt"
node /opt/briotap/reorder-enrichment.mjs "$data" /opt/briotap/popular-purls.json /opt/briotap/priority-modules.txt
systemctl start briotap-enrich.service
