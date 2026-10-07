import { parseHTML } from 'linkedom';
import { marked } from 'marked';
import sanitize from 'sanitize-html';
import * as v from 'valibot';
import { cached, fetchJson, pkgUrl } from './cache';
import { documentContents, documentFragment } from '../document-contents';

const moduleSchema = v.object({
  isRedistributable: v.boolean(),
  repoUrl: v.nullish(v.string()),
  readme: v.nullish(v.object({ filepath: v.string(), contents: v.string() }))
});
const schema = v.object({
  html: v.string(), isRedistributable: v.boolean(),
  headings: v.array(v.object({ id: v.string(), name: v.string(), level: v.number() }))
});

function repositoryDirectory(repository: string | null | undefined, version: string, filepath: string, raw: boolean): URL | null {
  if (!repository) return null;
  let url: URL;
  try { url = new URL(repository); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const path = url.pathname.replace(/\.git\/?$/, '').replace(/\/$/, '');
  const directory = filepath.split('/').slice(0, -1).map(encodeURIComponent).join('/');
  if (url.hostname === 'github.com') {
    if (raw) url.hostname = 'raw.githubusercontent.com';
    url.pathname = `${path}/${raw ? '' : 'blob/'}${encodeURIComponent(version)}/${directory}${directory ? '/' : ''}`;
  } else if (url.hostname === 'gitlab.com')
    url.pathname = `${path}/-/${raw ? 'raw' : 'blob'}/${encodeURIComponent(version)}/${directory}${directory ? '/' : ''}`;
  else return null;
  url.search = '';
  url.hash = '';
  return url;
}

function linkedUrl(value: string, base: URL | null, root: URL | null): string | null {
  try {
    if (value.startsWith('//')) return new URL(`https:${value}`).href;
    return new URL(value.startsWith('/') ? value.slice(1) : value,
      (value.startsWith('/') ? root : base) ?? undefined).href;
  } catch { return null; }
}

/** Render the module's actual README while keeping untrusted markup inert. */
export function renderReadme(contents: string, repository: string | null | undefined, version: string, filepath: string) {
  const { document } = parseHTML(`<html><body>${marked.parse(contents, { async: false, gfm: true })}</body></html>`);
  const outline = documentContents(document.querySelectorAll('h1, h2, h3, h4, h5, h6'), 'readme', true);
  const base = repositoryDirectory(repository, version, filepath, false);
  const root = repositoryDirectory(repository, version, '', false);
  const images = repositoryDirectory(repository, version, filepath, true);
  const imageRoot = repositoryDirectory(repository, version, '', true);
  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      const target = outline.aliases.get(documentFragment(href));
      if (target) anchor.setAttribute('href', `#${target}`);
    } else {
      const target = linkedUrl(href, base, root);
      if (target) anchor.setAttribute('href', target);
      else anchor.removeAttribute('href');
    }
  }
  for (const image of document.querySelectorAll('img[src]')) {
    const src = image.getAttribute('src') ?? '';
    const target = linkedUrl(src, images, imageRoot);
    if (target) image.setAttribute('src', target);
    else image.removeAttribute('src');
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');
  }
  const html = sanitize(document.body.innerHTML, {
    allowedTags: [...sanitize.defaults.allowedTags, 'img', 'details', 'summary'],
    allowedAttributes: {
      a: ['href', 'title', 'id', 'rel'], code: ['class'],
      h1: ['id'], h2: ['id'], h3: ['id'], h4: ['id'], h5: ['id'], h6: ['id'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'], details: ['open']
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    transformTags: { a: sanitize.simpleTransform('a', { rel: 'noreferrer' }) }
  });
  return { html, headings: outline.headings };
}

export async function readme(modulePath: string, version: string) {
  return cached(`readme:v1:${modulePath}@${version}`, schema, async () => {
    const data = v.parse(moduleSchema, await fetchJson(pkgUrl('module', modulePath, { version, readme: 'true' })));
    if (!data.isRedistributable || !data.readme) return { html: '', headings: [], isRedistributable: data.isRedistributable };
    return { ...renderReadme(data.readme.contents, data.repoUrl, version, data.readme.filepath), isRedistributable: true };
  });
}
