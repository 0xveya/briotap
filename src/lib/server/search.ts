import { prisma } from './prisma';
import { collections } from './catalog';
import { Prisma } from '../../../generated/prisma/client';
import { suggestionCache } from './suggestion-cache';

export type SearchResult = {
  kind: 'package' | 'module';
  path: string;
  name: string;
  synopsis: string;
  version: string | null;
};
export type Suggestion = Pick<SearchResult, 'path' | 'name'>;
type Candidate = SearchResult & { score: number };
type SuggestionCandidate = Suggestion & { score: number };
const featured = new Set(collections.flatMap((group) => group.paths));
const recent = new Map<string, { at: number; results: SearchResult[] }>();
const pending = new Map<string, Promise<SearchResult[]>>();

export class SearchUnavailableError extends Error {
  constructor() { super('Search is temporarily unavailable. Try again.'); }
}

function isStatementTimeout(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2010') return false;
  if (error.meta?.code === '57014') return true;
  const adapter = error.meta?.driverAdapterError;
  if (typeof adapter !== 'object' || adapter === null || !('cause' in adapter)) return false;
  const cause = adapter.cause;
  return typeof cause === 'object' && cause !== null && 'originalCode' in cause && cause.originalCode === '57014';
}

async function timedQuery<T>(
  milliseconds: number,
  run: (tx: Prisma.TransactionClient) => Promise<T[]>,
  maxWait = 500
): Promise<T[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('statement_timeout', ${String(milliseconds)}, true)`;
    return run(tx);
  }, { maxWait, timeout: milliseconds + 1000 });
}

/** Typing never waits for description or fuzzy searches. Prefix scans stop early. */
export const suggest = suggestionCache<Suggestion>(async (q) => {
  const prefix = `${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  try {
    const candidates = await timedQuery(750, (tx) => tx.$queryRaw<SuggestionCandidate[]>`
      WITH featured_packages AS MATERIALIZED (
        SELECT path, name FROM packages WHERE path = ANY(${[...featured]}::text[])
      )
      (SELECT path, name, 1000 AS score
        FROM packages WHERE lower(path) = ${q} LIMIT 1)
      UNION ALL
      (SELECT path, name, 900
        FROM packages WHERE lower(name) = ${q}
        ORDER BY (path = module_path) DESC, length(path), path LIMIT 6)
      UNION ALL
      (SELECT path, name, 950
        FROM featured_packages WHERE lower(name) LIKE ${prefix})
      UNION ALL
      (SELECT path, name, 650
        FROM modules WHERE lower(path) = ${q} AND enriched_at IS NOT NULL LIMIT 1)
    `, 100);
    // Exact names already fill most dropdowns. Do not read additional heap pages
    // just to discard their lower-ranked matches, especially on cold NAS storage.
    if (new Set(candidates.map((item) => item.path)).size < 6) {
      const prefixes = await optionalQuery<SuggestionCandidate>(750, (tx) => tx.$queryRaw<SuggestionCandidate[]>`
        (SELECT path, name, 700 AS score
          FROM packages WHERE lower(path) LIKE ${prefix}
          ORDER BY lower(path) USING ~<~ LIMIT 6)
        UNION ALL
        (SELECT path, name, 600
          FROM packages WHERE lower(name) LIKE ${prefix}
          ORDER BY lower(name) USING ~<~ LIMIT 6)
      `, 100);
      candidates.push(...prefixes.rows);
      if (!candidates.length && prefixes.timedOut) throw new SearchUnavailableError();
    }
    candidates.sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path));
    const seen = new Set<string>();
    return candidates.filter((item) => {
      if (seen.has(item.path)) return false;
      seen.add(item.path);
      return true;
    }).slice(0, 6).map(({ score: _score, ...item }) => item);
  } catch (error) {
    if (isStatementTimeout(error)) throw new SearchUnavailableError();
    throw error;
  }
}, () => new SearchUnavailableError());

async function optionalQuery<T = Candidate>(
  milliseconds: number,
  run: (tx: Prisma.TransactionClient) => Promise<T[]>,
  maxWait = 500
): Promise<{ rows: T[]; timedOut: boolean }> {
  try { return { rows: await timedQuery(milliseconds, run, maxWait), timedOut: false }; }
  catch (error) {
    if (!isStatementTimeout(error)) throw error;
    console.warn(`Search fallback exceeded its ${milliseconds} ms query budget`);
    return { rows: [], timedOut: true };
  }
}

/** Search indexed names first, then descriptions and fuzzy paths when needed. */
export function search(query: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase().slice(0, 200);
  if (!q) return Promise.resolve([]);
  const existing = recent.get(q);
  if (existing && Date.now() - existing.at < 30_000) return Promise.resolve(existing.results);
  const running = pending.get(q);
  if (running) return running;
  // Leave database connections available for package pages and the catalog.
  if (pending.size >= 4) return Promise.reject(new SearchUnavailableError());
  const task = lookup(q).then((results) => {
    if (recent.size >= 200) recent.delete(recent.keys().next().value!);
    recent.set(q, { at: Date.now(), results });
    return results;
  }).catch((error: unknown) => {
    if (isStatementTimeout(error)) {
      console.warn('Search exceeded its 2000 ms query budget');
      throw new SearchUnavailableError();
    }
    throw error;
  }).finally(() => pending.delete(q));
  pending.set(q, task);
  return task;
}

async function lookup(q: string): Promise<SearchResult[]> {
  const prefix = `${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const strict = await timedQuery(2000, (tx) => tx.$queryRaw<Candidate[]>`
    WITH featured_packages AS MATERIALIZED (
      SELECT path, name, synopsis, version FROM packages WHERE path = ANY(${[...featured]}::text[])
    )
    (SELECT 'package'::text AS kind, path, name, synopsis, version, 1000 AS score
      FROM packages WHERE lower(path) = ${q} LIMIT 1)
    UNION ALL
    (SELECT 'package', path, name, synopsis, version, 900
      FROM packages WHERE lower(name) = ${q}
      ORDER BY (path = module_path) DESC, length(path), path LIMIT 20)
    UNION ALL
    (SELECT 'package', path, name, synopsis, version, 900
      FROM featured_packages WHERE lower(name) = ${q})
    UNION ALL
    (SELECT 'module', path, name, ''::text, version, 650
      FROM modules WHERE lower(path) = ${q} AND enriched_at IS NOT NULL LIMIT 1)
  `);
  let candidates = strict;
  const exactPath = strict.some((item) => item.path.toLowerCase() === q);
  let prefixTimedOut = false;
  if (!exactPath && new Set(strict.map((item) => item.path)).size < 20) {
    const prefixes = await optionalQuery(700, (tx) => tx.$queryRaw<Candidate[]>`
      (SELECT 'package'::text AS kind, path, name, synopsis, version, 700 AS score
        FROM packages WHERE lower(path) LIKE ${prefix}
        ORDER BY lower(path) USING ~<~ LIMIT 20)
      UNION ALL
      (SELECT 'package', path, name, synopsis, version, 600
        FROM packages WHERE lower(name) LIKE ${prefix}
        ORDER BY lower(name) USING ~<~ LIMIT 20)
    `);
    candidates.push(...prefixes.rows);
    prefixTimedOut = prefixes.timedOut;
  }
  if (!exactPath && q.length >= 3 && (candidates.length < 8 || q.includes(' '))) {
    const descriptions = await optionalQuery(700, (tx) => tx.$queryRaw<Candidate[]>`
      SELECT 'package'::text AS kind, path, name, synopsis, version, 400 AS score
        FROM packages WHERE to_tsvector('english', synopsis) @@ plainto_tsquery('english', ${q}) LIMIT 80
    `);
    candidates.push(...descriptions.rows);
    const fuzzy = await optionalQuery(250, (tx) => tx.$queryRaw<Candidate[]>`
      SELECT 'package'::text AS kind, path, name, synopsis, version, 200 AS score
        FROM packages WHERE lower(name) % ${q} LIMIT 40
    `);
    candidates.push(...fuzzy.rows);
    if (!candidates.length && (prefixTimedOut || descriptions.timedOut || fuzzy.timedOut)) throw new SearchUnavailableError();
  }
  if (!candidates.length && prefixTimedOut) throw new SearchUnavailableError();
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
  return results;
}
