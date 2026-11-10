import { z } from 'zod';

export const PK_STORE = 'clan:7059';
export const pkSettingsSchema = z.object({ revision: z.number().int().nonnegative(), roleId: z.union([z.literal(''), z.string().regex(/^\d{17,20}$/)]) }).strict();
export type PkSettings = z.infer<typeof pkSettingsSchema>;
const ids = z.array(z.number().int().positive()).min(1).max(50).refine(value => new Set(value).size === value.length, 'Kies elke speler één keer.');
export const pkCreateSchema = z.object({ requestId: z.string().uuid(), title: z.string().trim().min(3).max(80), playerIds: ids }).strict();
const common = { requestId: z.string().uuid(), sessionId: z.string().uuid(), revision: z.number().int().positive() };
export const pkRemoveSchema = z.object(common).strict();
export const pkActionSchema = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('add_players'), playerIds: ids }).strict(),
  z.object({ ...common, type: z.literal('player_status'), playerId: z.number().int().positive(), status: z.enum(['active', 'paused', 'left']) }).strict(),
  z.object({ ...common, type: z.literal('add_drop'), playerId: z.number().int().positive().optional(), label: z.string().trim().min(2).max(100).optional(), gp: z.number().int().min(1).max(100_000_000_000) }).strict(),
  z.object({ ...common, type: z.literal('remove_drop'), dropId: z.string().uuid(), reason: z.string().trim().min(3).max(200) }).strict(),
  z.object({ ...common, type: z.literal('finish') }).strict(),
  z.object({ ...common, type: z.literal('join_request'), playerId: z.number().int().positive() }).strict(),
  z.object({ ...common, type: z.literal('resolve_request'), joinId: z.string().uuid(), decision: z.enum(['accepted', 'declined']) }).strict(),
  z.object({ ...common, type: z.literal('cancel_request'), joinId: z.string().uuid() }).strict(),
]).superRefine((value, context) => {
  // Keep already-open clients compatible; new entries select a session player.
  if (value.type === 'add_drop' && !value.playerId && !value.label) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Kies de speler van wie de loot is.' });
});
export type PkAction = z.infer<typeof pkActionSchema>;
export type PkActor = { id: string; name: string; staff: boolean; admin?: boolean; roleIds?: string[] };
export type PkPlayerChoice = { id: number; name: string };
export type PkPlayer = PkPlayerChoice & { status: 'active' | 'paused' | 'left'; joinedAt: string; changedAt: string };
export type PkDrop = { id: string; label: string; playerId?: number; playerName?: string; gp: number; at: string; addedBy: string; shares: { playerId: number; gp: number }[]; remainder: number; removedAt: string | null; removedBy: string | null; reason: string | null };
export type PkLog = { sequence: number; at: string; actor: string; text: string };
export type PkJoinRequest = { id: string; requesterId: string; requesterName: string; player: PkPlayerChoice; at: string; status: 'pending' | 'accepted' | 'declined' | 'cancelled'; resolvedAt: string | null; resolvedBy: string | null };
export type PkSession = { id: string; title: string; ownerId: string; ownerName: string; revision: number; startedAt: string; endedAt: string | null; players: PkPlayer[]; drops: PkDrop[]; timeline: PkLog[]; requests: PkJoinRequest[] };
export type PkTotals = { gp: number; distributed: number; remainder: number; drops: number; shares: Record<string, number>; collected: Record<string, number>; keys: Record<string, number>; unattributed: number };
export type PkView = PkSession & { totals: PkTotals; canManage: boolean; canRemove: boolean; viewerId: string };
export type PkSummary = Pick<PkSession, 'id' | 'title' | 'ownerName' | 'startedAt' | 'endedAt'> & { gp: number; playerCount: number; activeCount: number };
export const pkStatusLabel = { active: 'Actief', paused: 'Pauze', left: 'Vertrokken' };
export const gpText = (value: number) => value.toLocaleString('nl-NL');
export function pkTotals(session: Pick<PkSession, 'players' | 'drops'>): PkTotals {
  const shares: Record<string, number> = Object.fromEntries(session.players.map(player => [String(player.id), 0]));
  const collected: Record<string, number> = Object.fromEntries(session.players.map(player => [String(player.id), 0]));
  const keys: Record<string, number> = Object.fromEntries(session.players.map(player => [String(player.id), 0]));
  let gp = 0, remainder = 0, drops = 0, unattributed = 0;
  for (const drop of session.drops) if (!drop.removedAt) {
    gp += drop.gp; remainder += drop.remainder; drops++;
    if (drop.playerId !== undefined && Object.hasOwn(collected, String(drop.playerId))) { collected[String(drop.playerId)] += drop.gp; keys[String(drop.playerId)]++; }
    else unattributed += drop.gp;
    for (const share of drop.shares) shares[String(share.playerId)] = (shares[String(share.playerId)] || 0) + share.gp;
  }
  return { gp, distributed: gp - remainder, remainder, drops, shares, collected, keys, unattributed };
}
