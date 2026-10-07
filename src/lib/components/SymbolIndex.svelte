<script lang="ts">
  import Icon from './Icon.svelte';
  import { createVirtualizer } from '@tanstack/svelte-virtual';
  import { get } from 'svelte/store';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import {
    indexSymbols,
    searchSymbols,
    matchedName,
    symbolCategories,
    symbolCategory,
    type SymbolEntry,
    type SymbolKind
  } from '$lib/symbol-search';

  let {
    symbols,
    id = 'symbol-search',
    onselect,
    sourceBase
  }: {
    symbols: SymbolEntry[];
    id?: string;
    onselect?: () => void;
    sourceBase: string;
  } = $props();
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
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      window.open(
        `${sourceBase}&symbol=${encodeURIComponent(filtered[0]!.name)}`,
        '_blank',
        'noopener,noreferrer'
      );
      return;
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
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      window.open(
        `${sourceBase}&symbol=${encodeURIComponent(filtered[index]!.name)}`,
        '_blank',
        'noopener,noreferrer'
      );
      return;
    }
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
  <div class="symbol-categories" aria-label="Symbol categories">
    {#each symbolCategories as category}
      {@const count =
        category.kind === 'all'
          ? indexed.length
          : indexed.filter((item) => item.kind === category.kind).length}
      {#if count}<button
          type="button"
          aria-pressed={kind === category.kind}
          onclick={() => (kind = category.kind)}
          >{category.label} <span>{count}</span></button
        >{/if}
    {/each}
  </div>
  <label
    ><input type="checkbox" bind:checked={signatures} /> Search signatures</label
  >
</div>
<p class="symbol-help" id={`${id}-help`}>
  ↓ to select · Enter for docs · Shift+Enter for source
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
          <div
            class="virtual-symbol"
            class:current={page.url.hash === `#${symbol.id}`}
            style:transform="translateY({row.start}px)"
          >
            <a
              href="#{symbol.id}"
              class="symbol-doc-link"
              class:current={page.url.hash === `#${symbol.id}`}
              aria-current={page.url.hash === `#${symbol.id}`
                ? 'location'
                : undefined}
              onclick={onselect}
              onkeydown={navigate}
              title={symbol.signature}
              data-index={row.index}
            >
              {#if kind === 'all'}<span class="symbol-kind"
                  >{symbolCategory(symbol)}</span
                >{/if}
              <span class="symbol-detail"
                ><strong
                  >{#each matchedName(symbol.name, filter) as part}{#if part.matched}<mark
                        >{part.text}</mark
                      >{:else}{part.text}{/if}{/each}</strong
                ><small>{symbol.signature}</small></span
              >
            </a><a
              class="symbol-source"
              href="{sourceBase}&symbol={encodeURIComponent(symbol.name)}"
              target="_blank"
              rel="noreferrer"
              aria-label="Source for {symbol.name}"
              title="Source for {symbol.name}"><Icon name="file-code" size={18} /></a
            >
          </div>{/if}
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
