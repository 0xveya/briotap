import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import * as v from 'valibot';
import { upstreamFetch, withRequestPriority } from './upstream';
import type { RequestPriority } from './request-budget';
import { responseText } from './response';

const directory = 'data/ui-cache';
const pending = new Map<string, Promise<unknown>>();
const failures = new Map<string, number>();
const maxEntryBytes = 8 * 1024 * 1024;
const maxCacheBytes = 512 * 1024 * 1024;
const maxEntries = 10_000;
const entries = new Map<string, number>();
let bytes = 0;
let initialized: Promise<void> | undefined;
let writes = Promise.resolve();

async function readEntry(file: string): Promise<unknown> {
  if ((await stat(file)).size > maxEntryBytes) throw new Error('Cache entry is too large');
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}

async function saveEntry(file: string, value: unknown): Promise<void> {
  const data = JSON.stringify({ savedAt: Date.now(), value });
  const size = Buffer.byteLength(data);
  if (size > maxEntryBytes) return;
  initialized ??= (async () => {
    await mkdir(directory, { recursive: true });
    const files = [];
    for (const name of await readdir(directory)) {
      if (/^[a-f0-9]{64}\.json\.tmp$/.test(name)) {
        await unlink(`${directory}/${name}`);
        continue;
      }
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const path = `${directory}/${name}`;
      const info = await stat(path);
      files.push({ path, size: info.size, at: info.mtimeMs });
    }
    files.sort((a, b) => a.at - b.at);
    for (const item of files) { entries.set(item.path, item.size); bytes += item.size; }
  })();
  await initialized;
  const task = writes.then(async () => {
    bytes -= entries.get(file) ?? 0;
    entries.delete(file);
    while (entries.size >= maxEntries || bytes + size > maxCacheBytes) {
      const oldest = entries.entries().next().value;
      if (!oldest) break;
      await unlink(oldest[0]);
      entries.delete(oldest[0]);
      bytes -= oldest[1];
    }
    await writeFile(`${file}.tmp`, data);
    await rename(`${file}.tmp`, file);
    entries.set(file, size);
    bytes += size;
  });
  writes = task.catch(() => {});
  return task;
}

const envelope = v.object({ savedAt: v.number(), value: v.unknown() });

/** Read an existing snapshot without waiting for an upstream request. */
export async function cachedSnapshot<T>(key: string, schema: v.GenericSchema<unknown, T>): Promise<T | null> {
  try {
    const file = `${directory}/${createHash('sha256').update(key).digest('hex')}.json`;
    const entry = v.parse(envelope, await readEntry(file));
    return v.parse(schema, entry.value);
  } catch {
    return null;
  }
}

/** Persist upstream responses and serve stale data while refreshing it. */
export async function cached<T>(
  key: string,
  schema: v.GenericSchema<unknown, T>,
  load: () => Promise<T>
): Promise<T> {
  const file = `${directory}/${createHash('sha256').update(key).digest('hex')}.json`;
  const refresh = (priority: RequestPriority): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing.then((value) => v.parse(schema, value));
    if ((failures.get(key) ?? 0) > Date.now()) return Promise.reject(new Error('Upstream is temporarily unavailable'));
    if (pending.size >= 32) return Promise.reject(new Error('Too many upstream requests'));
    const task = (async () => {
      const value = v.parse(schema, await withRequestPriority(priority, load));
      await saveEntry(file, value);
      return value;
    })();
    pending.set(key, task);
    void task.catch(() => {
      if (failures.size >= 1000) failures.delete(failures.keys().next().value!);
      failures.set(key, Date.now() + 30_000);
    }).finally(() => pending.delete(key));
    return task;
  };
  try {
    const entry = v.parse(
      envelope,
      await readEntry(file)
    );
    const value = v.parse(schema, entry.value);
    if (Date.now() - entry.savedAt > 86_400_000) {
      void refresh('background').catch((error: unknown) =>
        console.error(`Could not refresh ${key}`, error)
      );
    }
    return value;
  } catch {
    return refresh('foreground');
  }
}

export async function fetchJson(url: string | URL): Promise<unknown> {
  const response = await upstreamFetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: { 'User-Agent': 'briotap-prototype' }
  });
  if (!response.ok)
    throw new Error(`Upstream returned ${response.status}: ${url}`);
  return JSON.parse(await responseText(response)) as unknown;
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
