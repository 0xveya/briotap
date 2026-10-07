import { createReadStream } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';

/** Yield complete lines with byte checkpoints, leaving a partial final line unread. */
export async function* lines(path: string, start: number, end: number) {
  if (end <= start) return;
  const stream = createReadStream(path, { start, end: end - 1 });
  let pending = Buffer.alloc(0);
  let offset = start;
  for await (const chunk of stream) {
    pending = Buffer.concat([pending, chunk as Buffer]);
    let newline: number;
    while ((newline = pending.indexOf(10)) !== -1) {
      const line = pending.subarray(0, newline).toString('utf8');
      pending = pending.subarray(newline + 1);
      offset += newline + 1;
      yield { line, offset };
    }
  }
}

/** Drop an interrupted append before resuming the single-writer output. */
export async function recoverOutput(file: FileHandle): Promise<number> {
  let size = (await file.stat()).size;
  const buffer = Buffer.alloc(4096);
  while (size > 0) {
    const start = Math.max(0, size - buffer.length);
    const { bytesRead } = await file.read(buffer, 0, size - start, start);
    const newline = buffer.subarray(0, bytesRead).lastIndexOf(10);
    if (newline !== -1) {
      size = start + newline + 1;
      await file.truncate(size);
      await file.sync();
      return size;
    }
    size = start;
  }
  await file.truncate(0);
  await file.sync();
  return 0;
}

/** Read the end of an existing index snapshot without loading the whole file. */
export async function lastIndexLine(path: string): Promise<string | undefined> {
  let file: FileHandle;
  try { file = await open(path, 'r'); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    const size = (await file.stat()).size;
    const length = Math.min(size, 1024 * 1024);
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, size - length);
    const end = buffer.lastIndexOf(10);
    if (end < 0) return undefined;
    const start = buffer.lastIndexOf(10, end - 1);
    if (start < 0 && size > length) throw new Error('No complete index record in the last MiB');
    return buffer.subarray(start + 1, end).toString('utf8');
  } finally { await file.close(); }
}
