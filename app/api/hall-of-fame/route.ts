import { env } from 'cloudflare:workers';
import { readWiseOldMan, womRetryAfter } from '@/lib/wise-old-man';
import { awardFrom, categoryOf, monthKey, monthlyLeaders, unitOf, type Award, type Competition, type CompetitionDetail } from '@/lib/community';
import communitySnapshot from '@/content/community-snapshot.json';

function fallback(month?: string | null) {
  const snapshots = communitySnapshot.hall as Record<string, { month: string; months: string[]; awards: Award[]; leaders: unknown[]; partial: boolean; ongoingMonth: boolean }>;
  const selected = month || Object.keys(snapshots).sort().reverse()[0];
  const data = snapshots[selected];
  if (!data) return null;
  return Response.json({ data: { ...data, ongoingMonth: data.month === monthKey(Date.now()) }, fetchedAt: communitySnapshot.fetchedAt, stale: true }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get('month');
  let stale = false; let fetchedAt = new Date().toISOString();
  const read = async <T,>(path: string, ttl: number): Promise<T> => {
    const value = await readWiseOldMan<T>(path, url.origin, { apiKey: env.WOM_API_KEY, freshFor: ttl });
    stale ||= value.stale;
    if (Date.parse(value.fetchedAt) < Date.parse(fetchedAt)) fetchedAt = value.fetchedAt;
    return value.data;
  };
  if (requested && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(requested)) return Response.json({ error: 'Ongeldige maand.' }, { status: 400 });
  const edge = typeof caches !== 'undefined' ? (caches as CacheStorage & { default?: Cache }).default : undefined;
  const key = new Request(`${url.origin}/__hall-cache/${requested || 'latest'}`);
  try { const hit = await edge?.match(key); if (hit) return new Response(hit.body, { status: hit.status, headers: new Headers(hit.headers) }); } catch { /* Optional cache. */ }
  try {
    const all = await read<Competition[]>('/groups/7059/competitions', 300000);
    if (!Array.isArray(all)) throw new Error('De competitiegegevens konden niet worden gelezen.');
    const finished = all.filter(c => c.groupId === 7059 && c.type === 'classic' && Date.parse(c.endsAt) <= Date.now()).sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt) || b.id - a.id);
    const months = [...new Set(finished.map(c => monthKey(c.endsAt)))];
    const month = requested || months[0] || monthKey(Date.now());
    const selected = finished.filter(c => monthKey(c.endsAt) === month);
    // Bound upstream load while keeping the full selected month's result set.
    const awards: Award[] = [];
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(3, selected.length) }, async () => {
      while (cursor < selected.length) {
        const c = selected[cursor++];
        try {
          const detail = await read<CompetitionDetail>(`/competitions/${c.id}`, 3600000);
          if (detail.groupId !== 7059 || detail.id !== c.id || detail.type !== 'classic' || Date.parse(detail.endsAt) > Date.now() || !Array.isArray(detail.participations)) throw new Error('Ongeldig resultaat');
          awards.push(awardFrom(detail));
        } catch { awards.push({ ...c, category: categoryOf(c), unit: unitOf(c), winners: [], unavailable: true }); }
      }
    }));
    awards.sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt) || b.id - a.id);
    const partial = awards.some(a => a.unavailable);
    if (partial) { const saved = fallback(month); if (saved) return saved; }
    const response = Response.json({ data: { month, months, awards, leaders: partial ? [] : monthlyLeaders(awards), partial, ongoingMonth: month === monthKey(Date.now()) }, fetchedAt, stale }, { headers: { 'Cache-Control': partial || stale ? 'no-store' : 'public, max-age=60, s-maxage=600' } });
    if (!partial && !stale) try { await edge?.put(key, response.clone()); } catch { /* Data remains usable without cache. */ }
    return response;
  } catch (e) { return fallback(requested) || Response.json({ error: e instanceof Error ? e.message : 'De erelijst is tijdelijk niet beschikbaar.' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': womRetryAfter(e) } }); }
}
