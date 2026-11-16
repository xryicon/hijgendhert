import { z } from 'zod';
import type { Team } from './warships';

export const womPlayerId = z.number().int().positive();
export const teamPlayerIds = z.array(womPlayerId).min(2).max(100).refine(ids => new Set(ids).size === ids.length, 'Kies iedere speler één keer.');
export const captainIdsSchema = z.tuple([womPlayerId, womPlayerId]);
export type SeaPlayer = { id: number; username: string; rsn: string; ehb: number | null; updatedAt: string | null };
export type SeaRoster = { players: SeaPlayer[]; fetchedAt: string; stale: boolean };
export type SeaTeamPlayer = SeaPlayer & { team: Team; captain: boolean };
export type SeaTeamDraw = {
  id: string; at: string; mode: 'random' | 'captains' | 'manual'; players: SeaTeamPlayer[];
  fetchedAt: string; stale: boolean;
};
export type SeaDrawLog = { id: string; at: string; mode: SeaTeamDraw['mode']; captains: string[]; totals: number[]; gap: number; confirmed: boolean };

// Rejection sampling avoids modulo bias. The server, never the browser, draws.
function randomSource(): (max: number) => number {
  // Request-local batching avoids a native crypto call for every tied partition.
  const bytes = new Uint32Array(256); let index = bytes.length;
  return max => {
    const limit = Math.floor(4294967296 / max) * max; let value: number;
    do { if (index === bytes.length) { crypto.getRandomValues(bytes); index = 0; } value = bytes[index++]; } while (value >= limit);
    return value % max;
  };
}
function shuffled<T>(input: T[], random: (max: number) => number) {
  const values = [...input];
  for (let i = values.length - 1; i > 0; i--) { const j = random(i + 1); [values[i], values[j]] = [values[j], values[i]]; }
  return values;
}
export function teamBalance(players: { team: Team; ehb: number | null }[]) {
  const totals = ([0, 1] as Team[]).map(t => Math.round(players.filter(p => p.team === t).reduce((sum, p) => sum + (p.ehb ?? 0), 0) * 100) / 100);
  const sizes = ([0, 1] as Team[]).map(t => players.filter(p => p.team === t).length);
  const missing = players.filter(p => p.ehb === null).length;
  const gap = Math.round(Math.abs(totals[0] - totals[1]) * 100) / 100;
  const percent = totals[0] + totals[1] ? gap / ((totals[0] + totals[1]) / 2) * 100 : 0;
  return { totals, sizes, missing, gap, percent };
}

/** Equal-size teams, captains fixed on opposite sides, minimise total EHB gap.
 * Up to 20 players: exact search, reservoir-sampled ties. Larger pools: bounded
 * multi-start pair swapping; report the best found split, not a global guarantee.
 */
export function balancedTeams(players: SeaPlayer[], captains: [number, number] | null, random: (max: number) => number = randomSource()): SeaTeamPlayer[] {
  if (players.length < 2 || players.length > 100 || new Set(players.map(p => p.id)).size !== players.length) throw new Error('Kies 2 tot 100 verschillende clanleden.');
  if (players.some(p => p.ehb === null || !Number.isFinite(p.ehb) || p.ehb < 0 || p.ehb > 10000000)) throw new Error('EHB ontbreekt bij een speler. Kies een handmatige indeling of probeer later opnieuw.');
  const order = shuffled(players, random);
  const ids = captains || [order[0].id, order[1].id];
  const leaders = ids.map(id => players.find(p => p.id === id));
  if (ids[0] === ids[1] || leaders.some(p => !p)) throw new Error('Kies twee verschillende kapiteins uit de selectie.');
  const [a, b] = leaders as [SeaPlayer, SeaPlayer];
  const rest = order.filter(p => !ids.includes(p.id));
  const weight = (p: SeaPlayer) => Math.round(p.ehb! * 100);
  const total = players.reduce((sum, p) => sum + weight(p), 0);
  let best: number[] = [], bestGap = Infinity, ties = 0;
  const consider = (chosen: number[], sum: number) => {
    const gap = Math.abs(2 * sum - total);
    if (gap < bestGap) { bestGap = gap; best = [...chosen]; ties = 1; }
    else if (gap === bestGap && random(++ties) === 0) best = [...chosen];
  };
  const sizes = [...new Set([Math.floor(players.length / 2), Math.ceil(players.length / 2)])];
  for (const size of sizes) {
    if (!rest.length || rest.every(p => weight(p) === weight(rest[0]))) {
      consider(rest.slice(0, size - 1).map(p => p.id), weight(a) + (size - 1) * (rest.length ? weight(rest[0]) : 0));
    } else if (players.length <= 20) {
      const visit = (index: number, chosen: number[], sum: number) => {
        if (chosen.length === size - 1) { consider(chosen, sum); return; }
        if (rest.length - index < size - 1 - chosen.length) return;
        chosen.push(rest[index].id); visit(index + 1, chosen, sum + weight(rest[index])); chosen.pop();
        visit(index + 1, chosen, sum);
      };
      visit(0, [], weight(a));
    } else {
      for (let trial = 0; trial < 24; trial++) {
        const pool = shuffled(rest, random);
        const left = pool.slice(0, size - 1), right = pool.slice(size - 1);
        let sum = weight(a) + left.reduce((s, p) => s + weight(p), 0);
        for (let step = 0; step < 24; step++) {
          let improvement = Math.abs(2 * sum - total), pair: [number, number] | null = null;
          for (let i = 0; i < left.length; i++) for (let j = 0; j < right.length; j++) {
            const gap = Math.abs(2 * (sum - weight(left[i]) + weight(right[j])) - total);
            if (gap < improvement) { improvement = gap; pair = [i, j]; }
          }
          if (!pair) break;
          const [i, j] = pair; sum += weight(right[j]) - weight(left[i]); [left[i], right[j]] = [right[j], left[i]];
        }
        consider(left.map(p => p.id), sum);
      }
    }
  }
  const left = new Set([a.id, ...best]);
  return order.map(p => ({ ...p, team: left.has(p.id) ? 0 : 1, captain: ids.includes(p.id) }));
}

export function manualTeams(players: SeaPlayer[], teams: [number[], number[]], captains: [number, number]): SeaTeamPlayer[] {
  const ids = teams.flat();
  if (teams.some(t => !t.length || t.length > 50) || new Set(ids).size !== ids.length || ids.length !== players.length || !teams.every((t, i) => t.includes(captains[i])) || captains[0] === captains[1] || players.some(p => !ids.includes(p.id))) throw new Error('Elke speler hoort bij één team, met één kapitein per team.');
  return players.map(p => ({ ...p, team: teams[0].includes(p.id) ? 0 : 1, captain: captains.includes(p.id) }));
}
