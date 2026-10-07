<script lang="ts">
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import Search from '$lib/components/Search.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import '../app.css';
  let { children }: { children: Snippet } = $props();
</script>

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
    {#if page.url.pathname !== '/'}<Search
        value={page.url.pathname === '/search'
          ? (page.url.searchParams.get('q') ?? '')
          : ''}
      />{:else}<span class="header-spacer"></span>{/if}
    <nav aria-label="Main navigation">
      <a class:current={page.url.pathname === '/search'} href="/search"
        >Packages</a
      ><a
        href="https://github.com/0xveya/briotap"
        target="_blank"
        rel="noreferrer">GitHub <Icon name="external" size={13} /></a
      >
    </nav>
  </div>
</header>
<main id="main">{@render children()}</main>
<footer class="site-footer">
  <a class="footer-brand" href="/">briotap · Go packages</a>
  <div>
    <a href="https://pkg.go.dev" target="_blank" rel="noreferrer">pkg.go.dev</a
    ><a href="https://deps.dev" target="_blank" rel="noreferrer">deps.dev</a
    >
  </div>
</footer>
