<script lang="ts">
  let {
    requirements
  }: {
    requirements: { name: string; requirement: string; indirect: boolean }[];
  } = $props();
  let filter = $state('');
  let scope = $state('all');
  const filtered = $derived(
    requirements.filter(
      (item) =>
        item.name.toLowerCase().includes(filter.toLowerCase()) &&
        (scope === 'all' || item.indirect === (scope === 'indirect'))
    )
  );
</script>

<div class="dependency-controls">
  <input
    type="search"
    aria-label="Filter module dependencies"
    placeholder="Filter dependencies"
    bind:value={filter}
  />
  <select aria-label="Dependency type" bind:value={scope}>
    <option value="all">All dependencies</option>
    <option value="direct">Direct</option>
    <option value="indirect">Indirect</option>
  </select>
</div>
<p class="filter-count" aria-live="polite">
  {filtered.length} of {requirements.length} dependencies
</p>
<div class="compact-list">
  {#each filtered as item}<a href="/search?q={encodeURIComponent(item.name)}">
      <span
        >{item.name}{#if item.indirect}<span class="release-label"
            >indirect</span
          >{/if}</span
      >
      <small>{item.requirement}</small>
    </a>{:else}<div class="notice">
      {requirements.length
        ? 'No dependencies match this filter.'
        : 'No module requirements reported for this version.'}
    </div>{/each}
</div>
