<script lang="ts">
  import { onMount } from 'svelte';
  import {
    readReaderPreferences,
    saveReaderPreferences,
    type ReaderPreferences
  } from '$lib/reader-preferences';
  import { page } from '$app/state';
  import { getDocumentation } from '../../routes/index.remote';
  import type { documentation } from '$lib/server/documentation';
  import { highlightSnippets } from '$lib/highlight';
  import { readingTools } from '$lib/reading-tools';
  import { sourceBase } from '$lib/source-link';
  import SymbolIndex from './SymbolIndex.svelte';
  import { goDocsUrl } from '$lib/go-docs';
  let {
    path,
    modulePath,
    version,
    onloaded
  }: {
    path: string;
    modulePath: string;
    version: string;
    onloaded?: (data: Awaited<ReturnType<typeof documentation>>) => void;
  } = $props();
  const doc = $derived(getDocumentation({ path, version }));
  let symbolsOpen = $state(false);
  let symbolToggle = $state<HTMLElement>();
  let textSize = $state<ReaderPreferences['textSize']>('normal');
  let wrapCode = $state(false);
  let preferencesReady = $state(false);
  onMount(() => {
    const saved = readReaderPreferences();
    if (saved) {
      textSize = saved.textSize;
      wrapCode = saved.wrapCode;
    }
    preferencesReady = true;
  });
  $effect(() => {
    if (preferencesReady) saveReaderPreferences({ textSize, wrapCode });
  });
  let visible = $state(40);
  $effect(() => {
    if (!symbolsOpen) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById('reader-symbol-search')?.focus()
    );
    return () => cancelAnimationFrame(frame);
  });
  const start = $derived(
    doc.current?.ok
      ? Math.max(
          0,
          doc.current.data.sections.findIndex(
            (section) =>
              `#${section.id}` === page.url.hash ||
              section.aliases.includes(page.url.hash.slice(1))
          )
        )
      : 0
  );
  const renderedHtml = $derived(
    doc.current?.ok
      ? doc.current.data.html +
          doc.current.data.sections
            .slice(start, start + visible)
            .map((section) => section.html)
            .join('')
      : ''
  );
  $effect(() => {
    if (!doc.current?.ok) return;
    onloaded?.(doc.current.data);
    if (page.url.hash) {
      void renderedHtml;
      const frame = requestAnimationFrame(() => {
        const target = document.getElementById(
          decodeURIComponent(window.location.hash.slice(1))
        );
        if (!target) return;
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
        target.scrollIntoView();
      });
      return () => cancelAnimationFrame(frame);
    }
  });
</script>

<svelte:window
  onkeydown={(event) => {
    if (
      event.key === 'f' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !(
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      )
    ) {
      event.preventDefault();
      symbolsOpen = true;
    }
    if (event.key === 'Escape' && symbolsOpen) {
      event.preventDefault();
      symbolsOpen = false;
      symbolToggle?.focus();
    }
  }}
  onclick={(event) => {
    if (
      event.target instanceof Element &&
      !event.target.closest('.reader-symbols')
    )
      symbolsOpen = false;
  }}
/>

<div class="doc-heading" id="documentation">
  <h2>Documentation</h2>
  <a
    class="original-docs"
    href={goDocsUrl(path, modulePath, version)}
    target="_blank"
    rel="noreferrer">pkg.go.dev ↗</a
  >
</div>
{#await doc}<div
    class="skeleton"
    role="status"
    aria-label="Loading documentation"
  >
    <span></span><span></span><span></span><span></span>
  </div>
{:then result}
  {#if result.ok}
    {#if result.data.html || result.data.sections.length > 0}
      <div class="reader-toolbar">
        <details class="reader-symbols" bind:open={symbolsOpen}>
          <summary bind:this={symbolToggle}
            >Symbols <span>{result.data.symbols.length}</span>
            <kbd>f</kbd></summary
          >
          <div class="reader-symbol-menu" hidden={!symbolsOpen}>
            <SymbolIndex
              symbols={result.data.symbols}
              sourceBase={sourceBase(path, result.data.modulePath, version)}
              id="reader-symbol-search"
              onselect={() => (symbolsOpen = false)}
            />
          </div>
        </details>
        <label class="reader-size"
          ><span class="sr-only">Documentation text size</span>
          <select aria-label="Documentation text size" bind:value={textSize}>
            <option value="normal">Text size</option><option value="large"
              >Large text</option
            >
          </select>
        </label>
        <label class="reader-wrap"
          ><input type="checkbox" bind:checked={wrapCode} /> Wrap code</label
        >
        <a class="reader-top" href="#documentation">Top ↑</a>
      </div>
      <div
        class="prose"
        class:large-text={textSize === 'large'}
        class:wrap-code={wrapCode}
        data-documentation
        use:highlightSnippets={renderedHtml}
        use:readingTools={{
          html: renderedHtml,
          sourceBase: sourceBase(path, result.data.modulePath, version)
        }}
      >
        {@html renderedHtml}
      </div>
      {#if result.data.sections.length > 0}<div class="notice">
          Showing symbols {start + 1}–{Math.min(
            start + visible,
            result.data.sections.length
          )} of {result.data.sections.length}. Use the symbol search to jump
          straight to an API.
          {#if start + visible < result.data.sections.length}<br /><button
              onclick={() => (visible += 40)}>Read more symbols</button
            >{/if}
        </div>{/if}
    {:else}<div class="notice">
        {result.data.isRedistributable
          ? 'This package does not publish documentation for this version.'
          : 'Documentation cannot be redistributed for this package.'}
        <a
          href={goDocsUrl(path, modulePath, version)}
          target="_blank"
          rel="noreferrer">Open on pkg.go.dev ↗</a
        >
      </div>{/if}
  {:else}<div class="notice">
      <p>{result.message}</p>
      <button onclick={() => doc.refresh()}>Try again</button>
      <a
        href={goDocsUrl(path, modulePath, version)}
        target="_blank"
        rel="noreferrer">pkg.go.dev ↗</a
      >
    </div>{/if}
{/await}
