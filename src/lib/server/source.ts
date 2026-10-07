import { parseHTML } from 'linkedom';
import * as v from 'valibot';
import { cached } from './cache';

const linksSchema = v.record(
  v.string(),
  v.pipe(v.string(), v.url(), v.regex(/^https:\/\//))
);

export function documentationUrl(
  path: string,
  modulePath: string,
  version: string
): string {
  const suffix = path.slice(modulePath.length);
  return `https://pkg.go.dev/${modulePath}@${encodeURIComponent(version)}${suffix}`;
}

/** Cache the source locations published by pkg.go.dev, including file and line. */
export async function sourceLinks(
  path: string,
  modulePath: string,
  version: string
): Promise<Record<string, string>> {
  return cached(`source-links:v1:${path}@${version}`, linksSchema, async () => {
    const response = await fetch(documentationUrl(path, modulePath, version), {
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'briotap-prototype' }
    });
    if (!response.ok)
      throw new Error(`Source lookup returned ${response.status}`);
    const { document } = parseHTML(await response.text());
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
    return links;
  });
}
