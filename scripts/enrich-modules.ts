import { prisma } from '../src/lib/server/prisma';

type ModuleInfo = {
  path: string;
  version: string;
  repoUrl: string | null;
  commitTime: Date | null;
};

type PackageInfo = { path: string; name: string; synopsis: string };

const args = process.argv.slice(2);
const explicitPath = args.find((arg) => !arg.startsWith('--'));
const retryFailed = args.includes('--retry-failed');
const limit = Number(args.find((arg) => arg.startsWith('--limit='))?.slice(8) ?? 20);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
  throw new Error('--limit must be an integer between 1 and 1000');
}
if (explicitPath && retryFailed) throw new Error('Choose a module path or --retry-failed');

let lastRequestAt = 0;

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

function moduleName(path: string): string {
  const parts = path.split('/');
  const last = parts.at(-1) ?? path;
  return /^v[2-9]\d*$/.test(last) ? parts.at(-2) ?? last : last;
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
    if (pause) await Bun.sleep(pause);
    lastRequestAt = Date.now();
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      lastError = error;
      if (attempt < 3) await Bun.sleep(1000 * 2 ** attempt);
      continue;
    }
    if (response.ok) return response.json() as Promise<unknown>;
    const message = `pkg.go.dev returned ${response.status} for ${url.pathname}`;
    if (response.status !== 429 && response.status < 500) throw new Error(message);
    lastError = new Error(message);
    const retryAfter = Number(response.headers.get('retry-after'));
    if (attempt < 3) await Bun.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
  }
  throw new Error(`Could not fetch ${url.pathname}`, { cause: lastError });
}

async function fetchModule(path: string): Promise<ModuleInfo> {
  const item = record(await request(apiUrl('module', path)));
  const commitTime = item.commitTime == null ? null : new Date(requiredString(item.commitTime, 'commitTime'));
  if (commitTime && Number.isNaN(commitTime.valueOf())) throw new Error(`Invalid commitTime for ${path}`);
  return {
    path: requiredString(item.path, 'path'),
    version: requiredString(item.version, 'version'),
    repoUrl: item.repoUrl == null ? null : requiredString(item.repoUrl, 'repoUrl'),
    commitTime
  };
}

async function fetchPackages(path: string, version: string): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];
  const tokens = new Set<string>();
  let token = '';
  do {
    const response = record(await request(apiUrl('packages', path, {
      version, limit: '100', ...(token ? { token } : {})
    })));
    const page = record(response.packages);
    if (!Array.isArray(page.items)) throw new Error(`Missing package list for ${path}`);
    for (const value of page.items) {
      const item = record(value);
      packages.push({
        path: requiredString(item.path, 'package path'),
        name: requiredString(item.name, 'package name'),
        synopsis: typeof item.synopsis === 'string' ? item.synopsis : ''
      });
    }
    token = page.nextPageToken === undefined ? '' : requiredString(page.nextPageToken, 'nextPageToken');
    if (token && tokens.has(token)) throw new Error(`Repeated pagination token for ${path}`);
    tokens.add(token);
  } while (token);
  return packages;
}

async function enrich(path: string): Promise<number> {
  const module = await fetchModule(path);
  if (module.path !== path) throw new Error(`Unexpected module path ${module.path}`);
  const packages = await fetchPackages(path, module.version);
  await prisma.$transaction(async (tx) => {
    await tx.module.upsert({
      where: { path },
      create: { ...module, name: moduleName(path), enrichedAt: new Date() },
      update: { ...module, name: moduleName(path), enrichedAt: new Date(), lastError: null }
    });
    await tx.package.deleteMany({ where: { modulePath: path } });
    await tx.package.createMany({
      data: packages.map((item) => ({ ...item, modulePath: path, version: module.version })),
      skipDuplicates: true
    });
  }, { timeout: 30_000 });
  return packages.length;
}

async function candidates(): Promise<string[]> {
  if (explicitPath) return [explicitPath];
  if (retryFailed) {
    const failed = await prisma.module.findMany({
      where: { lastError: { not: null } }, orderBy: { path: 'asc' }, take: limit, select: { path: true }
    });
    return failed.map((item) => item.path);
  }
  const rows = await prisma.$queryRaw<{ module_path: string }[]>`
    SELECT DISTINCT mv.module_path FROM module_versions AS mv
    WHERE NOT EXISTS (SELECT 1 FROM modules AS m WHERE m.path = mv.module_path)
    ORDER BY mv.module_path LIMIT ${limit}
  `;
  return rows.map((item) => item.module_path);
}

try {
  const paths = await candidates();
  let failed = 0;
  for (const path of paths) {
    try {
      const count = await enrich(path);
      console.log(`${path}: ${count} packages`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.module.upsert({
        where: { path },
        create: { path, name: moduleName(path), lastError: message },
        update: { lastError: message }
      });
      console.error(`${path}: ${message}`);
      failed++;
    }
  }
  console.log(`${paths.length - failed} modules enriched, ${failed} failed`);
  if (failed) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
