<script lang="ts">
  import { getSourceFiles, getSourceFile } from '../../routes/index.remote';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import Copy from './Copy.svelte';
  import { highlightSnippets } from '$lib/highlight';
  let { path, modulePath, version }: { path: string; modulePath: string; version: string } = $props();
  const input = $derived({ path, modulePath, version });
  function fileUrl(name: string) {
    const url = new URL(page.url);
    url.searchParams.set('file', name);
    return `${url.pathname}${url.search}`;
  }
</script>

<div class="list-heading"><h2>Code</h2></div>
<p class="tab-intro">Source files for {path}@{version}.</p>
{#await getSourceFiles(input)}
  <p class="tab-intro" role="status">Loading source files…</p>
{:then result}
  {#if result.ok && result.files.length}
    {@const selected = result.files.find((file) => file.name === page.url.searchParams.get('file')) ?? result.files[0]!}
    <div class="source-file-tabs" aria-label="Source files">
      {#each result.files as file}
        <a href={fileUrl(file.name)} aria-current={file.name === selected.name ? 'page' : undefined}
          onclick={(event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); void goto(fileUrl(file.name), { noScroll: true }); } }}>{file.name}</a>
      {/each}
    </div>
    {#await getSourceFile({ ...input, name: selected.name })}
      <p class="tab-intro" role="status">Loading {selected.name}…</p>
    {:then response}
      <a class="original-docs" href={selected.url} target="_blank" rel="noreferrer">{selected.name} in source repository ↗</a>
      {#if response.ok && response.file.code !== null}
        {#key selected.name}
          <div class="prose source-code" use:highlightSnippets={{ html: response.file.code, maxLength: 200_000 }}>
            <div class="snippet-frame"><pre><code>{response.file.code}</code></pre><Copy text={response.file.code} label={`Copy ${selected.name}`} /></div>
          </div>
        {/key}
      {:else}<div class="notice">{response.ok ? 'Read this file in the source repository.' : response.message}</div>{/if}
    {/await}
  {:else}<div class="notice">{result.ok ? 'No source files were listed for this package.' : result.message}</div>{/if}
{/await}
