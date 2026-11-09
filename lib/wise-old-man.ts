const API = 'https://api.wiseoldman.net/v2';
const RETAIN = 24 * 60 * 60 * 1000;
export type WomResult<T> = { data: T; fetchedAt: string; stale: boolean };
export type WomEnv = { WOM_API_KEY?: string };
type WomOptions = { apiKey?: string; fetcher?: typeof fetch; freshFor?: number; now?: number };
export class WomUnavailable extends Error {
  constructor(message: string, public retryAfter = 60) { super(message); this.name = 'WomUnavailable'; }
}
export const womRetryAfter = (error: unknown) => error instanceof WomUnavailable ? String(error.retryAfter) : '60';

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
  const { fetcher = fetch, freshFor = 300_000, now = Date.now() } = options;
  const apiKey = options.apiKey?.trim();
  if (apiKey && !/^[\x21-\x7e]{1,512}$/.test(apiKey)) throw new WomUnavailable('De Wise Old Man-koppeling moet worden nagekeken.');
  const edge = typeof caches !== 'undefined' ? (caches as CacheStorage & { default?: Cache }).default : undefined;
  const key = new Request(`${origin}/__wom-data/v1${path}`);
  // A newly configured key has its own quota. Neither the key nor a provider
  // response containing credentials is stored in the public data cache.
  const quota = apiKey ? Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey))).toString('hex') : 'public';
  const cooldownKey = new Request(`${origin}/__wom-data/rate-limit/v2/${quota}`);
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
  try {
    const cooling = await edge?.match(cooldownKey);
    if (cooling) {
      const { retryAt } = await cooling.json() as { retryAt: number };
      if (Number.isFinite(retryAt)) retryAfter = Math.max(0, Math.ceil((retryAt - now) / 1000));
    }
  } catch { /* Optional cache. */ }
  const busy = 'Wise Old Man is even druk. De laatst bekende gegevens blijven zichtbaar waar beschikbaar.';
  if (retryAfter > 0) {
    if (saved) return { ...saved, stale: true };
    throw new WomUnavailable(busy, retryAfter);
  }
  try {
    const headers = new Headers({ Accept: 'application/json', 'User-Agent': 'HijgendHertClanWebsite/1.0 (github.com/xryicon/hijgendhert; group/7059)' });
    if (apiKey) headers.set('x-api-key', apiKey);
    const response = await fetcher(API + path, { redirect: 'manual', headers, signal: AbortSignal.timeout(8_000) });
    if (response.status === 429) {
      const retry = retrySeconds(response, now);
      await response.body?.cancel();
      try { await edge?.put(cooldownKey, Response.json({ retryAt: now + retry * 1000 }, { headers: { 'Cache-Control': `public, max-age=${retry}` } })); } catch { /* Optional cache. */ }
      throw new WomUnavailable(busy, retry);
    }
    if (!response.ok) {
      await response.body?.cancel();
      // Safe diagnostics only: never log request headers, API keys or player names.
      console.warn(JSON.stringify({ event: 'wom_request_failed', status: response.status, authenticated: !!apiKey }));
      throw new WomUnavailable('Wise Old Man is tijdelijk niet bereikbaar.');
    }
    const value: WomResult<T> = { data: await readJson(response) as T, fetchedAt: new Date(now).toISOString(), stale: false };
    try { await edge?.put(key, Response.json(value, { headers: { 'Cache-Control': 'public, max-age=86400' } })); } catch { /* Fresh data is still usable. */ }
    return value;
  } catch (error) {
    if (saved) return { ...saved, stale: true };
    throw error;
  }
}
