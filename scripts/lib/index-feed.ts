import * as v from 'valibot';
import { responseText } from '../../src/lib/server/response';

export const indexEntrySchema = v.object({
  Path: v.pipe(v.string(), v.nonEmpty()),
  Version: v.pipe(v.string(), v.nonEmpty()),
  Timestamp: v.pipe(v.string(), v.isoTimestamp(), v.regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/))
});
export const indexCursorSchema = v.object({ timestamp: v.string(), seen: v.array(v.string()) });
export type IndexCursor = v.InferOutput<typeof indexCursorSchema>;

/** Normalize fractional seconds before comparing RFC3339Nano feed timestamps. */
export function timestampKey(timestamp: string): string {
  if (!timestamp) return '';
  const [seconds, fraction = ''] = timestamp.slice(0, -1).split('.');
  return `${seconds}.${fraction.padEnd(9, '0')}Z`;
}

/** Fetch one chronological page, preserving entries sharing a timestamp. */
export async function indexPage(cursor: IndexCursor, signal: AbortSignal) {
  const url = new URL('https://index.golang.org/index');
  url.searchParams.set('limit', '2000');
  if (cursor.timestamp) url.searchParams.set('since', cursor.timestamp);
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`index.golang.org returned ${response.status}`);
  }
  const entries = (await responseText(response)).split('\n').filter(Boolean)
    .map((line) => v.parse(indexEntrySchema, JSON.parse(line) as unknown));
  for (let i = 1; i < entries.length; i++) {
    if (timestampKey(entries[i].Timestamp) < timestampKey(entries[i - 1].Timestamp)) throw new Error('Index page is out of order');
  }
  const seen = new Set(cursor.seen);
  const previous = timestampKey(cursor.timestamp);
  const fresh = entries.filter((entry) => timestampKey(entry.Timestamp) > previous ||
    (timestampKey(entry.Timestamp) === previous && !seen.has(`${entry.Path}@${entry.Version}`)));
  if (!fresh.length && entries.length === 2000) throw new Error(`Index cursor stuck at ${cursor.timestamp}`);
  const timestamp = fresh.at(-1)?.Timestamp ?? cursor.timestamp;
  const atTimestamp = fresh.filter((entry) => timestampKey(entry.Timestamp) === timestampKey(timestamp)).map((entry) => `${entry.Path}@${entry.Version}`);
  return {
    entries: fresh,
    caughtUp: entries.length < 2000,
    cursor: { timestamp, seen: timestampKey(timestamp) === previous ? [...cursor.seen, ...atTimestamp] : atTimestamp }
  };
}
