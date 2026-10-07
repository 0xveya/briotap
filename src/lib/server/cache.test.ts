import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as v from 'valibot';
import { cached } from './cache';

const original = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'briotap-cache-'));
process.chdir(directory);
afterAll(async () => { process.chdir(original); await rm(directory, { recursive: true, force: true }); });

test('failed upstream loads are briefly suppressed', async () => {
  let calls = 0;
  const load = async (): Promise<string> => { calls++; throw new Error('missing'); };
  await expect(cached('missing', v.string(), load)).rejects.toThrow('missing');
  await expect(cached('missing', v.string(), load)).rejects.toThrow('temporarily unavailable');
  expect(calls).toBe(1);
});

test('distinct upstream loads are bounded while identical requests share work', async () => {
  let finish: ((value: string) => void) | undefined;
  const upstream = new Promise<string>((resolve) => { finish = resolve; });
  let started = 0;
  const load = () => { started++; return upstream; };
  const pending = Array.from({ length: 32 }, (_, index) => cached(`pending-${index}`, v.string(), load));
  while (started < 32) await new Promise((resolve) => setTimeout(resolve, 1));
  const shared = cached('pending-0', v.string(), load);
  await expect(cached('overflow', v.string(), load)).rejects.toThrow('Too many upstream requests');
  finish!('done');
  expect(await shared).toBe('done');
  expect(await Promise.all(pending)).toHaveLength(32);
  expect(started).toBe(32);
});
