import { expect, test } from 'bun:test';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lastIndexLine, lines, recoverOutput } from './jsonl';

test('recovery removes interrupted output and resumes at UTF-8 byte boundaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'briotap-jsonl-test-'));
  const path = join(directory, 'output.jsonl');
  const complete = 'first\ncafé\n';
  try {
    await writeFile(path, complete + '{"incomplete":');
    const file = await open(path, 'a+');
    try { expect(await recoverOutput(file)).toBe(Buffer.byteLength(complete)); }
    finally { await file.close(); }
    const recovered = [];
    for await (const row of lines(path, 6, Buffer.byteLength(complete))) recovered.push(row);
    expect(recovered).toEqual([{ line: 'café', offset: Buffer.byteLength(complete) }]);
    expect(await lastIndexLine(path)).toBe('café');
  } finally { await rm(directory, { recursive: true }); }
});
