import type { SeaTeamDraw } from './warship-teams';
import type { WarshipGame } from './warships';
import { SEA_BRIEFING_MS } from './warship-briefing';
import { seaIntroAudience, seaIntroDuration, type SeaIntroSlide } from './warship-intro';
export const CINEMATIC_REVEAL = { introMs: 5000, stepMs: 9000, spinMs: 4000, spotlightMs: 2600, flightMs: 1100, outroMs: 5000 };
const BRIEFED_REVEAL = { ...CINEMATIC_REVEAL, introMs: SEA_BRIEFING_MS + CINEMATIC_REVEAL.introMs };
const LEGACY_REVEAL = { introMs: 4000, stepMs: 2600, spinMs: 1800, spotlightMs: 0, flightMs: 0, outroMs: 2000 };
export type SeaReveal = { drawId: string; at: string; opensAt: string; headline: string; message: string; startedAt: string | null; completedAt: string | null; pace?: 2 | 3 | 4; slides?: SeaIntroSlide[] };
// A deployment must not change the timing of an already announced round.
export const revealTiming = (reveal: SeaReveal) => reveal.pace === 4 ? { ...CINEMATIC_REVEAL, introMs: seaIntroDuration(reveal.slides || []) + 5000 } : reveal.pace === 3 ? BRIEFED_REVEAL : reveal.pace === 2 ? CINEMATIC_REVEAL : LEGACY_REVEAL;
export const revealSequence = (draw: SeaTeamDraw) => [draw.players.find(p => p.captain && p.team === 0)!, draw.players.find(p => p.captain && p.team === 1)!, ...draw.players.filter(p => !p.captain)];
export const revealDuration = (players: number, pace: 2 | 3 = 3) => (pace === 3 ? BRIEFED_REVEAL : CINEMATIC_REVEAL).introMs + players * CINEMATIC_REVEAL.stepMs + CINEMATIC_REVEAL.outroMs;
export const introRevealDuration = (players: number, slides: SeaIntroSlide[]) => seaIntroDuration(slides) + revealDuration(players, 2);
export const revealLocked = (g: WarshipGame, now = Date.now()) => !!g.reveal && g.status !== 'cancelled' && now < Date.parse(g.reveal.opensAt);
export function advanceReveal(g: WarshipGame, now = Date.now()) {
  if (!g.reveal || g.status === 'cancelled') return false;
  let changed = false;
  if (!g.reveal.startedAt && now >= Date.parse(g.reveal.at)) {
    g.reveal.startedAt = g.reveal.at; g.revision++; changed = true;
    g.audit.push({ at: g.reveal.at, actor: 'system', name: 'Hijgend Hert', action: 'reveal_started' });
  }
  if (!g.reveal.completedAt && now >= Date.parse(g.reveal.opensAt)) {
    g.reveal.completedAt = g.reveal.opensAt; g.revision++; changed = true;
    g.audit.push({ at: g.reveal.opensAt, actor: 'system', name: 'Hijgend Hert', action: 'reveal_completed' });
  }
  return changed;
}
export function revealView(g: WarshipGame, signedIn: boolean, now = Date.now(), staff = false) {
  const reveal = g.reveal, draw = g.teamAssignment;
  if (!reveal || !draw || g.status === 'cancelled') return null;
  const elapsed = now - Date.parse(reveal.at), sequence = revealSequence(draw);
  const phase = elapsed < 0 ? 'countdown' as const : now < Date.parse(reveal.opensAt) ? 'drawing' as const : 'open' as const;
  const timing = revealTiming(reveal);
  const index = Math.floor((elapsed - timing.introMs) / timing.stepMs);
  const landed = elapsed >= timing.introMs && (elapsed - timing.introMs) % timing.stepMs >= timing.spinMs + timing.spotlightMs + timing.flightMs;
  const current = phase === 'drawing' && index >= 0 && index < sequence.length ? sequence[index] : null;
  const count = phase === 'open' ? sequence.length : Math.max(0, Math.min(sequence.length, index + (landed ? 1 : 0)));
  // Expose only the current spin and past reveals, never future assignments.
  const person = (p: typeof sequence[number]) => ({ id: p.id, rsn: p.rsn, team: p.team, captain: p.captain });
  return { drawId: reveal.drawId, at: reveal.at, opensAt: reveal.opensAt, headline: reveal.headline, message: reveal.message,
    phase, count: sequence.length, index, mode: draw.mode, timing,
    briefing: reveal.pace === 3 || reveal.pace === 4 ? { durationMs: timing.introMs - 5000, firstSpinAt: new Date(Date.parse(reveal.at) + timing.introMs).toISOString(), slides: reveal.pace === 4 ? seaIntroAudience(reveal.slides || [], elapsed, staff) : null } : null,
    pool: signedIn ? draw.players.map(p => ({ id: p.id, rsn: p.rsn })).sort((a, b) => a.rsn.localeCompare(b.rsn)) : [],
    current: signedIn && current ? person(current) : null,
    revealed: signedIn ? sequence.slice(0, count).map(person) : [],
  };
}
