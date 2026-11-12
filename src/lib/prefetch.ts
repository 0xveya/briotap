import { preloadData } from '$app/navigation';
import * as v from 'valibot';
import { getDocumentation, getReadme, getInsights, getReleases, getSourceFiles, getSourceFile } from '../routes/index.remote';

const packageSchema = v.object({
  pkg: v.object({
    path: v.string(),
    modulePath: v.string(),
    version: v.string(),
    repoUrl: v.nullable(v.string())
  })
});
const warmed = new Map<
  string,
  {
    expires: number;
    docs?: ReturnType<typeof getDocumentation>;
    readme?: ReturnType<typeof getReadme>;
    insights?: ReturnType<typeof getInsights>;
    releases?: ReturnType<typeof getReleases>;
    files?: ReturnType<typeof getSourceFiles>;
    file?: ReturnType<typeof getSourceFile>;
  }
>();
let active = 0;

/** Warm only the link the user is approaching, retaining a small query cache. */
export async function prefetchLink(href: string): Promise<void> {
  if (
    (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection?.saveData
  )
    return;
  const url = new URL(href, location.href);
  if (
    url.origin !== location.origin ||
    !/^\/(package|source|search)(\/|$)/.test(url.pathname)
  )
    return;
  if (url.pathname === location.pathname && url.search === location.search)
    return;
  const source = url.pathname.startsWith('/source/');
  const key = source
    ? `${url.pathname}?${url.searchParams.get('module')}@${url.searchParams.get('version')}`
    : `${url.pathname}${url.search}`;
  if ((warmed.get(key)?.expires ?? 0) > Date.now() || active >= 2) return;
  for (const [entryKey, entry] of warmed)
    if (entry.expires < Date.now()) warmed.delete(entryKey);
  if (warmed.size >= 4) warmed.delete(warmed.keys().next().value!);
  const entry: {
    expires: number;
    docs?: ReturnType<typeof getDocumentation>;
    readme?: ReturnType<typeof getReadme>;
    insights?: ReturnType<typeof getInsights>;
    releases?: ReturnType<typeof getReleases>;
    files?: ReturnType<typeof getSourceFiles>;
    file?: ReturnType<typeof getSourceFile>;
  } = { expires: Date.now() + 30_000 };
  warmed.set(key, entry);
  active++;
  try {
    if (source) {
      await fetch(url, { method: 'HEAD', redirect: 'manual' });
      return;
    }
    const result = await preloadData(`${url.pathname}${url.search}`);
    if (result.type !== 'loaded' || result.status >= 400) {
      warmed.delete(key);
      return;
    }
    const parsed = v.safeParse(packageSchema, result.data);
    if (!parsed.success) return;
    const pkg = parsed.output.pkg;
    const tab = url.searchParams.get('tab') ?? 'overview';
    const input = { path: pkg.path, modulePath: pkg.modulePath, version: pkg.version };
    entry.insights = getInsights(input);
    const queries: PromiseLike<unknown>[] = [entry.insights];
    if (tab === 'changelog' && pkg.repoUrl) {
      entry.releases = getReleases(pkg.repoUrl);
      queries.push(entry.releases);
    } else if (tab === 'code') {
      entry.files = getSourceFiles(input);
      queries.push(entry.files);
      const files = await entry.files;
      if (files.ok && files.files.length) {
        const file = files.files.find((item) => item.name === url.searchParams.get('file')) ?? files.files[0]!;
        entry.file = getSourceFile({ ...input, name: file.name });
        queries.push(entry.file);
      }
    } else if (tab === 'overview') {
      entry.readme = getReadme({ modulePath: pkg.modulePath, version: pkg.version });
      queries.push(entry.readme);
    } else if (['docs', 'dependencies'].includes(tab)) {
      entry.docs = getDocumentation({ path: pkg.path, version: pkg.version });
      queries.push(entry.docs);
    }
    const results = await Promise.allSettled(queries);
    if (results.some((result) => result.status === 'rejected'))
      warmed.delete(key);
  } catch {
    warmed.delete(key);
  } finally {
    active--;
  }
}

/** Delegate pointer, keyboard, and touch intent for links added by async rendering. */
export function prefetchOnIntent(node: HTMLElement) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const link = (event: Event) =>
    event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>('a[href]')
      : null;
  function hover(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    const anchor = link(event);
    if (
      !anchor ||
      anchor.contains(
        event.relatedTarget instanceof Node ? event.relatedTarget : null
      )
    )
      return;
    clearTimeout(timer);
    timer = setTimeout(() => void prefetchLink(anchor.href), 100);
  }
  function leave(event: PointerEvent) {
    const anchor = link(event);
    if (
      anchor &&
      !anchor.contains(
        event.relatedTarget instanceof Node ? event.relatedTarget : null
      )
    )
      clearTimeout(timer);
  }
  function immediate(event: Event) {
    const anchor = link(event);
    if (anchor) void prefetchLink(anchor.href);
  }
  node.addEventListener('pointerover', hover);
  node.addEventListener('pointerout', leave);
  node.addEventListener('focusin', immediate);
  node.addEventListener('touchstart', immediate, { passive: true });
  return {
    destroy() {
      clearTimeout(timer);
      node.removeEventListener('pointerover', hover);
      node.removeEventListener('pointerout', leave);
      node.removeEventListener('focusin', immediate);
      node.removeEventListener('touchstart', immediate);
    }
  };
}
