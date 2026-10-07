import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import * as v from 'valibot';

export type RequestPriority = 'foreground' | 'background';

/** Pace requests across containers without letting background work spend the reserve. */
export class RequestBudget {
  private readonly database: DatabaseSync;
  private readonly grant: StatementSync;
  private readonly next: StatementSync;

  constructor(path: string, readonly rate: number, readonly reserve: number) {
    if (!Number.isFinite(rate) || rate <= 0 || rate > 45 || !Number.isFinite(reserve) || reserve < 0 || reserve >= rate) {
      throw new Error('pkg.go.dev budget requires 0 < rate <= 45 and 0 <= reserve < rate');
    }
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS request_budget (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        next_at REAL NOT NULL DEFAULT 0,
        background_next_at REAL NOT NULL DEFAULT 0,
        cooldown_until REAL NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO request_budget(id) VALUES (1);
    `);
    this.grant = this.database.prepare(`
      UPDATE request_budget SET next_at = ?,
        background_next_at = CASE WHEN ? THEN ? ELSE background_next_at END
      WHERE id = 1 AND next_at <= ? AND cooldown_until <= ?
        AND (? = 0 OR background_next_at <= ?)
      RETURNING id
    `);
    this.next = this.database.prepare(`
      SELECT max(next_at, cooldown_until, CASE WHEN ? THEN background_next_at ELSE 0 END) AS next_at
      FROM request_budget WHERE id = 1
    `);
  }

  close(): void { this.database.close(); }

  /** Return zero for a granted permit, otherwise the wait in milliseconds. */
  tryAcquire(priority: RequestPriority, now = Date.now()): number {
    const background = priority === 'background' ? 1 : 0;
    const granted = this.grant.get(now + 1000 / this.rate, background,
      now + 1000 / (this.rate - this.reserve), now, now, background, now);
    if (granted) return 0;
    const row = v.parse(v.object({ next_at: v.number() }), this.next.get(background));
    return Math.max(1, Math.ceil(row.next_at - now));
  }

  async acquire(priority: RequestPriority, signal: AbortSignal): Promise<void> {
    while (true) {
      signal.throwIfAborted();
      const wait = this.tryAcquire(priority);
      if (!wait) return;
      await setTimeout(wait, undefined, { signal });
    }
  }

  /** Upstream throttling pauses both classes, including across process restarts. */
  cooldown(until: number): void {
    this.database.prepare('UPDATE request_budget SET cooldown_until = max(cooldown_until, ?) WHERE id = 1').run(until);
  }
}
