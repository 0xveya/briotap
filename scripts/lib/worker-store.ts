import { DatabaseSync, type StatementSync } from 'node:sqlite';
import * as v from 'valibot';
import type { RecordEntry } from './enrichment';
import { timestampKey } from './index-feed';

const jobSchema = v.object({ path: v.string(), attempts: v.number() });
const day = 86_400_000;

/** Durable NAS queue and checkpoints. One worker owns writes through flock. */
export class WorkerStore {
  readonly database: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();

  private prepare(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) { statement = this.database.prepare(sql); this.statements.set(sql, statement); }
    return statement;
  }

  constructor(path: string, readOnly = false) {
    this.database = new DatabaseSync(path, { readOnly });
    this.database.exec('PRAGMA busy_timeout = 5000');
    if (readOnly) return;
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (
        path TEXT PRIMARY KEY,
        requested_at TEXT NOT NULL DEFAULT '',
        pending INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 1,
        available_at INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(priority, available_at, path) WHERE pending = 1;
    `);
  }

  close(): void { this.database.close(); }

  transaction<T>(run: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = run();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  get(key: string): string | undefined {
    const row = this.prepare('SELECT value FROM state WHERE key = ?').get(key);
    return row ? v.parse(v.string(), row.value) : undefined;
  }

  set(key: string, value: string): void {
    this.prepare('INSERT INTO state VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  enqueue(path: string, timestamp?: string, now = Date.now()): void {
    if (timestamp === undefined) {
      this.prepare('INSERT INTO jobs(path) VALUES (?) ON CONFLICT(path) DO NOTHING').run(path);
      return;
    }
    this.prepare(`
      INSERT INTO jobs(path, requested_at, priority, available_at) VALUES (?, ?, 0, ?)
      ON CONFLICT(path) DO UPDATE SET requested_at = excluded.requested_at,
        pending = 1, priority = 0, available_at = excluded.available_at, attempts = 0
      WHERE jobs.requested_at < excluded.requested_at
    `).run(path, timestampKey(timestamp), now);
  }

  next(now = Date.now()): v.InferOutput<typeof jobSchema> | null {
    const row = this.prepare(`
      SELECT path, attempts FROM jobs WHERE pending = 1 AND available_at <= ?
      ORDER BY priority, available_at, path LIMIT 1
    `).get(now);
    return row ? v.parse(jobSchema, row) : null;
  }

  result(entry: RecordEntry, offset: number, now = Date.now()): void {
    const error = 'error' in entry ? entry.error : null;
    const current = this.prepare('SELECT attempts FROM jobs WHERE path = ?').get(entry.path);
    const attempts = error !== null ? (current ? v.parse(v.number(), current.attempts) : 0) + 1 : 0;
    const permanent = error !== null && /returned (400|404|410|412)\b/.test(error);
    const delay = Math.min(30 * day, (permanent ? 7 * day : 60_000) * 2 ** Math.min(attempts - 1, 16));
    this.prepare(`
      INSERT INTO jobs(path, pending, priority, available_at, attempts, last_error) VALUES (?, ?, 2, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET pending = excluded.pending, priority = 2,
        available_at = excluded.available_at, attempts = excluded.attempts, last_error = excluded.last_error
    `).run(entry.path, error === null ? 0 : 1, error === null ? 0 : now + delay, attempts, error);
    this.set('output-offset', String(offset));
  }

  status(now = Date.now()): object {
    return {
      checkpoints: this.database.prepare('SELECT key, value FROM state ORDER BY key').all(),
      counts: this.database.prepare(`
        SELECT count(*) AS known, sum(pending = 0) AS succeeded,
          sum(pending = 1 AND attempts = 0) AS queued,
          sum(pending = 1 AND attempts > 0) AS retrying,
          sum(pending = 1 AND available_at <= ?) AS ready,
          min(CASE WHEN pending = 1 THEN available_at END) AS next_attempt_at
        FROM jobs
      `).get(now),
      recentErrors: this.database.prepare(`
        SELECT path, attempts, available_at, last_error FROM jobs
        WHERE pending = 1 AND last_error IS NOT NULL ORDER BY available_at LIMIT 5
      `).all()
    };
  }
}
