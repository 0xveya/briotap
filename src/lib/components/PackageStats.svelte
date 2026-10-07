<script lang="ts">
  import type { insights } from '$lib/server/insights';
  import SocketScore from './SocketScore.svelte';
  import PackageBadges from './PackageBadges.svelte';
  import { repositoryMetrics } from '$lib/repository-links';
  let { details, path, repoUrl, modulePath, version }: {
    details: Awaited<ReturnType<typeof insights>>;
    path: string;
    repoUrl: string | null;
    modulePath: string;
    version: string;
  } = $props();
  const scorecardUrl = $derived(details.projectId ? `https://scorecard.dev/viewer/?uri=${encodeURIComponent(details.projectId)}` : null);
  const repository = $derived(repositoryMetrics(repoUrl));
  const packageUrl = $derived(`/package/${path}?version=${encodeURIComponent(version)}`);
  const number = (value: number | null | undefined) => value == null ? 'Unavailable' : new Intl.NumberFormat('en').format(value);
  const metrics = $derived([
    ['Imported by (all versions)', details.importedBy?.total, `${packageUrl}&tab=imported-by`],
    ['Repository stars', details.project?.starsCount, repository?.stars],
    ['Forks', details.project?.forksCount, repository?.forks],
    ['Open issues', details.project?.openIssuesCount, repository?.issues],
    ['Direct dependencies', details.requirements?.filter((item) => !item.indirect).length, `${packageUrl}&tab=dependencies`],
    ['Indirect dependencies', details.requirements?.filter((item) => item.indirect).length, `${packageUrl}&tab=dependencies`]
  ] as const);
</script>
<div class="list-heading"><h2>Stats</h2></div>
<dl class="stats-grid">
  {#each metrics as [label, value, href]}<div><dt>{label}</dt><dd>{#if href}<a {href} target={href.startsWith('https:') ? '_blank' : undefined} rel={href.startsWith('https:') ? 'noreferrer' : undefined}>{number(value)}</a>{:else}{number(value)}{/if}</dd></div>{/each}
</dl>
<h3 class="content-title">Socket security</h3>
<SocketScore {modulePath} {version} />
{#if details.project?.scorecard?.overallScore != null}
  <h3 class="content-title">{#if scorecardUrl}<a href={scorecardUrl} target="_blank" rel="noreferrer">OpenSSF Scorecard ↗</a>{:else}OpenSSF Scorecard{/if}</h3>
  <p class="scorecard-result"><strong>{#if scorecardUrl}<a href={scorecardUrl} target="_blank" rel="noreferrer">{details.project.scorecard.overallScore} / 10</a>{:else}{details.project.scorecard.overallScore} / 10{/if}</strong><span>Recorded {details.project.scorecard.date ? new Date(details.project.scorecard.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'date unavailable'}</span></p>
{/if}
<h3 class="content-title">Known advisories</h3>
{#if details.metadata}
  <div class="compact-list">
    {#each details.metadata.advisoryKeys as advisory}<a href="https://osv.dev/vulnerability/{encodeURIComponent(advisory.id)}" target="_blank" rel="noreferrer"><span>{advisory.id}</span><small>OSV ↗</small></a>
    {:else}<p>No advisories reported by deps.dev for this version.</p>{/each}
  </div>
{:else}<div class="notice">Advisory data unavailable.</div>{/if}
<PackageBadges {path} {modulePath} />
