import { createReadStream } from 'node:fs';
import { open, readFile, rename, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

type PackageInfo = { path: string; name: string; synopsis: string };
type ModuleInfo = {
  path: string;
  version: string;
  repoUrl: string | null;
  commitTime: string | null;
};
type RecordEntry =
  | { path: string; module: ModuleInfo; packages: PackageInfo[] }
  | { path: string; error: string };

const directory = process.argv[2];
if (!directory) throw new Error('Usage: collect-enrichment <data directory>');
const input = `${directory}/module-paths.txt`;
const output = `${directory}/module-enrichment.jsonl`;
const cursorFile = `${directory}/enrichment-cursor.json`;
let lastRequestAt = 0;

class TransientRequestError extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an object from pkg.go.dev');
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Missing ${field} from pkg.go.dev`);
  return value;
}

function apiUrl(route: string, path: string, params: Record<string, string> = {}): URL {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = new URL(`https://pkg.go.dev/v1/${route}/${encodedPath}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function request(url: URL): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const pause = Math.max(0, lastRequestAt + 500 - Date.now());
    if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    lastRequestAt = Date.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.json() as Promise<unknown>;
      const message = `pkg.go.dev returned ${response.status} for ${url.pathname}`;
      if (response.status !== 429 && response.status < 500) throw new Error(message);
      lastError = new Error(message);
      const retryAfter = Number(response.headers.get('retry-after'));
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve,
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt));
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('pkg.go.dev returned 4') &&
        !error.message.startsWith('pkg.go.dev returned 429')) throw error;
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw new TransientRequestError(`Could not fetch ${url.pathname}`, { cause: lastError });
}

async function fetchEntry(path: string): Promise<RecordEntry> {
  try {
    const item = record(await request(apiUrl('module', path)));
    const module: ModuleInfo = {
      path: requiredString(item.path, 'path'),
      version: requiredString(item.version, 'version'),
      repoUrl: item.repoUrl == null ? null : requiredString(item.repoUrl, 'repoUrl'),
      commitTime: item.commitTime == null ? null : requiredString(item.commitTime, 'commitTime')
    };
    if (module.path !== path) throw new Error(`Unexpected module path ${module.path}`);
    const packages: PackageInfo[] = [];
    const tokens = new Set<string>();
    let token = '';
    do {
      const response = record(await request(apiUrl('packages', path, {
        version: module.version, limit: '100', ...(token ? { token } : {})
      })));
      const page = record(response.packages);
      if (!Array.isArray(page.items)) throw new Error(`Missing package list for ${path}`);
      for (const value of page.items) {
        const pkg = record(value);
        packages.push({
          path: requiredString(pkg.path, 'package path'),
          name: requiredString(pkg.name, 'package name'),
          synopsis: typeof pkg.synopsis === 'string' ? pkg.synopsis : ''
        });
      }
      token = page.nextPageToken === undefined ? '' : requiredString(page.nextPageToken, 'nextPageToken');
      if (token && tokens.has(token)) throw new Error(`Repeated pagination token for ${path}`);
      tokens.add(token);
    } while (token);
    return { path, module, packages };
  } catch (error) {
    if (error instanceof TransientRequestError) throw error;
    return { path, error: error instanceof Error ? error.message : String(error) };
  }
}

async function readCursor(): Promise<number> {
  try {
    const value: unknown = JSON.parse(await readFile(cursorFile, 'utf8'));
    if (typeof value !== 'object' || value === null || !('offset' in value) ||
      !Number.isSafeInteger(value.offset) || (value.offset as number) < 0) {
      throw new Error('Invalid enrichment cursor');
    }
    return value.offset as number;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 0;
    throw error;
  }
}

async function saveCursor(offset: number): Promise<void> {
  const temporary = `${cursorFile}.tmp`;
  await writeFile(temporary, JSON.stringify({ offset }));
  await rename(temporary, cursorFile);
}

let offset = await readCursor();
const result = await open(output, 'a+');
let processed = 0;
try {
  let size = (await result.stat()).size;
  if (size) {
    const buffer = Buffer.alloc(4096);
    let found = false;
    while (size > 0 && !found) {
      const start = Math.max(0, size - buffer.length);
      const { bytesRead } = await result.read(buffer, 0, size - start, start);
      const newline = buffer.subarray(0, bytesRead).lastIndexOf(10);
      if (newline !== -1) {
        await result.truncate(start + newline + 1);
        found = true;
      } else {
        size = start;
      }
    }
    if (!found) await result.truncate(0);
  }
  const lines = createInterface({ input: createReadStream(input, { start: offset }), crlfDelay: Infinity });
  for await (const path of lines) {
    const bytes = Buffer.byteLength(path) + 1;
    if (!path) { offset += bytes; await saveCursor(offset); continue; }
    const entry = await fetchEntry(path);
    await result.writeFile(`${JSON.stringify(entry)}\n`);
    await result.sync();
    offset += bytes;
    await saveCursor(offset);
    processed++;
    if ('error' in entry) console.error(`${path}: ${entry.error}`);
    if (processed % 100 === 0) console.log(`${processed} modules processed; input byte ${offset}`);
  }
} finally {
  await result.close();
}
console.log(`${processed} modules processed; input byte ${offset}`);
