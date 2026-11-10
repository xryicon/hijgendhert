import { z } from 'zod';

const id = z.number().int().positive();
export const leaderboardEventSchema = z.object({ id, groupId: z.number().nullable(), type: z.string(), metric: z.string(), startsAt: z.string().datetime(), endsAt: z.string().datetime(), updatedAt: z.string().optional(), metrics: z.array(z.object({ metric: z.string() })).optional() });
const detailSchema = leaderboardEventSchema.extend({ participations: z.array(z.object({
  playerId: id.optional(), player: z.object({ id }).optional(),
  deltas: z.array(z.object({ metric: z.string(), values: z.object({ gained: z.number().finite() }) })),
})).max(5000) });
export type LeaderboardEvent = { id: number; sourceRevision: string; fetchedAt: string; results: { playerId: number; place: number }[] };
export type LeaderboardRow = { playerId: number; events: number; averagePlace: number | null; position: number | null };
export type EventLeaderboard = { rows: LeaderboardRow[]; totalEvents: number; loadedEvents: number; complete: boolean; stale: boolean; retryAfter: number; fetchedAt: string };
export const eventRevision = (event: z.infer<typeof leaderboardEventSchema>) => `${event.updatedAt || ''}:${event.endsAt}:${event.metric}:${(event.metrics || []).map(m => m.metric).join(',')}`;
export function summarizeLeaderboardEvent(input: unknown, fetchedAt: string, sourceRevision: string, now = Date.now()): LeaderboardEvent {
  const detail = detailSchema.parse(input);
  if (detail.groupId !== 7059 || detail.type !== 'classic' || Date.parse(detail.endsAt) > now || Date.parse(detail.endsAt) > Date.parse(fetchedAt)) throw new Error('Nog geen einduitslag');
  const metric = (detail.metrics?.length || 0) > 1 ? 'total' : detail.metric;
  const seen = new Set<number>();
  const scores = detail.participations.flatMap(p => {
    const playerId = p.player?.id || p.playerId;
    if (!playerId || (p.playerId && p.player && p.playerId !== p.player.id) || seen.has(playerId)) throw new Error('Ongeldige deelnemerslijst');
    seen.add(playerId);
    const gained = p.deltas.find(d => d.metric === metric)?.values.gained;
    if (gained === undefined) throw new Error('Onvolledige uitslag');
    return gained > 0 ? [{ playerId, gained }] : [];
  }).sort((a, b) => b.gained - a.gained || a.playerId - b.playerId);
  let place = 0;
  return { id: detail.id, fetchedAt, sourceRevision, results: scores.map((score, index) => {
    if (!index || score.gained !== scores[index - 1].gained) place = index + 1;
    return { playerId: score.playerId, place };
  }) };
}
export function eventLeaderboardRows(playerIds: number[], events: LeaderboardEvent[], complete: boolean): LeaderboardRow[] {
  const sums = new Map(playerIds.map(id => [id, { count: 0, sum: 0 }]));
  for (const event of new Map(events.map(event => [event.id, event])).values()) for (const result of event.results) {
    const value = sums.get(result.playerId);
    if (value) { value.count++; value.sum += result.place; }
  }
  const rows = [...sums].map(([playerId, value]) => ({ playerId, events: value.count, averagePlace: value.count ? value.sum / value.count : null, position: null as number | null }))
    .sort((a, b) => (a.averagePlace ?? Infinity) - (b.averagePlace ?? Infinity) || b.events - a.events || a.playerId - b.playerId);
  let position = 0;
  rows.forEach((row, index) => {
    if (!row.events || !complete) return;
    if (!index || row.averagePlace !== rows[index - 1].averagePlace || row.events !== rows[index - 1].events) position = index + 1;
    row.position = position;
  });
  return rows;
}
