import { z } from 'zod';
import { SKILLS } from './community';
import { metricLabel, metricKeys } from './osrs-metrics';

export const EVENT_CATEGORIES = { skill: 'Skill-event', boss: 'Boss-event', raid: 'Raid', bingo: 'Bingo', social: 'Clanavond', other: 'Ander event' } as const;
const activities = new Set(['combat', 'bounty_hunter_hunter', 'bounty_hunter_rogue', 'clue_scrolls_all', 'clue_scrolls_beginner', 'clue_scrolls_easy', 'clue_scrolls_medium', 'clue_scrolls_hard', 'clue_scrolls_elite', 'clue_scrolls_master', 'collections_logged', 'colosseum_glory', 'ehp', 'ehb', 'guardians_of_the_rift', 'last_man_standing', 'league_points', 'pvp_arena', 'soul_wars_zeal', 'tt200m', 'ttm']);
export const skillOptions = [...SKILLS].filter(key => metricKeys.includes(key)).map(value => ({ value, label: value === 'overall' ? 'Totale XP (alle skills)' : metricLabel(value) }));
export const bossOptions = [{ value: 'all_bosses', label: 'Alle bosses samen' }, ...metricKeys.filter(key => !SKILLS.has(key) && !activities.has(key)).map(value => ({ value, label: metricLabel(value) }))];
export const minimumSchema = z.object({
  unit: z.enum(['xp', 'kc']), metric: z.string().min(1).max(80), amount: z.number().int().min(1).max(10_000_000_000),
}).strict().superRefine((value, ctx) => {
  const options = value.unit === 'xp' ? skillOptions : bossOptions;
  if (!options.some(option => option.value === value.metric)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Kies een geldige skill voor XP of een boss voor KC.' });
  if (value.unit === 'kc' && value.amount > 10_000_000) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Het KC-minimum is te hoog.' });
});
export type EventMinimum = z.infer<typeof minimumSchema>;
export type EventProgress = { revision: number; gained: number | null; qualified: boolean | null; updatedAt: string | null };
export const eventResultSchema = z.object({
  eventId: z.string().uuid(), userId: z.string().regex(/^\d{17,20}$/), revision: z.number().int().nonnegative(), gained: z.number().int().min(0).max(10_000_000_000).nullable(),
}).strict();
export type EventResultInput = z.infer<typeof eventResultSchema>;
export function minimumLabel(minimum?: EventMinimum | null) {
  if (!minimum) return 'Geen minimum';
  const target = minimum.metric === 'overall' ? 'totale XP' : minimum.metric === 'all_bosses' ? 'alle bosses samen' : metricLabel(minimum.metric);
  return `${minimum.amount.toLocaleString('nl-NL')} ${minimum.unit.toUpperCase()} · ${target}`;
}
export function progressFor(minimum: EventMinimum | null | undefined, result?: { revision: number; gained: number | null; updatedAt: string }): EventProgress {
  return { revision: result?.revision || 0, gained: result?.gained ?? null, qualified: minimum && result?.gained !== null && result?.gained !== undefined ? result.gained >= minimum.amount : null, updatedAt: result?.updatedAt || null };
}
