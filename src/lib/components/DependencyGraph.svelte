<script lang="ts">
  import { untrack } from 'svelte';
  import { getModuleRequirements, getInsights } from '../../routes/index.remote';
  import Copy from './Copy.svelte';
  import Icon from './Icon.svelte';
  import { layoutDependencies, DEPENDENCY_CARD_WIDTH, dependencyCardHeight } from '$lib/dependency-layout';
  type Requirement = { name: string; requirement: string; indirect: boolean };
  type Module = { name: string; version: string };
  type Entry = { node: Module; path: Module[]; id: string; depth: number; left: number; top: number; height: number };
  let { modulePath, version, requirements, onNavigate }: { modulePath: string; version: string; requirements: Requirement[]; onNavigate?: () => void } = $props();
  const id = $props.id();
  const marker = `${id}-dependency-arrow`;
  const key = (node: Module) => `${node.name}@${node.version}`;
  const moduleUrl = (node: Module) => `/package/${node.name}?version=${encodeURIComponent(node.version)}`;
  function navigate(event: MouseEvent) { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) onNavigate?.(); }
  const root = $derived({ name: modulePath, version });
  let loaded = $state<Record<string, Requirement[]>>({});
  let expanded = $state<string[]>([]);
  let pending = $state<string[]>([]);
  let failures = $state<Record<string, string>>({});
  let selected = $state('root');
  let auditOpen = $state(false);
  let filter = $state('');
  let indirect = $state(false);
  let mode = $state<'graph' | 'list'>('graph');
  let bulk = $state(false);
  let completed = $state(0);
  let total = $state(0);
  let cancelled = $state(false);
  let inspectorOpen = $state(false);
  let optionsOpen = $state(false);
  let width = $state(960);
  let height = $state(520);
  let zoom = $state(1);
  let x = $state(0);
  let y = $state(24);
  const warmed = new Map<string, ReturnType<typeof getModuleRequirements>>();
  const layout = $derived.by(() => {
    const entries: Entry[] = [{ node: root, path: [root], id: key(root), depth: 0, left: 0, top: 0, height: dependencyCardHeight(root.name) }];
    const links: { from: Entry; to: Entry; indirect: boolean }[] = [];
    const seen = new Map([[key(root), entries[0]!]]);
    let omitted = 0;
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]!;
      if (!expanded.includes(entry.id)) continue;
      for (const child of (loaded[entry.id] ?? []).filter((item) => indirect || !item.indirect)) {
        const node = { name: child.name, version: child.requirement };
        let target = seen.get(key(node));
        if (!target) {
          if (entries.length >= 400) { omitted++; continue; }
          target = { node, path: [...entry.path, node], id: key(node), depth: entry.depth + 1, left: 0, top: (entry.depth + 1) * 210, height: dependencyCardHeight(node.name) };
          seen.set(target.id, target);
          entries.push(target);
        }
        links.push({ from: entry, to: target, indirect: child.indirect });
      }
    }
    const geometry = layoutDependencies(entries, links.map((edge) => ({ from: edge.from.id, to: edge.to.id })));
    const positions = new Map(geometry.positions.map((position) => [position.id, position]));
    for (const entry of entries) { const position = positions.get(entry.id)!; entry.left = position.left; entry.top = position.top; }
    const routes = new Map(geometry.paths.map((path) => [`${path.from}:${path.to}`, path.d]));
    return { entries, segments: geometry.segments, arrows: geometry.arrows, links: links.map((edge) => ({ ...edge, d: routes.get(`${edge.from.id}:${edge.to.id}`)! })), width: geometry.width, height: geometry.height, capped: omitted > 0, omitted };

  });
  const active = $derived(layout.entries.find((entry) => entry.id === selected) ?? layout.entries[0]!);
  const current = $derived(active.node);
  const results = $derived(layout.entries.filter((entry) => entry.node.name.toLowerCase().includes(filter.toLowerCase())));
  const edges = $derived(layout.links);
  const tracedEdges = $derived(edges.filter((edge) => active.path.some((node, index) => index > 0 && key(node) === edge.to.id && key(active.path[index - 1]!) === edge.from.id)));
  const importers = $derived(edges.filter((edge) => edge.to.id === active.id));
  const dependencies = $derived(edges.filter((edge) => edge.from.id === active.id));
  $effect(() => {
    loaded = { [key(root)]: requirements };
    expanded = [key(root)];
    pending = [];
    failures = {};
    selected = key(root);
    warmed.clear();
  });
  let anchor: { id: string; left: number; top: number } | undefined;
  $effect(() => {
    const next = { id: active.id, left: active.left, top: active.top };
    untrack(() => {
      if (anchor?.id === next.id) { x += (anchor.left - next.left) * zoom; y += (anchor.top - next.top) * zoom; }
      anchor = next;
    });
  });
  function center(entry = active) {
    zoom = Math.min(1, (width - 24) / DEPENDENCY_CARD_WIDTH);
    x = width / 2 - (entry.left + DEPENDENCY_CARD_WIDTH / 2) * zoom;
    y = 24 - entry.top * zoom;
  }
  function fitView() {
    zoom = Math.max(0.04, Math.min(1, (width - 40) / layout.width, (height - 40) / layout.height));
    x = (width - layout.width * zoom) / 2;
    y = (height - layout.height * zoom) / 2;
  }
  function resetView() { center(); }
  function choose(entry: Entry, reveal = false, inspect = true) {
    selected = entry.id;
    if (inspect) inspectorOpen = true;
    if (reveal) center(entry);
  }
  function locate(entry: Entry) {
    choose(entry, true);
    if (window.matchMedia('(max-width: 780px)').matches) {
      inspectorOpen = false;
      filter = '';
      if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    }
  }
  function warm(node: Module) {
    const id = key(node);
    let query = warmed.get(id);
    if (!query) {
      if (warmed.size >= 32) warmed.delete(warmed.keys().next().value!);
      query = getModuleRequirements({ modulePath: node.name, version: node.version });
      warmed.set(id, query);
    }
    return query;
  }
  async function expand(node: Module, refresh = false) {
    const id = key(node);
    if (pending.includes(id)) return;
    if (loaded[id] && !refresh) { if (!expanded.includes(id)) expanded = [...expanded, id]; return; }
    pending = [...pending, id];
    failures = { ...failures, [id]: '' };
    try {
      const query = warm(node);
      if (refresh) await query.refresh();
      const result = await query;
      if (result.ok) { loaded = { ...loaded, [id]: result.requirements }; if (!expanded.includes(id)) expanded = [...expanded, id]; }
      else failures = { ...failures, [id]: result.message };
    } catch { failures = { ...failures, [id]: 'Requirements could not be loaded.' }; }
    finally { pending = pending.filter((item) => item !== id); }
  }
  async function expandLevel() {
    bulk = true;
    cancelled = false;
    completed = 0;
    const nodes = [...new Map(layout.entries.filter((entry) => !expanded.includes(key(entry.node))).map((entry) => [key(entry.node), entry.node])).values()];
    total = nodes.length;
    let index = 0;
    async function worker() { while (!cancelled && !layout.capped && index < nodes.length) { const node = nodes[index++]; if (node) { await expand(node); completed++; } } }
    try { await Promise.all(Array.from({ length: Math.min(3, nodes.length) }, worker)); }
    finally { bulk = false; }
  }
  function scale(factor: number, cx = width / 2, cy = height / 2) {
    const next = Math.max(0.04, Math.min(2, zoom * factor));
    x = cx - (cx - x) * next / zoom;
    y = cy - (cy - y) * next / zoom;
    zoom = next;
  }
  function viewport(svg: HTMLDivElement) {
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width <= 0 || entry.contentRect.height <= 0) return;
      height = entry.contentRect.height;
      if (entry.contentRect.width !== width) { width = entry.contentRect.width; resetView(); }
    });
    observer.observe(svg);
    const pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
    let dragged = false;
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest('.graph-zoom, input'))) return;
      if (event.pointerType === 'mouse' && event.target instanceof Element && event.target.closest('button, a')) return;
      if (!pointers.size) dragged = false;
      if (!(event.target instanceof Element && event.target.closest('button, a, input'))) svg.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
    };
    const move = (event: PointerEvent) => {
      const old = pointers.get(event.pointerId);
      if (!old) return;
      const other = [...pointers.entries()].find(([key]) => key !== event.pointerId)?.[1];
      const dx = event.clientX - old.x;
      const dy = event.clientY - old.y;
      if (Math.hypot(event.clientX - old.startX, event.clientY - old.startY) > 3 || other) dragged = true;
      if (other) {
        const before = Math.hypot(old.x - other.x, old.y - other.y);
        const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
        const box = svg.getBoundingClientRect();
        if (before > 0) scale(after / before, (old.x + other.x) / 2 - box.left, (old.y + other.y) / 2 - box.top);
        x += dx / 2; y += dy / 2;
      } else { x += dx; y += dy; }
      pointers.set(event.pointerId, { ...old, x: event.clientX, y: event.clientY });
    };
    const up = (event: PointerEvent) => { pointers.delete(event.pointerId); };
    const click = (event: MouseEvent) => { if (dragged) { event.preventDefault(); event.stopImmediatePropagation(); dragged = false; } };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? height : 1;
      const dx = event.deltaX * unit;
      const dy = event.deltaY * unit;
      if (event.ctrlKey || event.metaKey) {
        const box = svg.getBoundingClientRect();
        scale(Math.exp(-dy * 0.002), event.clientX - box.left, event.clientY - box.top);
      } else {
        x -= event.shiftKey && !dx ? dy : dx;
        y -= event.shiftKey && !dx ? 0 : dy;
      }
    };
    svg.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', wheel, { passive: false });
    svg.addEventListener('click', click, true);
    return { destroy() {
      observer.disconnect();
      svg.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      svg.removeEventListener('wheel', wheel);
      svg.removeEventListener('click', click, true);
    } };
  }
</script>

<svelte:window onpointerdown={(event) => {
  if (optionsOpen && event.target instanceof Element && !event.target.closest('.graph-options')) optionsOpen = false;
}} />

<div class="dependency-explorer">
  <div class="graph-toolbar">
    <div class="graph-view-switch" aria-label="Dependency view"><button aria-pressed={mode === 'graph'} onclick={() => mode = 'graph'}>Graph</button><button aria-pressed={mode === 'list'} onclick={() => mode = 'list'}>List</button></div>
    <button disabled={bulk || layout.capped} onclick={() => void expandLevel()}>{bulk ? cancelled ? 'Stopping…' : `Expanding ${completed}/${total}…` : 'Expand level'}</button>{#if bulk}<button onclick={() => cancelled = true}>Stop</button>{/if}
    <div class="graph-options" class:open={optionsOpen}>
      <button class="graph-options-toggle" aria-label="Graph options" aria-expanded={optionsOpen} onclick={() => optionsOpen = !optionsOpen}><Icon name="more" size={18} /><span>Options</span></button>
      <div class="graph-options-body">
        <button disabled={bulk} onclick={() => { expanded = [key(root)]; selected = key(root); optionsOpen = false; queueMicrotask(() => center(layout.entries[0])); }}>Collapse all</button>
        <label><input type="checkbox" bind:checked={indirect} /> Indirect</label>
      </div>
    </div>
    <input class="graph-search" type="search" aria-label="Find a loaded dependency" placeholder="Find loaded dependency…" bind:value={filter} oninput={() => inspectorOpen = true} />
    <span class="graph-count" aria-live="polite">{layout.entries.length} nodes · {Math.max(...layout.entries.map((entry) => entry.depth))} levels</span>
  </div>
  <div class="graph-workspace">
    <div class="graph-main">
      {#if mode === 'graph'}
        <div class="dependency-canvas" use:viewport aria-label="Module dependency graph">
          <div class="graph-world" style:transform={`translate(${x}px, ${y}px) scale(${zoom})`} style:width={`${layout.width}px`} style:height={`${layout.height}px`}>
            <svg class="graph-connections" width={layout.width} height={layout.height} aria-hidden="true">
              <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="var(--muted)" /></marker><marker id={`${marker}-active`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="var(--pink)" /></marker></defs>
              {#each layout.segments as segment}<path class="graph-edge" d={segment} vector-effect="non-scaling-stroke" />{/each}
              {#each layout.arrows as arrow}<path class="graph-edge" d={arrow} vector-effect="non-scaling-stroke" marker-end={`url(#${marker})`} />{/each}
              {#each tracedEdges as edge (`${edge.from.id}:${edge.to.id}`)}<path class="graph-edge active" class:indirect={edge.indirect} d={edge.d} vector-effect="non-scaling-stroke" marker-end={`url(#${marker}-active)`} />{/each}
            </svg>
            {#each layout.entries as entry (entry.id)}
              <div class="module-node" class:selected={active.id === entry.id} class:dimmed={filter && !entry.node.name.toLowerCase().includes(filter.toLowerCase())} style:left={`${entry.left}px`} style:top={`${entry.top}px`} style:height={`${entry.height}px`}>
                <a class="module-node-label" href={moduleUrl(entry.node)} data-sveltekit-preload-data="hover" onclick={navigate} onfocus={() => { choose(entry); if (entry.left * zoom + x < 0 || (entry.left + DEPENDENCY_CARD_WIDTH) * zoom + x > width || entry.top * zoom + y < 0 || (entry.top + entry.height) * zoom + y > height) center(entry); }} onpointerenter={() => { if (!loaded[key(entry.node)]) void Promise.resolve(warm(entry.node)).catch(() => {}); }}><strong>{entry.node.name}</strong><small title={entry.node.version}>{entry.node.version}</small></a>
                <div class="module-node-actions"><button onclick={() => choose(entry)} aria-label={`Inspect ${entry.node.name}`}>Details</button><button class="module-node-expand" disabled={pending.includes(key(entry.node)) || loaded[key(entry.node)]?.length === 0 || layout.capped && !expanded.includes(key(entry.node))} aria-expanded={expanded.includes(key(entry.node))} aria-label={`Toggle dependencies of ${entry.node.name}`} onclick={() => { choose(entry, false, false); if (expanded.includes(key(entry.node))) expanded = expanded.filter((id) => id !== key(entry.node)); else void expand(entry.node, !!failures[key(entry.node)]); }}>{pending.includes(key(entry.node)) ? 'Loading…' : failures[key(entry.node)] ? 'Retry' : loaded[key(entry.node)]?.length === 0 ? 'No requirements' : expanded.includes(key(entry.node)) ? `Collapse (${loaded[key(entry.node)]?.filter((item) => indirect || !item.indirect).length ?? 0})` : 'Expand'}</button> </div>
              </div>
            {/each}
          </div>
          <div class="graph-zoom floating"><button aria-label="Zoom out" onclick={() => scale(.8)}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onclick={() => scale(1.25)}>+</button><button onclick={() => center()}>Focus</button><button onclick={fitView}>Fit all</button></div>
        </div>
      {:else}
        <div class="dependency-list" aria-label="Expanded dependency tree">
          {#each results as entry (entry.id)}<div class="dependency-list-row" style:padding-left={`${Math.min(entry.depth, 4) * 16 + 12}px`}><a href={moduleUrl(entry.node)} data-sveltekit-preload-data="hover" onclick={navigate}><strong>{entry.node.name}</strong><small>{entry.node.version} · Level {entry.depth}</small></a><button disabled={pending.includes(key(entry.node)) || loaded[key(entry.node)]?.length === 0 || layout.capped && !expanded.includes(key(entry.node))} aria-label={`Toggle dependencies of ${entry.node.name}`} onclick={() => { choose(entry, false, false); if (expanded.includes(key(entry.node))) expanded = expanded.filter((id) => id !== key(entry.node)); else void expand(entry.node, !!failures[key(entry.node)]); }}>{expanded.includes(key(entry.node)) ? '−' : '+'}</button></div>{/each}
        </div>
      {/if}
    </div>
    <aside class="graph-inspector" class:open={inspectorOpen} aria-label="Selected module">
      <button class="inspector-toggle" aria-expanded={inspectorOpen} onclick={() => inspectorOpen = !inspectorOpen}>{inspectorOpen ? 'Close details' : 'Details: ' + current.name}</button>
      <div class="inspector-body">
      {#if filter}<div class="graph-find-results">{#each results.slice(0, 30) as entry}<button onclick={() => locate(entry)}>{entry.node.name}<small>Level {entry.depth} · {entry.node.version}</small></button>{:else}<p>No match in loaded branches.</p>{/each}</div>{/if}
      <h3><a href={moduleUrl(current)} data-sveltekit-preload-data="hover" onclick={navigate}>{current.name}</a></h3><code>{current.version}</code>
      <nav class="graph-path" aria-label="Dependency path">{#each active.path as node, index}<a href={moduleUrl(node)} onclick={navigate}>{index ? '↓ ' : ''}{node.name}</a>{/each}</nav>
      {#if importers.length}<section class="graph-importers"><h4>Required by {importers.length} loaded modules</h4>{#each importers as edge}<div class="graph-relation"><a href={moduleUrl(edge.from.node)} data-sveltekit-preload-data="hover" onclick={navigate}>{edge.from.node.name}<small>{edge.from.node.version}{edge.indirect ? ' · indirect' : ''}</small></a><button aria-label={`Locate ${edge.from.node.name}`} onclick={() => locate(edge.from)}>Locate</button></div>{/each}</section>{/if}
      {#if dependencies.length}<section class="graph-importers"><h4>Requires {dependencies.length} modules</h4>{#each dependencies as edge}<div class="graph-relation"><a href={moduleUrl(edge.to.node)} data-sveltekit-preload-data="hover" onclick={navigate}>{edge.to.node.name}<small>{edge.to.node.version}{edge.indirect ? ' · indirect' : ''}</small></a><button aria-label={`Locate ${edge.to.node.name}`} onclick={() => locate(edge.to)}>Locate</button></div>{/each}</section>{/if}
      <Copy text={active.path.map(key).join(' → ')} label="Copy dependency path" />
      <button class="graph-focus" onclick={() => center()}>Focus selected module</button>
      {#if failures[key(current)]}<p role="alert">{failures[key(current)]}</p>{/if}
      <div class="graph-module-info"><a href="https://pkg.go.dev/{current.name}@{encodeURIComponent(current.version)}" target="_blank" rel="noreferrer">Go documentation ↗</a><a href="https://deps.dev/go/{encodeURIComponent(current.name)}/{encodeURIComponent(current.version)}" target="_blank" rel="noreferrer">deps.dev ↗</a><Copy text={`go get ${current.name}@${current.version}`} label="Copy go get" /></div>
      <details class="graph-audit" bind:open={auditOpen}><summary>License and advisories</summary>
    {#if auditOpen}
      {#await getInsights({ path: current.name, modulePath: current.name, version: current.version })}<p role="status">Loading module details…</p>
      {:then audit}
        <dl class="graph-audit-facts"><div><dt>License</dt><dd>{audit.metadata?.licenses.join(', ') || 'Unavailable'}</dd></div><div><dt>Known advisories</dt><dd>{audit.metadata ? audit.metadata.advisoryKeys.length : 'Unavailable'}</dd></div></dl>
        {#if audit.metadata}{#each audit.metadata.advisoryKeys as advisory}<a class="graph-advisory" href="https://osv.dev/vulnerability/{encodeURIComponent(advisory.id)}" target="_blank" rel="noreferrer">{advisory.id} ↗</a>{:else}<p>No advisories reported by deps.dev for this module version.</p>{/each}{/if}
        {#if audit.project?.scorecard?.overallScore != null && audit.projectId}<a class="graph-advisory" href="https://scorecard.dev/viewer/?uri={encodeURIComponent(audit.projectId)}" target="_blank" rel="noreferrer">OpenSSF Scorecard: {audit.project.scorecard.overallScore} / 10 ↗</a>{/if}
      {:catch}<p>Module details could not be loaded. Use the deps.dev link above to inspect this version.</p>{/await}
    {/if}
      </details>
      </div>
    </aside>
  </div>
  <details class="graph-help"><summary>Graph help · {layout.entries.length} modules</summary><p class="graph-footnote">{#if layout.capped}{layout.omitted} requirements omitted at the 400-node display limit. Collapse a branch to explore another. {/if}Drag or scroll to pan. Pinch or Ctrl/⌘ + scroll to zoom. Expand branches to trace deeper requirements. Declared go.mod requirements from deps.dev, not Go’s resolved build graph.</p></details>
</div>

<style>
:global {
  .dependency-explorer { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .dependency-explorer button { appearance: none; border: 0; background: transparent; color: var(--secondary); padding: 8px 10px; border-radius: 3px; font: inherit; }
  .dependency-explorer button:hover { color: var(--pink); background: var(--accent-wash); }
  .dependency-explorer button:disabled { opacity: .45; cursor: default; background: transparent; }
  .graph-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; flex-shrink: 0; padding: 6px 0 16px; font-size: 0.875rem; }
  .graph-toolbar button { min-height: 44px; }
  .graph-view-switch { display: flex; gap: 2px; }
  .graph-view-switch button[aria-pressed=true] { color: var(--pink); background: var(--accent-wash); }
  .graph-options { display: contents; }
  .graph-options-toggle { display: none; }
  .graph-options-body { display: contents; }
  .graph-help { flex-shrink: 0; }
  .graph-help > summary { display: none; }
  .graph-help:not([open]) > .graph-footnote { display: block; }
  .graph-toolbar label { display: flex; align-items: center; gap: 6px; }
  .graph-search { flex: 1; min-width: 160px; min-height: 44px; font-size: 0.9375rem; padding: 8px 12px; border: 0; border-radius: 4px; background: var(--surface); color: var(--text); }
  .graph-count { font-size: 0.75rem; color: var(--muted); }
  .graph-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 300px; flex: 1; min-height: 0; overflow: hidden; contain: layout paint; }
  .graph-main { min-width: 0; min-height: 0; overflow: hidden; }
  .dependency-canvas { position: relative; height: 100%; overflow: hidden; touch-action: none; overscroll-behavior: contain; cursor: grab; background: var(--bg); }
  .dependency-canvas:active { cursor: grabbing; }
  .graph-world { position: absolute; transform-origin: 0 0; will-change: transform; }
  .graph-connections { position: absolute; overflow: visible; pointer-events: none; }
  .graph-connections .graph-edge { fill: none; stroke: var(--secondary); stroke-width: 1; opacity: .3; }
  .graph-connections .graph-edge.active { stroke: var(--pink); opacity: .9; }
  .graph-edge.indirect { stroke-dasharray: 5 5; }
  .module-node { display: flex; flex-direction: column; position: absolute; width: 264px; height: 100px; border: 0; border-radius: 4px; background: var(--surface); }
  .module-node.selected { background: var(--accent-wash); }
  .module-node.dimmed { opacity: .35; }
  .module-node-label { display: flex; flex-direction: column; justify-content: space-between; flex: 1; min-height: 0; padding: 10px 12px 4px; }
  .module-node-label strong { font: 0.8125rem/1.4 var(--mono); word-break: break-all; color: var(--text); }
  .module-node-label:hover strong { color: var(--pink); }
  .module-node-label small { font: 0.6875rem var(--mono); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .module-node-actions { display: flex; align-items: center; justify-content: space-between; height: 32px; flex-shrink: 0; padding: 0 4px; }
  .module-node-actions button { font-size: 0.75rem; padding: 4px 8px; min-height: 28px; }
  .graph-zoom { position: absolute; bottom: 12px; left: 12px; display: flex; align-items: center; gap: 4px; padding: 3px; background: var(--surface); border-radius: 4px; font-size: 0.8125rem; }
  .graph-zoom button { min-height: 40px; min-width: 36px; }
  .graph-zoom span { min-width: 40px; text-align: center; font: 0.75rem var(--mono); color: var(--muted); }
  .graph-inspector { min-width: 0; overflow-y: auto; padding: 4px 20px; border-left: 1px solid var(--line); background: var(--bg); contain: layout paint; }
  .graph-inspector h3 { font: 0.9375rem/1.5 var(--mono); color: var(--text); overflow-wrap: anywhere; margin: 12px 0 6px; }
  .graph-inspector code { display: block; font-size: 0.75rem; color: var(--muted); overflow-wrap: anywhere; white-space: normal; }
  .graph-path { display: grid; gap: 6px; margin: 20px 0; font: 0.75rem/1.5 var(--mono); color: var(--muted); overflow-wrap: anywhere; }
  .graph-importers { margin: 20px 0; }
  .graph-importers h4 { font-size: 0.8125rem; color: var(--muted); font-weight: 500; margin-bottom: 8px; }
  .graph-relation { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
  .graph-relation a { flex: 1; min-width: 0; font: 0.75rem/1.5 var(--mono); overflow-wrap: anywhere; }
  .graph-relation small { display: block; color: var(--muted); font-size: 0.6875rem; }
  .graph-relation button { flex-shrink: 0; font-size: 0.6875rem; min-height: 40px; padding: 6px; }
  .graph-focus { font-size: 0.8125rem !important; min-height: 44px; }
  .graph-module-info { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 14px 0; font-size: 0.8125rem; }
  .graph-audit { margin: 20px 0; font-size: 0.8125rem; }
  .graph-audit summary { cursor: pointer; min-height: 44px; padding: 10px 0; color: var(--secondary); }
  .graph-audit-facts { display: flex; flex-wrap: wrap; gap: 24px; }
  .graph-audit-facts dt { color: var(--muted); }
  .graph-audit-facts dd { margin: 6px 0; }
  .graph-advisory { display: block; padding: 6px 0; color: var(--pink); }
  .graph-find-results { max-height: 180px; overflow: auto; }
  .graph-find-results button { display: grid; text-align: left; width: 100%; overflow-wrap: anywhere; font-size: 0.8125rem; }
  .graph-find-results small { font-size: 0.6875rem; color: var(--muted); }
  .dependency-explorer .dependency-list { height: 100%; overflow: auto; }
  .dependency-list-row { display: flex; align-items: center; gap: 8px; padding: 4px 12px; min-height: 60px; }
  .dependency-list-row > a { flex: 1; min-width: 0; display: grid; gap: 4px; overflow-wrap: anywhere; }
  .dependency-list-row strong { font: 0.8125rem var(--mono); }
  .dependency-list-row small { font-size: 0.75rem; color: var(--muted); }
  .dependency-list-row > button { min-width: 44px; min-height: 44px; }
  .graph-footnote { flex-shrink: 0; color: var(--muted); font-size: 0.6875rem; line-height: 1.5; margin: 12px 0 0; }
  .inspector-toggle { display: none; }
  @media (max-width: 780px) {
    .graph-toolbar { gap: 4px; font-size: 0.75rem; padding: 0 0 8px; }
    .graph-toolbar > button { flex: 1; white-space: nowrap; }
    .graph-toolbar button { padding: 6px 8px; }
    .graph-options { display: block; position: relative; }
    .graph-options-toggle { display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 44px; padding: 6px 8px; list-style: none; color: var(--secondary); cursor: pointer; }
    .graph-options-toggle span { display: none; }
    .graph-options-body { display: none; }
    .graph-options.open .graph-options-body { display: grid; gap: 4px; position: absolute; right: 0; top: 100%; z-index: 5; min-width: 160px; padding: 8px; background: var(--surface); box-shadow: 0 8px 24px var(--shadow); border-radius: 4px; }
    .graph-options-body label { min-height: 44px; padding: 6px 8px; }
    .graph-search { flex-basis: 100%; min-width: 0; }
    .graph-count { display: none; }
    .graph-workspace { display: block; position: relative; }
    .graph-main { height: 100%; }
    .graph-inspector { position: absolute; bottom: 0; left: 0; right: 0; border-left: 0; border-top: 1px solid var(--line); padding: 0; max-height: 62%; overflow: auto; overscroll-behavior: contain; }
    .graph-inspector.open { box-shadow: 0 -8px 32px var(--shadow); }
    .dependency-explorer .inspector-toggle { display: block; width: 100%; min-height: 44px; text-align: left; position: sticky; top: 0; z-index: 1; background: var(--bg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .inspector-body { display: none; }
    .graph-inspector.open .inspector-body { display: block; padding: 10px; }
    .graph-help { max-height: 25%; overflow: auto; }
    .graph-help > summary { display: block; padding: 8px 0; font-size: 0.6875rem; color: var(--muted); cursor: pointer; }
    .graph-help:not([open]) > .graph-footnote { display: none; }
    .graph-footnote { margin-top: 0; }
    .graph-zoom { bottom: 52px; left: 8px; gap: 2px; }
    .graph-zoom button { padding: 4px; min-height: 44px; }
  }
}
</style>
