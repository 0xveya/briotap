<script lang="ts">
  import { getDocumentation } from '../../routes/index.remote';
  import type { documentation } from '$lib/server/documentation';
  import Icon from './Icon.svelte';
  let { path, version, onloaded }: { path: string; version: string; onloaded?: (data: Awaited<ReturnType<typeof documentation>>) => void } = $props();
  const doc = $derived(getDocumentation({ path, version }));
  let filter = $state('');
  $effect(() => { if (doc.current?.ok) onloaded?.(doc.current.data); });
</script>
<div class="doc-heading"><h2>Documentation</h2><span><Icon name="book" size={13} /> A little room to read.</span></div>
{#await doc}<div class="skeleton" role="status" aria-label="Loading documentation"><span></span><span></span><span></span><span></span></div>
{:then result}
  {#if result.ok}
    {#if result.data.html}
      <div class="doc-filter-mobile"><label class="sr-only" for="mobile-symbols">Find a symbol</label><input class="symbol-search" id="mobile-symbols" type="search" bind:value={filter} placeholder="Find a symbol, e.g. NewRouter…" />{#if filter}<div class="symbol-results">{#each result.data.symbols.filter((symbol) => symbol.name.toLowerCase().includes(filter.toLowerCase())) as symbol}<a href="#{symbol.id}" onclick={() => filter = ''}>{symbol.name}</a>{:else}<span class="tab-intro">No symbols match.</span>{/each}</div>{/if}</div>
      <div class="prose" data-documentation>{@html result.data.html}</div>
    {:else}<div class="notice">{result.data.isRedistributable ? 'This package does not publish documentation for this version.' : 'Documentation cannot be redistributed for this package.'} <a href="https://pkg.go.dev/{path}@{version}" target="_blank" rel="noreferrer">Open on pkg.go.dev ↗</a></div>{/if}
  {:else}<div class="notice"><p>{result.message}</p><button onclick={() => doc.refresh()}>Try again</button> <a href="https://pkg.go.dev/{path}@{version}" target="_blank" rel="noreferrer">pkg.go.dev ↗</a></div>{/if}
{/await}
