/** Short-lived, bounded autocomplete cache with one request per normalized prefix. */
export function suggestionCache<T>(
  lookup: (query: string) => Promise<T[]>,
  unavailable: () => Error,
  now = Date.now
): (query: string) => Promise<T[]> {
  const recent = new Map<string, { at: number; results: T[] }>();
  const pending = new Map<string, Promise<T[]>>();
  return (query) => {
    const q = query.trim().toLowerCase().slice(0, 200);
    if (!q) return Promise.resolve([]);
    const cached = recent.get(q);
    if (cached && now() - cached.at < 30_000) return Promise.resolve(cached.results);
    const running = pending.get(q);
    if (running) return running;
    if (pending.size >= 4) return Promise.reject(unavailable());
    const task = Promise.resolve().then(() => lookup(q)).then((results) => {
      if (recent.size >= 200) recent.delete(recent.keys().next().value!);
      recent.set(q, { at: now(), results });
      return results;
    }).finally(() => pending.delete(q));
    pending.set(q, task);
    return task;
  };
}
