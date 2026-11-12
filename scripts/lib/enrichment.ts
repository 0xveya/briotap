import { setTimeout } from 'node:timers/promises';
import { retryDelay } from '../../src/lib/server/retry-delay';
import { responseText } from '../../src/lib/server/response';
import { upstreamFetch } from '../../src/lib/server/upstream';

type PackageInfo = { path: string; name: string; synopsis: string };
type ModuleInfo = {
  path: string;
  version: string;
  repoUrl: string | null;
  commitTime: string | null;
};
export type RecordEntry =
  | { path: string; module: ModuleInfo; packages: PackageInfo[] }
  | { path: string; error: string };

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

async function request(url: URL, signal?: AbortSignal): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const pause = Math.max(0, lastRequestAt + (process.env.REQUEST_BUDGET_PATH ? 0 : 500) - Date.now());
    if (pause) await setTimeout(pause, undefined, { signal });
    lastRequestAt = Date.now();
    try {
      const timeout = AbortSignal.timeout(30_000);
      const response = await upstreamFetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout }, 'background');
      if (response.ok) return JSON.parse(await responseText(response, 8 * 1024 * 1024)) as unknown;
      await response.body?.cancel();
      const message = `pkg.go.dev returned ${response.status} for ${url.pathname}`;
      if (response.status !== 429 && response.status < 500) throw new Error(message);
      lastError = new Error(message);
      const delay = retryDelay(response.headers.get('retry-after'), 1000 * 2 ** attempt);
      if (attempt < 3) {
        await setTimeout(delay, undefined, { signal });
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof Error && error.message.startsWith('pkg.go.dev returned 4') &&
        !error.message.startsWith('pkg.go.dev returned 429')) throw error;
      lastError = error;
      if (attempt < 3) await setTimeout(1000 * 2 ** attempt, undefined, { signal });
    }
  }
  throw new TransientRequestError(`Could not fetch ${url.pathname}`, { cause: lastError });
}

export async function fetchEntry(path: string, signal?: AbortSignal): Promise<RecordEntry> {
  // A module with endlessly changing page tokens must not monopolize the worker.
  const deadline = AbortSignal.timeout(5 * 60_000);
  signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    signal.throwIfAborted();
    const item = record(await request(apiUrl('module', path), signal));
    const module: ModuleInfo = {
      path: requiredString(item.path, 'path'),
      version: requiredString(item.version, 'version'),
      repoUrl: item.repoUrl == null ? null : requiredString(item.repoUrl, 'repoUrl'),
      commitTime: item.commitTime == null ? null : requiredString(item.commitTime, 'commitTime')
    };
    if (module.commitTime && Number.isNaN(Date.parse(module.commitTime))) throw new Error(`Invalid commitTime for ${path}`);
    if (module.path !== path) throw new Error(`Unexpected module path ${module.path}`);
    const packages: PackageInfo[] = [];
    const tokens = new Set<string>();
    let token = '';
    do {
      const response = record(await request(apiUrl('packages', path, {
        version: module.version, limit: '100', ...(token ? { token } : {})
      }), signal));
      const page = record(response.packages);
      if (!Array.isArray(page.items)) throw new Error(`Missing package list for ${path}`);
      for (const value of page.items) {
        if (packages.length >= 100_000) throw new Error(`Package limit exceeded for ${path}`);
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
    signal?.throwIfAborted();
    if (error instanceof TransientRequestError) throw error;
    return { path, error: error instanceof Error ? error.message : String(error) };
  }
}

