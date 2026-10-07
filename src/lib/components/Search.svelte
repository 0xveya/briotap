<script lang="ts">
  import { goto } from '$app/navigation';
  import { searchPackages } from '../../routes/index.remote';
  import type { SearchResult } from '$lib/server/search';
  import Icon from './Icon.svelte';
  let { large = false, value = '' }: { large?: boolean; value?: string } =
    $props();
  let text = $state('');
  let results = $state<SearchResult[]>([]);
  let open = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  let input: HTMLInputElement;
  let selected = $state(-1);
  let request = 0;
  $effect(() => {
    text = value;
  });
  $effect(() => {
    const q = text.trim();
    const current = ++request;
    selected = -1;
    failed = false;
    if (!q) {
      results = [];
      loading = false;
      return;
    }
    loading = true;
    results = [];
    const timer = setTimeout(async () => {
      try {
        const found = await searchPackages(q.slice(0, 200));
        if (current === request) results = found.slice(0, 6);
      } catch {
        if (current === request) {
          failed = true;
          results = [];
        }
      } finally {
        if (current === request) loading = false;
      }
    }, 140);
    return () => clearTimeout(timer);
  });
  function shortcut(event: KeyboardEvent) {
    if (
      (event.key === '/' &&
        !(
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement
        )) ||
      ((event.ctrlKey || event.metaKey) && event.key === 'k')
    ) {
      event.preventDefault();
      input?.focus();
      open = true;
    }
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') open = false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open = true;
      selected = Math.max(
        -1,
        Math.min(
          results.length - 1,
          selected + (event.key === 'ArrowDown' ? 1 : -1)
        )
      );
    }
    if (event.key === 'Enter' && selected >= 0 && results[selected]) {
      event.preventDefault();
      open = false;
      void goto(`/package/${results[selected]!.path}`);
    }
  }
</script>

<svelte:window
  onkeydown={shortcut}
  onclick={(event) => {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest('.search-container')
    )
      open = false;
  }}
/>
<div class:large class="search-container">
  <form
    class="search-form"
    action="/search"
    role="search"
    onsubmit={() => (open = false)}
  >
    <Icon name="search" size={large ? 23 : 17} />
    <input
      bind:this={input}
      bind:value={text}
      onfocus={() => (open = true)}
      onkeydown={keydown}
      type="search"
      name="q"
      maxlength="200"
      autocomplete="off"
      spellcheck="false"
      aria-label="Search Go packages"
      placeholder={large ? 'Search Go packages…' : 'Search packages…'}
      aria-controls={large ? 'hero-results' : 'header-results'}
    />
    {#if large}<button class="search-submit" type="submit"
        >Search <Icon name="arrow" size={16} /></button
      >{:else}<kbd>/</kbd>{/if}
  </form>
  {#if open && text.trim()}
    <div class="search-results" id={large ? 'hero-results' : 'header-results'}>
      <div class="search-caption">
        {loading
          ? 'Searching the local index…'
          : failed
            ? 'Search unavailable. Try again.'
            : 'Packages'} <span>{results.length ? 'Enter to open' : ''}</span>
      </div>
      {#each results as result, index}
        <a
          class:active={selected === index}
          href="/package/{result.path}"
          onclick={() => (open = false)}
          ><Icon name="package" size={17} /><span
            ><strong>{result.name}</strong><small>{result.path}</small></span
          ><Icon name="arrow" size={15} /></a
        >
      {/each}
      {#if !loading && !failed && !results.length}<p class="search-empty">
          No matches yet. Try a name or an import path.
        </p>{/if}
      <a
        class="all-results"
        href="/search?q={encodeURIComponent(text)}"
        onclick={() => (open = false)}
        >All results <Icon name="arrow" size={15} /></a
      >
    </div>
  {/if}
</div>
