import { afterEach, expect, test } from 'bun:test';
import { fetchEntry } from './enrichment';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('a rejected response body is retried rather than recorded as a permanent error', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return { ok: true, json: async () => { throw new Error('connection reset'); } } as unknown as Response;
    if (calls === 2) return Response.json({ path: 'example.com/m', version: 'v1.0.0' });
    return Response.json({ packages: { items: [] } });
  }) as typeof fetch;
  const entry = await fetchEntry('example.com/m');
  expect('error' in entry).toBe(false);
  expect(calls).toBe(3);
});

test('shutdown interrupts a pending enrichment request without recording a failed module', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(fetchEntry('example.com/m', controller.signal)).rejects.toThrow();
});
