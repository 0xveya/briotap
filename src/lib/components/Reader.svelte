<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { saveReaderPreferences } from '$lib/reader-preferences';
  import { readingTools } from '$lib/reading-tools';
  import { highlightSnippets } from '$lib/highlight';
  import { documentFragment, type DocumentHeading } from '$lib/document-contents';
  import type { SymbolEntry } from '$lib/symbol-search';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';
  import SymbolIndex from './SymbolIndex.svelte';

  let { html, headings, symbols = [], sourceBase = '', title, originalUrl, id, readme = false }: {
    html: string; headings: DocumentHeading[]; symbols?: SymbolEntry[]; sourceBase?: string;
    title: string; originalUrl: string; id: string; readme?: boolean;
  } = $props();
  let contentsOpen = $state(false);
  let toggle = $state<HTMLButtonElement>();
  let wrapCode = $state(page.data.wrapCode);
  const contents = $derived<SymbolEntry[]>([
    ...headings.map((heading) => ({ ...heading, kind: 'section', signature: '' })),
    ...symbols
  ]);
  let lastJump = '';
  function focusTarget(targetId: string) {
    const target = document.getElementById(targetId);
    if (!target) return;
    lastJump = targetId;
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView();
  }
  function selectTarget(targetId: string) {
    contentsOpen = false;
    lastJump = '';
    if (documentFragment(page.url.hash) === targetId) requestAnimationFrame(() => focusTarget(targetId));
  }
  $effect(() => saveReaderPreferences({ wrapCode }));
  $effect(() => {
    if (!['symbols', 'contents'].includes(page.url.searchParams.get('find') ?? '')) return;
    contentsOpen = true;
    const url = new URL(page.url);
    url.searchParams.delete('find');
    void goto(`${url.pathname}${url.search}${url.hash}`, { replaceState: true, noScroll: true, keepFocus: true });
  });
  $effect(() => {
    const targetId = documentFragment(page.url.hash);
    void html;
    if (!targetId || targetId === lastJump) return;
    const frame = requestAnimationFrame(() => focusTarget(targetId));
    return () => cancelAnimationFrame(frame);
  });
  function shortcut(event: KeyboardEvent) {
    if (!contents.length) return;
    if (event.defaultPrevented || event.repeat || event.isComposing) return;
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 's' &&
      (contentsOpen || (!document.querySelector('dialog[open]') && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || (event.target instanceof HTMLElement && event.target.isContentEditable))))) {
      event.preventDefault();
      contentsOpen = !contentsOpen;
    }
    if (event.key === 'Escape' && contentsOpen) { contentsOpen = false; toggle?.focus(); }
  }
</script>

<svelte:window onkeydown={shortcut} />
<div class="doc-heading" {id}>
  <h2>{title}</h2>
  <a class="original-docs" href={originalUrl} target="_blank" rel="noreferrer">pkg.go.dev ↗</a>
</div>
<div class="reader-toolbar">
  {#if contents.length}
  <button type="button" class="reader-symbol-trigger" bind:this={toggle} onclick={() => (contentsOpen = true)} aria-keyshortcuts="Alt+s">
    <Icon name="search" size={16} /> Contents <span>{contents.length}</span><kbd>Alt S</kbd>
  </button>
  <Dialog bind:open={contentsOpen} title="Table of contents">
    <SymbolIndex symbols={contents} {sourceBase} id={`${id}-contents-search`} onselect={selectTarget} />
  </Dialog>
  {/if}
  <label class="reader-wrap"><input type="checkbox" bind:checked={wrapCode} /> Wrap code</label>
  <a class="reader-top" href="#{id}">Top ↑</a>
</div>
<div class="reader-surface" class:readme>
  {#if readme}
    <div class="prose" class:wrap-code={wrapCode} data-readme use:highlightSnippets={{ html, maxLength: 30_000, language: 'text' }} use:readingTools={{ html, sourceBase }}>{@html html}</div>
  {:else}
    <div class="prose" class:wrap-code={wrapCode} data-documentation use:highlightSnippets={html} use:readingTools={{ html, sourceBase }}>{@html html}</div>
  {/if}
</div>

<style>
  .reader-surface :global(ul), .reader-surface :global(ol) { padding-left: 1.5em; margin: 1em 0; }
  .reader-surface :global(ul) { list-style: disc; }
  .reader-surface :global(ol) { list-style: decimal; }
  .reader-surface :global(li) { margin: 0.35em 0; padding-left: 0.15em; }
  .reader-surface :global(li > ul), .reader-surface :global(li > ol) { margin: 0.35em 0; }
  .reader-surface :global(h1), .reader-surface :global(h5), .reader-surface :global(h6) { color: var(--pink); scroll-margin-top: 150px; }
  .reader-surface :global(img) { max-width: 100%; height: auto; vertical-align: middle; }
  .reader-surface :global(details) { margin: 1em 0; }
  .reader-surface :global(summary) { cursor: pointer; color: var(--text); }
  .readme :global(h1), .readme :global(h2), .readme :global(h3), .readme :global(h4) { font-family: 'DM Sans', sans-serif; line-height: 1.35; }
</style>
