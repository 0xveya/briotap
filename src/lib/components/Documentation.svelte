<script lang="ts">
  import { page } from '$app/state';
  import { getDocumentation } from '../../routes/index.remote';
  import type { documentation } from '$lib/server/documentation';
  import { highlightSnippets } from '$lib/highlight';
  let {
    path,
    version,
    onloaded
  }: {
    path: string;
    version: string;
    onloaded?: (data: Awaited<ReturnType<typeof documentation>>) => void;
  } = $props();
  const doc = $derived(getDocumentation({ path, version }));
  let filter = $state('');
  let visible = $state(40);
  const start = $derived(
    doc.current?.ok
      ? Math.max(
          0,
          doc.current.data.sections.findIndex(
            (section) => `#${section.id}` === page.url.hash
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
    if (page.url.hash.startsWith('#symbol-')) {
      void renderedHtml;
      const frame = requestAnimationFrame(() =>
        document
          .getElementById(decodeURIComponent(window.location.hash.slice(1)))
          ?.scrollIntoView()
      );
      return () => cancelAnimationFrame(frame);
    }
  });
</script>

<div class="doc-heading">
  <h2>Documentation</h2>
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
      <div class="doc-filter-mobile">
        <label class="sr-only" for="mobile-symbols">Find a symbol</label><input
          class="symbol-search"
          id="mobile-symbols"
          type="search"
          bind:value={filter}
          placeholder="Find a symbol, e.g. NewRouter…"
        />{#if filter}<div class="symbol-results">
            {#each result.data.symbols
              .filter((symbol) => symbol.name
                  .toLowerCase()
                  .includes(filter.toLowerCase()))
              .slice(0, 60) as symbol}<a
                href="#{symbol.id}"
                onclick={() => (filter = '')}>{symbol.name}</a
              >{:else}<span class="tab-intro">No symbols match.</span>{/each}
          </div>{/if}
      </div>
      <div
        class="prose"
        data-documentation
        use:highlightSnippets={renderedHtml}
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
          href="https://pkg.go.dev/{path}@{version}"
          target="_blank"
          rel="noreferrer">Open on pkg.go.dev ↗</a
        >
      </div>{/if}
  {:else}<div class="notice">
      <p>{result.message}</p>
      <button onclick={() => doc.refresh()}>Try again</button>
      <a
        href="https://pkg.go.dev/{path}@{version}"
        target="_blank"
        rel="noreferrer">pkg.go.dev ↗</a
      >
    </div>{/if}
{/await}
