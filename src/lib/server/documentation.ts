import { parseHTML } from 'linkedom';
import sanitize from 'sanitize-html';
import * as v from 'valibot';
import { cached, cachedSnapshot, fetchJson, pkgUrl } from './cache';
import { prisma } from './prisma';
import { documentationLink } from './documentation-links';
import { documentContents, documentFragment } from '../document-contents';

const schema = v.object({
  path: v.string(),
  name: v.string(),
  version: v.string(),
  modulePath: v.string(),
  synopsis: v.optional(v.string(), ''),
  docs: v.optional(v.string(), ''),
  imports: v.optional(v.array(v.string()), []),
  isRedistributable: v.boolean()
});

const renderedSchema = v.object({
  ...v.omit(schema, ['docs']).entries,
  html: v.string(),
  headings: v.array(v.object({ id: v.string(), name: v.string(), level: v.number() })),
  symbols: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      kind: v.string(),
      signature: v.string()
    })
  ),
  sections: v.array(
    v.object({ id: v.string(), aliases: v.array(v.string()), html: v.string() })
  )
});

export function documentationSnapshot(path: string, version: string) {
  return cachedSnapshot(`rendered-docs:v6:${path}@${version}`, renderedSchema);
}

export async function documentation(path: string, version: string) {
  return cached(
    `rendered-docs:v6:${path}@${version}`,
    renderedSchema,
    async () => renderDocumentation(path, version)
  );
}

async function renderDocumentation(path: string, version: string) {
  const raw = await cached(`docs:${path}@${version}`, schema, async () =>
    v.parse(
      schema,
      await fetchJson(
        pkgUrl('package', path, {
          version,
          doc: 'html',
          examples: 'true',
          imports: 'true'
        })
      )
    )
  );
  const { document } = parseHTML(
    `<html><body>${raw.isRedistributable ? raw.docs : ''}</body></html>`
  );
  const symbols: {
    id: string;
    name: string;
    kind: string;
    signature: string;
  }[] = [];
  const aliases = new Map<string, string[]>();
  document.querySelector('h1')?.remove();
  for (const pre of document.querySelectorAll('pre')) {
    pre.textContent = (pre.textContent ?? '').replace(
      /^(?:[ \t]*\r?\n)+|(?:\r?\n[ \t]*)+$/g,
      ''
    );
    const signature = (pre.textContent ?? '').trim();
    const match =
      /^(func|type|var|const)\s+(?:\((?:\w+\s+)?\*?(\w+(?:\[[^\]]+\])?)\)\s+)?([A-Z]\w*)/.exec(
        signature
      );
    const declarations = (
      match
        ? [
            {
              kind: match[1]!,
              name: match[2] ? `${match[2]}.${match[3]}` : match[3]!,
              signature: signature.split('\n')[0]!
            }
          ]
        : /^(var|const)\s*\(/.test(signature)
          ? [...signature.matchAll(/^\t([A-Z]\w*)\b[^\n]*/gm)].map((item) => ({
              kind: signature.startsWith('const') ? 'const' : 'var',
              name: item[1]!,
              signature: `${signature.startsWith('const') ? 'const' : 'var'} ${item[0].trim()}`
            }))
          : []
    ).filter(
      (declaration) =>
        !symbols.some((symbol) => symbol.name === declaration.name)
    );
    if (!declarations.length) continue;
    const heading = document.createElement('h3');
    heading.id = `symbol-${declarations[0]!.name}`;
    heading.textContent = declarations.length === 1 ? declarations[0]!.name : `${declarations[0]!.name} (${declarations.length} declarations)`;
    aliases.set(
      heading.id,
      declarations.slice(1).map((item) => `symbol-${item.name}`)
    );
    pre.before(heading);
    for (const [index, declaration] of declarations.entries()) {
      const id = `symbol-${declaration.name}`;
      if (index > 0) {
        const alias = document.createElement('a');
        alias.id = id;
        heading.append(alias);
      }
      symbols.push({
        id,
        name: declaration.name,
        kind: declaration.kind,
        signature: declaration.signature
      });
    }
  }

  const contents = documentContents(document.querySelectorAll('h2, h3, h4, h5, h6'), 'section');
  const links = [...document.querySelectorAll('a[href]')].flatMap((anchor) => {
    const href = anchor.getAttribute('href') ?? '';
    if (!href.startsWith('/') && !href.startsWith('https://pkg.go.dev/')) return [];
    const link = documentationLink(href);
    return link ? [{ anchor, link }] : [];
  });
  const paths = [...new Set(links.flatMap(({ link }) => link.path ? [link.path] : []))];
  const indexed = paths.length
    ? await prisma.package.findMany({ where: { path: { in: paths } }, select: { path: true } })
    : [];
  const available = new Set([path, ...indexed.map((pkg) => pkg.path)]);
  for (const { anchor, link } of links)
    anchor.setAttribute('href', link.path && available.has(link.path) ? link.local! : link.external);
  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') ?? '';
    const fragment = documentFragment(href);
    if (
      href.startsWith('#') &&
      symbols.some((symbol) => symbol.name === fragment)
    )
      anchor.setAttribute('href', `#symbol-${fragment}`);
    else if (href.startsWith('#')) {
      const target = contents.aliases.get(fragment) ?? contents.aliases.get(fragment.toLowerCase());
      if (target) anchor.setAttribute('href', `#${target}`);
    }
  }
  const html = sanitize(document.body.innerHTML, {
    allowedTags: [
      'p',
      'a',
      'pre',
      'code',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'strong',
      'em',
      'br',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
      'hr'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'id'],
      h2: ['id'],
      h3: ['id'],
      h4: ['id'],
      h5: ['id'],
      h6: ['id']
    },
    allowedSchemes: ['http', 'https', 'mailto']
  });
  const sections: { id: string; aliases: string[]; html: string }[] = [];
  let intro = html;
  if (symbols.length > 300) {
    const boundaries = [...html.matchAll(/<h3 id="(symbol-[^"]+)">/g)];
    intro = html.slice(0, boundaries[0]?.index ?? html.length);
    for (const [index, match] of boundaries.entries()) {
      sections.push({
        id: match[1]!,
        aliases: aliases.get(match[1]!) ?? [],
        html: html.slice(
          match.index,
          boundaries[index + 1]?.index ?? html.length
        )
      });
      const section = sections.at(-1)!;
      section.aliases = [...new Set([...section.aliases, ...[...section.html.matchAll(/<(?:h[2-6]|a)\b[^>]*\bid="([^"]+)"/g)].map((entry) => entry[1]!)])].filter((id) => id !== section.id);
    }
  }
  const { docs: _docs, ...metadata } = raw;
  return { ...metadata, html: intro, headings: contents.headings, symbols, sections };
}
