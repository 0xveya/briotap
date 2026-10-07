<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let { open = $bindable(false), title, children }: { open: boolean; title: string; children: Snippet } = $props();
  let dialog = $state<HTMLDialogElement>();
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      queueMicrotask(() => dialog?.querySelector<HTMLInputElement>('input:not([type="checkbox"])')?.focus());
    }
    else if (!open && dialog.open) dialog.close();
  });
</script>
<dialog bind:this={dialog} class="search-dialog" aria-label={title}
  oncancel={(event) => { event.preventDefault(); open = false; }}
  onclose={() => (open = false)}
  onclick={(event) => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) open = false; } }}>
  <div class="dialog-heading"><h2>{title}</h2><button type="button" class="dialog-close" aria-label="Close dialog" onclick={() => (open = false)}><Icon name="close" /></button></div>
  {@render children()}
</dialog>
