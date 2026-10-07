<script lang="ts">
  let { url, size = 16 }: { url: string; size?: number } = $props();
  const forge = $derived(
    url.startsWith('https://github.com/')
      ? 'github'
      : url.startsWith('https://gitlab.com/')
        ? 'gitlab'
        : 'git'
  );
</script>

<span
  class="repository-icon"
  style:width="{size}px"
  style:height="{size}px"
  style:mask-image="url('/icons/{forge}.svg')"
  aria-hidden="true"
></span>
