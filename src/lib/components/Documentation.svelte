<script lang="ts">
  import { page } from '$app/state';
  import { getDocumentation } from '../../routes/index.remote';
  import type { documentation } from '$lib/server/documentation';
  import { documentFragment } from '$lib/document-contents';
  import { sourceBase } from '$lib/source-link';
  import { goDocsUrl } from '$lib/go-docs';
  import Reader from './Reader.svelte';

  let { path, modulePath, version, initial, onloaded }: {
    path: string; modulePath: string; version: string;
    initial?: Awaited<ReturnType<typeof documentation>> | null;
    onloaded?: (data: Awaited<ReturnType<typeof documentation>>) => void;
  } = $props();
  const doc = $derived(getDocumentation({ path, version }));
  const snapshot = $derived(initial?.path === path && initial.version === version ? initial : null);
  const result = $derived(snapshot ? { ok: true as const, data: snapshot } : doc.current);
  let visible = $state(40);
  const activeId = $derived(documentFragment(page.url.hash));
  $effect(() => { void activeId; visible = 40; });
  const start = $derived(result?.ok ? Math.max(0, result.data.sections.findIndex((section) =>
    section.id === activeId || section.aliases.includes(activeId))) : 0);
  const renderedHtml = $derived(result?.ok ? result.data.html + result.data.sections
    .slice(start, start + visible).map((section) => section.html).join('') : '');
  $effect(() => { if (result?.ok) onloaded?.(result.data); });
</script>

{#if result?.ok && (result.data.html || result.data.sections.length)}
  <Reader html={renderedHtml} headings={result.data.headings} symbols={result.data.symbols}
    sourceBase={sourceBase(path, result.data.modulePath, version)} title="Documentation"
    originalUrl={goDocsUrl(path, modulePath, version)} id="documentation" />
  {#if result.data.sections.length}<div class="notice">
    Showing entries {start + 1}–{Math.min(start + visible, result.data.sections.length)} of {result.data.sections.length}.
    Use Contents to jump to any section or symbol.
    {#if start + visible < result.data.sections.length}<br /><button onclick={() => (visible += 40)}>Read more</button>{/if}
  </div>{/if}
{:else if result?.ok}
  <div class="notice">
    <p>{result.data.isRedistributable ? 'This package does not publish documentation for this version.' : 'Documentation cannot be redistributed for this package.'}</p>
    <a href={goDocsUrl(path, modulePath, version)} target="_blank" rel="noreferrer">Open on pkg.go.dev ↗</a>
  </div>
{:else if result || doc.error}
  <div class="notice" role="alert">
    <p>{result && !result.ok ? result.message : 'Documentation could not be loaded. Try again.'}</p>
    <button disabled={doc.loading} onclick={() => doc.refresh()}>{doc.loading ? 'Retrying…' : 'Try again'}</button>
    <a href={goDocsUrl(path, modulePath, version)} target="_blank" rel="noreferrer">pkg.go.dev ↗</a>
  </div>
{:else}
  <div class="reader-loading" role="status" aria-live="polite"><span class="loading-spinner" aria-hidden="true"></span> Loading documentation…</div>
  <div class="skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
{/if}

<style>
  .reader-loading { display: flex; align-items: center; gap: 10px; padding: 24px 0 8px; color: var(--muted); }
</style>
