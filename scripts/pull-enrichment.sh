#!/usr/bin/env bash
set -euo pipefail

nas_data=/srv/dev-disk-by-uuid-5aef6871-c178-4eba-a09c-22b258f91e50/briotap
mkdir -p data
rsync -av --append-verify "nas:$nas_data/module-enrichment.jsonl" data/module-enrichment.jsonl
