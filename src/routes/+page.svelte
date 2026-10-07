<script lang="ts">
  import Search from '$lib/components/Search.svelte';
  import HomeCatalog from '$lib/components/HomeCatalog.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
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
  <HomeCatalog catalog={data.catalog} />
</div>
