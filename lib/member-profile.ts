import { z } from 'zod';
import { authorizeMember, discordConfig, DiscordAccessError, playerPreferenceCookie, privateHeaders, readPlayerPreference, type DiscordEnv } from './discord-auth';
import { unitOf } from './community';
import type { ClanPlayer, DiscordMember, MemberEvent, MemberProfile } from './member-types';
import { normalizePlayerName } from './player-name';
import { readWiseOldMan } from './wise-old-man';

const groupId = 7059;
const finite = z.number().finite();
const playerSchema = z.object({
  id: z.number().int().positive(), username: z.string().min(1).max(30), displayName: z.string().min(1).max(30),
  type: z.string().max(40), exp: finite.nullish(), ehp: finite.nullish(), ehb: finite.nullish(),
});
const eventSchema = z.object({
  playerId: z.number().int().positive(), rank: z.number().int().positive().nullish(),
  progress: z.object({ gained: finite.nullish() }).nullish(),
  deltas: z.array(z.object({ metric: z.string(), values: z.object({ gained: finite.nullish() }) })).optional(),
  competition: z.object({
    id: z.number().int().positive(), title: z.string().max(200), metric: z.string().max(80),
    groupId: z.number().nullable(), startsAt: z.string(), endsAt: z.string(),
    participantCount: z.number().int().nonnegative(), metrics: z.array(z.object({ metric: z.string() })).optional(),
  }),
});
export function matchingPlayer(players: ClanPlayer[], member: Pick<DiscordMember, 'displayName' | 'username'>) {
  const names = new Set([member.displayName, member.username].map(normalizePlayerName));
  const matches = players.filter(p => names.has(normalizePlayerName(p.username)) || names.has(normalizePlayerName(p.displayName)));
  return matches.length === 1 ? matches[0] : null;
}
export function profileEvents(rows: unknown[], playerId: number, now = Date.now()): MemberEvent[] {
  const events = new Map<number, MemberEvent>();
  for (const row of rows) {
    const parsed = eventSchema.safeParse(row);
    if (!parsed.success || parsed.data.playerId !== playerId || parsed.data.competition.groupId !== groupId) continue;
    const { competition: c, rank, progress, deltas } = parsed.data;
    if (!Number.isFinite(Date.parse(c.startsAt)) || !Number.isFinite(Date.parse(c.endsAt))) continue;
    const metric = (c.metrics?.length || 0) > 1 ? 'total' : c.metric;
    const gained = progress?.gained ?? deltas?.find(d => d.metric === metric)?.values.gained ?? null;
    events.set(c.id, { id: c.id, title: c.title, metric: c.metric, startsAt: c.startsAt, endsAt: c.endsAt,
      unit: unitOf({ ...c, groupId }), gained, rank: rank ?? null, participantCount: c.participantCount,
      status: Date.parse(c.startsAt) > now ? 'upcoming' : Date.parse(c.endsAt) > now ? 'active' : 'finished' });
  }
  return [...events.values()].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
}

async function boundedJson(response: Response | Request, limit: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty');
  let size = 0; const parts: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error('large'); }
    parts.push(value);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

export async function memberProfileRoute(request: Request, env: DiscordEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url);
  if (!['/api/members/profile', '/api/members/event'].includes(url.pathname)) return null;
  const isEvent = url.pathname === '/api/members/event';
  const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(data, { status, headers: { ...privateHeaders, ...headers } });
  if (!(isEvent ? ['GET'] : ['GET', 'POST']).includes(request.method)) return json({ error: 'Ongeldig verzoek.' }, 405);
  const eventId = url.searchParams.get('id') || '';
  if (isEvent && !/^[1-9]\d{0,9}$/.test(eventId)) return json({ error: 'Ongeldig event.' }, 400);
  const config = discordConfig(env);
  if (!config) return json({ error: 'De Discord-koppeling is niet beschikbaar.' }, 503);
  if (new URL(request.url).origin !== config.origin || (request.method === 'POST' && (request.headers.get('Origin') !== config.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site'))) return json({ error: 'Ongeldig verzoek.' }, 403);
  try {
    const member = await authorizeMember(request, config, fetcher);
    let stale = false;
    let fetchedAt = new Date().toISOString();
    const readWom = async (path: string) => {
      const value = await readWiseOldMan<unknown>(path, config.origin, fetcher);
      stale ||= value.stale;
      if (Date.parse(value.fetchedAt) < Date.parse(fetchedAt)) fetchedAt = value.fetchedAt;
      return value.data;
    };
    let selectedId: number | undefined;
    if (request.method === 'POST') {
      try {
        const body = z.object({ playerId: z.number().int().positive() }).strict().parse(await boundedJson(request, 2048));
        selectedId = body.playerId;
      } catch { return json({ error: 'Kies een RuneScape-account uit de clanlijst.' }, 400); }
    }
    const group = z.object({ id: z.literal(groupId), memberships: z.array(z.object({ player: playerSchema })).max(2000) })
      .parse(await readWom('/groups/7059'));
    const players: ClanPlayer[] = group.memberships.map(({ player: p }) => ({ ...p, exp: p.exp ?? null, ehp: p.ehp ?? null, ehb: p.ehb ?? null }));
    if (selectedId !== undefined) {
      if (!players.some(p => p.id === selectedId)) return json({ error: 'Dit account staat niet in de clanlijst van Hijgend Hert.' }, 400);
      return json({ saved: true }, 200, { 'Set-Cookie': await playerPreferenceCookie(config, member.id, selectedId) });
    }
    const savedId = await readPlayerPreference(request, config, member.id);
    const saved = players.find(p => p.id === savedId);
    const player = saved || matchingPlayer(players, member);
    if (isEvent) {
      if (!player) return json({ error: 'Kies eerst je RuneScape-account.' }, 400);
      const detail = z.object({
        id: z.number().int(), groupId: z.number().nullable(),
        participations: z.array(z.object({ playerId: z.number().int() }).passthrough()).max(2000),
      }).passthrough().parse(await readWom(`/competitions/${eventId}`));
      if (detail.id !== Number(eventId) || detail.groupId !== groupId) return json({ error: 'Dit event hoort niet bij Hijgend Hert.' }, 404);
      const index = detail.participations.findIndex(p => p.playerId === player.id);
      if (index === -1) return json({ error: 'Dit account staat niet op de deelnemerslijst van dit event.' }, 404);
      const event = profileEvents([{ ...detail.participations[index], rank: index + 1, competition: detail }], player.id)[0];
      if (!event) throw new Error('wom');
      return json({ event, stale });
    }
    let events: MemberEvent[] = []; let eventsError: string | null = null;
    if (player) {
      try {
        const rows = await readWom(`/players/${encodeURIComponent(player.username)}/competitions`);
        if (!Array.isArray(rows)) throw new Error('wom');
        events = profileEvents(rows, player.id);
      } catch { eventsError = 'Je eventgeschiedenis is tijdelijk niet beschikbaar. Probeer het over een paar minuten opnieuw.'; }
    }
    const profile: MemberProfile = { player, selection: saved ? 'saved' : player ? 'discord' : null,
      players: players.map(({ id, username, displayName }) => ({ id, username, displayName })).sort((a, b) => a.displayName.localeCompare(b.displayName)),
      events, eventsError, fetchedAt, stale };
    return json(profile);
  } catch (error) {
    if (error instanceof DiscordAccessError) return json({ error: 'Je Discord-toegang kon niet worden bevestigd.', reason: error.code }, error.code === 'unavailable' ? 503 : 401);
    return json({ error: 'Wise Old Man is tijdelijk niet bereikbaar. Je Discord-login blijft actief.' }, 503);
  }
}
