import { z } from 'zod';
import type { MemberEvent } from './member-types';
import { clanRank, rankLabel, rankSymbol } from './osrs-ranks';

export const rankStepSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
  name: z.string().trim().min(1).max(32),
  events: z.number().int().min(0).max(10000),
}).strict();
export const rankRulesSchema = z.object({
  revision: z.number().int().nonnegative(),
  steps: z.array(rankStepSchema).min(2).max(12),
}).strict().superRefine(({ steps }, ctx) => {
  if (steps[0].events !== 0 || steps.some((s, i) => i > 0 && s.events <= steps[i - 1].events))
    ctx.addIssue({ code: 'custom', message: 'Begin bij 0 events en gebruik daarna oplopende aantallen.' });
  if (new Set(steps.map(s => s.id)).size !== steps.length || new Set(steps.map(s => s.name.toLowerCase())).size !== steps.length)
    ctx.addIssue({ code: 'custom', message: 'Iedere rang moet een unieke naam en code hebben.' });
});
export const memberRankSchema = z.object({
  playerId: z.number().int().positive(), revision: z.number().int().nonnegative(),
  rankOverride: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/).nullable(),
  eventAdjustment: z.number().int().min(-10000).max(10000),
  reason: z.string().trim().min(5).max(300),
}).strict();
export type RankStep = z.infer<typeof rankStepSchema>;
export type RankRules = { revision: number; steps: RankStep[]; configured: boolean; updatedAt: string | null };
export type PlayerProgressState = {
  revision: number; rankOverride: string | null; eventAdjustment: number;
  reason: string | null; updatedAt: string | null; events: MemberEvent[];
};
export type BossRecord = { metric: string; name: string; kills: number; rank: number | null };
export type BossProfile = { favourite: BossRecord | null; top: BossRecord[]; totalKills: number; trackedBosses: number; updatedAt: string | null };
export type RankProgress = {
  current: { id: string; name: string }; source: 'wise-old-man';
  next: RankStep | null; confirmedEvents: number; eventAdjustment: number; totalEvents: number;
  pendingEvents: number; remaining: number | null; percent: number | null; ready: boolean;
  rules: RankRules; stateRevision: number; rankOverride: string | null; adjustmentReason: string | null;
};
export const DEFAULT_RANK_RULES: RankRules = {
  revision: 0, configured: false, updatedAt: null,
  steps: [
    { id: 'recruit', name: 'Rekruut', events: 0 }, { id: 'corporal', name: 'Korporaal', events: 5 },
    { id: 'sergeant', name: 'Sergeant', events: 10 }, { id: 'lieutenant', name: 'Luitenant', events: 20 },
    { id: 'captain', name: 'Kapitein', events: 35 }, { id: 'general', name: 'Generaal', events: 50 },
  ],
};
export const EMPTY_PLAYER_PROGRESS: PlayerProgressState = { revision: 0, rankOverride: null, eventAdjustment: 0, reason: null, updatedAt: null, events: [] };
export const metricName = (metric: string) => ({ kreearra: "Kree'arra", kril_tsutsaroth: "K'ril Tsutsaroth", tzkal_zuk: 'TzKal-Zuk', tztok_jad: 'TzTok-Jad' } as Record<string, string>)[metric] || metric.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export function bossProfile(value: unknown, playerId: number): BossProfile {
  const parsed = z.object({ id: z.literal(playerId), latestSnapshot: z.object({
    createdAt: z.string(), data: z.object({ bosses: z.record(z.unknown()) }),
  }).nullable() }).parse(value);
  const top: BossRecord[] = [];
  for (const [metric, entry] of Object.entries(parsed.latestSnapshot?.data.bosses || {})) {
    if (!/^[a-z][a-z0-9_]{0,79}$/.test(metric)) continue;
    const result = z.object({ kills: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), rank: z.number().int().nullish() }).safeParse(entry);
    if (result.success) top.push({ metric, name: metricName(metric), kills: result.data.kills, rank: result.data.rank && result.data.rank > 0 ? result.data.rank : null });
  }
  top.sort((a, b) => b.kills - a.kills || a.metric.localeCompare(b.metric));
  return { favourite: top[0] || null, top: top.slice(0, 3), totalKills: top.reduce((sum, boss) => sum + boss.kills, 0), trackedBosses: top.length,
    updatedAt: parsed.latestSnapshot && Number.isFinite(Date.parse(parsed.latestSnapshot.createdAt)) ? parsed.latestSnapshot.createdAt : null };
}
export function mergeEventResults(events: MemberEvent[], saved: MemberEvent[]): MemberEvent[] {
  const known = new Map(saved.map(e => [e.id, e]));
  return events.map(e => e.gained === null && e.status === 'finished' && known.has(e.id) ? known.get(e.id)! : e);
}
export function rankProgress(role: string, events: MemberEvent[], state: PlayerProgressState, rules: RankRules): RankProgress {
  // Old overrides remain in stored audit data, but never replace the WOM rank.
  const current = clanRank(role) || { id: '', name: 'Rang onbekend' };
  rules = { ...rules, steps: rules.steps.map(step => rankSymbol(step.id) ? { ...step, name: rankLabel(step.id) } : step) };
  const index = rules.steps.findIndex(s => s.id === current.id);
  const next = index >= 0 ? rules.steps[index + 1] || null : null;
  const confirmedEvents = new Set(events.filter(e => e.status === 'finished' && e.gained !== null && e.gained > 0).map(e => e.id)).size;
  const totalEvents = Math.max(0, confirmedEvents + state.eventAdjustment);
  const floor = index >= 0 ? rules.steps[index].events : 0;
  return { current, source: 'wise-old-man', next, confirmedEvents,
    eventAdjustment: state.eventAdjustment, totalEvents,
    pendingEvents: events.filter(e => e.status === 'finished' && e.gained === null).length,
    remaining: next ? Math.max(0, next.events - totalEvents) : null,
    percent: next ? Math.round(Math.max(0, Math.min(1, (totalEvents - floor) / (next.events - floor))) * 100) : null,
    ready: !!next && totalEvents >= next.events, rules, stateRevision: state.revision,
    rankOverride: state.rankOverride, adjustmentReason: state.reason };
}
