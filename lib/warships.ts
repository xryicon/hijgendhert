import { z } from 'zod';
import { captainIdsSchema, teamPlayerIds, womPlayerId, teamBalance, type SeaTeamDraw, type SeaDrawLog } from './warship-teams';
import { revealLocked, revealView, type SeaReveal } from './warship-reveal';

export const SEA_SIZE = 8;
export const FLEET = [{ name: 'Het Vlaggenschip', length: 4 }, { name: 'De Jager', length: 3 }, { name: 'De Stormvanger', length: 3 }, { name: 'Het Hert', length: 2 }] as const;
export type Team = 0 | 1;
export const otherTeam = (team: Team): Team => team === 0 ? 1 : 0;
const team = z.union([z.literal(0), z.literal(1)]);
const id = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const discordId = z.string().regex(/^\d{17,20}$/);
export const placementSchema = z.object({ ship: z.number().int().min(0).max(3), cell: z.number().int().min(0).max(63), vertical: z.boolean() }).strict();
export type Placement = z.infer<typeof placementSchema>;
export const objectiveSchema = z.object({ id, boss: text(60), item: text(90), shots: z.number().int().min(1).max(5), limit: z.number().int().min(1).max(20) }).strict();
export const warshipConfigSchema = z.object({
  title: text(90), description: text(1000), teams: z.tuple([text(32), text(32)]),
  endsAt: z.string().datetime({ offset: true }), objectives: z.array(objectiveSchema).min(1).max(25),
}).strict().refine(v => new Set(v.objectives.map(o => o.id)).size === v.objectives.length, 'Iedere drop moet uniek zijn.')
  .refine(v => v.teams[0].toLowerCase() !== v.teams[1].toLowerCase(), 'Geef beide teams een eigen naam.');
export type WarshipConfig = z.infer<typeof warshipConfigSchema>;
const proof = z.string().trim().max(1500).url().refine(value => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && ['discord.com', 'cdn.discordapp.com', 'media.discordapp.net', 'i.imgur.com'].includes(url.hostname);
}, 'Gebruik een Discord-bericht, Discord-afbeelding of i.imgur.com-link.');
const ref = { requestId: id, gameId: id, revision: z.number().int().nonnegative() };
export const warshipActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), requestId: id, config: warshipConfigSchema }).strict(),
  z.object({ type: z.literal('edit'), ...ref, config: warshipConfigSchema }).strict(),
  z.object({ type: z.literal('publish'), ...ref, published: z.boolean() }).strict(),
  z.object({ type: z.literal('join'), ...ref, team, rsn: z.string().trim().min(1).max(12).regex(/^[a-zA-Z0-9 _-]+$/) }).strict(),
  z.object({ type: z.literal('withdraw'), ...ref }).strict(),
  z.object({ type: z.literal('enrol'), ...ref, userId: discordId, accept: z.boolean() }).strict(),
  z.object({ type: z.literal('remove_member'), ...ref, userId: discordId }).strict(),
  z.object({ type: z.literal('captain'), ...ref, userId: discordId }).strict(),
  z.object({ type: z.literal('fleet'), ...ref, placements: z.array(placementSchema).length(4), locked: z.boolean() }).strict(),
  z.object({ type: z.literal('start'), ...ref }).strict(),
  z.object({ type: z.literal('force_start'), ...ref }).strict(),
  z.object({ type: z.literal('claim'), ...ref, objectiveId: id, evidence: proof, droppedAt: z.string().datetime({ offset: true }) }).strict(),
  z.object({ type: z.literal('review'), ...ref, claimId: id, approve: z.boolean(), reason: z.string().trim().max(200) }).strict(),
  z.object({ type: z.literal('fire'), ...ref, cell: z.number().int().min(0).max(63) }).strict(),
  z.object({ type: z.literal('cancel'), ...ref, reason: text(200) }).strict(),
  z.object({ type: z.literal('draw_teams'), ...ref, playerIds: teamPlayerIds, captainIds: captainIdsSchema.nullable() }).strict(),
  z.object({ type: z.literal('manual_teams'), ...ref, teams: z.tuple([z.array(womPlayerId).min(1).max(50), z.array(womPlayerId).min(1).max(50)]), captainIds: captainIdsSchema }).strict(),
  z.object({ type: z.literal('confirm_teams'), ...ref, drawId: id }).strict(),
  z.object({ type: z.literal('link_player'), ...ref, playerId: womPlayerId }).strict(),
  z.object({ type: z.literal('schedule_reveal'), ...ref, drawId: id, at: z.string().datetime({ offset: true }), headline: text(100), message: text(500) }).strict(),
  z.object({ type: z.literal('cancel_reveal'), ...ref }).strict(),
]);
export type WarshipAction = z.infer<typeof warshipActionSchema>;
export type WarshipActor = { id: string; name: string; staff: boolean };
export type Crew = { userId: string; name: string; rsn: string; team: Team; captain: boolean; playerId?: number; ehb?: number | null };
export type JoinRequest = Omit<Crew, 'captain'> & { at: string };
export type DropClaim = { id: string; userId: string; name: string; rsn: string; team: Team; objectiveId: string; evidence: string; droppedAt: string; submittedAt: string; status: 'pending' | 'approved' | 'rejected'; reviewer: string | null; reviewedAt: string | null; reason: string };
export type SeaShot = { team: Team; cell: number; result: 'hit' | 'miss' | 'sunk'; sunkShip: number | null; at: string };
export type WarshipGame = {
  id: string; revision: number; config: WarshipConfig; status: 'draft' | 'setup' | 'active' | 'finished' | 'cancelled'; published: boolean;
  createdAt: string; startedAt: string | null; finishedAt: string | null; winner: Team | null; finishReason: string;
  fleets: [Placement[], Placement[]]; locked: [boolean, boolean]; crew: Crew[]; requests: JoinRequest[]; claims: DropClaim[]; shots: SeaShot[];
  audit: { at: string; actor: string; name: string; action: string }[];
  teamDraft?: SeaTeamDraw; teamAssignment?: SeaTeamDraw; drawLog?: SeaDrawLog[];
  reveal?: SeaReveal;
};
export function shipCells(p: Placement): number[] {
  const length = FLEET[p.ship]?.length;
  if (!length || p.cell < 0 || p.cell >= 64 || (!p.vertical && p.cell % 8 + length > 8) || (p.vertical && Math.floor(p.cell / 8) + length > 8)) return [];
  return Array.from({ length }, (_, index) => p.cell + index * (p.vertical ? 8 : 1));
}
export function validFleet(placements: Placement[]) {
  if (placements.length !== 4 || new Set(placements.map(p => p.ship)).size !== 4) return false;
  const cells = placements.flatMap(shipCells);
  return cells.length === 12 && new Set(cells).size === 12;
}
export const seaCoordinate = (cell: number) => `${'ABCDEFGH'[cell % 8]}${Math.floor(cell / 8) + 1}`;
export function ammo(game: WarshipGame, team: Team) {
  return game.claims.filter(c => c.team === team && c.status === 'approved').reduce((sum, c) => sum + (game.config.objectives.find(o => o.id === c.objectiveId)?.shots || 0), 0) - game.shots.filter(s => s.team === team).length;
}
export function hits(game: WarshipGame, team: Team) { return game.shots.filter(s => s.team === team && s.result !== 'miss').length; }
export function evidenceKey(value: string) { const url = new URL(value); return `${url.hostname}${url.pathname.replace(/\/$/, '')}`; }
export function finishAtDeadline(game: WarshipGame, now = Date.now()) {
  if (game.status !== 'active' || now < Date.parse(game.config.endsAt)) return false;
  const a = hits(game, 0), b = hits(game, 1);
  game.status = 'finished'; game.winner = a === b ? null : a > b ? 0 : 1;
  game.finishedAt = game.config.endsAt; game.finishReason = a === b ? 'De tijd is om. Gelijke stand.' : 'De tijd is om. De meeste treffers winnen.'; game.revision++;
  return true;
}

// Explicit allowlist: enemy placements, proof links and account IDs never leak
// through a spread of the stored game. Even staff sees only its own live fleet.
export function warshipView(g: WarshipGame, actor: WarshipActor | null, now = Date.now()) {
  const me = g.crew.find(p => p.userId === actor?.id);
  const locked = revealLocked(g, now);
  const ownTeam = locked ? null : me?.team ?? null;
  const reveal = g.status === 'finished';
  return {
    id: g.id, revision: g.revision, config: g.config, status: g.status, published: g.published, createdAt: g.createdAt,
    startedAt: g.startedAt, finishedAt: g.finishedAt, winner: g.winner, finishReason: g.finishReason,
    serverTime: new Date(now).toISOString(), reveal: revealView(g, !!actor, now), fleetAccessLocked: locked,
    linkedPlayer: me ? { playerId: me.playerId || null, rsn: me.rsn } : null,
    lobbyPlayers: actor && g.teamAssignment ? g.crew.map(p => ({ playerId: p.playerId!, rsn: p.rsn, linked: !!p.userId })).sort((a, b) => a.rsn.localeCompare(b.rsn)) : [],
    myTeam: ownTeam, canManage: !!actor?.staff, canCaptain: !locked && !!me?.captain, signedIn: !!actor,
    teamDraft: actor?.staff && !locked ? g.teamDraft || null : null, teamAssignment: actor && !locked ? g.teamAssignment || null : null,
    drawLog: actor && !locked ? g.drawLog || [] : [],
    balance: teamBalance(locked ? [] : g.crew.map(p => ({ team: p.team, ehb: p.ehb ?? null }))),
    teams: ([0, 1] as Team[]).map(team => ({ name: g.config.teams[team], members: locked ? 0 : g.crew.filter(p => p.team === team).length,
      ready: g.locked[team], ammo: ammo(g, team), hits: hits(g, team), sunk: g.shots.filter(s => s.team === team && s.result === 'sunk').length,
      fleet: reveal || ownTeam === team ? g.fleets[team] : [],
      revealedCells: g.shots.filter(s => s.team === otherTeam(team) && s.sunkShip !== null).flatMap(s => shipCells(g.fleets[team].find(p => p.ship === s.sunkShip)!)),
    })),
    shots: g.shots, crew: actor && !locked ? g.crew.map(p => ({ ...p, linked: !!p.userId, userId: actor.staff || p.userId === actor.id ? p.userId : '' })) : [],
    requests: actor ? g.requests.filter(r => actor.staff || r.userId === actor.id).map(r => ({ ...r, team: locked ? null : r.team })) : [],
    claims: actor ? g.claims.filter(c => actor.staff || c.team === ownTeam).map(c => ({ ...c, userId: actor.staff || c.userId === actor.id ? c.userId : '' })) : [],
    progress: g.config.objectives.map(o => ({ id: o.id, counts: ([0, 1] as Team[]).map(team => g.claims.filter(c => c.team === team && c.objectiveId === o.id && c.status === 'approved').length) })),
    audit: actor?.staff ? g.audit.slice(-50).reverse() : [],
  };
}
export type WarshipView = ReturnType<typeof warshipView>;
export type WarshipSummary = { id: string; title: string; status: WarshipGame['status']; published: boolean; endsAt: string; revealAt?: string | null; opensAt?: string | null };
export type WarshipOverview = { games: WarshipSummary[]; canManage: boolean; signedIn: boolean };

// Suggested rules only; staff reviews and can replace every entry before launch.
export const starterDrops = [
  { boss: 'zulrah', item: 'Tanzanite fang / Magic fang / Serpentine visage', shots: 2, limit: 3 },
  { boss: 'vorkath', item: 'Dragonbone necklace', shots: 2, limit: 3 },
  { boss: 'general_graardor', item: 'Bandos chestplate / tassets / boots', shots: 2, limit: 3 },
  { boss: 'commander_zilyana', item: 'Armadyl crossbow / Saradomin hilt', shots: 3, limit: 3 },
  { boss: 'kril_tsutsaroth', item: 'Zamorakian spear', shots: 2, limit: 3 },
  { boss: 'cerberus', item: 'Primordial / Pegasian / Eternal crystal', shots: 2, limit: 3 },
  { boss: 'dagannoth_rex', item: 'Berserker ring', shots: 1, limit: 3 },
  { boss: 'alchemical_hydra', item: 'Hydra\'s claw', shots: 4, limit: 2 },
];
