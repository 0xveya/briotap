<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  let theme = $state<'dark' | 'light'>('dark');
  function apply(value: 'dark' | 'light') {
    theme = value;
    document.documentElement.dataset.theme = value;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', value === 'light' ? '#fffdfd' : '#080809');
  }
  onMount(() => {
    apply(
      document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    );
    const sync = (event: StorageEvent) => {
      if (event.key === 'briotap:theme')
        apply(event.newValue === 'light' ? 'light' : 'dark');
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  });
  function toggle() {
    apply(theme === 'dark' ? 'light' : 'dark');
    try {
      localStorage.setItem('briotap:theme', theme);
    } catch {
      /* Keep the toggle usable with storage disabled. */
    }
  }
</script>

<button
  class="theme-toggle"
  type="button"
  onclick={toggle}
  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
  <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
</button>
