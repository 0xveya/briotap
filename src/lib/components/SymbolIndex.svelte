<script lang="ts">
  import { createVirtualizer } from '@tanstack/svelte-virtual';
  import { get } from 'svelte/store';
  import type { documentation } from '$lib/server/documentation';

  type Symbol = Awaited<ReturnType<typeof documentation>>['symbols'][number];
  let { symbols }: { symbols: Symbol[] } = $props();
  let filter = $state('');
  let viewport = $state<HTMLElement>();
  const filtered = $derived(
    symbols.filter((symbol) =>
      symbol.name.toLowerCase().includes(filter.toLowerCase())
    )
  );
  const virtualizer = createVirtualizer<HTMLElement, HTMLAnchorElement>({
    count: 0,
    getScrollElement: () => viewport ?? null,
    estimateSize: () => 32,
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

  function navigate(event: KeyboardEvent) {
    if (!(event.target instanceof HTMLAnchorElement)) return;
    const index = Number(event.target.dataset.index);
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
    get(virtualizer).scrollToIndex(destination, { align: 'auto' });
    requestAnimationFrame(() =>
      viewport
        ?.querySelector<HTMLAnchorElement>(`[data-index="${destination}"]`)
        ?.focus()
    );
  }
</script>

<label class="sr-only" for="symbol-search">Search symbols</label>
<input
  id="symbol-search"
  class="symbol-search"
  type="search"
  placeholder="Search symbols"
  bind:value={filter}
/>
<p class="symbol-count" aria-live="polite">
  {filtered.length}
  {filtered.length === 1 ? 'symbol' : 'symbols'}
</p>
{#if filtered.length}
  <nav
    class="virtual-symbols"
    aria-label="Package symbols"
    bind:this={viewport}
    style:height="{Math.min(filtered.length * 32, 384)}px"
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
            onkeydown={navigate}
            title={symbol.signature}
            data-index={row.index}
            style:transform="translateY({row.start}px)"
          >
            <span class="symbol-kind"
              >{symbol.kind === 'func'
                ? 'fn'
                : symbol.kind === 'type'
                  ? 'ty'
                  : symbol.kind.slice(0, 2)}</span
            ><span>{symbol.name}</span>
          </a>{/if}
      {/each}
    </div>
  </nav>
{:else}<p class="sidebar-note">No matching symbols.</p>{/if}
