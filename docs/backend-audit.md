# Backend release audit — 2026-11-12

Scope: scraper request handling, durable queue/replay, importer lifecycle,
container packaging, backend checks, and obsolete deployment tooling. No UI changes.

## Fixed

- Body read failures now stay inside the enrichment retry boundary instead of
  becoming ordinary module errors immediately. Non-success bodies are discarded.
- Retry-After accepts seconds and HTTP dates, with a 60-second maximum per wait.
- Each module has a five-minute deadline and a 100,000-package ceiling.
- Enrichment bodies are capped at 8 MiB; index pages at 4 MiB.
- Heartbeats advance during recovery, discovery, and individual module completion,
  rather than only after an entire potentially lengthy worker pass.
- Container base images use explicit registries so unattended Podman builds work.
- Removed the superseded host scraper, seed/reorder, SSH sync scripts, associated
  service units, and task entries. Compose ingestion and optional backup scheduling
  remain. Removing repository files does not stop previously installed services.

## Remaining release checks

- The reported live restart cause is **unconfirmed**. The current account cannot
  inspect the deployed Docker daemon or system journal. Podman uses a separate
  container store. Obtain scraper/importer logs, exit codes, restart counts,
  OOMKilled state, free space, and restart timing from the actual deployment.
- Malformed complete JSONL records intentionally stop replay/import rather than
  silently skipping data. Such a record will cause repeated importer failures
  until repaired. Preserve the original files and cursor pairing during repair.
- SQLite and JSONL durability depend on writable, healthy local storage. Full
  disks, permission changes, and checkpoint/file truncation still require operator
  action; automatic restart cannot repair them.
- Validate database migrations and backup restoration on an isolated copy of the
  deployment database before release. Unit checks and a container build do not
  establish database recovery or long-running production stability.
- The new response/package limits deliberately reject exceptionally large modules;
  these appear in the durable retry queue rather than exhausting process memory.

## Verification results

- 32 tests passed with a 30-second timeout; Svelte/TypeScript checks passed.
- Podman production image build succeeded.
- Container smoke check mounted the current scripts and server source, used fixture
  upstream responses and isolated temporary storage, processed one module, then
  restarted and confirmed one successful job and exactly one output record.
- Shell syntax checks passed for the remaining scripts; working tree whitespace
  checks passed. No production services or data were changed.

Run `bun test --timeout 30000`, `bun run check`, and
`podman build -t localhost/briotap-audit:local .` for local verification. The longer
test timeout accommodates synchronous SQLite fsyncs on this device under build I/O.
