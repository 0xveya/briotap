import { open, readFile, rename } from 'node:fs/promises';

const [directory, snapshotPath, manualPath] = process.argv.slice(2);
if (!directory || !snapshotPath || !manualPath) {
  throw new Error('Usage: reorder-enrichment <data directory> <popular-purls.json> <priority-modules.txt>');
}

const pathsFile = `${directory}/module-paths.txt`;
const cursorFile = `${directory}/enrichment-cursor.json`;
const paths = await readFile(pathsFile);

let offset = 0;
try {
  const value: unknown = JSON.parse(await readFile(cursorFile, 'utf8'));
  if (typeof value !== 'object' || value === null || !('offset' in value) ||
    !Number.isSafeInteger(value.offset) || (value.offset as number) < 0) {
    throw new Error('Invalid enrichment cursor');
  }
  offset = value.offset as number;
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
}
if (offset > paths.length || (offset > 0 && paths[offset - 1] !== 10)) {
  throw new Error('Enrichment cursor is not at a complete path');
}

const value: unknown = JSON.parse(await readFile(snapshotPath, 'utf8'));
if (!Array.isArray(value)) throw new Error('Expected an array of popular packages');
const popular: { path: string; dependents: number }[] = [];
for (const item of value as unknown[]) {
  if (typeof item !== 'object' || item === null || !('purl' in item) ||
    !('dependents_count' in item) || typeof item.purl !== 'string') continue;
  if (typeof item.dependents_count !== 'string' && typeof item.dependents_count !== 'number') continue;
  if (!item.purl.startsWith('pkg:golang/')) continue;
  const at = item.purl.lastIndexOf('@');
  if (at < 'pkg:golang/'.length) continue;
  const dependents = Number(item.dependents_count);
  if (!Number.isSafeInteger(dependents) || dependents < 0) continue;
  try {
    popular.push({ path: decodeURIComponent(item.purl.slice('pkg:golang/'.length, at)), dependents });
  } catch {
    continue;
  }
}
popular.sort((a, b) => b.dependents - a.dependents || a.path.localeCompare(b.path));

const manual = (await readFile(manualPath, 'utf8')).split('\n').map((path) => path.trim()).filter(Boolean);
const remaining = paths.subarray(offset).toString('utf8').split('\n').filter(Boolean);
const available = new Set(remaining);
const selected = new Set<string>();
const priority: string[] = [];
for (const path of [...manual, ...popular.map((item) => item.path)]) {
  if (available.has(path) && !selected.has(path)) {
    priority.push(path);
    selected.add(path);
  }
}

const reordered = Buffer.from(`${[...priority, ...remaining.filter((path) => !selected.has(path))].join('\n')}\n`);
const temporary = `${pathsFile}.next`;
const output = await open(temporary, 'w');
try {
  await output.writeFile(paths.subarray(0, offset));
  await output.writeFile(reordered);
  await output.sync();
} finally {
  await output.close();
}
await rename(temporary, pathsFile);
console.log(`Promoted ${priority.length} modules; preserved ${offset} processed bytes and ${remaining.length} unprocessed paths`);
