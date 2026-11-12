<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { navigating } from '$app/state';
  import { suggestPackages } from '../../routes/index.remote';
  import type { Suggestion } from '$lib/server/search';
  import Icon from './Icon.svelte';
  let { large = false, value = '', oncommand }: { large?: boolean; value?: string; oncommand?: () => void } =
    $props();
  let previousValue = untrack(() => value);
  let text = $state(previousValue);
  let results = $state<Suggestion[]>([]);
  let open = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  let input: HTMLInputElement;
  let selected = $state(-1);
  let request = 0;
  let shortcutLabel = $state('Ctrl K');
  const submitting = $derived(navigating.to?.url.pathname === '/search' &&
    (navigating.to.url.searchParams.get('q') ?? '').trim() === text.trim());
  onMount(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) shortcutLabel = '⌘ K';
    if (document.activeElement === input && input.value.trim()) open = true;
  });
  function focusSearch() {
    input.focus();
    input.select();
    open = true;
  }
  $effect(() => {
    if (value !== previousValue) {
      previousValue = value;
      text = value;
    }
  });
  $effect(() => {
    const q = text.trim();
    const current = ++request;
    selected = -1;
    failed = false;
    if (!q || !open) {
      results = [];
      loading = false;
      return;
    }
    loading = true;
    results = [];
    const timer = setTimeout(() => void loadResults(q, current), 60);
    return () => clearTimeout(timer);
  });
  async function loadResults(q: string, current: number, refresh = false) {
    try {
      const resource = suggestPackages(q.slice(0, 200));
      if (refresh) resource.refresh();
      const found = await resource;
      if (current === request) results = found.slice(0, 6);
    } catch {
      if (current === request) {
        failed = true;
        results = [];
      }
    } finally {
      if (current === request) loading = false;
    }
  }
  function retrySearch() {
    failed = false;
    loading = true;
    void loadResults(text.trim(), ++request, true);
  }
  function shortcut(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || document.querySelector('dialog[open]')) return;
    if (
      (event.key === '/' &&
        !event.ctrlKey && !event.metaKey && !event.altKey &&
        !(
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement ||
          (event.target instanceof HTMLElement && event.target.isContentEditable)
        ))
    ) {
      event.preventDefault();
      focusSearch();
    }
  }
  function keydown(event: KeyboardEvent) {
    if (event.isComposing) return;
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
      input
        .closest('.search-container')
        ?.querySelectorAll<HTMLAnchorElement>('.search-results > a')
        [selected]?.scrollIntoView({ block: 'nearest' });
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
    if (!event.composedPath().some((node) =>
      node instanceof Element && node.classList.contains('search-container')))
      open = false;
  }}
/>
<div class:large class="search-container" data-prefetch="off" data-sveltekit-preload-data="off">
  <form
    class="search-form"
    action="/search"
    role="search"
    aria-busy={submitting}
    onsubmit={() => (open = false)}
  >
    <Icon name="search" size={large ? 23 : 17} />
    <input
      bind:this={input}
      bind:value={text}
      onfocus={() => (open = true)}
      oninput={() => (open = true)}
      onkeydown={keydown}
      type="search"
      name="q"
      maxlength="200"
      autocomplete="off"
      spellcheck="false"
      aria-label="Search Go packages"
      aria-keyshortcuts="/"
      placeholder={large ? 'Search Go packages…' : 'Search packages…'}
      aria-controls={large ? 'hero-results' : 'header-results'}
    />
    {#if large}<button class="search-submit" type="submit" disabled={submitting}
        >{#if submitting}<span class="loading-spinner" aria-hidden="true"></span>Searching…{:else}Search <Icon name="arrow" size={16} />{/if}</button
      >{:else}<button type="button" class="search-shortcut" onclick={oncommand ?? focusSearch} aria-label="Open search and commands" title={`Search and commands (${shortcutLabel})`}><kbd>{shortcutLabel}</kbd></button>{/if}
  </form>
  {#if open && text.trim()}
    <div class="search-results" id={large ? 'hero-results' : 'header-results'}>
      <div class="search-caption" role="status" aria-live="polite">
        <span class="search-caption-label">
        {#if loading}<span class="loading-spinner" aria-hidden="true"></span>{/if}
        {loading
          ? 'Searching…'
          : failed
            ? 'Search unavailable. Try again.'
            : 'Packages'}
        </span>
        <span
          >{results.length
            ? selected >= 0
              ? 'Enter to open'
              : '↓ to select'
            : ''}</span
        >
      </div>
      {#each results as result, index}
        <a
          class:active={selected === index}
          href="/package/{result.path}"
          onclick={() => (open = false)}
          ><span
            ><strong>{result.name}</strong><small>{result.path}</small></span
          ><Icon name="arrow" size={15} /></a
        >
      {/each}
      {#if !loading && !failed && !results.length}<p class="search-empty">
          No packages found. Try a name or an import path.
        </p>{/if}
      {#if failed}<button type="button" class="search-retry" onclick={retrySearch}>Try again</button>{/if}
      <a
        class="all-results"
        href="/search?q={encodeURIComponent(text)}"
        onclick={() => (open = false)}
        >All results <Icon name="arrow" size={15} /></a
      >
    </div>
  {/if}
</div>
