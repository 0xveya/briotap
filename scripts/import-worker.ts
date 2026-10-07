import { spawn, type ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { prisma } from '../src/lib/server/prisma';

const inputs = [
  { path: 'data/module-updates.jsonl', source: 'nas-module-updates', script: 'scripts/import-index.ts', limit: 5000 },
  { path: 'data/module-enrichment.jsonl', source: 'nas-enrichment', script: 'scripts/import-enrichment.ts', limit: 1000 },
  { path: 'data/module-index.jsonl', source: 'go-module-index', script: 'scripts/import-index.ts', limit: 20_000 }
];

/** Import bounded batches so historical files cannot starve fresh metadata. */
async function main(): Promise<void> {
  if (process.argv.slice(2).some((arg) => arg !== '--once')) throw new Error('Usage: import-worker [--once]');
  const controller = new AbortController();
  let child: ChildProcess | undefined;
  const stop = () => { controller.abort(); child?.kill('SIGTERM'); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    do {
      let worked = false;
      for (const input of inputs) {
        if (controller.signal.aborted) break;
        let size: number;
        try { size = (await stat(input.path)).size; }
        catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
          throw error;
        }
        const before = await prisma.importCursor.findUnique({ where: { source: input.source } });
        const offset = before?.offset ?? 0n;
        if (BigInt(size) < offset) throw new Error(`${input.path} is shorter than its saved cursor; restore the original file`);
        if (BigInt(size) === offset) continue;
        const args = [input.script, `--limit=${input.limit}`];
        if (input.script.endsWith('import-index.ts')) args.push(`--input=${input.path}`, `--source=${input.source}`);
        const command = spawn(process.execPath, args, { stdio: 'inherit' });
        child = command;
        await new Promise<void>((resolve, reject) => {
          command.once('error', reject);
          command.once('close', (code, signal) => {
            if (code === 0 || controller.signal.aborted) resolve();
            else reject(new Error(`${process.execPath} ${args.join(' ')} failed (${signal ?? code})`));
          });
        });
        child = undefined;
        const after = await prisma.importCursor.findUnique({ where: { source: input.source } });
        worked ||= (after?.offset ?? 0n) > offset;
      }
      if (process.argv.includes('--once')) break;
      if (!worked) await setTimeout(5000, undefined, { signal: controller.signal });
    } while (!controller.signal.aborted);
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => { console.error('Import worker failed', error); process.exitCode = 1; });
