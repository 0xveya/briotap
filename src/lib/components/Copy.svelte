<script lang="ts">
  import Icon from './Icon.svelte';
  import { onDestroy } from 'svelte';
  import { copyText } from '$lib/clipboard';
  let {
    text,
    label = 'Copy install command'
  }: { text: string; label?: string } = $props();
  let state = $state<'idle' | 'copied' | 'failed'>('idle');
  let timer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(timer));
  async function copy() {
    state = (await copyText(text)) ? 'copied' : 'failed';
    clearTimeout(timer);
    timer = setTimeout(() => (state = 'idle'), 2000);
  }
</script>

<button
  class="copy-button"
  type="button"
  onclick={copy}
  aria-label={state === 'copied'
    ? 'Copied'
    : state === 'failed'
      ? 'Copy failed'
      : label}
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
