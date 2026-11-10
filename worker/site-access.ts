import { DurableObject } from 'cloudflare:workers';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
type WindowRow = { started_at: number; attempts: number };

// One small persistent counter per hashed client IP. Concurrent attempts and
// worker restarts share the same limit; no raw address or submitted code is kept.
export class SiteAccessLimits extends DurableObject<Cloudflare.Env> {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS access_window (id INTEGER PRIMARY KEY CHECK (id = 1), started_at INTEGER NOT NULL, attempts INTEGER NOT NULL)');
  }
  async attempt(): Promise<{ allowed: boolean; retryAfter: number }> {
    const now = Date.now();
    const previous = this.ctx.storage.sql.exec<WindowRow>('SELECT started_at, attempts FROM access_window WHERE id = 1').toArray()[0];
    const active = previous && now < previous.started_at + WINDOW_MS;
    const startedAt = active ? previous.started_at : now;
    const attempts = active ? previous.attempts : 0;
    const retryAfter = Math.max(1, Math.ceil((startedAt + WINDOW_MS - now) / 1000));
    if (attempts >= MAX_ATTEMPTS) return { allowed: false, retryAfter };
    // Synchronous read/check/write prevents concurrent requests spending the
    // same attempt. The alarm is submitted before yielding to another request.
    this.ctx.storage.sql.exec('INSERT INTO access_window (id, started_at, attempts) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET started_at = excluded.started_at, attempts = excluded.attempts', startedAt, attempts + 1);
    await this.ctx.storage.setAlarm(startedAt + WINDOW_MS);
    return { allowed: true, retryAfter: 0 };
  }
  async alarm(): Promise<void> {
    const row = this.ctx.storage.sql.exec<WindowRow>('SELECT started_at, attempts FROM access_window WHERE id = 1').toArray()[0];
    if (!row) return;
    if (Date.now() >= row.started_at + WINDOW_MS) this.ctx.storage.sql.exec('DELETE FROM access_window WHERE id = 1');
    else await this.ctx.storage.setAlarm(row.started_at + WINDOW_MS);
  }
}
