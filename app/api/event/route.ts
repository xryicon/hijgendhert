import { env } from 'cloudflare:workers';
import { readWiseOldMan, womRetryAfter } from '@/lib/wise-old-man';
import { categoryOf, SKILLS as skills } from '@/lib/community';

type Player = { id: number; username: string; displayName: string; type: string; updatedAt: string };
type Event = { id: number; title: string; metric: string; type: string; startsAt: string; endsAt: string; groupId: number; participantCount: number; metrics?: { metric: string }[]; participations?: { player: Player; teamName: string | null; deltas: { metric: string; values: { gained: number; start: number; end: number }; levels?: { gained: number } }[] }[] };
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const category = url.searchParams.get("category") || "all";
  if ((id && !/^[1-9]\d{0,9}$/.test(id)) || !["all", "skill", "boss"].includes(category)) return Response.json({ error: "Ongeldige eventselectie." }, { status: 400 });
  const edge = typeof caches !== "undefined" ? (caches as CacheStorage & { default?: Cache }).default : undefined;
  const key = new Request(`${url.origin}/__event-cache/v2/${category}/${id || "current"}`);
  try {
    const hit = await edge?.match(key);
    if (hit) {
      const body = await hit.clone().json() as { data: { competition?: Event } };
      if (id || !body.data.competition || Date.parse(body.data.competition.endsAt) > Date.now()) return new Response(hit.body, { status: hit.status, headers: new Headers(hit.headers) });
    }
  } catch { /* Continue when the optional edge cache is unavailable. */ }
  try {
    const listing = await readWiseOldMan<Event[]>("/groups/7059/competitions", url.origin, { apiKey: env.WOM_API_KEY });
    const all = listing.data;
    let stale = listing.stale; let fetchedAt = listing.fetchedAt;
    if (!Array.isArray(all)) throw new Error("De eventgegevens zijn tijdelijk niet beschikbaar.");
    const clanEvents = all.filter(e => e.groupId === 7059);
    const active = clanEvents.filter(e => Date.parse(e.startsAt) <= Date.now() && Date.parse(e.endsAt) > Date.now()).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
    const matching = (id ? clanEvents : active).filter(e => category === "all" || categoryOf(e) === category);
    const selected = id ? matching.find(e => e.id === Number(id)) : matching[0];
    if (id && !selected) return Response.json({ error: "Dit event hoort niet bij deze clan of selectie." }, { status: 404 });
    let competition = null;
    if (selected) {
      const result = await readWiseOldMan<Event>(`/competitions/${selected.id}`, url.origin, { apiKey: env.WOM_API_KEY });
      const detail = result.data; stale ||= result.stale;
      if (Date.parse(result.fetchedAt) < Date.parse(fetchedAt)) fetchedAt = result.fetchedAt;
      if (detail.groupId !== 7059 || !Array.isArray(detail.participations)) throw new Error("De deelnemers zijn tijdelijk niet beschikbaar.");
      const rankedMetric = (detail.metrics?.length || 0) > 1 ? "total" : detail.metric;
      const participants = detail.participations.map((p, index) => {
        const delta = p.deltas?.find(d => d.metric === rankedMetric);
        return { rank: index + 1, player: p.player, teamName: p.teamName, gained: delta?.values.gained ?? null, start: delta?.values.start ?? null, end: delta?.values.end ?? null, levels: delta?.levels?.gained ?? null };
      });
      competition = { id: detail.id, title: detail.title, metric: detail.metric, startsAt: detail.startsAt, endsAt: detail.endsAt, participantCount: detail.participantCount, unit: rankedMetric === "total" ? "punten" : skills.has(detail.metric) ? "XP" : ["ehb", "ehp"].includes(detail.metric) ? "uur" : "kills", participants };
    }
    const payload = { data: { competition, activeEvents: active.map(e => ({ id: e.id, title: e.title, metric: e.metric, category: skills.has(e.metric) ? "skill" : "boss" })) }, fetchedAt, stale };
    const response = Response.json(payload, { headers: { "Cache-Control": stale ? "no-store" : "public, max-age=30, s-maxage=300" } });
    if (!stale) try { await edge?.put(key, response.clone()); } catch { /* Return the verified data even without a cache. */ }
    return response;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "De eventranglijst is tijdelijk niet beschikbaar." }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": womRetryAfter(error) } });
  }
}
