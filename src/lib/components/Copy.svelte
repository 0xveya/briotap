<script lang="ts">
  import Icon from './Icon.svelte';
  let {
    text,
    label = 'Copy install command'
  }: { text: string; label?: string } = $props();
  let state = $state<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      state = 'copied';
    } catch {
      state = 'failed';
    }
    setTimeout(() => (state = 'idle'), 2000);
  }
</script>

<button
  class="copy-button"
  onclick={copy}
  aria-label={state === 'copied' ? 'Copied' : label}
  title={state === 'failed'
    ? 'Select the command and copy it manually'
    : 'Copy'}
  ><Icon name={state === 'copied' ? 'check' : 'copy'} size={16} /><span
    class="sr-only"
    aria-live="polite"
    >{state === 'copied'
      ? 'Copied'
      : state === 'failed'
        ? 'Copy failed. Select the command to copy it.'
        : ''}</span
  ></button
>
