<script lang="ts">
  import Icon from './Icon.svelte';
  import { getSocketScore } from '../../routes/index.remote';
  let { modulePath, version }: { modulePath: string; version: string } = $props();
  const path = $derived(modulePath.split('/').map(encodeURIComponent).join('/'));
  const url = $derived(`https://socket.dev/go/package/${path}?version=${encodeURIComponent(version)}`);
  const score = $derived(getSocketScore({ modulePath, version }));
</script>

<a href={url} target="_blank" rel="noreferrer" title={`Socket score for ${modulePath}@${version}`} class="socket-score">
  <span>Socket</span>
  {#await score}<span class="score" aria-label="Loading score">…</span>
  {:then value}<span class="score">{value === null ? 'Unavailable' : `${value}/100`}</span>
  {:catch}<span class="score">Unavailable</span>{/await}
  <Icon name="external" size={12} />
</a>

<style>
  .socket-score { display: inline-flex; align-items: center; gap: 7px; min-height: 44px; }
  .score { font-variant-numeric: tabular-nums; }
</style>
