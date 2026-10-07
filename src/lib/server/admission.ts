/** Bound dynamic request work and client state without trusting forwarded headers. */
export class Admission {
  private active = 0;
  private readonly clients = new Map<string, { tokens: number; at: number }>();

  constructor(private readonly concurrency = 64, private readonly burst = 120,
    private readonly rate = 2, private readonly maxClients = 10_000) {}

  acquire(client: string, now = Date.now()): (() => void) | null {
    if (this.active >= this.concurrency) return null;
    const previous = this.clients.get(client);
    const tokens = previous
      ? Math.min(this.burst, previous.tokens + Math.max(0, now - previous.at) * this.rate / 1000)
      : this.burst;
    if (tokens < 1) return null;
    if (!previous && this.clients.size >= this.maxClients) {
      const oldest = this.clients.entries().next().value;
      if (!oldest || now - oldest[1].at < this.burst / this.rate * 1000) return null;
      this.clients.delete(oldest[0]);
    }
    this.clients.delete(client);
    this.clients.set(client, { tokens: tokens - 1, at: now });
    this.active++;
    let released = false;
    return () => {
      if (!released) this.active--;
      released = true;
    };
  }
}

/** Retain the request permit until streaming finishes or the client disconnects. */
export function admittedResponse(response: Response, release: () => void): Response {
  const reader = response.body?.getReader();
  if (!reader) { release(); return response; }
  const finish = () => { reader.releaseLock(); release(); };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) { controller.close(); finish(); }
        else controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
        finish();
      }
    },
    async cancel(reason: unknown) {
      try { await reader.cancel(reason); }
      finally { finish(); }
    }
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
