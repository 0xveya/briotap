import { mkdir, open, readFile, stat } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import * as v from 'valibot';
import { fetchEntry, type RecordEntry } from './lib/enrichment';
import { indexCursorSchema, indexEntrySchema, indexPage } from './lib/index-feed';
import { lastIndexLine, lines, recoverOutput } from './lib/jsonl';
import { WorkerStore } from './lib/worker-store';

const entrySchema = v.union([
  v.object({ path: v.string(), error: v.string() }),
  v.object({
    path: v.string(),
    module: v.object({ path: v.string(), version: v.string(), repoUrl: v.nullable(v.string()), commitTime: v.nullable(v.string()) }),
    packages: v.array(v.object({ path: v.string(), name: v.string(), synopsis: v.string() }))
  })
]);

function offset(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Invalid worker byte checkpoint');
  return parsed;
}

async function size(path: string): Promise<number> {
  try { return (await stat(path)).size; }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 0;
    throw error;
  }
}

async function main(): Promise<void> {
  const directory = process.argv[2];
  const args = process.argv.slice(3);
  if (!directory || args.some((arg) => !['--once', '--status'].includes(arg))) {
    throw new Error('Usage: worker <data directory> [--once | --status]; run through mise or the flock systemd service');
  }
  if (args.includes('--status')) {
    const store = new WorkerStore(`${directory}/enrichment-worker.sqlite`, true);
    try {
      console.log(JSON.stringify({ ...store.status(),
        backfillBytes: await size(`${directory}/module-paths.txt`),
        outputBytes: await size(`${directory}/module-enrichment.jsonl`)
      }, null, 2));
    } finally { store.close(); }
    return;
  }

  await mkdir(directory, { recursive: true });
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  const { signal } = controller;
  const store = new WorkerStore(`${directory}/enrichment-worker.sqlite`);
  try {
    const outputPath = `${directory}/module-enrichment.jsonl`;
    const output = await open(outputPath, 'a+');
    try {
      let outputSize = await recoverOutput(output);
      const savedOutput = offset(store.get('output-offset'));
      if (savedOutput > outputSize) throw new Error('Enrichment output is shorter than the worker checkpoint; restore the original file');
      let batch: { entry: RecordEntry; offset: number }[] = [];
      const flush = () => {
        store.transaction(() => { for (const row of batch) store.result(row.entry, row.offset); });
        batch = [];
      };
      console.log(`Recovering enrichment history from byte ${savedOutput} of ${outputSize}`);
      for await (const row of lines(outputPath, savedOutput, outputSize)) {
        signal.throwIfAborted();
        batch.push({ entry: v.parse(entrySchema, JSON.parse(row.line) as unknown), offset: row.offset });
        if (batch.length === 1000) { flush(); console.log(`Recovered output through byte ${row.offset}`); }
      }
      flush();

      if (store.get('backfill-offset') === undefined) {
        let legacy = 0;
        try {
          const value: unknown = JSON.parse(await readFile(`${directory}/enrichment-cursor.json`, 'utf8'));
          legacy = v.parse(v.object({ offset: v.pipe(v.number(), v.integer(), v.minValue(0)) }), value).offset;
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
        store.set('backfill-offset', String(legacy));
      }
      if (store.get('index-cursor') === undefined) {
        const last = await lastIndexLine(`${directory}/module-index.jsonl`);
        const entry = last ? v.parse(indexEntrySchema, JSON.parse(last) as unknown) : null;
        store.set('index-cursor', JSON.stringify({ timestamp: entry?.Timestamp ?? '', seen: [] }));
      }

      const updates = await open(`${directory}/module-updates.jsonl`, 'a+');
      try {
        await recoverOutput(updates);
        let nextPoll = 0;
        let processed = 0;
        do {
          signal.throwIfAborted();
          let worked = false;
          if (Date.now() >= nextPoll) {
            try {
              for (let page = 0; page < 25 && !signal.aborted; page++) {
                const cursor = v.parse(indexCursorSchema, JSON.parse(store.get('index-cursor')!) as unknown);
                const result = await indexPage(cursor, signal);
                if (result.entries.length) {
                  await updates.writeFile(result.entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
                  await updates.sync();
                  store.transaction(() => {
                    for (const entry of result.entries) store.enqueue(entry.Path, entry.Timestamp);
                    store.set('index-cursor', JSON.stringify(result.cursor));
                  });
                  console.log(`Discovered ${result.entries.length} versions; index cursor ${result.cursor.timestamp}`);
                  worked = true;
                }
                nextPoll = result.caughtUp ? Date.now() + 60_000 : 0;
                if (result.caughtUp) break;
              }
            } catch (error) {
              signal.throwIfAborted();
              console.error('Index discovery failed; retrying in 60 seconds', error);
              nextPoll = Date.now() + 60_000;
              if (args.includes('--once')) process.exitCode = 1;
            }
          }

          const start = offset(store.get('backfill-offset'));
          const end = await size(`${directory}/module-paths.txt`);
          if (start > end) throw new Error('Backfill input is shorter than the worker checkpoint; restore the original file');
          const paths: { line: string; offset: number }[] = [];
          for await (const row of lines(`${directory}/module-paths.txt`, start, end)) {
            paths.push(row);
            if (paths.length === 1000) break;
          }
          if (paths.length) {
            store.transaction(() => {
              for (const row of paths) if (row.line) store.enqueue(row.line);
              store.set('backfill-offset', String(paths.at(-1)!.offset));
            });
            worked = true;
          }
          for (let i = 0; i < 20 && !signal.aborted; i++) {
            const job = store.next();
            if (!job) break;
            let entry: RecordEntry;
            try { entry = await fetchEntry(job.path, signal); }
            catch (error) {
              signal.throwIfAborted();
              entry = { path: job.path, error: error instanceof Error ? error.message : String(error) };
            }
            const line = `${JSON.stringify(entry)}\n`;
            await output.writeFile(line);
            await output.sync();
            outputSize += Buffer.byteLength(line);
            store.transaction(() => store.result(entry, outputSize));
            console.log('error' in entry ? `${entry.path}: retry scheduled: ${entry.error}` : `${entry.path}: ${entry.packages.length} packages`);
            processed++;
            worked = true;
          }
          store.set('heartbeat', new Date().toISOString());
          if (args.includes('--once')) break;
          if (!worked) await setTimeout(5000, undefined, { signal });
        } while (!signal.aborted);
        console.log(`${processed} modules processed; worker stopped`);
      } finally { await updates.close(); }
    } finally { await output.close(); }
  } catch (error) {
    if (!signal.aborted) throw error;
    console.log('Worker stopped; checkpoints saved');
  } finally {
    store.close();
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
}

main().catch((error: unknown) => { console.error('Enrichment worker failed', error); process.exitCode = 1; });
