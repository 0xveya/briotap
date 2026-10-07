<script lang="ts">
  import Search from '$lib/components/Search.svelte';
  import HomeCatalog from '$lib/components/HomeCatalog.svelte';
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
          ><kbd>Ctrl K</kbd> / <kbd>⌘ K</kbd> to search</span
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
  <svelte:boundary>
    <HomeCatalog />
    {#snippet pending()}
      <section class="index-strip" aria-label="Loading index coverage" aria-busy="true">
        {#each ['Packages', 'Modules', 'Versions'] as label}
          <div><strong>—</strong><span>{label}</span></div>
        {/each}
        <p>Loading counts…</p>
      </section>
      <section class="discover" aria-busy="true" aria-label="Loading package collections">
        <div class="section-heading">
          <h2>Browse packages</h2><a href="/search">Search all packages →</a>
        </div>
        <div class="collection-grid catalog-placeholder">
          {#each [0, 1, 2] as group}
            <div class="skeleton"><span></span><span></span><span></span></div>
          {/each}
        </div>
      </section>
    {/snippet}
    {#snippet failed()}
      <div class="notice">Package collections could not be loaded. <a href="/search">Search packages →</a></div>
    {/snippet}
  </svelte:boundary>
</div>
