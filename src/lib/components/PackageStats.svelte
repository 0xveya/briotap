<script lang="ts">
  import type { insights } from '$lib/server/insights';
  let { details }: { details: Awaited<ReturnType<typeof insights>> } = $props();
  const number = (value: number | null | undefined) => value == null ? 'Unavailable' : new Intl.NumberFormat('en').format(value);
  const metrics = $derived([
    ['Imported by', details.importedBy?.total],
    ['GitHub stars', details.project?.starsCount],
    ['Forks', details.project?.forksCount],
    ['Open issues', details.project?.openIssuesCount],
    ['Direct dependencies', details.requirements?.filter((item) => !item.indirect).length],
    ['Indirect dependencies', details.requirements?.filter((item) => item.indirect).length]
  ] as const);
</script>
<div class="list-heading"><h2>Stats</h2></div>
<p class="tab-intro">Current upstream snapshots from pkg.go.dev and deps.dev. Import counts include all recorded versions.</p>
<dl class="stats-grid">
  {#each metrics as [label, value]}<div><dt>{label}</dt><dd>{number(value)}</dd></div>{/each}
</dl>
{#if details.project?.scorecard?.overallScore != null}
  <h3 class="content-title">OpenSSF Scorecard</h3>
  <p class="scorecard-result"><strong>{details.project.scorecard.overallScore} / 10</strong><span>Recorded {details.project.scorecard.date ? new Date(details.project.scorecard.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'date unavailable'}</span></p>
{/if}
<h3 class="content-title">Known advisories</h3>
{#if details.metadata}
  <div class="compact-list">
    {#each details.metadata.advisoryKeys as advisory}<a href="https://osv.dev/vulnerability/{encodeURIComponent(advisory.id)}" target="_blank" rel="noreferrer"><span>{advisory.id}</span><small>OSV ↗</small></a>
    {:else}<p>No advisories reported by deps.dev for this version.</p>{/each}
  </div>
{:else}<div class="notice">Advisory data unavailable.</div>{/if}
