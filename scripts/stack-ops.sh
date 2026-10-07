#!/usr/bin/env bash
set -euo pipefail
umask 077

# Run on the deployment host, from the project root.
export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-briotap}
compose=(docker compose)
usage() {
  echo 'Usage: bash scripts/stack-ops.sh status | backup <new-directory> | restore <backup-directory>' >&2
  exit 2
}
[[ $# -ge 1 ]] || usage
case "$1" in
  status)
    [[ $# == 1 ]] || usage
    "${compose[@]}" ps -a
    running=$("${compose[@]}" ps --status running --services)
    for service in postgres app scraper importer; do
      case $'\n'"$running"$'\n' in
        *$'\n'"$service"$'\n'*) ;;
        *) echo "$service is not running; inspect docker compose logs $service." >&2; exit 1 ;;
      esac
    done
    "${compose[@]}" exec -T scraper bun scripts/worker.ts data --status
    "${compose[@]}" exec -T postgres psql -U briotap -d briotap -c 'SELECT * FROM import_cursors ORDER BY source;'
    "${compose[@]}" exec -T scraper bun -e '
      import { WorkerStore } from "./scripts/lib/worker-store.ts";
      const store = new WorkerStore("data/enrichment-worker.sqlite", true);
      try {
        const heartbeat = store.get("heartbeat");
        if (!heartbeat || !Number.isFinite(Date.parse(heartbeat)) || Date.now() - Date.parse(heartbeat) > 600000) {
          throw new Error("Scraper heartbeat is missing or older than 10 minutes; inspect scraper logs and its discovery/backfill progress.");
        }
      } finally { store.close(); }
    '
    cursors=$("${compose[@]}" exec -T postgres psql -U briotap -d briotap -At -F '|' -c 'SELECT source, "offset", floor(extract(epoch FROM now() - updated_at))::bigint FROM import_cursors;')
    lagged=false
    while IFS='|' read -r source offset age; do
      case "$source" in
        go-module-index) file=module-index.jsonl ;;
        nas-module-updates) file=module-updates.jsonl ;;
        nas-enrichment) file=module-enrichment.jsonl ;;
        *) continue ;;
      esac
      bytes=$("${compose[@]}" exec -T scraper sh -c 'if [ -f "data/$1" ]; then stat -c %s "data/$1"; else echo 0; fi' sh "$file")
      if (( bytes > offset && age > 600 )); then
        echo "Importer has unread $file bytes and its cursor has not advanced for over 10 minutes; inspect importer logs." >&2
        lagged=true
      fi
    done <<< "$cursors"
    if "$lagged"; then exit 1; fi
    "${compose[@]}" exec -T scraper df -h /app/data /app/budget
    "${compose[@]}" exec -T scraper bun -e '
      import { statfs } from "node:fs/promises";
      for (const directory of ["/app/data", "/app/budget"]) {
        const space = await statfs(directory);
        if (space.blocks > 0 && space.bavail / space.blocks < 0.1)
          throw new Error(`${directory} has less than 10% disk space available; inspect disk usage before continuing ingestion.`);
      }
    '
    ;;
  backup)
    [[ $# == 2 ]] || usage
    destination=$2
    [[ ! -e "$destination" ]] || { echo 'Backup destination must not already exist.' >&2; exit 1; }
    mkdir -p "$destination"
    destination=$(cd "$destination" && pwd)
    running=$("${compose[@]}" ps --status running --services)
    writers=()
    for service in scraper importer; do
      case $'\n'"$running"$'\n' in
        *$'\n'"$service"$'\n'*) writers+=("$service") ;;
      esac
    done
    restart_writers() {
      if (( ${#writers[@]} )); then "${compose[@]}" start "${writers[@]}" >&2; fi
    }
    trap restart_writers EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    if (( ${#writers[@]} )); then "${compose[@]}" stop "${writers[@]}"; fi
    "${compose[@]}" exec -T postgres pg_dump -U briotap -d briotap -Fc > "$destination/database.dump"
    # Hash retained prefixes instead of duplicating potentially huge append-only files.
    "${compose[@]}" run --rm -T --no-deps scraper bash -c '
      set -euo pipefail
      cd /app/data
      for file in module-index.jsonl module-updates.jsonl module-enrichment.jsonl module-paths.txt; do
        if [[ -f "$file" ]]; then
          bytes=$(stat -c %s "$file")
          hash=$(sha256sum "$file")
          printf "%s %s %s\n" "$bytes" "${hash%% *}" "$file"
        fi
      done
    ' > "$destination/history.manifest"
    for file in enrichment-worker.sqlite enrichment-worker.sqlite-wal enrichment-worker.sqlite-shm enrichment-cursor.json; do
      if "${compose[@]}" run --rm -T --no-deps scraper test -f "/app/data/$file"; then
        "${compose[@]}" cp "scraper:/app/data/$file" "$destination/$file"
      fi
    done
    if [[ -n ${BRIOTAP_HISTORY_BACKUP_DIR:-} ]]; then
      mkdir -p "$BRIOTAP_HISTORY_BACKUP_DIR"
      history=$(cd "$BRIOTAP_HISTORY_BACKUP_DIR" && pwd)
      "${compose[@]}" run --rm -T --no-deps -v "$history:/history-backup" scraper \
        rsync -rt --append-verify --fsync --include='/module-index.jsonl' --include='/module-updates.jsonl' \
          --include='/module-enrichment.jsonl' --include='/module-paths.txt' --exclude='*' /app/data/ /history-backup/
      printf '%s\n' "$history" > "$destination/history-backup-location.txt"
      sync "$history"
    fi
    sync "$destination"/*
    touch "$destination/COMPLETE"
    sync "$destination/COMPLETE" "$destination"
    if [[ -n ${BRIOTAP_HISTORY_BACKUP_DIR:-} ]]; then
      echo "Backup saved to $destination; append-only histories mirrored to $history."
    else
      echo "Backup saved to $destination. Retain the source histories listed in history.manifest separately; this backup does not copy them."
    fi
    ;;
  restore)
    [[ $# == 2 ]] || usage
    source_directory=$(cd "$2" && pwd)
    [[ -f "$source_directory/COMPLETE" && -f "$source_directory/database.dump" ]] || { echo 'Incomplete backup.' >&2; exit 1; }
    echo 'Restore replaces the deployment database and worker checkpoints. Set BRIOTAP_CONFIRM_RESTORE=replace to continue.' >&2
    [[ ${BRIOTAP_CONFIRM_RESTORE:-} == replace ]] || exit 1
    "${compose[@]}" stop app scraper importer
    # Validate all historical prefixes before replacing anything. Leave services stopped on failure.
    "${compose[@]}" run --rm -T --no-deps -v "$source_directory:/backup:ro" scraper bash -c '
      set -euo pipefail
      cd /app/data
      while read -r bytes expected file; do
        [[ "$file" != */* && -f "$file" && $(stat -c %s "$file") -ge "$bytes" ]] || { echo "Missing or truncated history: $file" >&2; exit 1; }
        actual=$(head -c "$bytes" "$file" | sha256sum)
        [[ "${actual%% *}" == "$expected" ]] || { echo "History prefix differs: $file" >&2; exit 1; }
      done < /backup/history.manifest
    '
    "${compose[@]}" exec -T postgres pg_restore -U briotap -d briotap --clean --if-exists --exit-on-error < "$source_directory/database.dump"
    "${compose[@]}" run --rm -T --no-deps -v "$source_directory:/backup:ro" scraper bash -c '
      set -euo pipefail
      rm -f /app/data/enrichment-worker.sqlite /app/data/enrichment-worker.sqlite-wal /app/data/enrichment-worker.sqlite-shm /app/data/enrichment-cursor.json
      for file in enrichment-worker.sqlite enrichment-worker.sqlite-wal enrichment-worker.sqlite-shm enrichment-cursor.json; do
        if [[ -f "/backup/$file" ]]; then cp "/backup/$file" "/app/data/$file"; fi
      done
    '
    "${compose[@]}" up -d --wait
    ;;
  *) usage ;;
esac
