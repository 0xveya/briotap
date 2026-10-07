<script lang="ts">
  import type { PageData } from './$types';
  import Icon from '$lib/components/Icon.svelte';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head
  ><title
    >{data.q ? `${data.q} · Search` : 'Explore Go packages'} · briotap</title
  ></svelte:head
>
<div class="wrap search-page">
  <h1>{data.q ? `Results for “${data.q}”` : 'Search packages'}</h1>
  {#if data.q}<div class="results-meta">
      <span
        >{data.results.length}{data.results.length === 20 ? '+' : ''} matches</span
      >
    </div>
    <div class="result-list">
      {#each data.results as result}<a
          class="result-row"
          href="/package/{result.path}"
          ><div class="result-detail">
            <h2>{result.name}<span>{result.version}</span></h2>
            <code>{result.path}</code>
            {#if result.synopsis}<p>{result.synopsis}</p>{/if}
          </div>
          <Icon name="arrow" size={20} /></a
        >{/each}
    </div>
    {#if !data.results.length}<div class="empty-state">
        <Icon name="search" size={36} />
        <h2>No packages found.</h2>
        <p>Try a package name, description, or import path.</p>
        <a href="/">Browse packages <Icon name="arrow" size={16} /></a>
      </div>{/if}
  {:else}<p class="search-intro">
      Search by package name, description, or import path.
    </p>
    <div class="topic-links">
      {#each ['HTTP router', 'database', 'logging', 'testing', 'command line', 'json'] as topic}<a
          href="/search?q={encodeURIComponent(topic)}"
          >{topic}<Icon name="arrow" size={17} /></a
        >{/each}
    </div>
    <a class="text-link" href="/">Browse packages →</a>{/if}
</div>
