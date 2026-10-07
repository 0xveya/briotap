import * as v from 'valibot';
import sanitize from 'sanitize-html';
import { cached } from './cache';

const schema = v.array(v.object({
  tag_name: v.string(),
  name: v.nullable(v.string()),
  html_url: v.pipe(v.string(), v.url(), v.regex(/^https:\/\/github\.com\//)),
  published_at: v.nullable(v.string()),
  prerelease: v.boolean(),
  body_html: v.optional(v.string(), '')
}));

/** Repository release notes, fetched only when the changelog is requested. */
export async function releases(repoUrl: string) {
  const match = /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/?$/.exec(repoUrl);
  if (!match) return { ok: false as const, message: 'Release notes are available here for GitHub repositories.' };
  const repository = `${match[1]}/${match[2]!.replace(/\.git$/, '')}`;
  try {
    const items = await cached(`releases:v1:${repository}`, schema, async () => {
      const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=20`, {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: 'application/vnd.github.html+json', 'User-Agent': 'briotap-prototype' }
      });
      if (!response.ok) throw new Error(`Release notes returned ${response.status}`);
      return v.parse(schema, await response.json());
    });
    return { ok: true as const, items: items.map((item) => ({
      tag: item.tag_name,
      name: item.name || item.tag_name,
      url: item.html_url,
      publishedAt: item.published_at,
      prerelease: item.prerelease,
      html: sanitize(item.body_html, {
        allowedTags: sanitize.defaults.allowedTags,
        allowedAttributes: { a: ['href', 'title', 'rel'], code: ['class'] },
        allowedSchemes: ['https', 'http'],
        transformTags: { a: sanitize.simpleTransform('a', { rel: 'noreferrer' }) }
      })
    })) };
  } catch {
    return { ok: false as const, message: 'Release notes could not be loaded. Open the repository releases or try again.' };
  }
}
