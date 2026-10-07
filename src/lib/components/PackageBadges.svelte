<script lang="ts">
  import { page } from '$app/state';
  import Copy from './Copy.svelte';
  let { path, modulePath }: { path: string; modulePath: string } = $props();
  const badges = $derived([
    { type: 'version', label: 'Version', target: `${page.url.origin}/package/${path}?tab=versions` },
    { type: 'docs', label: 'Documentation', target: `${page.url.origin}/package/${path}?tab=docs` },
    { type: 'socket', label: 'Socket score', target: `https://socket.dev/go/package/${modulePath}` }
  ]);
</script>

<details class="package-badges">
  <summary>README badges</summary>
  <p>Badges follow the latest indexed version.</p>
  {#each badges as item}
    {@const image = `${page.url.origin}/badge/${path}?type=${item.type}`}
    {@const markdown = `[![${item.label}](${image})](${item.target})`}
    <div class="badge-row">
      <a href={item.target}><img src={image} alt={item.label} loading="lazy" height="20" /></a>
      <code>{markdown}</code>
      <Copy text={markdown} label={`Copy ${item.label.toLowerCase()} badge Markdown`} />
    </div>
  {/each}
</details>

<style>
  .package-badges { margin-top: 28px; }
  summary { cursor: pointer; min-height: 44px; color: var(--text); }
  p { color: var(--muted); font-size: 0.8125rem; margin: 0 0 12px; }
  .badge-row { display: flex; align-items: center; gap: 12px; min-height: 52px; border-top: 1px solid var(--line); }
  .badge-row > a { flex-shrink: 0; }
  .badge-row img { display: block; }
  .badge-row code { min-width: 0; flex: 1; overflow: auto; white-space: nowrap; font: 0.75rem var(--mono); }
  .badge-row :global(.copy-button) { flex-shrink: 0; }
</style>
