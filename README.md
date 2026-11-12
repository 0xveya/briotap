# briotap

A Go package browser for reading documentation and figuring out what a dependency brings into your project.

**[Open briotap](https://pkgs.saygex.xyz/)**

## About

I wanted a nicer place to read Go docs, jump between symbols and source, and explore the dependencies in my projects. In particular, I wanted to follow a module that imports another module, keep digging, and check the licenses, advisories, and repository information along the way.

briotap is very heavily inspired by [npmx](https://github.com/npmx-dev/npmx.dev). Much of the navigation and layout is borrowed from it, so calling this an npmx rip-off for Go is fair. It's a small personal project and a toy version of that idea, built around Go's simpler module ecosystem. The focus is documentation and dependency inspection.

## Features

### Documentation and source

- Module READMEs with headings, lists, links, and syntax-highlighted code blocks.
- Versioned Go API documentation with syntax-highlighted examples and declarations.
- Searchable Contents for README headings, documentation sections, functions, types, methods, errors, and other symbols.
- Links from declarations to source, plus a source-file browser.
- Copy buttons on code snippets and version-specific `go get` commands.
- Code wrapping, light and dark themes, and a layout for desktop and mobile reading.

### Dependency exploration and auditing

- Separate views of module requirements from `go.mod` and the packages a Go package imports.
- An interactive dependency graph: expand a branch or a whole level, pan and zoom, find loaded modules, and trace the path to a dependency.
- Direct and indirect requirements, with links to each module and version.
- License and advisory details for the selected module inside the graph.
- Known advisories from deps.dev, with links to the individual OSV reports.
- Socket scores and OpenSSF Scorecard results linked to their original reports.
- Repository stars, forks, open issues, and imported-by counts, with links to inspect them.

The graph follows declared module requirements. It does not calculate the resolved build graph for your project.

### Package browsing

- Search by package name, import path, or description using a local PostgreSQL index.
- A version picker, release notes, and a release timeline.
- Browsable importing packages and other packages in the same module.
- Shareable URLs for package versions, tabs, source files, and documentation anchors.
- A command palette, keyboard shortcuts, and preloading on navigation intent.
- Syntax highlighting runs in a WASM worker, keeping that work off the rendering thread.
- Copyable version, documentation, and Socket badges for project READMEs.

## Using briotap

Search for a name such as [chi](https://pkgs.saygex.xyz/search?q=chi) or [pgx](https://pkgs.saygex.xyz/search?q=pgx), or paste an import path. Open a package, select a version, and copy its `go get` command.

Use **Main** for its README, **Docs** for the API, and **Code** for source files. **Contents** searches headings and symbols and jumps to the selected entry.

To inspect dependencies, open **Dependencies**, then **Explore dependency graph**. Expand modules to follow their requirements and select a node to inspect its path, license, and advisories. **Stats** brings together repository metrics and security reports; **Imported by** shows packages that use it.

Try [Chi's documentation](https://pkgs.saygex.xyz/package/github.com/go-chi/chi/v5?tab=docs) or its [dependency view](https://pkgs.saygex.xyz/package/github.com/go-chi/chi/v5?tab=dependencies).

| Shortcut | Action |
| --- | --- |
| Ctrl+K / Cmd+K | Open package search and commands |
| Alt+S | Toggle Contents on Main and Docs |
| m / d / . | Open Main, Docs, or Code |
| - / t / s | Open Changelog, Timeline, or Stats |

On **Stats**, expand **README badges** to preview and copy badge Markdown for your project. Badges follow the latest indexed version; Socket scores apply to the containing module. README image caches may delay updates.

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

See the [operations guide](docs/operations.md) for the Docker Compose stack, Cloudflare Tunnel setup, data ingestion, backups, and recovery. The `personal:nas:deploy` and `personal:nas:status` tasks use Veya's existing NAS configuration; the guide explains which paths to change for another host.

## License

[MIT](LICENSE).
