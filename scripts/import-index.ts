import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '../src/lib/server/prisma';

interface IndexEntry {
  Path: string;
  Version: string;
  Timestamp: string;
}

const source = 'go-module-index';
const input = resolve('data/module-index.jsonl');
const limit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.slice(8) ?? Infinity);
const batchSize = 1000;
let batch: { modulePath: string; version: string; observedAt: string }[] = [];
let offset = 0;
let imported = 0;

function parseEntry(line: Buffer): IndexEntry {
  const value: unknown = JSON.parse(line.toString('utf8'));
  if (typeof value !== 'object' || value === null ||
      !('Path' in value) || typeof value.Path !== 'string' ||
      !('Version' in value) || typeof value.Version !== 'string' ||
      !('Timestamp' in value) || typeof value.Timestamp !== 'string') {
    throw new Error(`Invalid index entry at byte ${offset}`);
  }
  return value as IndexEntry;
}

async function flush(): Promise<void> {
  if (!batch.length) return;
  const data = batch;
  const nextOffset = BigInt(offset);
  await prisma.$transaction(async (tx) => {
    await tx.moduleVersion.createMany({ data, skipDuplicates: true });
    await tx.importCursor.upsert({
      where: { source },
      create: { source, offset: nextOffset },
      update: { offset: nextOffset }
    });
  }, { timeout: 30_000 });
  imported += data.length;
  batch = [];
  if (imported % 20_000 === 0) console.log(`${imported} entries processed`);
}

try {
  const cursor = await prisma.importCursor.findUnique({ where: { source } });
  offset = Number(cursor?.offset ?? 0n);
  const size = (await stat(input)).size;
  if (size < offset) throw new Error('The JSONL file is shorter than the saved import cursor');
  if (size === offset) {
    console.log('No new complete entries to import');
  } else {
    let pending = Buffer.alloc(0);
    const stream = createReadStream(input, { start: offset, end: size - 1 });
    let stopped = false;
    for await (const chunk of stream) {
      pending = Buffer.concat([pending, chunk as Buffer]);
      let newline: number;
      while ((newline = pending.indexOf(10)) !== -1) {
        const line = pending.subarray(0, newline);
        pending = pending.subarray(newline + 1);
        const entry = parseEntry(line);
        offset += newline + 1;
        batch.push({ modulePath: entry.Path, version: entry.Version, observedAt: entry.Timestamp });
        if (batch.length === batchSize) await flush();
        if (imported + batch.length >= limit) { stopped = true; break; }
      }
      if (stopped) break;
    }
    await flush();
    console.log(`${imported} entries processed; cursor at byte ${offset}`);
  }
} finally {
  await prisma.$disconnect();
}
