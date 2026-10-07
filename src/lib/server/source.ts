import { parseHTML } from 'linkedom';
import * as v from 'valibot';
import { cached } from './cache';
import { upstreamFetch } from './upstream';
import { responseText } from './response';

const linksSchema = v.record(
  v.string(),
  v.pipe(v.string(), v.url(), v.regex(/^https:\/\//))
);

const indexSchema = v.object({
  links: linksSchema,
  files: v.array(v.object({
    name: v.string(),
    url: v.pipe(v.string(), v.url(), v.regex(/^https:\/\//))
  }))
});

export function documentationUrl(
  path: string,
  modulePath: string,
  version: string
): string {
  if (!(path === modulePath || path.startsWith(`${modulePath}/`)) ||
    [...path.split('/'), ...modulePath.split('/')].some((part) => !part || part === '.' || part === '..'))
    throw new Error('Package is outside the selected module');
  const suffix = path.slice(modulePath.length);
  return `https://pkg.go.dev/${modulePath}@${encodeURIComponent(version)}${suffix}`;
}

/** Cache the source locations published by pkg.go.dev, including file and line. */
export async function sourceIndex(
  path: string,
  modulePath: string,
  version: string
) {
  return cached(`source-index:v3:${modulePath}:${path}@${version}`, indexSchema, async () => {
    const response = await upstreamFetch(documentationUrl(path, modulePath, version), {
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'briotap-prototype' }
    });
    if (!response.ok)
      throw new Error(`Source lookup returned ${response.status}`);
    const { document } = parseHTML(await responseText(response));
    const links: Record<string, string> = {};
    for (const node of document.querySelectorAll('[id][data-kind]')) {
      const anchor =
        node.querySelector('a.Documentation-source') ??
        node
          .closest('.Documentation-declaration')
          ?.querySelector('a.Documentation-source');
      const href = anchor?.getAttribute('href');
      if (
        href &&
        v.safeParse(v.pipe(v.string(), v.url(), v.regex(/^https:\/\//)), href)
          .success
      )
        links[node.id] = href;
    }
    const files = [...document.querySelectorAll('a')].flatMap((anchor) => {
      const name = (anchor.textContent ?? '').trim();
      const url = anchor.getAttribute('href') ?? '';
      return /^[a-zA-Z0-9_.-]+\.go$/.test(name) && /^https:\/\//.test(url) && !url.includes('#')
        ? [{ name, url }]
        : [];
    });
    return { links, files: [...new Map(files.map((file) => [file.name, file])).values()] };
  });
}

export async function sourceLinks(path: string, modulePath: string, version: string): Promise<Record<string, string>> {
  return (await sourceIndex(path, modulePath, version)).links;
}

/** Read only files listed by the selected package's original documentation. */
export async function sourceFile(path: string, modulePath: string, version: string, name: string) {
  const file = (await sourceIndex(path, modulePath, version)).files.find((item) => item.name === name);
  if (!file) throw new Error('Source file not found');
  const url = new URL(file.url);
  const raw = new URL(url);
  if (url.hostname === 'github.com' && url.pathname.includes('/blob/')) {
    raw.hostname = 'raw.githubusercontent.com';
    raw.pathname = url.pathname.replace('/blob/', '/');
  } else if (url.hostname === 'gitlab.com' && url.pathname.includes('/-/blob/')) {
    raw.pathname = url.pathname.replace('/-/blob/', '/-/raw/');
  } else return { name, url: file.url, code: null };
  raw.username = '';
  raw.password = '';
  raw.port = '';
  raw.search = '';
  raw.hash = '';
  const code = await cached(`source-file:v1:${raw}`, v.string(), async () => {
    const response = await fetch(raw, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Source returned ${response.status}`);
    const text = await responseText(response, 200_000);
    if (text.length > 200_000) throw new Error('Source file is too large to display');
    return text;
  });
  return { name, url: file.url, code };
}
