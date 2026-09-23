import { prisma } from './prisma';

export type SearchResult = {
  kind: 'package' | 'module';
  path: string;
  name: string;
  synopsis: string;
  version: string | null;
};

export async function search(query: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase().slice(0, 200);
  if (!q) return [];
  const prefix = `${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const fuzzy = q.length >= 3;
  return prisma.$queryRaw<SearchResult[]>`
    WITH matches AS (
      SELECT 'package'::text AS kind, path, name, synopsis, version,
        CASE
          WHEN lower(path) = ${q} THEN 1000
          WHEN lower(name) = ${q} THEN 900
          WHEN lower(path) LIKE ${prefix} THEN 800
          WHEN lower(name) LIKE ${prefix} THEN 700
          WHEN ${fuzzy} AND lower(path) % ${q} THEN 300 + similarity(lower(path), ${q}) * 100
          WHEN ${fuzzy} AND lower(name) % ${q} THEN 250 + similarity(lower(name), ${q}) * 100
          ELSE 100 + ts_rank(to_tsvector('english', synopsis), plainto_tsquery('english', ${q})) * 100
        END AS score
      FROM packages
      WHERE lower(path) = ${q} OR lower(name) = ${q}
        OR lower(path) LIKE ${prefix} OR lower(name) LIKE ${prefix}
        OR (${fuzzy} AND (lower(path) % ${q} OR lower(name) % ${q}))
        OR to_tsvector('english', synopsis) @@ plainto_tsquery('english', ${q})
      UNION ALL
      SELECT 'module'::text, path, name, ''::text, version,
        CASE
          WHEN lower(path) = ${q} THEN 950
          WHEN lower(name) = ${q} THEN 650
          WHEN lower(path) LIKE ${prefix} THEN 600
          WHEN lower(name) LIKE ${prefix} THEN 550
          ELSE 200 + greatest(similarity(lower(path), ${q}), similarity(lower(name), ${q})) * 100
        END
      FROM modules
      WHERE enriched_at IS NOT NULL AND (
        lower(path) = ${q} OR lower(name) = ${q}
        OR lower(path) LIKE ${prefix} OR lower(name) LIKE ${prefix}
        OR (${fuzzy} AND (lower(path) % ${q} OR lower(name) % ${q}))
      )
    )
    SELECT kind, path, name, synopsis, version
    FROM matches ORDER BY score DESC, path LIMIT 20
  `;
}
