<script lang="ts">
  import type { catalog as loadCatalog } from '$lib/server/catalog';
  import Icon from './Icon.svelte';
  let { catalog }: { catalog: Awaited<ReturnType<typeof loadCatalog>> } = $props();
  const count = (name: string) =>
    catalog.estimates.find((row) => row.name === name)?.count ?? 0;
  const compact = (value: number) =>
    new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value);
</script>

<section class="index-strip" aria-label="Estimated index coverage" title="Approximate package, module, and version counts">
  <div>
    <strong>{compact(count('packages'))}</strong><span>Packages</span>
  </div>
  <div><strong>{compact(count('modules'))}</strong><span>Modules</span></div>
  <div>
    <strong>{compact(count('module_versions'))}</strong><span>Versions</span>
  </div>
  
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

