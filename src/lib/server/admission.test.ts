import { expect, test } from 'bun:test';
import { Admission, admittedResponse } from './admission';

test('bounds concurrent work and releases a permit only once', () => {
  const admission = new Admission(1);
  const release = admission.acquire('a', 0);
  expect(release).not.toBeNull();
  expect(admission.acquire('b', 0)).toBeNull();
  release!();
  release!();
  expect(admission.acquire('b', 0)).not.toBeNull();
  expect(admission.acquire('c', 0)).toBeNull();
});

test('limits each client across completed requests and refills with time', () => {
  const admission = new Admission(10, 2, 1);
  admission.acquire('a', 0)!();
  admission.acquire('a', 0)!();
  expect(admission.acquire('a', 0)).toBeNull();
  expect(admission.acquire('b', 0)).not.toBeNull();
  expect(admission.acquire('a', 1000)).not.toBeNull();
});

test('new client identities cannot evict a live rate limit', () => {
  const admission = new Admission(10, 1, 1, 1);
  admission.acquire('a', 0)!();
  expect(admission.acquire('b', 0)).toBeNull();
  expect(admission.acquire('a', 0)).toBeNull();
  expect(admission.acquire('b', 1000)).not.toBeNull();
});

test('streamed responses retain their permit until fully consumed', async () => {
  const admission = new Admission(1);
  const response = admittedResponse(new Response('hello'), admission.acquire('a')!);
  expect(admission.acquire('b')).toBeNull();
  expect(await response.text()).toBe('hello');
  expect(admission.acquire('b')).not.toBeNull();
});

test('cancelled and failed response streams release their permit', async () => {
  const admission = new Admission(1);
  let cancelled = false;
  const response = admittedResponse(new Response(new ReadableStream<Uint8Array>({
    cancel() { cancelled = true; }
  })), admission.acquire('a')!);
  await response.body!.cancel();
  expect(cancelled).toBe(true);
  const release = admission.acquire('b');
  expect(release).not.toBeNull();
  const failed = admittedResponse(new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.error(new Error('stream failed')); }
  })), release!);
  await expect(failed.text()).rejects.toThrow('stream failed');
  expect(admission.acquire('c')).not.toBeNull();
});
