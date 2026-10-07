<script lang="ts">
  import { page } from '$app/state';
  import Icon from '$lib/components/Icon.svelte';
</script>

<svelte:head><title>{page.status} · briotap</title></svelte:head>
<div class="wrap search-page">
  <p class="tab-intro">{page.status}</p>
  <h1>
    {page.status === 404
      ? 'Package not found'
      : 'Unable to load page'}
  </h1>
  <p class="tab-intro">{page.error?.message}</p>
  <a class="text-link" href="/search"
    >Search packages <Icon name="arrow" size={16} /></a
  >
</div>
