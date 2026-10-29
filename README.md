# briotap

briotap aims to be [npmx](https://npmx.dev/) for Go: a package browser with syntax-highlighted Go documentation, READMEs, source code, versions, and dependencies.

**[Use briotap at pkgs.saygex.xyz](https://pkgs.saygex.xyz/)**

## Using briotap

Search by package name, description, or import path. Try [chi](https://pkgs.saygex.xyz/search?q=chi), [pgx](https://pkgs.saygex.xyz/search?q=pgx), or a full path such as `github.com/go-chi/chi/v5`.

Open a package and choose a version from the version picker. Copy the `go get` command to install that version, or use the tabs to explore:

- **Main** shows the module README with highlighted code examples.
- **Docs** shows API documentation with syntax-highlighted Go examples and declarations. Open **Contents** to search headings and symbols and jump to them.
- **Code** lets you browse package source files.
- **Changelog**, **Timeline**, and **Versions** show release notes and version history.
- **Dependencies** lists module requirements and package imports, with an expandable dependency graph. **Imported by** shows packages that use it.
- **Stats** shows repository metrics, Socket scores, OpenSSF Scorecard results, and known advisories, with links to their reports.

For example, open [Chi's README](https://pkgs.saygex.xyz/package/github.com/go-chi/chi/v5), [API documentation](https://pkgs.saygex.xyz/package/github.com/go-chi/chi/v5?tab=docs), or [dependencies](https://pkgs.saygex.xyz/package/github.com/go-chi/chi/v5?tab=dependencies).

Press **Ctrl+K** or **Cmd+K** for package search and commands. **Alt+S** opens Contents on Main and Docs. Package tabs show their keyboard shortcuts. Use **Wrap code** in the reader or the theme button in the header to adjust the view.

## Badges for your project

On a package's **Stats** tab, expand **README badges** to preview and copy Markdown for a version, documentation, or Socket score badge. Paste it into your project's README.

Badges follow the latest indexed version. Socket scores apply to the containing module. README image caches may delay updates.

## Development

The app uses SvelteKit, Bun, and PostgreSQL. Install [mise](https://mise.jdx.dev/) and Docker Engine, then run:

```sh
mise install
mise exec -- bun install
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

## Self-hosting

See the [operations guide](docs/operations.md) for the Docker Compose stack, Cloudflare Tunnel setup, data ingestion, backups, and recovery. The `personal:nas:*` tasks use Veya's existing NAS configuration; the guide explains which paths to change for another host.
