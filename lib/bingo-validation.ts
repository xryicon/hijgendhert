import { z } from 'zod';
const short = (max: number) => z.string().trim().min(1).max(max);
const tile = z.object({ title: short(80), description: z.string().trim().max(350), target: z.number().int().min(1).max(100000000), points: z.number().int().min(1).max(1000), category: z.enum(['boss', 'drop', 'skill', 'other']) });
export const bingoConfigSchema = z.object({ title: short(100), description: z.string().trim().max(500), rules: z.string().trim().max(3000), startsAt: z.string().datetime(), endsAt: z.string().datetime(), teams: z.tuple([short(35), short(35)]), tiles: z.array(tile).length(25) }).superRefine((v, ctx) => {
  if (Date.parse(v.endsAt) <= Date.parse(v.startsAt)) ctx.addIssue({ code: 'custom', message: 'De eindtijd moet na de starttijd liggen.', path: ['endsAt'] });
  if (v.teams[0].toLowerCase() === v.teams[1].toLowerCase()) ctx.addIssue({ code: 'custom', message: 'Geef de twee teams verschillende namen.', path: ['teams'] });
});
const reference = { eventId: z.string().uuid(), version: z.number().int().min(1) };
const evidence = z.string().trim().max(2048).refine(s => { if (!s) return true; try { const url = new URL(s); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } }, 'Gebruik een volledige https-link voor het bewijs.');
export const bingoActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), config: bingoConfigSchema }),
  z.object({ action: z.literal('edit'), ...reference, config: bingoConfigSchema }),
  z.object({ action: z.literal('publish'), ...reference }),
  z.object({ action: z.literal('hide'), ...reference }),
  z.object({ action: z.literal('finish'), ...reference }),
  z.object({ action: z.literal('progress'), ...reference, team: z.number().int().min(0).max(1), tile: z.number().int().min(0).max(24), count: z.number().int().min(0).max(100000000), note: z.string().trim().max(500), evidence }),
]);
