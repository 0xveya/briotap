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
    sourceBase = ''
  }: {
    symbols: SymbolEntry[];
    id?: string;
    onselect?: (id: string) => void;
    sourceBase?: string;
  } = $props();
  let filter = $state('');
  let viewport = $state<HTMLElement>();
  let kind = $state<SymbolKind>('all');
  let signatures = $state(false);
  const indexed = $derived(indexSymbols(symbols));
  const filtered = $derived(searchSymbols(indexed, filter, kind, signatures));
  const hasSymbols = $derived(symbols.some((symbol) => symbol.kind !== 'section'));
  const rowHeight = $derived(hasSymbols ? 56 : 44);
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
    if (event.key === 'Enter' && event.shiftKey && sourceBase && filtered[0]!.kind !== 'section') {
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
      onselect?.(filtered[0]!.id);
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
    if (event.key === 'Enter' && event.shiftKey && sourceBase && filtered[index]!.kind !== 'section') {
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

<label class="sr-only" for={id}>{hasSymbols ? 'Search sections and symbols' : 'Search sections'}</label>
<input
  {id}
  class="symbol-search"
  type="search"
  placeholder={hasSymbols ? 'Search sections and symbols' : 'Search sections'}
  bind:value={filter}
  onkeydown={searchKey}
  autocomplete="off"
  spellcheck="false"
  aria-describedby={`${id}-help`}
/>
{#if hasSymbols}<div class="symbol-controls">
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
</div>{/if}
<p class="symbol-help" id={`${id}-help`}>
  ↓ to select · Enter to jump{#if hasSymbols} · Shift+Enter for source{/if}
</p>
<p class="symbol-count" aria-live="polite">
  {filtered.length}
  {filtered.length === 1 ? 'match' : 'matches'}
</p>
{#if filtered.length}
  <nav
    class="virtual-symbols"
    aria-label="Document contents"
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
            style:height="{rowHeight}px"
            style:transform="translateY({row.start}px)"
          >
            <a
              href="#{symbol.id}"
              class="symbol-doc-link"
              class:current={page.url.hash === `#${symbol.id}`}
              aria-current={page.url.hash === `#${symbol.id}`
                ? 'location'
                : undefined}
              onclick={() => onselect?.(symbol.id)}
              onkeydown={navigate}
              title={symbol.signature}
              data-index={row.index}
              style:padding-left={symbol.kind === 'section' ? `${12 + Math.max(0, (symbol.level ?? 2) - 2) * 12}px` : undefined}
            >
              {#if hasSymbols && kind === 'all'}<span class="symbol-kind"
                  >{symbolCategory(symbol)}</span
                >{/if}
              <span class="symbol-detail"
                class:section-title={symbol.kind === 'section'}
                ><strong
                  >{#each matchedName(symbol.name, filter) as part}{#if part.matched}<mark
                        >{part.text}</mark
                      >{:else}{part.text}{/if}{/each}</strong
                >{#if symbol.signature}<small>{symbol.signature}</small>{/if}</span
              >
            </a>{#if sourceBase && symbol.kind !== 'section'}<a
              class="symbol-source"
              href="{sourceBase}&symbol={encodeURIComponent(symbol.name)}"
              target="_blank"
              rel="noreferrer"
              aria-label="Source for {symbol.name}"
              title="Source for {symbol.name}"><Icon name="file-code" size={18} /></a
            >{/if}
          </div>{/if}
      {/each}
    </div>
  </nav>
{:else}<p class="sidebar-note">No matching sections or symbols.</p>
  <button
    class="symbol-reset"
    onclick={() => {
      filter = '';
      kind = 'all';
      signatures = false;
    }}>Clear filters</button
  >{/if}
