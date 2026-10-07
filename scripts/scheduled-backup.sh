#!/usr/bin/env bash
set -euo pipefail

: "${BRIOTAP_BACKUP_DIR:?Set BRIOTAP_BACKUP_DIR to a backup directory outside the checkout}"
exec bash scripts/stack-ops.sh backup "$BRIOTAP_BACKUP_DIR/daily-$(date -u +%Y%m%dT%H%M%SZ)"
