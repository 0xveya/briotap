<script lang="ts">
  import { onMount } from 'svelte';
  import { prefetchLink, prefetchOnIntent } from '$lib/prefetch';
  import { goto } from '$app/navigation';
  import { searchPackages } from '../../routes/index.remote';
  import type { SearchResult } from '$lib/server/search';
  import Icon from './Icon.svelte';
  let { large = false, value = '', oncommand }: { large?: boolean; value?: string; oncommand?: () => void } =
    $props();
  let text = $state('');
  let results = $state<SearchResult[]>([]);
  let open = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  let input: HTMLInputElement;
  let selected = $state(-1);
  let request = 0;
  let shortcutLabel = $state('Ctrl K');
  onMount(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) shortcutLabel = '⌘ K';
  });
  function focusSearch() {
    input.focus();
    input.select();
    open = true;
  }
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
      if (selected >= 0 && results[selected])
        void prefetchLink(`/package/${results[selected]!.path}`);
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
    if (
      !(event.target instanceof Element) ||
      !event.target.closest('.search-container')
    )
      open = false;
  }}
/>
<div class:large class="search-container" use:prefetchOnIntent>
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
    {#if large}<button class="search-submit" type="submit"
        >Search <Icon name="arrow" size={16} /></button
      >{:else}<button type="button" class="search-shortcut" onclick={oncommand ?? focusSearch} aria-label="Open search and commands" title={`Search and commands (${shortcutLabel})`}><kbd>{shortcutLabel}</kbd></button>{/if}
  </form>
  {#if open && text.trim()}
    <div class="search-results" id={large ? 'hero-results' : 'header-results'}>
      <div class="search-caption">
        {loading
          ? 'Searching…'
          : failed
            ? 'Search unavailable. Try again.'
            : 'Packages'}
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
      <a
        class="all-results"
        href="/search?q={encodeURIComponent(text)}"
        onclick={() => (open = false)}
        >All results <Icon name="arrow" size={15} /></a
      >
    </div>
  {/if}
</div>
