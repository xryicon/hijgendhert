import { z } from 'zod';
import { raffleNameKey } from './raffle-types';

export const raffleScheduleSchema = z.object({
  requestId: z.string().uuid(),
  title: z.string().trim().min(3).max(80),
  prize: z.string().trim().max(160),
  freeEntry: z.literal(true),
  drawAt: z.number().int().positive(),
  entries: z.array(z.object({
    name: z.string().trim().min(1).max(30).refine(value => !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value), 'Gebruik een leesbare naam.'),
    tickets: z.number().int().min(1).max(10_000),
  }).strict()).min(1).max(500),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>();
  for (const [index, entry] of value.entries.entries()) {
    const key = raffleNameKey(entry.name);
    if (seen.has(key)) ctx.addIssue({ code: 'custom', message: `De naam ${entry.name} staat meer dan één keer in de lijst.`, path: ['entries', index, 'name'] });
    seen.add(key);
  }
  if (value.entries.reduce((total, entry) => total + entry.tickets, 0) > 1_000_000) ctx.addIssue({ code: 'custom', message: 'Gebruik maximaal 1.000.000 gratis loten per trekking.', path: ['entries'] });
});
export const raffleCancellationSchema = z.object({
  id: z.string().uuid(), reason: z.string().trim().min(5).max(200),
}).strict();
