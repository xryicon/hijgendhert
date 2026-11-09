import communitySnapshot from '@/content/community-snapshot.json';
const BASE = "https://api.wiseoldman.net/v2/groups/7059";
const TTL = 5 * 60 * 1000;
type Envelope = { data: unknown; fetchedAt: string; stale?: boolean };
const memory = new Map<string, { value: Envelope; time: number }>();
const pending = new Map<string, Promise<Envelope>>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const resource = url.searchParams.get("resource") || "group";
  const metric = url.searchParams.get("metric") || "overall";
  const period = url.searchParams.get("period") || "week";
  if (!["group", "competitions", "gained"].includes(resource) || !["overall", "ehb"].includes(metric) || !["week", "month"].includes(period)) {
    return Response.json({ error: "Ongeldige selectie." }, { status: 400 });
  }
  const path = resource === "group" ? "" : resource === "competitions" ? "/competitions" : `/gained?metric=${metric}&period=${period}&limit=10`;
  const key = BASE + path;
  const cached = memory.get(key);
  const headers = { "Cache-Control": "public, max-age=60, s-maxage=300", "X-Content-Type-Options": "nosniff" };
  if (cached && Date.now() - cached.time < TTL) return Response.json(cached.value, { headers });
  const edge = typeof caches !== "undefined" ? (caches as CacheStorage & { default?: Cache }).default : undefined;
  const cacheKey = new Request(`${url.origin}/__clan-cache/${resource}/${resource === "gained" ? metric + "/" + period : "all"}`);
  try {
    const hit = await edge?.match(cacheKey);
    if (hit) return new Response(hit.body, { status: hit.status, headers: new Headers(hit.headers) });
  } catch { /* Cache failures do not prevent upstream reads. */ }
  try {
    let job = pending.get(key);
    if (!job) {
      job = (async () => {
        const upstream = await fetch(key, { headers: { Accept: "application/json", "User-Agent": "HijgendHertClanWebsite/1.0 (group/7059)" }, signal: AbortSignal.timeout(12000) });
        if (!upstream.ok) throw new Error(upstream.status === 429 ? "Wise Old Man is even druk. Probeer het over enkele minuten opnieuw." : "Wise Old Man is tijdelijk niet bereikbaar.");
        let data = await upstream.json();
        if (resource === "group" && (!data || typeof data !== "object" || !("id" in data) || data.id !== 7059 || !("memberships" in data) || !Array.isArray(data.memberships))) throw new Error("De clangegevens zijn tijdelijk niet beschikbaar.");
        if (resource !== "group") {
          if (!Array.isArray(data)) throw new Error("De gegevens zijn tijdelijk niet beschikbaar.");
          if (resource === "competitions") data = data.sort((a: { startsAt: string }, b: { startsAt: string }) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
          else data = data.slice(0, 10);
        }
        return { data, fetchedAt: new Date().toISOString() };
      })();
      pending.set(key, job);
    }
    const value = await job;
    memory.set(key, { value, time: Date.now() });
    const response = Response.json(value, { headers });
    try { await edge?.put(cacheKey, response.clone()); } catch { /* Fresh data is still usable. */ }
    return response;
  } catch (error) {
    if (cached && Date.now() - cached.time < 24 * 60 * 60 * 1000) return Response.json({ ...cached.value, stale: true }, { headers: { "Cache-Control": "no-store" } });
    if (resource === 'competitions' && Date.now() - Date.parse(communitySnapshot.fetchedAt) < 48 * 60 * 60 * 1000) return Response.json({ data: [...communitySnapshot.competitions].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)), fetchedAt: communitySnapshot.fetchedAt, stale: true }, { headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ error: error instanceof Error ? error.message : "De gegevens zijn tijdelijk niet beschikbaar." }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  } finally { pending.delete(key); }
}
