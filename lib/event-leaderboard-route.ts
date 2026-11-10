import { z } from 'zod';
import { readWiseOldMan, womConnection, womRetryAfter, type WomEnv } from './wise-old-man';
import { eventLeaderboardRows, eventRevision, leaderboardEventSchema, leaderboardRounds, summarizeLeaderboardRounds, summarizeLeaderboardEvent, LEADERBOARD_MIN_EVENTS, type LeaderboardEvent, type EventLeaderboard } from './event-leaderboard';
import type { ClanProgress } from '../worker/clan-progress';

export async function eventLeaderboardRoute(request: Request, env: WomEnv & { PROGRESS?: DurableObjectNamespace<ClanProgress> }, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/clan/leaderboard') return null;
  const json = (body: unknown, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
  if (request.method !== 'GET') return json({ error: 'Ongeldig verzoek.' }, 405, { Allow: 'GET' });
  if (!env.PROGRESS) return json({ error: 'Het eventklassement is nog niet beschikbaar.' }, 503, { 'Retry-After': '60' });
  const store = env.PROGRESS.getByName('clan:7059:event-leaderboard');
  let stale = false, fetchedAt = new Date().toISOString();
  const read = async (path: string) => {
    const result = await readWiseOldMan<unknown>(path, url.origin, { fetcher, ...womConnection(env) });
    stale ||= result.stale;
    if (Date.parse(result.fetchedAt) < Date.parse(fetchedAt)) fetchedAt = result.fetchedAt;
    return result;
  };
  try {
    const [groupResult, eventResult, stored] = await Promise.all([read('/groups/7059'), read('/groups/7059/competitions'), store.getLeaderboardEvents()]);
    const group = z.object({ id: z.literal(7059), memberships: z.array(z.object({ player: z.object({ id: z.number().int().positive() }) })).max(2000) }).parse(groupResult.data);
    // This WOM endpoint returns the complete group catalogue, without pagination.
    const catalogue = z.array(leaderboardEventSchema).max(2000).parse(eventResult.data);
    const rounds = leaderboardRounds(catalogue);
    const finished = rounds.flat();
    const saved = new Map<number, LeaderboardEvent>(stored.map(event => [event.id, event]));
    const missing = finished.filter(event => !saved.has(event.id) || saved.get(event.id)!.sourceRevision !== eventRevision(event));
    let retryAfter = 10;
    if (missing.length && await store.claimLeaderboardRefresh()) {
      try {
        // Small shared batches prevent a first visit from flooding WOM. Completed
        // final results survive restarts and are refreshed when WOM revises them.
        for (const event of missing.slice(0, 4)) {
          const result = await read(`/competitions/${event.id}`);
          const summary = summarizeLeaderboardEvent(result.data, result.fetchedAt, eventRevision(event));
          if (summary.id !== event.id || result.stale || eventRevision(leaderboardEventSchema.parse(result.data)) !== eventRevision(event)) { retryAfter = 60; continue; }
          await store.saveLeaderboardEvent(summary);
          saved.set(event.id, summary);
        }
      } catch (error) { stale = true; retryAfter = Math.max(60, Number(womRetryAfter(error)) || 60); }
      finally { await store.releaseLeaderboardRefresh(retryAfter); }
    } else if (missing.length) retryAfter = await store.leaderboardRetryAfter();
    const results = finished.flatMap(event => {
      const summary = saved.get(event.id);
      return summary?.sourceRevision === eventRevision(event) ? [summary] : [];
    });
    const summaries = summarizeLeaderboardRounds(rounds, saved);
    const complete = summaries.length === rounds.length;
    const data: EventLeaderboard = { rows: eventLeaderboardRows(group.memberships.map(m => m.player.id), summaries, complete), minimumEvents: LEADERBOARD_MIN_EVENTS, totalEvents: rounds.length, loadedEvents: summaries.length, totalCompetitions: finished.length, loadedCompetitions: results.length, complete, stale, fetchedAt, retryAfter: complete ? 3600 : retryAfter };
    return json(data);
  } catch (error) { return json({ error: 'Het eventklassement kan nu niet worden bijgewerkt. Probeer het later opnieuw.' }, 503, { 'Retry-After': womRetryAfter(error) }); }
}
