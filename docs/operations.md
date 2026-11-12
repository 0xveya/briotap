# Operations

[Back to the README](../README.md)

## NAS Compose stack

`compose.yaml` runs everything on the NAS: PostgreSQL, the SvelteKit app, a scraper, and an importer. A one-off migration service must succeed before the app and importer start. The scraper and importer share local files, so this setup needs no SSH sync or host timers. The app binds to `127.0.0.1:3000`; PostgreSQL binds to `127.0.0.1:55432`. Nothing is published and no Cloudflare Tunnel starts.

Copy `.env.example` to `.env`, set `BRIOTAP_DATA_DIR` to the NAS data directory, and set `ORIGIN` to the address used to access the app. For the existing NAS data this directory is `/srv/dev-disk-by-uuid-5aef6871-c178-4eba-a09c-22b258f91e50/briotap`. Then run on the NAS:

```sh
mise run stack:build
mise run stack:up
mise run stack:status
```

Docker Compose can also be used directly without installing Bun or Node on the NAS: `docker compose up -d --build --wait`. Bun and Node are included in the shared image. The Cloudflare Tunnel can later connect to `http://app:3000` on the Compose network; set `ORIGIN` to the public HTTPS address when enabling it.

Before reusing existing data, stop the old `briotap-enrich.service` or `briotap-worker.service` on the NAS and disable the old `briotap-nas-sync.timer` on its app host. Keep the original JSONL files and checkpoints. Legacy seed, prioritize, and SSH sync tooling has been removed; Compose owns this directory. If moving an existing PostgreSQL database, restore it before starting the importer so its saved byte cursors still refer to the original files. With an empty database, the importer replays the files instead.

The scraper polls the [Go module index](https://index.golang.org/) every minute once caught up, prioritizes new modules and version changes, and resumes `module-paths.txt` from the legacy `enrichment-cursor.json`. Its durable queue and checkpoints live in `enrichment-worker.sqlite`. First startup imports the existing enrichment history into the queue without refetching completed modules. Transient failures retry after one minute with exponential backoff; HTTP 400, 404, 410, and 412 failures start at seven days. Backoff is capped at 30 days. New index observations make failed modules immediately eligible again.

Each module scrape has a five-minute deadline and a 100,000-package limit. Enrichment responses are limited to 8 MiB and index pages to 4 MiB. Failed response bodies are retried, and failed HTTP responses are discarded before retrying.

The scraper flushes `module-enrichment.jsonl` and `module-updates.jsonl` before advancing checkpoints. Interrupted appends are repaired on restart, and replays are safe. The importer checks these files every five seconds when idle. Each pass imports up to 5,000 new version records, 1,000 enrichment records, and 20,000 historical index records, so historical index backfill does not monopolize the importer. Enrichment records retain file order; importing a large existing history still takes time. Both processes use file locks to prevent duplicate writers. Errors are logged and failed containers restart; migration failures remain visible instead of being ignored.

The app and scraper share a SQLite request budget on a Docker volume. Defaults are **40 pkg.go.dev requests/second total**, with background work capped at **30/second**, leaving **10/second reserved for uncached reads**. This stays below the API's documented [45 QPS limit per IP block](https://pkg.go.dev/v1/api#rate-limiting). Set `PKG_REQUESTS_PER_SECOND` and `PKG_RESERVED_REQUESTS_PER_SECOND` together before recreating the stack. Foreground reads can use all spare capacity; the scraper cannot spend the reserve, even when idle. Requests are paced without accumulating idle bursts. The scraper runs sequentially, so actual throughput also depends on upstream latency.

Fresh cache hits spend no requests. Stale cache hits return immediately and refresh using the background allowance. Cold cache loads use foreground allowance, including documentation and pkg.go.dev source lookups. A `429` applies a shared `Retry-After` cooldown capped at 60 seconds; queued reads remain cancellable and retain their normal timeouts. The budget covers pkg.go.dev only, not separate providers such as GitHub, deps.dev, or the Go index. Other programs using the same public IP are outside this budget. Standalone scripts without `REQUEST_BUDGET_PATH` retain their existing behavior, including the scraper's 500 ms request spacing.

Inspect logs and queue state with:

```sh
docker compose logs --tail=50 scraper importer app
docker compose exec scraper bun scripts/worker.ts data --status
```

`postgres_data`, `ui_cache`, and `request_budget` are persistent Docker volumes; enrichment history and worker state stay in `BRIOTAP_DATA_DIR`. `mise run stack:down` stops the stack without deleting those volumes. Back up PostgreSQL along with the original JSONL files and worker SQLite state. Stop the scraper before copying its SQLite files, or use SQLite's backup mechanism. Keep PostgreSQL import cursors paired with their source files when restoring.

This maintains latest module/package metadata and discovered version records. Documentation and other UI snapshots refresh on demand; historical documentation is not exhaustively crawled. Finishing the discovery queue and successfully enriching every module are separate: unavailable modules remain visible in retry counts.

For focused checks, use `mise run test:worker`, `mise run test:budget`, `mise run test:server`, and `mise run check`. Local one-pass commands remain available through `mise run worker --once` and `mise run data:import`. The obsolete host-based ingestion scripts and units have been removed. The optional backup timer remains available.


## Deployment and recovery

The NAS instance is published at `https://pkgs.saygex.xyz` through the `briotap` Cloudflare Tunnel. Its environment and tunnel token stay on the NAS outside the synchronized source files.

`mise run personal:nas:deploy` synchronizes the current working tree to `nas:/opt/briotap/app`, builds there, and starts Compose project `briotap`. It preserves remote `.env`, `data/`, `backups/`, `secrets/`, and Docker volumes. Other files in that app directory are replaced or removed to match the checkout. Override `BRIOTAP_DEPLOY_HOST` and `BRIOTAP_DEPLOY_DIR` for another SSH host alias or absolute path. No commit or push is needed.

Production base images are pinned to the verified image digests. Update those digests deliberately when upgrading Bun, Node, PostgreSQL, or cloudflared; development mise tools continue to follow their configured latest releases.

Use `mise run personal:nas:status` from the local checkout to inspect the deployed app, data workers, and disk capacity.

Create the remote `.env` first. On the existing NAS set `APP_PORT=3042`, `BRIOTAP_DATA_DIR` to the existing history directory, and `POSTGRES_DATA_DIR` to a dedicated directory on the large data disk. Leave `POSTGRES_DATA_DIR` unset to use the default Docker volume elsewhere. A bind-mounted database directory must be empty for a fresh database or contain a compatible PostgreSQL 17 cluster. Changing this path does not migrate an existing database.

For first deployment with a database to restore, run `mise run personal:nas:deploy --prepare`. This copies and builds the app and starts only PostgreSQL; scraper, importer, and app remain unstarted. Restore the database separately before the normal deployment command, keeping its import cursors paired with the source JSONL files. Do not run the importer against a partially restored database.

For public access, create a Cloudflare Tunnel with its public hostname routed to `http://app:3000`. Store its token outside the checkout at `/etc/briotap/cloudflared-token`, owned by UID/GID `65532:65532` with mode `0400` so the unprivileged connector can read it. Set `CLOUDFLARED_TOKEN_FILE` if using another path, `COMPOSE_PROFILES=public`, and `ORIGIN` to the exact public HTTPS origin in the remote `.env`, then deploy. Set `ADDRESS_HEADER=cf-connecting-ip` only when all application traffic comes through that controlled tunnel. Without the profile, no tunnel starts. Verify the public search, package, documentation, and source routes after deployment.

The app limits dynamic requests to 64 concurrent requests and a per-client burst of 120, replenishing at two requests per second. Upstream cache loads are limited to 32, failed loads are suppressed for 30 seconds, and successful snapshots are bounded to 512 MiB and 10,000 files. Oldest snapshots are evicted first. The controlled tunnel supplies client addresses; direct local requests must supply `cf-connecting-ip` when that header is configured. The container healthcheck supplies its own loopback address. Runtime containers drop Linux capabilities and cannot gain privileges; app and worker memory is limited to 2 GiB each.

Run these on the deployment host, from the app directory:

```sh
mise run stack:ops status
mise run stack:ops backup /absolute/path/to/backups/2026-10-27
```

The backup stops scraper/importer, dumps PostgreSQL, copies worker checkpoints, and records hashes and lengths of the source histories before restarting only the writers that were previously running. It reads the histories to hash them but does not copy multi-gigabyte JSONL files on every run. Keep an independent backup of the histories and preserve their original prefixes. The small backup directory alone is not a complete disaster recovery backup. Store it outside the deployment app directory. Container logs rotate at three 10 MB files per service. Status reports a failure for a missing scraper heartbeat or one older than ten minutes, or an import cursor stalled over ten minutes while its file has unread bytes. Inspect the indicated container logs before restarting anything. Check retry counts, import offsets, and disk use after deploys; Compose app health alone does not establish that ingestion is progressing.

`ops/briotap-backup.service` and its timer schedule the same backup at 03:10 with up to ten minutes of jitter. Install them in `/etc/systemd/system`, set `BRIOTAP_BACKUP_DIR` in `/etc/briotap/ops.env` to a directory on a separate disk, reload systemd, and enable the timer. Also set `BRIOTAP_HISTORY_BACKUP_DIR` there to mirror the append-only histories with rsync before marking each backup complete. The first copy transfers the histories; subsequent runs copy appended data and verify it. For recovery, use that mirror at `BRIOTAP_DATA_DIR` and the selected dated database/checkpoint backup. The mirror retains append-only continuations, so it remains usable with older backups. Backups retain their dated directories; check capacity and archive or remove old backups as appropriate. `systemctl status briotap-backup.service` and its journal expose failed backups.

After a power loss during backup, inspect the backup service journal and use `mise run personal:nas:deploy` to resume any stopped data workers. Backups without a `COMPLETE` marker must not be restored.

To restore, first supply the original histories or append-only continuations at `BRIOTAP_DATA_DIR`, then run:

```nu
$env.BRIOTAP_CONFIRM_RESTORE = 'replace'
mise run stack:ops restore /absolute/path/to/backups/2026-10-27
```

Restore stops the app and writers, verifies every recorded history prefix, replaces the database and worker checkpoints, then starts the stack. Append-only continuations are retained: the worker replays enrichment records after its restored output checkpoint, and importers replay the remaining records from their restored database cursors. Index observations may be rediscovered; the existing queue and database keys make these replays idempotent. A validation or restore failure leaves services stopped for inspection. Test this process on a separate deployment before relying on backups. Successful recovery of the deployment database is still a required operational check.
