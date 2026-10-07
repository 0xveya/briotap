export type DocumentHeading = { id: string; name: string; level: number };
type HeadingNode = { id: string; textContent: string | null; tagName: string };

/** Assign unique anchors and retain aliases used by upstream document links. */
export function documentContents(nodes: Iterable<HeadingNode>, prefix: string, replace = false) {
  const headings: DocumentHeading[] = [];
  const aliases = new Map<string, string>();
  const used = new Set<string>();
  for (const node of nodes) {
    if (node.id.startsWith('symbol-')) continue;
    const name = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const slug = name.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
    const previous = node.id;
    const base = !replace && previous && !/\s/.test(previous) ? previous : `${prefix}-${slug}`;
    let id = base;
    let suffix = 0;
    while (used.has(id)) id = `${base}-${++suffix}`;
    used.add(id);
    node.id = id;
    if (previous && !aliases.has(previous)) aliases.set(previous, id);
    if (!aliases.has(slug)) aliases.set(slug, id);
    else aliases.set(`${slug}-${suffix}`, id);
    headings.push({ id, name, level: Number(node.tagName.slice(1)) });
  }
  return { headings, aliases };
}

export function documentFragment(hash: string): string {
  const value = hash.replace(/^#/, '');
  try { return decodeURIComponent(value); }
  catch { return value; }
}
