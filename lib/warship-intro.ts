import { z } from 'zod';
import { SEA_BRIEFING } from './warship-briefing';
import type { WarshipConfig } from './warships';

export const seaRuleSchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-zA-Z0-9-]+$/),
  title: z.string().trim().min(1).max(80), text: z.string().trim().min(1).max(360),
  seconds: z.number().int().min(8).max(45),
}).strict();
export const seaRulesSchema = z.array(seaRuleSchema).min(1).max(12).refine(rules => new Set(rules.map(r => r.id)).size === rules.length, 'Iedere regel moet uniek zijn.');
export type SeaRule = z.infer<typeof seaRuleSchema>;
export const defaultSeaRules = (): SeaRule[] => SEA_BRIEFING.map(r => ({ id: r.id, title: r.title, text: r.text, seconds: Math.ceil(r.durationMs / 1000) }));
export type SeaIntroSlide =
  | { kind: 'rule'; id: string; title: string; text: string; durationMs: number }
  | { kind: 'drop'; id: string; boss: string; item: string; shots: number; limit: number; durationMs: number }
  | { kind: 'hidden_drop'; id: string; durationMs: number };
export const DROP_REVEAL_MS = 8000;
export function seaIntroSlides(rules: SeaRule[], objectives: WarshipConfig['objectives']): SeaIntroSlide[] {
  return [...rules.map(r => ({ kind: 'rule' as const, id: `rule-${r.id}`, title: r.title, text: r.text, durationMs: r.seconds * 1000 })),
    ...objectives.map(o => ({ kind: 'drop' as const, id: o.id, boss: o.boss, item: o.item, shots: o.shots, limit: o.limit, durationMs: DROP_REVEAL_MS }))];
}
export const seaIntroDuration = (slides: SeaIntroSlide[]) => slides.reduce((sum, s) => sum + s.durationMs, 0);
export function seaIntroStep(slides: SeaIntroSlide[], elapsedMs: number) {
  if (elapsedMs < 0) return null;
  let startMs = 0;
  for (let index = 0; index < slides.length; index++) {
    const slide = slides[index];
    if (elapsedMs < startMs + slide.durationMs) return { slide, index, startMs, elapsedMs: elapsedMs - startMs };
    startMs += slide.durationMs;
  }
  return null;
}
export function seaIntroAudience(slides: SeaIntroSlide[], elapsedMs: number, staff: boolean) {
  let startMs = 0;
  return slides.map(slide => {
    const hidden = !staff && slide.kind === 'drop' && elapsedMs < startMs;
    startMs += slide.durationMs;
    return hidden ? { kind: 'hidden_drop' as const, id: slide.id, durationMs: slide.durationMs } : slide;
  });
}
