/** Bound upstream cooldowns so a malformed header cannot stall ingestion for days. */
export function retryDelay(header: string | null, fallback: number, now = Date.now()): number {
  if (!header?.trim()) return fallback;
  const seconds = Number(header);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(delay) && delay > 0 ? Math.min(delay, 60_000) : fallback;
}
