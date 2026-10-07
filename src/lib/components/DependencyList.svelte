<script lang="ts">
  import Copy from './Copy.svelte';
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
  <div class="dependency-scopes" aria-label="Dependency type">
    {#each ['all', 'direct', 'indirect'] as type}<button
        type="button"
        aria-pressed={scope === type}
        onclick={() => (scope = type)}
        >{type === 'all' ? 'All' : type === 'direct' ? 'Direct' : 'Indirect'}
        <span
          >{type === 'all'
            ? requirements.length
            : requirements.filter(
                (item) => item.indirect === (type === 'indirect')
              ).length}</span
        ></button
      >{/each}
  </div>
</div>
<p class="filter-count" aria-live="polite">
  {filtered.length} of {requirements.length} dependencies
</p>
<div class="dependency-list">
  {#each filtered as item}<div class="dependency-row">
      <div class="dependency-heading">
        <a href="/search?q={encodeURIComponent(item.name)}">{item.name}</a><span
          >{item.indirect ? 'indirect' : 'direct'}</span
        >
      </div>
      <div class="dependency-install">
        <code>go get {item.name}@{item.requirement}</code><Copy
          text={`go get ${item.name}@${item.requirement}`}
          label={`Copy go get for ${item.name}`}
        />
      </div>
      <a
        class="dependency-docs"
        href="https://pkg.go.dev/{item.name}@{encodeURIComponent(
          item.requirement
        )}"
        target="_blank"
        rel="noreferrer">pkg.go.dev ↗</a
      >
    </div>{:else}<div class="notice">
      {requirements.length
        ? 'No dependencies match this filter.'
        : 'No module requirements reported for this version.'}
    </div>{/each}
</div>
