export type Competition = { id: number; title: string; metric: string; type?: string; groupId?: number; startsAt: string; endsAt: string; participantCount: number; metrics?: { metric: string }[] };
export type Winner = { id: number; username: string; displayName: string; gained: number };
export type CompetitionDetail = Competition & { participations: { player: { id: number; username: string; displayName: string }; deltas: { metric: string; values: { gained: number } }[] }[] };
export type Award = Competition & { category: string; unit: string; winners: Winner[]; unavailable?: boolean };
export const SKILLS = new Set(['overall', 'attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking', 'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving', 'slayer', 'farming', 'runecrafting', 'hunter', 'construction', 'sailing']);
export function localDay(value: string | number | Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k)!.value).join('-');
}
export const monthKey = (value: string | number | Date) => localDay(value).slice(0, 7);
export function categoryOf(c: Competition) { return SKILLS.has(c.metric) ? 'skill' : /\bbotw\b|boss of the week/i.test(c.title) ? 'boss' : 'other'; }
export function unitOf(c: Competition) { return (c.metrics?.length || 0) > 1 ? 'punten' : SKILLS.has(c.metric) ? 'XP' : ['ehb', 'ehp'].includes(c.metric) ? 'uur' : 'kills'; }
export function awardFrom(detail: CompetitionDetail): Award {
  const metric = (detail.metrics?.length || 0) > 1 ? 'total' : detail.metric;
  const ranked = detail.participations.flatMap(p => {
    const gained = p.deltas?.find(d => d.metric === metric)?.values.gained;
    return typeof gained === 'number' && Number.isFinite(gained) && gained > 0 ? [{ id: p.player.id, username: p.player.username, displayName: p.player.displayName, gained }] : [];
  });
  const best = Math.max(0, ...ranked.map(p => p.gained));
  const { participations: _participants, ...competition } = detail;
  return { ...competition, category: categoryOf(detail), unit: unitOf(detail), winners: ranked.filter(p => p.gained === best) };
}
export function monthlyLeaders(awards: Award[]) {
  const wins = new Map<number, Winner & { wins: number }>();
  for (const award of awards) for (const winner of award.winners) wins.set(winner.id, { ...winner, wins: (wins.get(winner.id)?.wins || 0) + 1 });
  const most = Math.max(0, ...Array.from(wins.values(), p => p.wins));
  return Array.from(wins.values()).filter(p => p.wins === most).sort((a, b) => a.displayName.localeCompare(b.displayName));
}
export type Activity = { id: string; title: string; category: 'raid' | 'boss' | 'social'; startsAt: string; endsAt: string; description: string; discordUrl: string; host?: string };
export type ClanMoment = { id: string; title: string; category: 'drop' | 'pet' | 'milestone'; player: string; date: string; description: string; image: string; imageAlt: string };
export type CalendarEntry = { id: string; title: string; category: string; startsAt: string; endsAt: string; description: string; url: string; source: 'wom' | 'clan'; host?: string };
export const overlapsDay = (event: CalendarEntry, day: string) => localDay(event.startsAt) <= day && localDay(event.endsAt) >= day;
