<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import type { documentation } from '$lib/server/documentation';
  import { getDocumentation, getInsights } from '../../index.remote';
  import PackageCode from '$lib/components/PackageCode.svelte';
  import PackageChangelog from '$lib/components/PackageChangelog.svelte';
  import PackageStats from '$lib/components/PackageStats.svelte';
  import Documentation from '$lib/components/Documentation.svelte';
  import Copy from '$lib/components/Copy.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import DependencyList from '$lib/components/DependencyList.svelte';
  import VersionPicker from '$lib/components/VersionPicker.svelte';
  import RepositoryIcon from '$lib/components/RepositoryIcon.svelte';
  import { goDocsUrl } from '$lib/go-docs';
  let { data }: { data: PageData } = $props();
  const pkg = $derived(data.pkg);
  const tabs = [
    'overview',
    'docs',
    'code',
    'changelog',
    'timeline',
    'stats',
    'dependencies',
    'imported-by',
    'versions',
    'packages'
  ] as const;
  const tabBindings: Record<string, string> = { overview: 'm', docs: 'd', code: '.', changelog: '-', timeline: 't', stats: 's' };
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
  const releaseVersion = $derived(pkg.version.split('+')[0]!);
  const versionStatus = $derived(
    /^v\d+\.\d+\.\d+-.*\d{14}-[a-f0-9]+$/.test(releaseVersion)
      ? 'Pseudo-version'
      : /^v\d+\.\d+\.\d+[-]/.test(releaseVersion)
        ? 'Prerelease'
        : /^v[1-9]\d*\.\d+\.\d+$/.test(releaseVersion)
          ? 'Stable release'
          : /^v0\.\d+\.\d+$/.test(releaseVersion)
            ? 'Tagged release · v0'
            : 'Untagged version'
  );
  const install = $derived(`go get ${pkg.path}@${pkg.version}`);
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
  let tabNavigation = $state<HTMLElement>();
  $effect(() => {
    void tab;
    const frame = requestAnimationFrame(() => {
      const current = tabNavigation?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!current || !tabNavigation) return;
      const navigation = tabNavigation.getBoundingClientRect();
      const anchor = current.getBoundingClientRect();
      if (anchor.left < navigation.left || anchor.right > navigation.right)
        tabNavigation.scrollTo({ left: tabNavigation.scrollLeft + anchor.left - navigation.left - (navigation.width - anchor.width) / 2 });
    });
    return () => cancelAnimationFrame(frame);
  });
  function tabUrl(value: string) {
    const url = new URL(page.url);
    url.searchParams.set('tab', value);
    url.hash = '';
    if (value !== 'code') url.searchParams.delete('file');
    return `${url.pathname}${url.search}`;
  }
  function shortcut(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      document.querySelector('dialog[open]') !== null ||
      event.repeat ||
      event.isComposing ||
      (event.target instanceof HTMLElement && event.target.isContentEditable) ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const destination = tabs.find((item) => tabBindings[item] === event.key);
    if (destination) { event.preventDefault(); void goto(tabUrl(destination)); }
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
    <VersionPicker
      value={pkg.version}
      path={pkg.path}
      indexedVersion={data.latestVersion}
      versions={info.current?.versions}
    />
  </div>
  <div class="package-path">
    <span>{pkg.path}</span><Copy text={pkg.path} label="Copy import path" />
  </div>
  <nav class="package-tabs" aria-label="Package sections" bind:this={tabNavigation}>
    {#each tabs as item}<a
        href={tabUrl(item)}
        class:active={tab === item}
        aria-current={tab === item ? 'page' : undefined}
        aria-keyshortcuts={tabBindings[item]}
        >{item === 'overview'
          ? 'Main'
          : item === 'docs'
            ? 'Docs'
            : item === 'imported-by'
              ? 'Imported by'
              : item[0]!.toUpperCase() + item.slice(1)}{#if tabBindings[item]}<kbd>{tabBindings[item]}</kbd>{/if}</a>
      {/each}
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
                ><RepositoryIcon url={pkg.repoUrl} />{pkg.repoUrl.replace(
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
              href={goDocsUrl(pkg.path, pkg.modulePath, pkg.version)}
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
                ><a href="{tabUrl('dependencies')}#package-imports" title="View dependencies and package imports">{info.current?.requirements
                  ? info.current.requirements.filter((item) => !item.indirect)
                      .length
                  : '—'} direct</a></strong
              >
            </div>
            <div>
              <span><a href="https://deps.dev/go/{encodeURIComponent(pkg.modulePath)}/{pkg.version}" target="_blank" rel="noreferrer" title="Advisories reported by deps.dev for this module version">Known advisories ↗</a></span><strong
                >{info.current?.metadata
                  ? info.current.metadata.advisoryKeys.length === 0
                    ? 'None reported'
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
            modulePath={pkg.modulePath}
            version={pkg.version}
            onloaded={(value) => (loadedDocumentation = value)}
          />{/key}
      {:else if tab === 'code'}
        {#key `${pkg.path}@${pkg.version}`}<PackageCode path={pkg.path} modulePath={pkg.modulePath} version={pkg.version} />{/key}
      {:else if tab === 'changelog'}
        <PackageChangelog repoUrl={pkg.repoUrl} version={pkg.version} />
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
          {#each pkg.packages as item}<div class="package-list-item">
              <a
                href="/package/{item.path}?version={encodeURIComponent(
                  pkg.version
                )}"
                ><div>
                  <strong>{item.name}</strong>
                  <p>{item.path}</p>
                  <p>{item.synopsis}</p>
                </div>
                <Icon name="arrow" size={16} /></a
              ><Copy
                text={`go get ${item.path}@${pkg.version}`}
                label={`Copy go get for ${item.path}`}
              />
            </div>{/each}
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
          {:else if tab === 'timeline'}
            <div class="list-heading"><h2>Timeline</h2><span>{details.versions?.length ?? '—'} recent versions</span></div>
            <p class="tab-intro">Module releases recorded by pkg.go.dev, newest dated releases first. Showing up to 30 versions.</p>
            {#if details.versions?.length}
              <ol class="release-timeline">
                {#each [...details.versions].sort((a, b) => (b.commitTime ?? '').localeCompare(a.commitTime ?? '')) as release}
                  <li><time datetime={release.commitTime}>{date(release.commitTime)}</time><div>
                    <a href="/package/{pkg.path}?version={encodeURIComponent(release.version)}&tab=docs">{release.version}</a>
                    {#if release.retracted}<span class="release-label">retracted</span>{/if}
                    <div class="dependency-install"><code>go get {pkg.path}@{release.version}</code><Copy text={`go get ${pkg.path}@${release.version}`} label={`Copy go get for ${release.version}`} /></div>
                  </div></li>
                {/each}
              </ol>
            {:else}<div class="notice">Version history unavailable.</div>{/if}
          {:else if tab === 'stats'}
            <PackageStats {details} />
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
              Requirements from go.mod, provided by deps.dev.
            </p>
            {#if details.requirements}<DependencyList
                requirements={details.requirements}
              />{:else}<div class="notice">
                Module requirements are unavailable from deps.dev.
              </div>{/if}
            <div class="list-heading" id="package-imports"><h2>Package imports</h2></div>
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
      <section class="sidebar-block package-details">
        <h2>Details</h2>
        <dl class="package-facts">
          <div><dt>License</dt><dd>
            {#if info.current?.metadata?.licenses?.length}
              {#each info.current.metadata.licenses as license}
                <a href="https://spdx.org/licenses/{encodeURIComponent(license)}.html" target="_blank" rel="noreferrer">{license}</a>
              {/each}
            {:else}{info.current ? 'Unavailable' : 'Loading…'}{/if}
          </dd></div>
          <div><dt>Version</dt><dd>{versionStatus}</dd></div>
          {#if documentationData}<div><dt>Redistributable</dt><dd>{documentationData.isRedistributable ? 'Yes' : 'No'}</dd></div>{/if}
        </dl>
      </section>
      {#if documentationData && (tab === 'overview' || tab === 'docs')}<section class="sidebar-block">
          <a class="sidebar-symbol-trigger" href="{tabUrl('docs')}&find=symbols" aria-keyshortcuts="Alt+s">
            <Icon name="search" size={16} /> Find symbol
            <span>{formatNumber(documentationData.symbols.length)}</span><kbd>Alt S</kbd>
          </a>
        </section>{:else}<section class="sidebar-block">
          <h2>Module packages</h2>
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
      <section class="sidebar-block">
        <h2>Metrics</h2>
        <div class="side-stat">
          <span>Imported by</span><strong
            >{formatNumber(info.current?.importedBy?.total)}</strong
          >
        </div>
        <div class="side-stat">
          <span>Repository stars</span><strong
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
        <h2>Links</h2>
        <div class="side-links">
          {#if pkg.repoUrl}<a
              href={pkg.repoUrl}
              target="_blank"
              rel="noreferrer"
              >Source repository <Icon name="external" size={12} /></a
            >{/if}<a
            href={goDocsUrl(pkg.path, pkg.modulePath, pkg.version)}
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
    </aside>
  </div>
</div>
