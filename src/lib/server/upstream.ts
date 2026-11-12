import { AsyncLocalStorage } from 'node:async_hooks';
import { retryDelay } from './retry-delay';
import { RequestBudget, type RequestPriority } from './request-budget';

const context = new AsyncLocalStorage<RequestPriority>();
const budget = process.env.REQUEST_BUDGET_PATH
  ? new RequestBudget(process.env.REQUEST_BUDGET_PATH, Number(process.env.PKG_REQUESTS_PER_SECOND ?? 40),
    Number(process.env.PKG_RESERVED_REQUESTS_PER_SECOND ?? 10))
  : undefined;

/** Preserve background priority through nested cache loads. */
export function withRequestPriority<T>(priority: RequestPriority, run: () => T): T {
  return context.run(context.getStore() === 'background' ? 'background' : priority, run);
}

/** Share the pkg.go.dev allowance between the scraper and uncached app reads. */
export async function upstreamFetch(
  url: string | URL,
  init: RequestInit = {},
  priority: RequestPriority = context.getStore() ?? 'foreground'
): Promise<Response> {
  if (!budget || new URL(url).hostname !== 'pkg.go.dev') return fetch(url, init);
  const signal = init.signal ?? AbortSignal.timeout(30_000);
  await budget.acquire(priority, signal);
  const response = await fetch(url, { ...init, signal });
  if (response.status === 429) {
    budget.cooldown(Date.now() + retryDelay(response.headers.get('retry-after'), 1000));
  }
  return response;
}
