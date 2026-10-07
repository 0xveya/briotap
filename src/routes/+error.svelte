<script lang="ts">
  import { page } from '$app/state';
  import Icon from '$lib/components/Icon.svelte';
</script>

<svelte:head><title>{page.status} · briotap</title></svelte:head>
<div class="wrap search-page">
  <div class="eyebrow">{page.status} / A SMALL DETOUR</div>
  <h1>
    {page.status === 404
      ? 'Not in the index. Yet.'
      : 'Something interrupted the search.'}
  </h1>
  <p class="tab-intro">{page.error?.message}</p>
  <a class="text-link" href="/search"
    >Find another package <Icon name="arrow" size={16} /></a
  >
</div>
