import { WOM_FAILURE_RETRY_SECONDS, WOM_REFRESH_MS, WOM_REQUEST_TIMEOUT_MS } from './wom-refresh';

const API = 'https://api.wiseoldman.net/v2';
const RETAIN = 24 * 60 * 60 * 1000;
export type WomResult<T> = { data: T; fetchedAt: string; stale: boolean };
export type WomEnv = { WOM_API_KEY?: string };
type WomOptions = { apiKey?: string; fetcher?: typeof fetch; freshFor?: number; now?: number; retryRejectedKey?: boolean };
export class WomUnavailable extends Error {
  constructor(message: string, public retryAfter = WOM_FAILURE_RETRY_SECONDS, public code = 'WOM_UNAVAILABLE') { super(message); this.name = 'WomUnavailable'; }
}
export const womRetryAfter = (error: unknown) => error instanceof WomUnavailable ? String(error.retryAfter) : String(WOM_FAILURE_RETRY_SECONDS);
export const womErrorCode = (error: unknown) => error instanceof WomUnavailable ? error.code : 'WOM_DATA';

function retrySeconds(response: Response, now: number) {
  const value = response.headers.get('Retry-After') || response.headers.get('RateLimit-Reset');
  const seconds = value && /^\d+(\.\d+)?$/.test(value) ? Number(value) : value ? (Date.parse(value) - now) / 1000 : 60;
  // WOM also has hourly and daily limits. Never shorten a valid wait to five minutes.
  return Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 60;
}

async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Wise Old Man gaf geen gegevens terug.');
  let bytes = 0; const parts: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 3_000_000) { await reader.cancel(); throw new Error('De gegevens van Wise Old Man zijn te groot.'); }
    parts.push(value);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

// Public WOM data only. All pages share these cache keys; no member identity,
// Discord token, role decision, or profile preference may enter this cache.
export async function readWiseOldMan<T>(path: string, origin: string, options: WomOptions = {}): Promise<WomResult<T>> {
  const { fetcher = fetch, freshFor = WOM_REFRESH_MS, now = Date.now() } = options;
  const apiKey = options.apiKey?.trim();
  if (apiKey && !/^[\x21-\x7e]{1,512}$/.test(apiKey)) throw new WomUnavailable('De Wise Old Man-koppeling moet worden nagekeken.', 900, 'WOM_CONFIG');
  const edge = typeof caches !== 'undefined' ? (caches as CacheStorage & { default?: Cache }).default : undefined;
  const key = new Request(`${origin}/__wom-data/v1${path}`);
  // A newly configured key has its own quota. Neither the key nor a provider
  // response containing credentials is stored in the public data cache.
  const quota = apiKey ? Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey))).toString('hex') : 'public';
  const cooldownKey = new Request(`${origin}/__wom-data/rate-limit/v2/${quota}`);
  const rememberFailure = async (failure: WomUnavailable) => {
    try {
      await edge?.put(cooldownKey, Response.json({ retryAt: now + failure.retryAfter * 1000, attemptedAt: now, code: failure.code }, { headers: { 'Cache-Control': `public, max-age=${failure.retryAfter}` } }));
    } catch { /* The failure remains recoverable even without an edge cache. */ }
  };
  let saved: WomResult<T> | null = null;
  try {
    const hit = await edge?.match(key);
    if (hit) {
      const value = await readJson(hit) as WomResult<T>;
      const age = now - Date.parse(value.fetchedAt);
      if (Number.isFinite(age) && age >= 0 && age < RETAIN) saved = value;
      if (saved && age < freshFor) return { ...saved, stale: false };
    }
  } catch { /* The optional edge cache must not prevent public API reads. */ }
  let retryAfter = 0;
  let failureCode = 'WOM_HTTP_429';
  let rejectedKeyRetryAt: number | null = null;
  try {
    const cooling = await edge?.match(cooldownKey);
    if (cooling) {
      const { retryAt, attemptedAt, code } = await cooling.json() as { retryAt: number; attemptedAt?: number; code?: string };
      if (Number.isFinite(retryAt)) retryAfter = Math.max(0, Math.ceil((retryAt - now) / 1000));
      if (code && /^WOM_[A-Z0-9_]+$/.test(code)) failureCode = code;
      // Only our own invalid-key pause can be retried manually, at most once a
      // minute. Provider rate limits are never bypassed. Older records used 900s.
      const lastAttempt = attemptedAt ?? retryAt - 900_000;
      if (options.retryRejectedKey && code === 'WOM_API_KEY_INVALID' && Number.isFinite(lastAttempt) && now - lastAttempt >= 60_000) {
        rejectedKeyRetryAt = retryAt; retryAfter = 0;
      }
    }
  } catch { /* Optional cache. */ }
  const busy = 'Wise Old Man is even druk. De laatst bekende gegevens blijven zichtbaar waar beschikbaar.';
  if (retryAfter > 0) {
    if (saved) return { ...saved, stale: true };
    throw new WomUnavailable(failureCode === 'WOM_HTTP_429' ? busy : 'Wise Old Man is tijdelijk niet bereikbaar.', retryAfter, failureCode);
  }
  try {
    const headers = new Headers({ Accept: 'application/json', 'User-Agent': 'HijgendHertClanWebsite/1.0 (github.com/xryicon/hijgendhert; group/7059)' });
    if (apiKey) headers.set('x-api-key', apiKey);
    const response = await fetcher(API + path, { redirect: 'manual', headers, signal: AbortSignal.timeout(WOM_REQUEST_TIMEOUT_MS) });
    if (response.status === 429) {
      const retry = retrySeconds(response, now);
      await response.body?.cancel();
      const failure = new WomUnavailable(busy, retry, 'WOM_HTTP_429');
      await rememberFailure(failure);
      throw failure;
    }
    if (!response.ok) {
      let code = `WOM_HTTP_${response.status}`;
      if (response.status === 403 && apiKey) {
        try {
          const body = await readJson(response) as { message?: unknown };
          if (typeof body?.message === 'string' && /^Invalid API Key\./.test(body.message)) code = 'WOM_API_KEY_INVALID';
        } catch { /* Keep the status-only diagnostic; never expose provider bodies. */ }
      } else await response.body?.cancel();
      // Safe diagnostics only: never log request headers, API keys or player names.
      console.warn(JSON.stringify({ event: 'wom_request_failed', status: response.status, authenticated: !!apiKey }));
      const failure = new WomUnavailable('Wise Old Man is tijdelijk niet bereikbaar.', [401, 403].includes(response.status) ? 900 : WOM_FAILURE_RETRY_SECONDS, code);
      if (response.status >= 500 || [401, 403].includes(response.status)) await rememberFailure(failure);
      throw failure;
    }
    const value: WomResult<T> = { data: await readJson(response) as T, fetchedAt: new Date(now).toISOString(), stale: false };
    try { await edge?.put(key, Response.json(value, { headers: { 'Cache-Control': 'public, max-age=86400' } })); } catch { /* Fresh data is still usable. */ }
    if (rejectedKeyRetryAt !== null) try {
      const latest = await edge?.match(cooldownKey);
      const failure = latest ? await latest.json() as { retryAt?: number; code?: string } : null;
      if (failure?.code === 'WOM_API_KEY_INVALID' && failure.retryAt === rejectedKeyRetryAt) await edge?.delete(cooldownKey);
    } catch { /* A later retry can still recover if the optional cache is unavailable. */ }
    return value;
  } catch (error) {
    const failure = error instanceof WomUnavailable ? error : new WomUnavailable('Wise Old Man is tijdelijk niet bereikbaar.', WOM_FAILURE_RETRY_SECONDS,
      error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'WOM_TIMEOUT' : 'WOM_CONNECTION');
    if (!(error instanceof WomUnavailable)) await rememberFailure(failure);
    if (saved) return { ...saved, stale: true };
    throw failure;
  }
}
