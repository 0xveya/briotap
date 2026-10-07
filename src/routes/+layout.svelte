<script lang="ts">
  import { navigating, page } from '$app/state';
  import type { Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import Search from '$lib/components/Search.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import { prefetchOnIntent } from '$lib/prefetch';
  import '../app.css';
  let paletteOpen = $state(false);
  const navigationMessage = $derived(navigating.to
    ? navigating.to.url.pathname === '/search' ? 'Searching…' : 'Loading page…'
    : null);
  function symbols() {
    const url = new URL(page.url);
    url.searchParams.set('tab', 'docs');
    url.searchParams.set('find', 'symbols');
    url.searchParams.delete('file');
    url.hash = '';
    void goto(`${url.pathname}${url.search}`, { noScroll: true });
  }
  let { children }: { children: Snippet } = $props();
</script>

<svelte:window onkeydown={(event) => {
  if (event.defaultPrevented || event.isComposing || event.repeat) return;
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (document.querySelector('dialog[open]') && !paletteOpen) return;
    paletteOpen = !paletteOpen;
  }
}} />
<CommandPalette bind:open={paletteOpen} />
<svelte:head
  ><meta name="theme-color" content="#080809" /><link
    rel="icon"
    href="/favicon.svg"
    type="image/svg+xml"
  /></svelte:head
>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="header-inner">
    <a class="wordmark" href="/" aria-label="briotap home">briotap</a>
    {#if page.url.pathname !== '/'}<Search oncommand={() => (paletteOpen = true)}
        value={page.url.pathname === '/search'
          ? (page.url.searchParams.get('q') ?? '')
          : ''}
      />{:else}<span class="header-spacer"></span>{/if}
    <div class="header-actions">
    <nav aria-label="Main navigation">
      <a class:current={page.url.pathname === '/search'} href="/search"
        >Packages</a
      ><a
        href="https://github.com/0xveya/briotap"
        target="_blank"
        rel="noreferrer">GitHub <Icon name="external" size={13} /></a
      >
    </nav>
    <button type="button" class="mobile-search-button" aria-label="Open search and commands" onclick={() => (paletteOpen = true)}><Icon name="search" size={20} /></button>
    {#if page.url.pathname.startsWith('/package/')}<button type="button" class="header-symbol-button" aria-label="Find a symbol in this package" title="Find a symbol (Alt+S)" onclick={symbols}><Icon name="file-code" size={20} /></button>{/if}
    <ThemeToggle />
    </div>
  </div>
</header>
{#if navigationMessage}
  <div class="navigation-status" role="status" aria-live="polite">
    <span class="loading-spinner" aria-hidden="true"></span>{navigationMessage}
  </div>
{/if}
<main id="main" use:prefetchOnIntent>{@render children()}</main>

