import * as v from 'valibot';
import sanitize from 'sanitize-html';
import { cached, fetchJson } from './cache';
import { responseText } from './response';

const schema = v.array(v.object({
  tag: v.string(), name: v.string(), url: v.pipe(v.string(), v.url(), v.regex(/^https:\/\//)),
  publishedAt: v.nullable(v.string()), prerelease: v.boolean(), html: v.string()
}));
const githubSchema = v.array(v.object({
  tag_name: v.string(), name: v.nullable(v.string()), html_url: v.string(),
  published_at: v.nullable(v.string()), prerelease: v.boolean(), body_html: v.optional(v.string(), '')
}));
const gitlabSchema = v.array(v.object({
  tag_name: v.string(), name: v.string(), description: v.nullish(v.string(), ''),
  released_at: v.nullable(v.string()), _links: v.object({ self: v.string() })
}));
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** Cache published release notes from the repository's forge. */
export async function releases(repoUrl: string) {
  const match = /^https:\/\/(github\.com|gitlab\.com)\/([a-zA-Z0-9_.\-/]+?)\/?$/.exec(repoUrl);
  if (!match) return { ok: false as const, message: 'Open the source repository to read its release notes.' };
  const forge = match[1]!;
  const repository = match[2]!.replace(/\.git$/, '');
  try {
    const items = await cached(`releases:v2:${forge}/${repository}`, schema, async () => {
      if (forge === 'gitlab.com') {
        const data = v.parse(gitlabSchema, await fetchJson(`https://gitlab.com/api/v4/projects/${encodeURIComponent(repository)}/releases?per_page=20`));
        return data.map((item) => ({
          tag: item.tag_name, name: item.name, url: item._links.self,
          publishedAt: item.released_at, prerelease: /-/.test(item.tag_name),
          html: `<p>${escape(item.description).replaceAll('\n', '<br>')}</p>`
        }));
      }
      const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=20`, {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: 'application/vnd.github.html+json', 'User-Agent': 'briotap-prototype' }
      });
      if (!response.ok) throw new Error(`Release notes returned ${response.status}`);
      return v.parse(githubSchema, JSON.parse(await responseText(response)) as unknown).map((item) => ({
        tag: item.tag_name, name: item.name || item.tag_name, url: item.html_url,
        publishedAt: item.published_at, prerelease: item.prerelease, html: item.body_html
      }));
    });
    return { ok: true as const, items: items.map((item) => ({ ...item,
      html: sanitize(item.html, {
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
