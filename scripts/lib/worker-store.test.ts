import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkerStore } from './worker-store';
import type { RecordEntry } from './enrichment';

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true }); });

function database(): string {
  const directory = mkdtempSync(join(tmpdir(), 'briotap-worker-test-'));
  directories.push(directory);
  return join(directory, 'worker.sqlite');
}

const success: RecordEntry = { path: 'example.com/module', module: {
  path: 'example.com/module', version: 'v1.0.0', repoUrl: null, commitTime: null
}, packages: [] };

test('committed work survives restart and a newer index version requeues it once', () => {
  const path = database();
  let store = new WorkerStore(path);
  store.transaction(() => {
    store.enqueue(success.path, '2026-10-20T12:00:00Z');
    store.result(success, 123);
  });
  store.close();
  store = new WorkerStore(path);
  try {
    expect(store.get('output-offset')).toBe('123');
    expect(store.next()).toBeNull();
    store.enqueue(success.path);
    store.enqueue(success.path, '2026-10-20T12:00:00Z');
    expect(store.next()).toBeNull();
    store.enqueue(success.path, '2026-10-21T12:00:00Z');
    expect(store.next()?.path).toBe(success.path);
  } finally { store.close(); }
});

test('new discoveries run before backfill and delayed failures retry without looping', () => {
  const store = new WorkerStore(database());
  try {
    store.enqueue('example.com/backfill');
    store.enqueue('example.com/new', '2026-10-21T12:00:00Z', 0);
    expect(store.next(0)?.path).toBe('example.com/new');
    store.result({ path: 'example.com/new', error: 'Could not fetch /v1/module/example.com/new' }, 10, 0);
    expect(store.next(0)?.path).toBe('example.com/backfill');
    store.result({ ...success, path: 'example.com/backfill' }, 20, 0);
    expect(store.next(59_999)).toBeNull();
    expect(store.next(60_000)?.attempts).toBe(1);
  } finally { store.close(); }
});

test('404s back off for a week, while a new release makes them immediately eligible', () => {
  const store = new WorkerStore(database());
  try {
    store.result({ path: success.path, error: 'pkg.go.dev returned 404 for /v1/module/example.com/module' }, 100, 0);
    expect(store.next(6 * 86_400_000)).toBeNull();
    expect(store.next(7 * 86_400_000)?.path).toBe(success.path);
    store.enqueue(success.path, '2026-10-21T12:00:00Z', 0);
    expect(store.next(0)?.attempts).toBe(0);
  } finally { store.close(); }
});

test('a failed checkpoint transaction preserves the pending job for replay', () => {
  const store = new WorkerStore(database());
  try {
    store.enqueue(success.path);
    expect(() => store.transaction(() => {
      store.result(success, 123);
      throw new Error('interrupted commit');
    })).toThrow('interrupted commit');
    expect(store.get('output-offset')).toBeUndefined();
    expect(store.next()?.path).toBe(success.path);
    store.transaction(() => store.result(success, 123));
    expect(store.next()).toBeNull();
  } finally { store.close(); }
});

test('a timestamp with additional fractional digits can enqueue a newer release', () => {
  const store = new WorkerStore(database());
  try {
    store.enqueue(success.path, '2026-10-21T12:00:00.123Z');
    store.result(success, 100);
    store.enqueue(success.path, '2026-10-21T12:00:00.123456Z');
    expect(store.next()?.path).toBe(success.path);
  } finally { store.close(); }
});
