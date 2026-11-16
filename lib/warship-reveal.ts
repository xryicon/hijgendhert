import type { SeaTeamDraw } from './warship-teams';
import type { WarshipGame } from './warships';
export const REVEAL_INTRO_MS = 4000;
export const REVEAL_STEP_MS = 2600;
export const REVEAL_SPIN_MS = 1800;
export const REVEAL_OUTRO_MS = 2000;
export type SeaReveal = { drawId: string; at: string; opensAt: string; headline: string; message: string; startedAt: string | null; completedAt: string | null };
export const revealSequence = (draw: SeaTeamDraw) => [draw.players.find(p => p.captain && p.team === 0)!, draw.players.find(p => p.captain && p.team === 1)!, ...draw.players.filter(p => !p.captain)];
export const revealDuration = (players: number) => REVEAL_INTRO_MS + players * REVEAL_STEP_MS + REVEAL_OUTRO_MS;
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
export function revealView(g: WarshipGame, signedIn: boolean, now = Date.now()) {
  const reveal = g.reveal, draw = g.teamAssignment;
  if (!reveal || !draw || g.status === 'cancelled') return null;
  const elapsed = now - Date.parse(reveal.at), sequence = revealSequence(draw);
  const phase = elapsed < 0 ? 'countdown' as const : now < Date.parse(reveal.opensAt) ? 'drawing' as const : 'open' as const;
  const index = Math.floor((elapsed - REVEAL_INTRO_MS) / REVEAL_STEP_MS);
  const landed = elapsed >= REVEAL_INTRO_MS && (elapsed - REVEAL_INTRO_MS) % REVEAL_STEP_MS >= REVEAL_SPIN_MS;
  const current = phase === 'drawing' && index >= 0 && index < sequence.length ? sequence[index] : null;
  const count = phase === 'open' ? sequence.length : Math.max(0, Math.min(sequence.length, index + (landed ? 1 : 0)));
  // Expose only the current spin and past reveals, never future assignments.
  const person = (p: typeof sequence[number]) => ({ id: p.id, rsn: p.rsn, team: p.team, captain: p.captain });
  return { drawId: reveal.drawId, at: reveal.at, opensAt: reveal.opensAt, headline: reveal.headline, message: reveal.message,
    phase, count: sequence.length, index, mode: draw.mode,
    pool: signedIn ? draw.players.map(p => ({ id: p.id, rsn: p.rsn })).sort((a, b) => a.rsn.localeCompare(b.rsn)) : [],
    current: signedIn && current ? person(current) : null,
    revealed: signedIn ? sequence.slice(0, count).map(person) : [],
  };
}
