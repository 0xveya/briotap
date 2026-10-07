<script lang="ts">
  import { createVirtualizer } from '@tanstack/svelte-virtual';
  import { get } from 'svelte/store';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import {
    indexSymbols,
    searchSymbols,
    matchedName,
    type SymbolEntry,
    type SymbolKind
  } from '$lib/symbol-search';

  let {
    symbols,
    id = 'symbol-search',
    onselect
  }: { symbols: SymbolEntry[]; id?: string; onselect?: () => void } = $props();
  let filter = $state('');
  let viewport = $state<HTMLElement>();
  let kind = $state<SymbolKind>('all');
  let signatures = $state(false);
  const indexed = $derived(indexSymbols(symbols));
  const filtered = $derived(searchSymbols(indexed, filter, kind, signatures));
  const rowHeight = 56;
  const virtualizer = createVirtualizer<HTMLElement, HTMLAnchorElement>({
    count: 0,
    getScrollElement: () => viewport ?? null,
    estimateSize: () => rowHeight,
    overscan: 5
  });

  $effect(() => {
    const items = filtered;
    void viewport;
    const instance = get(virtualizer);
    instance.setOptions({
      count: items.length,
      getItemKey: (index) => items[index]!.id
    });
    instance.scrollToOffset(0);
  });

  function focusResult(index: number) {
    get(virtualizer).scrollToIndex(index, { align: 'auto' });
    requestAnimationFrame(() =>
      viewport
        ?.querySelector<HTMLAnchorElement>(`[data-index="${index}"]`)
        ?.focus()
    );
  }
  function searchKey(event: KeyboardEvent) {
    if (!filtered.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusResult(0);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onselect?.();
      void goto(`#${filtered[0]!.id}`);
    }
  }
  function navigate(event: KeyboardEvent) {
    if (
      !(event.target instanceof HTMLAnchorElement) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const index = Number(event.target.dataset.index);
    if (event.key === 'ArrowUp' && index === 0) {
      event.preventDefault();
      document.getElementById(id)?.focus();
      return;
    }
    const next =
      event.key === 'ArrowDown'
        ? index + 1
        : event.key === 'ArrowUp'
          ? index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? filtered.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    const destination = Math.max(0, Math.min(filtered.length - 1, next));
    focusResult(destination);
  }
</script>

<label class="sr-only" for={id}>Search symbols</label>
<input
  {id}
  class="symbol-search"
  type="search"
  placeholder="Search symbols"
  bind:value={filter}
  onkeydown={searchKey}
  autocomplete="off"
  spellcheck="false"
  aria-describedby={`${id}-help`}
/>
<div class="symbol-controls">
  <select aria-label="Symbol kind" bind:value={kind}>
    <option value="all">All symbols</option><option value="func"
      >Functions</option
    ><option value="method">Methods</option><option value="type">Types</option
    ><option value="const">Constants</option><option value="var"
      >Variables</option
    >
  </select>
  <label><input type="checkbox" bind:checked={signatures} /> Signatures</label>
</div>
<p class="symbol-help" id={`${id}-help`}>
  Name, receiver + method, or initials. ↓ to select, Enter to open.
</p>
<p class="symbol-count" aria-live="polite">
  {filtered.length}
  {filtered.length === 1 ? 'symbol' : 'symbols'}
</p>
{#if filtered.length}
  <nav
    class="virtual-symbols"
    aria-label="Package symbols"
    bind:this={viewport}
    style:height="{Math.min(filtered.length * rowHeight, 336)}px"
  >
    <div
      style:height="{$virtualizer.getTotalSize()}px"
      style:position="relative"
    >
      {#each $virtualizer.getVirtualItems() as row (row.key)}
        {@const symbol = filtered[row.index]}
        {#if symbol}
          <a
            href="#{symbol.id}"
            class="virtual-symbol"
            class:current={page.url.hash === `#${symbol.id}`}
            aria-current={page.url.hash === `#${symbol.id}`
              ? 'location'
              : undefined}
            onclick={onselect}
            onkeydown={navigate}
            title={symbol.signature}
            data-index={row.index}
            style:transform="translateY({row.start}px)"
          >
            <span class="symbol-kind"
              >{symbol.kind === 'func'
                ? symbol.name.includes('.')
                  ? 'method'
                  : 'func'
                : symbol.kind}</span
            >
            <span class="symbol-detail"
              ><strong
                >{#each matchedName(symbol.name, filter) as part}{#if part.matched}<mark
                      >{part.text}</mark
                    >{:else}{part.text}{/if}{/each}</strong
              ><small>{symbol.signature}</small></span
            >
          </a>{/if}
      {/each}
    </div>
  </nav>
{:else}<p class="sidebar-note">No matching symbols.</p>
  <button
    class="symbol-reset"
    onclick={() => {
      filter = '';
      kind = 'all';
      signatures = false;
    }}>Clear filters</button
  >{/if}
