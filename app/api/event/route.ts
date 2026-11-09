const API = "https://api.wiseoldman.net/v2";
const TTL = 300_000;
const skills = new Set(["overall", "attack", "defence", "strength", "hitpoints", "ranged", "prayer", "magic", "cooking", "woodcutting", "fletching", "fishing", "firemaking", "crafting", "smithing", "mining", "herblore", "agility", "thieving", "slayer", "farming", "runecrafting", "hunter", "construction", "sailing"]);
type Player = { id: number; username: string; displayName: string; type: string; updatedAt: string };
type Event = { id: number; title: string; metric: string; type: string; startsAt: string; endsAt: string; groupId: number; participantCount: number; metrics?: { metric: string }[]; participations?: { player: Player; teamName: string | null; deltas: { metric: string; values: { gained: number; start: number; end: number }; levels: { gained: number } }[] }[] };
const cache = new Map<string, { time: number; data: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();
async function read<T>(path: string): Promise<T> {
  const old = cache.get(path);
  if (old && Date.now() - old.time < TTL) return old.data as T;
  let pending = inFlight.get(path);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(API + path, { headers: { Accept: "application/json", "User-Agent": "HijgendHertClanWebsite/1.0 (group/7059)" }, signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error(response.status === 429 ? "Wise Old Man is even druk. Probeer het over enkele minuten opnieuw." : "De eventranglijst is tijdelijk niet beschikbaar.");
      const data: unknown = await response.json();
      if (cache.size > 60) cache.clear();
      cache.set(path, { time: Date.now(), data });
      return data;
    })();
    inFlight.set(path, pending);
  }
  try { return await pending as T; } finally { inFlight.delete(path); }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const category = url.searchParams.get("category") || "all";
  if ((id && !/^[1-9]\d{0,9}$/.test(id)) || !["all", "skill", "boss"].includes(category)) return Response.json({ error: "Ongeldige eventselectie." }, { status: 400 });
  const edge = typeof caches !== "undefined" ? (caches as CacheStorage & { default?: Cache }).default : undefined;
  const key = new Request(`${url.origin}/__event-cache/${category}/${id || "current"}`);
  try {
    const hit = await edge?.match(key);
    if (hit) {
      const body = await hit.clone().json() as { data: { competition?: Event } };
      if (!body.data.competition || Date.parse(body.data.competition.endsAt) > Date.now()) return new Response(hit.body, { status: hit.status, headers: new Headers(hit.headers) });
    }
  } catch { /* Continue when the optional edge cache is unavailable. */ }
  try {
    const all = await read<Event[]>("/groups/7059/competitions");
    if (!Array.isArray(all)) throw new Error("De eventgegevens zijn tijdelijk niet beschikbaar.");
    const active = all.filter(e => e.groupId === 7059 && Date.parse(e.startsAt) <= Date.now() && Date.parse(e.endsAt) > Date.now()).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
    const matching = active.filter(e => category === "all" || (category === "skill" ? skills.has(e.metric) : !skills.has(e.metric)));
    const selected = id ? matching.find(e => e.id === Number(id)) : matching[0];
    if (id && !selected) return Response.json({ error: "Dit event is niet actief voor deze clan en selectie." }, { status: 404 });
    let competition = null;
    if (selected) {
      const detail = await read<Event>(`/competitions/${selected.id}`);
      if (detail.groupId !== 7059 || !Array.isArray(detail.participations)) throw new Error("De deelnemers zijn tijdelijk niet beschikbaar.");
      const rankedMetric = (detail.metrics?.length || 0) > 1 ? "total" : detail.metric;
      const participants = detail.participations.map((p, index) => {
        const delta = p.deltas?.find(d => d.metric === rankedMetric);
        return { rank: index + 1, player: p.player, teamName: p.teamName, gained: delta?.values.gained ?? null, start: delta?.values.start ?? null, end: delta?.values.end ?? null, levels: delta?.levels.gained ?? null };
      });
      competition = { id: detail.id, title: detail.title, metric: detail.metric, startsAt: detail.startsAt, endsAt: detail.endsAt, participantCount: detail.participantCount, unit: rankedMetric === "total" ? "punten" : skills.has(detail.metric) ? "XP" : ["ehb", "ehp"].includes(detail.metric) ? "uur" : "kills", participants };
    }
    const payload = { data: { competition, activeEvents: active.map(e => ({ id: e.id, title: e.title, metric: e.metric, category: skills.has(e.metric) ? "skill" : "boss" })) }, fetchedAt: new Date().toISOString() };
    const response = Response.json(payload, { headers: { "Cache-Control": "public, max-age=30, s-maxage=300" } });
    try { await edge?.put(key, response.clone()); } catch { /* Return the verified data even without a cache. */ }
    return response;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "De eventranglijst is tijdelijk niet beschikbaar." }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
}
