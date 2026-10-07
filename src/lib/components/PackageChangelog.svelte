<script lang="ts">
  import { readingTools } from '$lib/reading-tools';
  import { getReleases } from '../../routes/index.remote';
  let { repoUrl, version }: { repoUrl: string | null; version: string } = $props();
  const date = (value: string | null) => value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unavailable';
</script>
<div class="list-heading"><h2>Changelog</h2></div>
<p class="tab-intro">Recent repository releases. Selected module version: {version}. Release tags may cover more than one module.</p>
{#if repoUrl}
  <a class="original-docs" href={repoUrl.startsWith('https://github.com/') ? `${repoUrl}/releases` : repoUrl} target="_blank" rel="noreferrer">Repository releases ↗</a>
  {#await getReleases(repoUrl)}<p class="tab-intro" role="status">Loading release notes…</p>
  {:then result}
    {#if result.ok}
      {#each result.items as release}
        <details class="release-notes" open={release.tag === version || result.items[0] === release}>
          <summary><span>{release.name}{#if release.prerelease}<small>Prerelease</small>{/if}</span><time datetime={release.publishedAt ?? undefined}>{date(release.publishedAt)}</time></summary>
          <a class="original-docs" href={release.url} target="_blank" rel="noreferrer">{release.tag} on GitHub ↗</a>
          <div class="prose release-body" use:readingTools={{ html: release.html, sourceBase: '' }}>{@html release.html || '<p>No release notes provided.</p>'}</div>
        </details>
      {:else}<div class="notice">No published repository releases were found.</div>{/each}
    {:else}<div class="notice">{result.message}</div>{/if}
  {/await}
{:else}<div class="notice">No source repository is recorded for this module.</div>{/if}
