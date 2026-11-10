import { z } from 'zod';
import { metricName } from './profile-progress';
import type { MemberEvent } from './member-types';

export type MemberActivity = { id: string; kind: 'level' | 'boss' | 'event'; title: string; detail: string; at: string; since: string | null };
const snapshotSchema = z.object({
  playerId: z.number().int(), createdAt: z.string(),
  data: z.object({ skills: z.record(z.unknown()).optional(), bosses: z.record(z.unknown()).optional() }),
});
const counter = (value: unknown, key: string) => {
  const parsed = z.object({ [key]: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).safeParse(value);
  return parsed.success ? parsed.data[key] : null;
};
const fmt = (n: number) => new Intl.NumberFormat('nl-NL').format(n);

// These are changes observed between snapshots, never claims about exact in-game times.
export function memberActivities(rows: unknown[], playerId: number, events: MemberEvent[] = [], now = Date.now()): MemberActivity[] {
  const byDate = new Map<string, z.infer<typeof snapshotSchema>>();
  for (const row of rows) {
    const parsed = snapshotSchema.safeParse(row);
    if (!parsed.success || parsed.data.playerId !== playerId) continue;
    const time = Date.parse(parsed.data.createdAt);
    if (!Number.isFinite(time) || time > now) continue;
    byDate.set(new Date(time).toISOString(), parsed.data);
  }
  const snapshots = [...byDate.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const result: MemberActivity[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const before = snapshots[i - 1], after = snapshots[i];
    for (const [metric, value] of Object.entries(after.data.skills || {})) {
      if (metric === 'overall' || !/^[a-z_]{1,40}$/.test(metric)) continue;
      const previous = counter(before.data.skills?.[metric], 'level'), current = counter(value, 'level');
      if (previous === null || current === null || previous < 1 || current > 99 || current <= previous) continue;
      result.push({ id: `level:${metric}:${after.createdAt}`, kind: 'level', title: `${metricName(metric)} level ${current}`,
        detail: `Level ${previous} → ${current}`, at: after.createdAt, since: before.createdAt });
    }
    for (const [metric, value] of Object.entries(after.data.bosses || {})) {
      if (!/^[a-z][a-z0-9_]{0,79}$/.test(metric)) continue;
      const previous = counter(before.data.bosses?.[metric], 'kills'), current = counter(value, 'kills');
      if (previous === null || current === null || current <= previous) continue;
      result.push({ id: `boss:${metric}:${after.createdAt}`, kind: 'boss', title: `${metricName(metric)} · +${fmt(current - previous)} KC`,
        detail: `${fmt(current)} kills in totaal`, at: after.createdAt, since: before.createdAt });
    }
  }
  for (const event of events) {
    if (event.status !== 'finished' || !(event.gained !== null && event.gained > 0) || !Number.isFinite(Date.parse(event.endsAt)) || Date.parse(event.endsAt) > now) continue;
    result.push({ id: `event:${event.id}`, kind: 'event', title: event.title,
      detail: `${event.rank ? `Plaats ${event.rank} · ` : ''}+${fmt(event.gained)} ${event.unit}`, at: event.endsAt, since: null });
  }
  return [...new Map(result.map(entry => [entry.id, entry])).values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id)).slice(0, 10);
}
