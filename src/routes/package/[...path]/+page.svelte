<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import type { documentation } from '$lib/server/documentation';
  import { getDocumentation, getInsights } from '../../index.remote';
  import Documentation from '$lib/components/Documentation.svelte';
  import Copy from '$lib/components/Copy.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { sourceBase } from '$lib/source-link';
  import SymbolIndex from '$lib/components/SymbolIndex.svelte';
  import DependencyList from '$lib/components/DependencyList.svelte';
  let { data }: { data: PageData } = $props();
  const pkg = $derived(data.pkg);
  const tabs = [
    'overview',
    'docs',
    'dependencies',
    'imported-by',
    'versions',
    'packages'
  ] as const;
  const tab = $derived(
    tabs.find((item) => item === page.url.searchParams.get('tab')) ?? 'overview'
  );
  const info = $derived(
    getInsights({
      path: pkg.path,
      modulePath: pkg.modulePath,
      version: pkg.version
    })
  );
  let loadedDocumentation = $state<Awaited<
    ReturnType<typeof documentation>
  > | null>(null);
  const documentationData = $derived(
    loadedDocumentation?.path === pkg.path &&
      loadedDocumentation.version === pkg.version
      ? loadedDocumentation
      : null
  );
  const install = $derived(`go get ${pkg.modulePath}@${pkg.version}`);
  const formatNumber = (value: number | undefined | null) =>
    value == null ? '—' : new Intl.NumberFormat('en').format(value);
  const date = (value: string | undefined | null) =>
    value
      ? new Date(value).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        })
      : 'Unavailable';
  function tabUrl(value: string) {
    const url = new URL(page.url);
    url.searchParams.set('tab', value);
    url.hash = '';
    return `${url.pathname}${url.search}`;
  }
  function switchVersion(version: string) {
    const url = new URL(page.url);
    url.searchParams.set('version', version);
    url.hash = '';
    void goto(`${url.pathname}${url.search}`);
  }
  function shortcut(event: KeyboardEvent) {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    if (event.key === 'd') void goto(tabUrl('docs'));
    if (event.key === 'm') void goto(tabUrl('overview'));
  }
</script>

<svelte:window onkeydown={shortcut} />
<svelte:head
  ><title>{pkg.name} {pkg.version} · briotap</title><meta
    name="description"
    content={pkg.synopsis ||
      `Explore ${pkg.path}, documentation, imports, and package insights.`}
  /></svelte:head
>
<div class="package-wrap">
  <div class="breadcrumbs">
    <a href="/">Home</a><span>/</span><a href="/search">Packages</a><span
      >/</span
    ><a href="/search?q={encodeURIComponent(pkg.modulePath)}"
      >{pkg.modulePath.split('/').slice(0, 2).join('/')}</a
    >
  </div>
  <div class="package-heading">
    <h1><Icon name="package" size={31} />{pkg.name}</h1>
    <label
      ><span class="sr-only">Package version</span><select
        value={pkg.version}
        onchange={(event) => switchVersion(event.currentTarget.value)}
        ><option value={pkg.version}
          >{pkg.version}{pkg.version === data.latestVersion
            ? ' · indexed'
            : ''}</option
        >{#each info.current?.versions?.filter((item) => item.version !== pkg.version) ?? [] as item}<option
            value={item.version}
            >{item.version}{item.retracted ? ' · retracted' : ''}</option
          >{/each}</select
      ></label
    >
  </div>
  <div class="package-path">
    <span>{pkg.path}</span><Copy text={pkg.path} label="Copy import path" />
  </div>
  <nav class="package-tabs" aria-label="Package sections">
    {#each tabs as item}<a
        href={tabUrl(item)}
        class:active={tab === item}
        aria-current={tab === item ? 'page' : undefined}
        >{item === 'overview'
          ? 'Overview'
          : item === 'docs'
            ? 'Documentation'
            : item === 'imported-by'
              ? 'Imported by'
              : item[0]!.toUpperCase() + item.slice(1)}{#if item === 'docs'}<kbd
            >d</kbd
          >{:else if item === 'overview'}<kbd>m</kbd>{/if}</a
      >{/each}
  </nav>
  <div class="package-body">
    <div class="package-main">
      {#if tab === 'overview' || tab === 'docs'}
        {#if tab === 'overview'}<p class="synopsis">
            {pkg.synopsis || pkg.path}
          </p>{/if}
        {#if tab === 'overview'}<div class="repo-links">
            {#if pkg.repoUrl}<a
                href={pkg.repoUrl}
                target="_blank"
                rel="noreferrer"
                ><Icon name="branch" size={15} />{pkg.repoUrl.replace(
                  'https://',
                  ''
                )}
                <Icon name="external" size={12} /></a
              >{/if}<span
              ><Icon name="star" size={14} />{formatNumber(
                info.current?.project?.starsCount
              )}</span
            >{#if pkg.repoUrl?.startsWith('https://github.com/')}<a
                href="{pkg.repoUrl}/issues"
                target="_blank"
                rel="noreferrer">Issues <Icon name="external" size={12} /></a
              >{/if}<a
              href="https://pkg.go.dev/{pkg.path}@{pkg.version}"
              target="_blank"
              rel="noreferrer">pkg.go.dev <Icon name="external" size={12} /></a
            >
          </div>
        {/if}
        {#if tab === 'overview'}<div class="metadata-strip">
            <div>
              <span>License</span><strong
                >{#each info.current?.metadata?.licenses ?? [] as license, index}{#if index},
                  {/if}<a
                    href="https://spdx.org/licenses/{encodeURIComponent(
                      license
                    )}.html"
                    target="_blank"
                    rel="noreferrer">{license}</a
                  >{:else}—{/each}</strong
              >
            </div>
            <div>
              <span>Dependencies</span><strong
                >{info.current?.requirements
                  ? info.current.requirements.filter((item) => !item.indirect)
                      .length
                  : '—'} direct</strong
              >
            </div>
            <div>
              <span>Known advisories</span><strong
                class:known={info.current?.metadata?.advisoryKeys.length === 0}
                >{info.current?.metadata
                  ? info.current.metadata.advisoryKeys.length === 0
                    ? '✓ None reported'
                    : `${info.current.metadata.advisoryKeys.length} reported`
                  : '—'}</strong
              >
            </div>
            <div>
              <span>Published</span><strong
                >{date(
                  info.current?.metadata?.publishedAt ??
                    info.current?.versions?.find(
                      (item) => item.version === pkg.version
                    )?.commitTime ??
                    (pkg.version === data.latestVersion
                      ? pkg.commitTime
                      : undefined)
                )}</strong
              >
            </div>
          </div>
          <div class="install-label">
            <span>Install</span>
          </div>
          <div class="install-command">
            <span>$</span><code>{install}</code><Copy text={install} />
          </div>
        {/if}
        {#key `${pkg.path}@${pkg.version}`}<Documentation
            path={pkg.path}
            version={pkg.version}
            onloaded={(value) => (loadedDocumentation = value)}
          />{/key}
      {:else if tab === 'packages'}
        <div class="list-heading">
          <h2>Packages in this module</h2>
          <span
            >{pkg.packages.length}{pkg.packages.length === 100 ? '+' : ''} indexed</span
          >
        </div>
        <p class="tab-intro">
          Packages indexed at {data.latestVersion}. Select a package to read its
          API.
        </p>
        <div class="compact-list">
          {#each pkg.packages as item}<a href="/package/{item.path}"
              ><div>
                <strong>{item.name}</strong>
                <p>{item.path}</p>
                <p>{item.synopsis}</p>
              </div>
              <Icon name="arrow" size={16} /></a
            >{/each}
        </div>
      {:else}
        {#await info}<div
            class="skeleton"
            role="status"
            aria-label="Loading package insights"
          >
            <span></span><span></span><span></span>
          </div>{:then details}
          {#if tab === 'versions'}<div class="list-heading">
              <h2>Version history</h2>
              <span>Recent versions</span>
            </div>
            <p class="tab-intro">
              Versions reported by pkg.go.dev. Select a version to read its
              documentation.
            </p>
            {#if details.versions}<div class="compact-list">
                {#each details.versions as item}<a
                    href="/package/{pkg.path}?version={item.version}&tab=docs"
                    ><span
                      >{item.version}
                      {#if item.version === data.latestVersion}<span
                          class="release-label">indexed</span
                        >{/if}{#if item.retracted}<span class="release-label"
                          >retracted</span
                        >{/if}</span
                    ><small>{date(item.commitTime)}</small></a
                  >{/each}
              </div>{:else}<div class="notice">
                Version history unavailable.
              </div>{/if}
          {:else if tab === 'imported-by'}<div class="list-heading">
              <h2>Imported by</h2>
              <span>{formatNumber(details.importedBy?.total)} packages</span>
            </div>
            <p class="tab-intro">
              Public package imports recorded by pkg.go.dev, across versions.
              Showing up to 40 packages.
            </p>
            {#if details.importedBy}<div class="compact-list">
                {#each details.importedBy.items as item}<a
                    href="/search?q={encodeURIComponent(item)}"
                    ><span>{item}</span><Icon name="arrow" size={15} /></a
                  >{/each}
              </div>
              <div class="source-note">
                <a
                  href="https://pkg.go.dev/{pkg.path}?tab=importedby"
                  target="_blank"
                  rel="noreferrer">See all importing packages on pkg.go.dev ↗</a
                >
              </div>{:else}<div class="notice">
                Importing packages unavailable.
              </div>{/if}
          {:else if tab === 'dependencies'}<div class="list-heading">
              <h2>Module dependencies</h2>
              <span>{details.requirements?.length ?? '—'} requirements</span>
            </div>
            <p class="tab-intro">
              Declared go.mod requirements from deps.dev, including indirect and
              test dependencies. These are separate from package imports below.
            </p>
            {#if details.requirements}<DependencyList
                requirements={details.requirements}
              />{:else}<div class="notice">
                Module requirements are unavailable from deps.dev.
              </div>{/if}
            <div class="list-heading"><h2>Package imports</h2></div>
            <p class="tab-intro">
              Direct imports used by this package in its default build context.
            </p>
            {#await getDocumentation( { path: pkg.path, version: pkg.version } )}<div
                class="skeleton"
              >
                <span></span><span></span>
              </div>{:then result}{#if result.ok}<div class="compact-list">
                  {#each result.data.imports as item}<a
                      href={item.includes('.')
                        ? `/search?q=${encodeURIComponent(item)}`
                        : `https://pkg.go.dev/${item}`}
                      ><span>{item}</span><small
                        >{item.includes('.') ? 'package' : 'standard library'} ↗</small
                      ></a
                    >{:else}<div class="notice">
                      No package imports reported.
                    </div>{/each}
                </div>{:else}<div class="notice">
                  Package imports are unavailable.
                </div>{/if}{/await}
          {/if}
        {/await}
      {/if}
      <div class="source-note">
        Documentation and import data: <a
          href="https://pkg.go.dev/{pkg.path}"
          target="_blank"
          rel="noreferrer">pkg.go.dev</a
        >. Licenses, advisories, requirements and repository metrics:
        <a
          href="https://deps.dev/go/{encodeURIComponent(
            pkg.modulePath
          )}/{pkg.version}"
          target="_blank"
          rel="noreferrer">deps.dev</a
        >. Cached locally; upstream snapshots may lag. “None reported” is not a
        security assessment.
      </div>
    </div>
    <aside class="package-sidebar" aria-label="Package insights">
      <section class="sidebar-block">
        <h2>PACKAGE METRICS</h2>
        <div class="side-stat">
          <span>Imported by</span><strong
            >{formatNumber(info.current?.importedBy?.total)}</strong
          >
        </div>
        <div class="side-stat">
          <span>GitHub stars</span><strong
            >{formatNumber(info.current?.project?.starsCount)}</strong
          >
        </div>
        <div class="side-stat">
          <span>Forks</span><strong
            >{formatNumber(info.current?.project?.forksCount)}</strong
          >
        </div>
        <div class="side-stat">
          <span>Open issues</span><strong
            >{formatNumber(info.current?.project?.openIssuesCount)}</strong
          >
        </div>
      </section>
      <section class="sidebar-block">
        <h2>LINKS</h2>
        <div class="side-links">
          {#if pkg.repoUrl}<a
              href={pkg.repoUrl}
              target="_blank"
              rel="noreferrer"
              >Source repository <Icon name="external" size={12} /></a
            >{/if}<a
            href="https://pkg.go.dev/{pkg.path}@{pkg.version}"
            target="_blank"
            rel="noreferrer"
            >Original documentation <Icon name="external" size={12} /></a
          ><a
            href="https://deps.dev/go/{encodeURIComponent(
              pkg.modulePath
            )}/{pkg.version}"
            target="_blank"
            rel="noreferrer"
            >Open Source Insights <Icon name="external" size={12} /></a
          >
        </div>
      </section>
      {#if documentationData && (tab === 'overview' || tab === 'docs')}<section
          class="sidebar-block doc-outline"
        >
          <h2>
            SYMBOLS <span style="color:var(--muted)"
              >({documentationData.symbols.length})</span
            >
          </h2>
          <SymbolIndex
            symbols={documentationData.symbols}
            sourceBase={sourceBase(pkg.path, pkg.modulePath, pkg.version)}
          />
        </section>{:else}<section class="sidebar-block">
          <h2>MODULE PACKAGES</h2>
          {#each pkg.packages.slice(0, 8) as item}<a
              class="sidebar-package"
              class:current={item.path === pkg.path}
              href="/package/{item.path}"
              >{item.path === pkg.modulePath
                ? item.name
                : item.path.replace(`${pkg.modulePath}/`, '')}</a
            >{/each}{#if pkg.packages.length > 8}<a
              class="sidebar-package"
              href={tabUrl('packages')}>See all packages →</a
            >{/if}
        </section>{/if}
    </aside>
  </div>
</div>
