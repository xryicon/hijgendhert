import { DurableObject } from 'cloudflare:workers';
import { readWiseOldMan, WomUnavailable, WOM_RETAIN_MS, type WomCacheStore, type WomResult } from '../lib/wise-old-man';
import { WOM_REFRESH_MS } from '../lib/wom-refresh';

type Input = { path: string; origin: string; legacy?: { key: string; body: string }[]; retryRejectedKey?: boolean };
type Reply = { ok: true; valueJson: string } | { ok: false; error: string; retryAfter: number; code: string };
const success = (value: WomResult<unknown>): Reply => ({ ok: true, valueJson: JSON.stringify(value) });
type CacheRow = { expires_at: number };
const allowedPath = (path: string) => /^\/groups\/7059(?:\/competitions|\/gained\?metric=(?:overall|ehb)&period=(?:week|month)&limit=10)?$/.test(path)
  || /^\/competitions\/[1-9]\d{0,9}$/.test(path)
  || /^\/players\/[^/?#]{1,180}\/competitions$/.test(path);

// The coordination atom is this clan's WOM quota, not all website traffic.
// Only public data and quota deadlines are stored; Discord never uses this cache.
export class WomCache extends DurableObject<Cloudflare.Env> {
  #pending = new Map<string, Promise<Reply>>();
  #queue: Promise<void> = Promise.resolve();
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS wom_cache (key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS wom_chunks (key TEXT NOT NULL, part INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(key, part))');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS wom_imports (key TEXT PRIMARY KEY, version INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS wom_pace (id INTEGER PRIMARY KEY CHECK(id=1), next_at INTEGER NOT NULL)');
  }
  #body(key: string): string | undefined {
    const row = this.ctx.storage.sql.exec<CacheRow>('SELECT expires_at FROM wom_cache WHERE key = ?', key).toArray()[0];
    if (!row || row.expires_at <= Date.now()) return undefined;
    return this.ctx.storage.sql.exec<{ body: string }>('SELECT body FROM wom_chunks WHERE key = ? ORDER BY part', key).toArray().map(part => part.body).join('');
  }
  #store(key: string, body: string, expiresAt: number) {
    // Chunking keeps large group payloads below SQLite's per-row size limit.
    this.ctx.storage.sql.exec('DELETE FROM wom_chunks WHERE key = ?', key);
    for (let offset = 0, part = 0; offset < body.length; offset += 100_000, part++) this.ctx.storage.sql.exec('INSERT INTO wom_chunks (key, part, body) VALUES (?, ?, ?)', key, part, body.slice(offset, offset + 100_000));
    this.ctx.storage.sql.exec('INSERT INTO wom_cache (key, expires_at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at', key, expiresAt);
  }
  #remove(key: string) {
    this.ctx.storage.sql.exec('DELETE FROM wom_cache WHERE key = ?', key);
    this.ctx.storage.sql.exec('DELETE FROM wom_chunks WHERE key = ?', key);
  }
  #cache(): WomCacheStore {
    return {
      match: async request => { const body = this.#body(request.url); return body === undefined ? undefined : new Response(body, { headers: { 'Content-Type': 'application/json' } }); },
      put: async (request, response) => {
        const body = await response.text();
        const seconds = Number(/max-age=(\d+)/.exec(response.headers.get('Cache-Control') || '')?.[1]) || WOM_RETAIN_MS / 1000;
        this.#store(request.url, body, Date.now() + seconds * 1000);
      },
      delete: async request => { this.#remove(request.url); return true; },
    };
  }
  #import(input: Input, quota: string) {
    const key = `${input.origin}/__wom-data/v1${input.path}`;
    const cooldownKey = `${input.origin}/__wom-data/rate-limit/v2/${quota}`;
    const legacy = [...(input.legacy || [])];
    // Preserve the known production pause even when the first request reaches a
    // previously cold edge. This date expires naturally; it is never extended.
    const pause = this.env.WOM_AUTH_MODE !== 'api-key' ? Date.parse(this.env.WOM_PUBLIC_PAUSE_UNTIL || '') : NaN;
    if (pause > Date.now()) legacy.push({ key: cooldownKey, body: JSON.stringify({ retryAt: pause, code: 'WOM_HTTP_429' }) });
    for (const item of legacy) {
      if (![key, cooldownKey].includes(item.key) || item.body.length > 3_500_000) continue;
      try {
        const data = JSON.parse(item.body);
        const version = item.key === key ? Date.parse(data.fetchedAt) : data.retryAt;
        const expires = item.key === key ? version + WOM_RETAIN_MS : version;
        if (!Number.isFinite(version) || expires <= Date.now()) continue;
        if (item.key === key && (version > Date.now() || !('data' in data))) continue;
        if (item.key === cooldownKey && !/^WOM_[A-Z0-9_]+$/.test(data.code || '')) continue;
        const imported = this.ctx.storage.sql.exec<{ version: number }>('SELECT version FROM wom_imports WHERE key = ?', item.key).toArray()[0];
        if (imported && imported.version >= version) continue;
        const existing = this.#body(item.key);
        const previous = existing ? JSON.parse(existing) : null;
        const previousVersion = previous ? item.key === key ? Date.parse(previous.fetchedAt) : previous.retryAt : 0;
        if (!(previousVersion > version)) this.#store(item.key, item.body, expires);
        this.ctx.storage.sql.exec('INSERT INTO wom_imports (key, version) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET version=excluded.version', item.key, version);
      } catch { /* A malformed legacy entry is not used. */ }
    }
  }
  async read(input: Input): Promise<Reply> {
    if (!allowedPath(input.path) || new URL(input.origin).origin !== input.origin) return { ok: false, error: 'Ongeldige Wise Old Man-aanvraag.', code: 'WOM_PATH', retryAfter: 900 };
    const apiKey = this.env.WOM_AUTH_MODE === 'api-key' ? this.env.WOM_API_KEY?.trim() : undefined;
    const quota = apiKey ? Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey))).toString('hex') : 'public';
    this.#import(input, quota);
    this.ctx.storage.sql.exec('DELETE FROM wom_chunks WHERE key IN (SELECT key FROM wom_cache WHERE expires_at <= ?)', Date.now());
    this.ctx.storage.sql.exec('DELETE FROM wom_cache WHERE expires_at <= ?', Date.now());
    this.ctx.storage.sql.exec('DELETE FROM wom_imports WHERE version <= ?', Date.now() - WOM_RETAIN_MS);
    const key = `${input.origin}/__wom-data/v1${input.path}`;
    const body = this.#body(key);
    const candidate = body ? JSON.parse(body) as WomResult<unknown> : undefined;
    const age = candidate ? Date.now() - Date.parse(candidate.fetchedAt) : NaN;
    const saved = candidate && age >= 0 && age < WOM_RETAIN_MS ? candidate : undefined;
    if (saved && Date.now() - Date.parse(saved.fetchedAt) < WOM_REFRESH_MS) return success({ ...saved, stale: false });
    const cooldown = this.#body(`${input.origin}/__wom-data/rate-limit/v2/${quota}`);
    const cooling = cooldown ? JSON.parse(cooldown) as { retryAt: number; code: string } : undefined;
    if (cooling && cooling.retryAt > Date.now() && !(input.retryRejectedKey && cooling.code === 'WOM_API_KEY_INVALID')) return this.#readProvider(input, apiKey);
    let operation = this.#pending.get(key);
    if (!operation) {
      if (this.#pending.size >= 8) return saved ? success({ ...saved, stale: true }) : { ok: false, error: 'De clanlijst wordt opgehaald. Probeer het over een minuut opnieuw.', retryAfter: 60, code: 'WOM_BUSY' };
      operation = this.#queue.then(async () => {
        const next = this.ctx.storage.sql.exec<{ next_at: number }>('SELECT next_at FROM wom_pace WHERE id = 1').toArray()[0]?.next_at || 0;
        const delay = Math.min(4000, Math.max(0, next - Date.now()));
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        this.ctx.storage.sql.exec('INSERT INTO wom_pace (id, next_at) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET next_at=excluded.next_at', Date.now() + 4000);
        return this.#readProvider(input, apiKey);
      }).finally(() => this.#pending.delete(key));
      this.#pending.set(key, operation);
      this.#queue = operation.then(() => {}, () => {});
    }
    if (saved) { this.ctx.waitUntil(operation); return success({ ...saved, stale: true }); }
    return operation;
  }
  async #readProvider(input: Input, apiKey: string | undefined): Promise<Reply> {
    try {
      return success(await readWiseOldMan(input.path, input.origin, { apiKey, cache: this.#cache(), retryRejectedKey: input.retryRejectedKey }));
    } catch (error) {
      return error instanceof WomUnavailable ? { ok: false, error: error.message, retryAfter: error.retryAfter, code: error.code }
        : { ok: false, error: 'Wise Old Man is tijdelijk niet bereikbaar.', retryAfter: 900, code: 'WOM_UNAVAILABLE' };
    }
  }
}
