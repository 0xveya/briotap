import { parseHTML } from 'linkedom';
import sanitize from 'sanitize-html';
import * as v from 'valibot';
import { cached, fetchJson, pkgUrl } from './cache';

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
  symbols: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      kind: v.string(),
      signature: v.string()
    })
  ),
  sections: v.array(v.object({ id: v.string(), html: v.string() }))
});

export async function documentation(path: string, version: string) {
  return cached(
    `rendered-docs:v1:${path}@${version}`,
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
  document.querySelector('h1')?.remove();
  for (const heading of document.querySelectorAll('h2')) {
    heading.id = `section-${(heading.textContent ?? '').toLowerCase()}`;
  }
  for (const pre of document.querySelectorAll('pre')) {
    const signature = (pre.textContent ?? '').trim();
    const match =
      /^(func|type|var|const)\s+(?:\((?:\w+\s+)?\*?([\w\[\]]+)\)\s+)?([A-Z]\w*)/.exec(
        signature
      );
    if (!match) continue;
    const name = match[2] ? `${match[2]}.${match[3]}` : match[3]!;
    const id = `symbol-${name}`;
    const heading = document.createElement('h3');
    heading.id = id;
    heading.textContent = name;
    pre.before(heading);
    symbols.push({
      id,
      name,
      kind: match[1]!,
      signature: signature.split('\n')[0]!
    });
  }
  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') ?? '';
    if (
      href.startsWith('#') &&
      symbols.some((symbol) => symbol.name === href.slice(1))
    )
      anchor.setAttribute('href', `#symbol-${href.slice(1)}`);
    else if (href.startsWith('https://pkg.go.dev/'))
      anchor.setAttribute('href', `/package/${href.slice(19)}`);
    else if (href.startsWith('/'))
      anchor.setAttribute('href', `/package${href}`);
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
      a: ['href', 'title'],
      h2: ['id'],
      h3: ['id'],
      h4: ['id']
    },
    allowedSchemes: ['http', 'https', 'mailto']
  });
  const sections: { id: string; html: string }[] = [];
  let intro = html;
  if (symbols.length > 300) {
    const boundaries = [...html.matchAll(/<h3 id="(symbol-[^"]+)">/g)];
    intro = html.slice(0, boundaries[0]?.index ?? html.length);
    for (const [index, match] of boundaries.entries()) {
      sections.push({
        id: match[1]!,
        html: html.slice(
          match.index,
          boundaries[index + 1]?.index ?? html.length
        )
      });
    }
  }
  const { docs: _docs, ...metadata } = raw;
  return { ...metadata, html: intro, symbols, sections };
}
