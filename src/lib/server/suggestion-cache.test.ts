import { expect, test } from 'bun:test';
import { suggestionCache } from './suggestion-cache';

test('typing suggestions normalize, coalesce, and expire cached results', async () => {
  let calls = 0;
  let now = 0;
  const suggest = suggestionCache(async (q) => { calls++; return [q]; }, () => new Error('busy'), () => now);
  expect(await suggest('  ')).toEqual([]);
  const first = suggest(' Go ');
  expect(suggest('go')).toBe(first);
  expect(await first).toEqual(['go']);
  expect(await suggest('GO')).toEqual(['go']);
  expect(calls).toBe(1);
  now = 30_001;
  await suggest('go');
  expect(calls).toBe(2);
});

test('autocomplete caps concurrent distinct queries and retries failures', async () => {
  const finish: ((value: string[]) => void)[] = [];
  const suggest = suggestionCache(() => new Promise<string[]>((resolve) => finish.push(resolve)), () => new Error('busy'));
  const running = ['a', 'b', 'c', 'd'].map(suggest);
  await expect(suggest('e')).rejects.toThrow('busy');
  await Promise.resolve();
  finish.forEach((resolve) => resolve([]));
  await Promise.all(running);
  const retry = suggest('e');
  await Promise.resolve();
  finish.at(-1)!(['e']);
  expect(await retry).toEqual(['e']);
});

test('failed prefixes are not cached and cache growth evicts old entries', async () => {
  let calls = 0;
  const suggest = suggestionCache(async (q) => {
    calls++;
    if (q === 'failure') throw new Error('offline');
    return [q];
  }, () => new Error('busy'));
  await expect(suggest('failure')).rejects.toThrow('offline');
  await expect(suggest('failure')).rejects.toThrow('offline');
  for (let i = 0; i < 201; i++) await suggest(String(i));
  await suggest('0');
  expect(calls).toBe(204);
});
