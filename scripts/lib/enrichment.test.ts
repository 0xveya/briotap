import { afterEach, expect, test } from 'bun:test';
import { fetchEntry } from './enrichment';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('a rejected response body is retried rather than recorded as a permanent error', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return new Response(new ReadableStream({
      start(controller) { controller.error(new Error('connection reset')); }
    }));
    if (calls === 2) return Response.json({ path: 'example.com/m', version: 'v1.0.0' });
    return Response.json({ packages: { items: [] } });
  }) as unknown as typeof fetch;
  const entry = await fetchEntry('example.com/m');
  expect('error' in entry).toBe(false);
  expect(calls).toBe(3);
});

test('shutdown interrupts a pending enrichment request without recording a failed module', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(fetchEntry('example.com/m', controller.signal)).rejects.toThrow();
});

test('oversized package lists stop before growing the worker queue record without bound', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    if (++calls === 1) return Response.json({ path: 'example.com/m', version: 'v1.0.0' });
    return Response.json({ packages: { items: Array.from({ length: 100_001 }, () => ({
      path: 'example.com/m/p', name: 'p', synopsis: ''
    })) } });
  }) as unknown as typeof fetch;
  expect(await fetchEntry('example.com/m')).toEqual({
    path: 'example.com/m', error: 'Package limit exceeded for example.com/m'
  });
});
