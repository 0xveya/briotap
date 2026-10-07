import { expect, test } from 'bun:test';
import { responseText } from './response';

test('rejects an oversized streamed response even without content-length', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(5)); },
    cancel() { cancelled = true; }
  });
  await expect(responseText(new Response(stream), 4)).rejects.toThrow('too large');
  expect(cancelled).toBe(true);
});

test('decodes multibyte text across chunk boundaries', async () => {
  const bytes = new TextEncoder().encode('€');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, 1));
      controller.enqueue(bytes.slice(1));
      controller.close();
    }
  });
  expect(await responseText(new Response(stream), 3)).toBe('€');
});
