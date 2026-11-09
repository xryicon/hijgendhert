const API = 'https://api.wiseoldman.net/v2';
const RETAIN = 24 * 60 * 60 * 1000;
export type WomResult<T> = { data: T; fetchedAt: string; stale: boolean };

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
export async function readWiseOldMan<T>(path: string, origin: string, fetcher: typeof fetch = fetch, freshFor = 300_000, now = Date.now()): Promise<WomResult<T>> {
  const edge = typeof caches !== 'undefined' ? (caches as CacheStorage & { default?: Cache }).default : undefined;
  const key = new Request(`${origin}/__wom-data/v1${path}`);
  const cooldownKey = new Request(`${origin}/__wom-data/rate-limit`);
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
  let coolingDown = false;
  try { coolingDown = !!(await edge?.match(cooldownKey)); } catch { /* Optional cache. */ }
  const busy = 'Wise Old Man is even druk. De laatst bekende gegevens blijven zichtbaar waar beschikbaar.';
  if (coolingDown) {
    if (saved) return { ...saved, stale: true };
    throw new Error(busy);
  }
  try {
    const response = await fetcher(API + path, { redirect: 'manual', headers: { Accept: 'application/json', 'User-Agent': 'HijgendHertClanWebsite/1.0 (group/7059)' }, signal: AbortSignal.timeout(8_000) });
    if (response.status === 429) {
      const retry = Math.min(300, Math.max(15, Number(response.headers.get('Retry-After')) || 60));
      try { await edge?.put(cooldownKey, new Response('busy', { headers: { 'Cache-Control': `public, max-age=${Math.ceil(retry)}` } })); } catch { /* Optional cache. */ }
      throw new Error(busy);
    }
    if (!response.ok) throw new Error('Wise Old Man is tijdelijk niet bereikbaar.');
    const value: WomResult<T> = { data: await readJson(response) as T, fetchedAt: new Date(now).toISOString(), stale: false };
    try { await edge?.put(key, Response.json(value, { headers: { 'Cache-Control': 'public, max-age=86400' } })); } catch { /* Fresh data is still usable. */ }
    return value;
  } catch (error) {
    if (saved) return { ...saved, stale: true };
    throw error;
  }
}
