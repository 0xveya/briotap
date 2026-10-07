<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { searchPackages } from '../../routes/index.remote';
  import type { SearchResult } from '$lib/server/search';
  import { prefetchLink } from '$lib/prefetch';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';
  let { open = $bindable(false) }: { open: boolean } = $props();
  type Item = { label: string; detail: string; shortcut?: string } & ({ href: string } | { action: 'theme' });
  let query = $state('');
  let packages = $state<SearchResult[]>([]);
  let selected = $state(0);
  let loading = $state(false);
  let failed = $state(false);
  let generation = 0;
  function packageUrl(tab: string, symbols = false) {
    const url = new URL(page.url);
    url.searchParams.set('tab', tab);
    url.searchParams.delete('file');
    url.searchParams.delete('find');
    if (symbols) url.searchParams.set('find', 'symbols');
    url.hash = '';
    return `${url.pathname}${url.search}`;
  }
  const commands = $derived.by(() => {
    const items: Item[] = [
      { label: 'Search packages', detail: 'Browse the Go package index', href: '/search' },
      { label: 'Home', detail: 'Featured packages and collections', href: '/' },
      { label: 'Switch color theme', detail: 'Light or dark mode', action: 'theme' }
    ];
    if (page.url.pathname.startsWith('/package/')) {
      const tabs = [ ['overview', 'Main', 'm'], ['docs', 'Docs', 'd'], ['code', 'Code', '.'], ['changelog', 'Changelog', '-'], ['timeline', 'Timeline', 't'], ['stats', 'Stats', 's'], ['dependencies', 'Dependencies', ''], ['imported-by', 'Imported by', ''], ['packages', 'Module packages', ''] ] as const;
      items.unshift({ label: 'Find a symbol', detail: 'Search this package’s API', href: packageUrl('docs', true), shortcut: 'Alt S' }, ...tabs.map(([tab, label, shortcut]) => ({ label, detail: 'Current package', href: packageUrl(tab), shortcut })));
    }
    return items;
  });
  const items = $derived<Item[]>([
    ...commands.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(query.trim().toLowerCase())),
    ...packages.map((item) => ({ label: item.name, detail: item.path, href: `/package/${item.path}` }))
  ]);
  $effect(() => {
    const text = query.trim();
    const request = ++generation;
    selected = 0;
    packages = [];
    failed = false;
    loading = false;
    if (!open || text.length < 2) return;
    loading = true;
    const timer = setTimeout(async () => {
      try {
        const results = await searchPackages(text);
        if (request === generation) packages = results.slice(0, 8);
      } catch {
        if (request === generation) failed = true;
      } finally {
        if (request === generation) loading = false;
      }
    }, 140);
    return () => clearTimeout(timer);
  });
  function choose(item: Item) {
    open = false;
    query = '';
    if ('href' in item) void goto(item.href);
    else document.querySelector<HTMLButtonElement>('.theme-toggle')?.click();
  }
  function keydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      selected = Math.max(0, Math.min(items.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1)));
      const item = items[selected];
      if (item && 'href' in item) void prefetchLink(item.href);
      document.getElementById(`command-result-${selected}`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && items[selected]) {
      event.preventDefault();
      choose(items[selected]);
    }
  }
</script>
<Dialog bind:open title="Search and commands">
  <label class="sr-only" for="command-search">Search packages or commands</label>
  <input id="command-search" class="command-input" type="search" placeholder="Search packages or commands…" bind:value={query} onkeydown={keydown} autocomplete="off" spellcheck="false" maxlength="200" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="command-results" aria-activedescendant={items[selected] ? `command-result-${selected}` : undefined} />
  <p class="command-hint">↑ ↓ to select · Enter to open · Esc to close</p>
  <div class="command-results" id="command-results" role="listbox" aria-label="Commands and packages">
    {#each items as item, index}
      <button id="command-result-{index}" type="button" role="option" aria-selected={selected === index} class:active={selected === index} onclick={() => choose(item)} onmouseenter={() => { selected = index; if ('href' in item) void prefetchLink(item.href); }}>
        <span><strong>{item.label}</strong><small>{item.detail}</small></span>
        {#if item.shortcut}<kbd>{item.shortcut}</kbd>{:else}<Icon name="arrow" size={16} />{/if}
      </button>
    {/each}
  </div>
  <p class="command-status" aria-live="polite">{loading ? 'Searching packages…' : failed ? 'Package search unavailable. Commands still work.' : !items.length ? 'No matching commands or packages.' : query.trim().length < 2 ? 'Type two or more characters to search packages.' : `${items.length} results`}</p>
</Dialog>
