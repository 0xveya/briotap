#!/usr/bin/env bash
set -euo pipefail

temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
bun build scripts/worker.ts --target=node --outfile="$temporary/worker.mjs"
rsync -av "$temporary/worker.mjs" nas:/opt/briotap/worker.mjs
rsync -av ops/briotap-worker.service nas:/etc/systemd/system/briotap-worker.service
ssh -o BatchMode=yes nas 'node -e '\''require("node:sqlite")'\'' && systemctl disable --now briotap-enrich.service && systemctl daemon-reload && systemctl enable briotap-worker.service && systemctl restart briotap-worker.service && systemctl status briotap-worker.service --no-pager'
