<script lang="ts">
  import { getImportStatus } from './index.remote';
</script>

<svelte:head>
  <title>briotap</title>
</svelte:head>

<h1>briotap</h1>
<p>Go module index import</p>
<p>{(await getImportStatus()).bytesImported.toLocaleString()} bytes imported</p>
