<script lang="ts">
  import { getCatalog } from './index.remote';
  import Search from '$lib/components/Search.svelte';
  import Icon from '$lib/components/Icon.svelte';
  const catalog = await getCatalog();
  const count = (name: string) =>
    catalog.estimates.find((row) => row.name === name)?.count ?? 0;
  const compact = (value: number) =>
    new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value);
</script>

<svelte:head>
  <title>briotap · Go packages</title>
  <meta
    name="description"
    content="Search Go packages. Browse documentation, versions, imports, and dependencies."
  />
</svelte:head>
<div class="home wrap">
  <section class="catalog-header">
    <h1>briotap</h1>
    <p>A package browser for Go.</p>
    <div class="catalog-search">
      <Search large />
      <div class="search-hint">
        <span>Search by name, description, or import path.</span><span
          ><kbd>/</kbd> to search</span
        >
      </div>
    </div>
    <div class="quick-picks">
      <span>Try:</span
      >{#each ['chi', 'pgx', 'cobra', 'zerolog', 'grpc'] as name}<a
          href="/search?q={name}">{name}</a
        >{/each}
    </div>
  </section>
  <section class="index-strip" aria-label="Index coverage">
    <div>
      <strong>{compact(count('packages'))}</strong><span>Packages</span>
    </div>
    <div><strong>{compact(count('modules'))}</strong><span>Modules</span></div>
    <div>
      <strong>{compact(count('module_versions'))}</strong><span>Versions</span>
    </div>
    <p>Approximate counts</p>
  </section>
  <section class="discover" id="discover">
    <div class="section-heading">
      <h2>Browse packages</h2>
      <a href="/search">Search all packages <Icon name="arrow" size={16} /></a>
    </div>
    <div class="collection-grid">
      {#each catalog.collections as group}
        <div class="collection">
          <div class="collection-title"><h3>{group.name}</h3></div>
          {#each group.packages.slice(0, 4) as pkg}
            <a class="package-card" href="/package/{pkg.path}">
              <div>
                <strong>{pkg.name}</strong><span class="version"
                  >{pkg.version}</span
                >
              </div>
              <p>{pkg.synopsis || pkg.path}</p>
              <span class="card-path">{pkg.modulePath}</span>
            </a>
          {/each}
          <a
            class="collection-more"
            href="/search?q={encodeURIComponent(group.query)}"
            >View more <Icon name="arrow" size={15} /></a
          >
        </div>
      {/each}
    </div>
  </section>
  <div class="data-note">
    Data from pkg.go.dev and deps.dev. {#if catalog.syncedAt}Updated {new Date(
        catalog.syncedAt
      ).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })}.{/if}
  </div>
</div>
