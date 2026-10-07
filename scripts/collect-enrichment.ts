import { createReadStream } from 'node:fs';
import { open, readFile, rename, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { fetchEntry } from './lib/enrichment';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: collect-enrichment <data directory>');
const input = `${directory}/module-paths.txt`;
const output = `${directory}/module-enrichment.jsonl`;
const cursorFile = `${directory}/enrichment-cursor.json`;

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
