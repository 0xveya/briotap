<script lang="ts">
  import { getCatalog } from './index.remote';
  import Search from '$lib/components/Search.svelte';
  import Icon from '$lib/components/Icon.svelte';
  const catalog = await getCatalog();
  const count = (name: string) =>
    catalog.estimates.find((row) => row.name === name)?.count ?? 0;
  const compact = (value: number) =>
    new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value);
</script>

<svelte:head
  ><title>briotap · A better way to explore Go</title><meta
    name="description"
    content="Discover Go packages, read their documentation, and explore the ecosystem. Fast local search, clear package insights."
  /></svelte:head
>
<div class="home wrap">
  <section class="hero">
    <div class="eyebrow">
      <span class="pink-dot"></span> SMALL PACKAGES. BIG POSSIBILITIES.
    </div>
    <h1>
      A little curiosity.<br />A lot of <span>Go.</span><span
        class="hero-cursor">_</span
      >
    </h1>
    <p>
      Your next building block is out there.<br class="desktop-break" /> Find it,
      understand it, make something with it.
    </p>
    <div class="hero-search">
      <Search large />
      <div class="search-hint">
        <span><i></i> Fast search. Local index.</span><span
          >Press <kbd>/</kbd> to jump in</span
        >
      </div>
    </div>
    <div class="quick-picks">
      <span>Start somewhere</span
      >{#each ['chi', 'pgx', 'cobra', 'zerolog', 'grpc'] as name}<a
          href="/search?q={name}">{name} <span>↗</span></a
        >{/each}
    </div>
    <div class="hero-stamp" aria-hidden="true">
      <span>GO FIND<br />SOMETHING<br /><b>GOOD.</b></span><svg
        viewBox="0 0 120 120"><path d="M24 93 93 24M32 24h61v61" /></svg
      >
    </div>
  </section>
  <section class="index-strip" aria-label="Index coverage">
    <div>
      <strong>{compact(count('packages'))}<span>+</span></strong><span
        >indexed packages</span
      >
    </div>
    <div>
      <strong>{compact(count('modules'))}<span>+</span></strong><span
        >module records</span
      >
    </div>
    <div>
      <strong>{compact(count('module_versions'))}<span>+</span></strong><span
        >observed versions</span
      >
    </div>
    <p>
      <i></i> Growing with the ecosystem<small
        >Estimated index counts · coverage is still growing</small
      >
    </p>
  </section>
  <section class="discover" id="discover">
    <div class="section-heading">
      <div>
        <div class="eyebrow">A FEW GOOD STARTING POINTS</div>
        <h2>Built to be building blocks.</h2>
      </div>
      <a href="/search">Explore the index <Icon name="arrow" size={17} /></a>
    </div>
    <div class="collection-grid">
      {#each catalog.collections as group, index}
        <div class="collection">
          <div class="collection-title">
            <span class="collection-number">0{index + 1}</span>
            <h3>{group.name}</h3>
            <Icon
              name={index === 0 ? 'branch' : index === 1 ? 'package' : 'book'}
              size={20}
            />
          </div>
          {#each group.packages.slice(0, 4) as pkg}<a
              class="package-card"
              href="/package/{pkg.path}"
              ><div>
                <strong>{pkg.name}</strong><span class="version"
                  >{pkg.version}</span
                >
              </div>
              <p>{pkg.synopsis.replace(/^Package \S+ /, '') || pkg.path}</p>
              <span class="card-path"
                >{pkg.modulePath}<Icon name="arrow" size={14} /></span
              ></a
            >{/each}
          <a
            class="collection-more"
            href="/search?q={encodeURIComponent(group.query)}"
            >More in {group.name.toLowerCase()}
            <Icon name="arrow" size={15} /></a
          >
        </div>
      {/each}
    </div>
  </section>
  <section class="reading-callout">
    <div class="callout-icon"><Icon name="book" size={30} /></div>
    <div>
      <span class="eyebrow">LESS TAB-HOPPING. MORE UNDERSTANDING.</span>
      <h2>Get to know what you’re importing.</h2>
      <p>
        Readable docs. Searchable symbols. Dependencies and the details that
        matter, together.
      </p>
    </div>
    <a href="/package/github.com/go-chi/chi/v5"
      >Take a look <Icon name="arrow" size={17} /></a
    >
  </section>
  <div class="data-note">
    Metadata from pkg.go.dev and deps.dev. {#if catalog.syncedAt}Local index
      synced {new Date(catalog.syncedAt).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })}.{/if}
  </div>
</div>
