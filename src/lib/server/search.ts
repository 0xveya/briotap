import { prisma } from './prisma';
import { collections } from './catalog';

export type SearchResult = {
  kind: 'package' | 'module';
  path: string;
  name: string;
  synopsis: string;
  version: string | null;
};
type Candidate = SearchResult & { score: number };
const featured = new Set(collections.flatMap((group) => group.paths));
const recent = new Map<string, { at: number; results: SearchResult[] }>();

/** Search indexed names first, then descriptions and fuzzy paths when needed. */
export async function search(query: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase().slice(0, 200);
  if (!q) return [];
  const existing = recent.get(q);
  if (existing && Date.now() - existing.at < 30_000) return existing.results;
  const prefix = `${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const strict = await prisma.$queryRaw<Candidate[]>`
    (SELECT 'package'::text AS kind, path, name, synopsis, version, 1000 AS score
      FROM packages WHERE lower(path) = ${q} LIMIT 1)
    UNION ALL
    (SELECT 'package', path, name, synopsis, version, 900
      FROM packages WHERE lower(name) = ${q}
      ORDER BY (path = module_path) DESC, length(path), path LIMIT 60)
    UNION ALL
    (SELECT 'package', path, name, synopsis, version, 700
      FROM packages WHERE lower(path) LIKE ${prefix} LIMIT 40)
    UNION ALL
    (SELECT 'package', path, name, synopsis, version, 600
      FROM packages WHERE lower(name) LIKE ${prefix} LIMIT 40)
    UNION ALL
    (SELECT 'module', path, name, ''::text, version, 650
      FROM modules WHERE lower(path) = ${q} AND enriched_at IS NOT NULL LIMIT 1)
  `;
  let candidates = strict;
  if (q.length >= 3 && (strict.length < 8 || q.includes(' '))) {
    const broad = await prisma.$queryRaw<Candidate[]>`
      (SELECT 'package'::text AS kind, path, name, synopsis, version, 400 AS score
        FROM packages WHERE to_tsvector('english', synopsis) @@ plainto_tsquery('english', ${q}) LIMIT 80)
      UNION ALL
      (SELECT 'package', path, name, synopsis, version, 200
        FROM packages WHERE lower(name) % ${q} LIMIT 40)
    `;
    candidates = [...strict, ...broad];
  }
  candidates.sort(
    (a, b) =>
      b.score +
        (featured.has(b.path) ? 150 : 0) -
        (a.score + (featured.has(a.path) ? 150 : 0)) ||
      a.path.length - b.path.length ||
      a.path.localeCompare(b.path)
  );
  const seen = new Set<string>();
  const results = candidates
    .filter((item) => {
      if (seen.has(item.path)) return false;
      seen.add(item.path);
      return true;
    })
    .slice(0, 20)
    .map(({ score: _score, ...item }) => item);
  if (recent.size >= 200) recent.delete(recent.keys().next().value!);
  recent.set(q, { at: Date.now(), results });
  return results;
}
