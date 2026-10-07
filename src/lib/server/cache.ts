import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import * as v from 'valibot';

const directory = 'data/ui-cache';
const pending = new Map<string, Promise<unknown>>();
const envelope = v.object({ savedAt: v.number(), value: v.unknown() });

/** Persist upstream responses and serve stale data while refreshing it. */
export async function cached<T>(
  key: string,
  schema: v.GenericSchema<unknown, T>,
  load: () => Promise<T>
): Promise<T> {
  const file = `${directory}/${createHash('sha256').update(key).digest('hex')}.json`;
  const refresh = (): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing.then((value) => v.parse(schema, value));
    const task = (async () => {
      const value = v.parse(schema, await load());
      await mkdir(directory, { recursive: true });
      await writeFile(
        `${file}.tmp`,
        JSON.stringify({ savedAt: Date.now(), value })
      );
      await rename(`${file}.tmp`, file);
      return value;
    })();
    pending.set(key, task);
    void task.finally(() => pending.delete(key)).catch(() => {});
    return task;
  };
  try {
    const entry = v.parse(
      envelope,
      JSON.parse(await readFile(file, 'utf8')) as unknown
    );
    const value = v.parse(schema, entry.value);
    if (Date.now() - entry.savedAt > 86_400_000) {
      void refresh().catch((error: unknown) =>
        console.error(`Could not refresh ${key}`, error)
      );
    }
    return value;
  } catch {
    return refresh();
  }
}

export async function fetchJson(url: string | URL): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: { 'User-Agent': 'briotap-prototype' }
  });
  if (!response.ok)
    throw new Error(`Upstream returned ${response.status}: ${url}`);
  return response.json() as Promise<unknown>;
}

export function pkgUrl(
  route: string,
  path: string,
  params: Record<string, string> = {}
): URL {
  const url = new URL(
    `https://pkg.go.dev/v1/${route}/${path.split('/').map(encodeURIComponent).join('/')}`
  );
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  return url;
}
