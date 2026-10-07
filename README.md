# briotap

A Go package browser built with SvelteKit and PostgreSQL. Search package names and import paths, read documentation, find symbols, and inspect versions, imports, module requirements, and repository metadata.

## Development

Requires Bun, mise, and Docker for the local PostgreSQL instance.

```sh
bun install
mise run db:up
mise run db:migrate
mise run dev
```

Open `http://localhost:5173`. Set `DATABASE_URL` to use another PostgreSQL server; `.env.example` shows the local Compose connection. The database starts empty. To add a module for search:

```sh
mise run data:enrich github.com/go-chi/chi/v5
mise run search chi
```

`mise run check` runs Svelte and TypeScript checks. `mise run build` creates the application build.

## Data flow

The search index and upstream response cache are separate:

- `index.golang.org` supplies module paths, versions, and observation timestamps. The downloader writes `data/module-index.jsonl`; the importer loads complete records into PostgreSQL and saves its byte offset with each batch.
- Package names and descriptions come from pkg.go.dev. Enrichment stores them in PostgreSQL, where `pg_trgm` and full-text indexes support search.
- Documentation, imports, repository metrics, and module requirements are fetched through server-side remote queries. Responses are cached in `data/ui-cache`, served on subsequent visits, and refreshed in the background after 24 hours.

The feed timestamp records when the module proxy observed a version. Module requirements come from go.mod; they are not a resolved dependency graph. Counts and repository metrics reflect the available upstream snapshots.

For a small feed import:

```sh
mise run index:download --pages=1
mise run index:import --limit=1000
mise run data:enrich --limit=20
```

The downloader and importers resume from saved cursors. Run one downloader per output file. Data files and caches are ignored by Git.

## Background collection

Collection can run independently of the web application. A worker reads module paths, fetches package metadata, and appends results to `module-enrichment.jsonl`. The app host copies that file and runs `mise run data:import` to update PostgreSQL. Collection can continue while the application host is offline; later imports resume from their saved offsets.

The current development setup runs the collector on a NAS using Node and systemd. Scripts in `scripts/` and unit files in `ops/` contain Veya's SSH alias, filesystem paths, and service configuration. They are kept as working development helpers, not portable deployment defaults.

Shared mise tasks use `area:action` names. Machine-specific helpers use `personal:nas:*`:

| Task | Purpose |
| --- | --- |
| `personal:nas:seed` | Transfer the feed and collector, then start collection |
| `personal:nas:prioritize` | Reorder pending modules without resetting the cursor |
| `personal:nas:pull` | Copy collected records to the app host |
| `personal:nas:sync` | Pull records and import them into PostgreSQL |

The priority queue uses [AboutCode's module ranking snapshot](https://github.com/aboutcode-org/popular-package-purls), licensed under CC BY 4.0, plus `ops/priority-modules.txt`. Only modules present in the feed are promoted. Adapt the host, paths, and units before using these helpers on another machine.

## Documentation reader

Documentation HTML is sanitized before rendering. Code highlighting uses Shiki and Oniguruma WASM in a web worker. Large symbol lists are virtualized, and declarations are rendered incrementally. Code wrapping is enabled by default; reader preferences are saved locally.

Ctrl+K or Cmd+K opens package search and commands. Alt+S toggles symbol search on documentation pages. Package tabs show their keyboard shortcuts. Documentation links back to pkg.go.dev, and each symbol links to its source.
