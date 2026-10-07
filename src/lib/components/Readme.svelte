<script lang="ts">
  import { getReadme } from '../../routes/index.remote';
  import { goDocsUrl } from '$lib/go-docs';
  import Reader from './Reader.svelte';
  let { path, modulePath, version }: { path: string; modulePath: string; version: string } = $props();
  const request = $derived(getReadme({ modulePath, version }));
  const result = $derived(request.current);
  const originalUrl = $derived(`${goDocsUrl(modulePath, modulePath, version)}#readme`);
</script>

{#if result?.ok && result.data.html}
  <Reader html={result.data.html} headings={result.data.headings} title={path === modulePath ? 'README' : 'Module README'} {originalUrl} id="readme" readme />
{:else if result?.ok}
  <div class="notice">
    <p>{result.data.isRedistributable ? 'This module does not publish a README for this version.' : 'The README cannot be redistributed for this module.'}</p>
    <a href="/package/{path}?version={encodeURIComponent(version)}&tab=docs">Read package documentation →</a>
    <a href={originalUrl} target="_blank" rel="noreferrer">pkg.go.dev ↗</a>
  </div>
{:else if result || request.error}
  <div class="notice" role="alert">
    <p>{result && !result.ok ? result.message : 'The README could not be loaded. Try again.'}</p>
    <button disabled={request.loading} onclick={() => request.refresh()}>{request.loading ? 'Retrying…' : 'Try again'}</button>
    <a href={originalUrl} target="_blank" rel="noreferrer">pkg.go.dev ↗</a>
  </div>
{:else}
  <div class="reader-loading" role="status" aria-live="polite"><span class="loading-spinner" aria-hidden="true"></span> Loading README…</div>
  <div class="skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
{/if}

<style>
  .reader-loading { display: flex; align-items: center; gap: 10px; padding: 24px 0 8px; color: var(--muted); }
</style>
