<script lang="ts">
  import { page } from '$app/state';
  import Copy from './Copy.svelte';
  import Icon from './Icon.svelte';
  let {
    value,
    path,
    indexedVersion,
    versions
  }: {
    value: string;
    path: string;
    indexedVersion: string;
    versions: { version: string; retracted?: boolean }[] | null | undefined;
  } = $props();
  let open = $state(false);
  let filter = $state('');
  let root = $state<HTMLElement>();
  let trigger = $state<HTMLElement>();
  const choices = $derived(
    (versions?.some((item) => item.version === value)
      ? versions
      : [{ version: value, retracted: false }, ...(versions ?? [])]).filter((item) =>
      item.version.toLowerCase().includes(filter.toLowerCase())
    )
  );
  $effect(() => {
    void value;
    open = false;
    filter = '';
  });
  function href(version: string) {
    const url = new URL(page.url);
    url.searchParams.set('version', version);
    url.hash = '';
    return `${url.pathname}${url.search}`;
  }
  function move(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const links = [
      ...(root?.querySelectorAll<HTMLAnchorElement>('.version-choice > a') ??
        [])
    ];
    const current = links.findIndex((link) => link === event.target);
    event.preventDefault();
    links[
      Math.max(
        0,
        Math.min(
          links.length - 1,
          current + (event.key === 'ArrowDown' ? 1 : -1)
        )
      )
    ]?.focus();
  }
</script>

<svelte:window
  onclick={(event) => {
    if (event.target instanceof Node && !root?.contains(event.target))
      open = false;
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      open = false;
      trigger?.focus();
    }
  }}
/>
<details class="version-picker" bind:open bind:this={root}>
  <summary bind:this={trigger} aria-label="Select package version">
    <span>{value}</span><Icon name="chevron" size={16} />
  </summary>
  {#if open}<div class="version-menu">
      <label class="sr-only" for="version-filter">Filter versions</label>
      <input
        id="version-filter"
        type="search"
        placeholder="Filter versions"
        bind:value={filter}
        onkeydown={move}
        autocomplete="off"
      />
      <div class="version-choices">
        {#each choices as item (item.version)}<div class="version-choice" class:current={item.version === value}>
            <a
              href={href(item.version)}
              aria-current={item.version === value ? 'true' : undefined}
              onkeydown={move}
              onclick={() => (open = false)}
            >
              <span>{item.version}</span>
              {#if item.version === value}<Icon name="check" size={14} />{/if}
              {#if item.retracted}<small>retracted</small
                >{:else if item.version === indexedVersion}<small>indexed</small
                >{/if}
            </a>
            <Copy
              text={`go get ${path}@${item.version}`}
              label={`Copy go get for ${item.version}`}
            />
          </div>{:else}<p class="version-message">
            No matching versions.
          </p>{/each}
      </div>
      {#if versions === undefined}<p class="version-message">
          Loading versions…
        </p>{:else if versions === null}<p class="version-message">
          Version history unavailable.
        </p>{/if}
    </div>{/if}
</details>
