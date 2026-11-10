import { z } from 'zod';
import { localDay, SKILLS } from './community';

const id = z.number().int().positive();
export const leaderboardEventSchema = z.object({ id, groupId: z.number().nullable(), type: z.string(), metric: z.string(), startsAt: z.string().datetime(), endsAt: z.string().datetime(), updatedAt: z.string().optional(), metrics: z.array(z.object({ metric: z.string() })).optional() });
const detailSchema = leaderboardEventSchema.extend({ participations: z.array(z.object({
  playerId: id.optional(), player: z.object({ id }).optional(),
  teamName: z.string().trim().min(1).nullable().optional(),
  deltas: z.array(z.object({ metric: z.string(), values: z.object({ gained: z.number().finite() }) })),
})).max(5000) });
export type LeaderboardEvent = { id: number; sourceRevision: string; fetchedAt: string; results: { playerId: number; place: number }[] };
export type LeaderboardRow = { playerId: number; events: number; averagePlace: number | null; position: number | null };
export const LEADERBOARD_MIN_EVENTS = 5;
export type EventLeaderboard = { rows: LeaderboardRow[]; minimumEvents: number; totalEvents: number; loadedEvents: number; totalCompetitions?: number; loadedCompetitions?: number; complete: boolean; stale: boolean; retryAfter: number; fetchedAt: string };
type Competition = z.infer<typeof leaderboardEventSchema>;
export function leaderboardRoundKey(event: Competition) {
  const family = event.type === 'team' ? 'team' : SKILLS.has(event.metric) ? 'skill' : ['ehp', 'ehb'].includes(event.metric) ? event.metric : 'boss';
  return `${family}:${localDay(event.startsAt)}:${localDay(event.endsAt)}`;
}
export function leaderboardRounds(catalogue: Competition[], now = Date.now()): Competition[][] {
  const rounds = new Map<string, Map<string, Competition>>();
  for (const event of [...catalogue].sort((a, b) => a.id - b.id)) {
    if (event.groupId !== 7059 || !['classic', 'team'].includes(event.type) || Date.parse(event.endsAt) > now) continue;
    const key = leaderboardRoundKey(event);
    const parts = rounds.get(key) || new Map<string, Competition>();
    // Same metric and event period is one tracker, even if WOM contains a duplicate.
    const metric = (event.metrics?.length ? event.metrics.map(m => m.metric) : [event.metric]).sort().join(',');
    if (!parts.has(metric)) parts.set(metric, event);
    rounds.set(key, parts);
  }
  return [...rounds.values()].map(parts => [...parts.values()]).sort((a, b) => Date.parse(b[0].endsAt) - Date.parse(a[0].endsAt));
}
export function summarizeLeaderboardRounds(rounds: Competition[][], saved: Map<number, LeaderboardEvent>): LeaderboardEvent[] {
  return rounds.flatMap(parts => {
    const summaries = parts.map(event => saved.get(event.id)).filter((summary, index): summary is LeaderboardEvent => !!summary && summary.sourceRevision === eventRevision(parts[index]));
    // A half-loaded multi-boss week must not become a complete participation.
    if (summaries.length !== parts.length) return [];
    const scores = new Map<number, { sum: number; count: number }>();
    for (const summary of summaries) for (const result of summary.results) {
      const score = scores.get(result.playerId) || { sum: 0, count: 0 };
      score.sum += result.place; score.count++;
      scores.set(result.playerId, score);
    }
    return [{ id: Math.min(...parts.map(p => p.id)), sourceRevision: summaries.map(s => s.sourceRevision).join('|'),
      fetchedAt: summaries.map(s => s.fetchedAt).sort()[0],
      results: [...scores].map(([playerId, score]) => ({ playerId, place: score.sum / score.count })) }];
  });
}
export const eventRevision = (event: z.infer<typeof leaderboardEventSchema>) => `${event.updatedAt || ''}:${event.endsAt}:${event.metric}:${(event.metrics || []).map(m => m.metric).join(',')}`;
export function summarizeLeaderboardEvent(input: unknown, fetchedAt: string, sourceRevision: string, now = Date.now()): LeaderboardEvent {
  const detail = detailSchema.parse(input);
  if (detail.groupId !== 7059 || !['classic', 'team'].includes(detail.type) || Date.parse(detail.endsAt) > now || Date.parse(detail.endsAt) > Date.parse(fetchedAt)) throw new Error('Nog geen einduitslag');
  const metric = (detail.metrics?.length || 0) > 1 ? 'total' : detail.metric;
  const seen = new Set<number>();
  const scores = detail.participations.flatMap(p => {
    const playerId = p.player?.id || p.playerId;
    if (!playerId || (p.playerId && p.player && p.playerId !== p.player.id) || seen.has(playerId)) throw new Error('Ongeldige deelnemerslijst');
    seen.add(playerId);
    const gained = p.deltas.find(d => d.metric === metric)?.values.gained;
    if (gained === undefined) throw new Error('Onvolledige uitslag');
    if (detail.type === 'team' && gained > 0 && !p.teamName) throw new Error('Onvolledige teamuitslag');
    return gained > 0 ? [{ playerId, gained, teamName: p.teamName }] : [];
  }).sort((a, b) => b.gained - a.gained || a.playerId - b.playerId);
  if (detail.type === 'team') {
    const totals = new Map<string, number>();
    for (const score of scores) totals.set(score.teamName!, (totals.get(score.teamName!) || 0) + score.gained);
    const teams = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const places = new Map<string, number>(); let place = 0;
    teams.forEach(([team, gained], index) => { if (!index || gained !== teams[index - 1][1]) place = index + 1; places.set(team, place); });
    return { id: detail.id, fetchedAt, sourceRevision, results: scores.map(score => ({ playerId: score.playerId, place: places.get(score.teamName!)! })) };
  }
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
    .sort((a, b) => b.events - a.events || a.playerId - b.playerId);
  rows.forEach((row, index) => {
    if (row.events < LEADERBOARD_MIN_EVENTS || !complete) return;
    row.position = index + 1;
  });
  return rows;
}
