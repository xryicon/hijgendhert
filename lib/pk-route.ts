import { z } from 'zod';
import { authorizeMemberWithRoles, discordConfig, DiscordAccessError, privateHeaders, type DiscordEnv } from './discord-auth';
import { isStaff } from './clan-discord';
import { PK_STORE, pkActionSchema, pkCreateSchema, pkSettingsSchema, type PkActor } from './pk';
import { readWiseOldMan, womConnection, WomUnavailable, type WomEnv } from './wise-old-man';
import type { ClanPk } from '../worker/clan-pk';
type PkEnv = DiscordEnv & WomEnv & { PK?: DurableObjectNamespace<ClanPk> };
export const pkAllowed = (actor: PkActor, roles: string[], roleId: string) => actor.staff || Boolean(roleId && roles.includes(roleId));
const rosterSchema = z.object({ id: z.literal(7059), memberships: z.array(z.object({ player: z.object({ id: z.number().int().positive(), displayName: z.string().min(1).max(30) }) })).max(2000) });
async function body(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new Error('body');
  const parts: Uint8Array[] = []; let bytes = 0;
  while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 16000) { await reader.cancel(); throw new Error('body'); } parts.push(chunk.value); }
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
}
export async function pkRoute(request: Request, env: PkEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname;
  if (!['/api/pk', '/api/pk/access', '/api/pk/session', '/api/pk/create', '/api/pk/action', '/api/admin/pk/settings'].includes(path)) return null;
  const json = (data: unknown, status = 200, extra = {}) => Response.json(data, { status, headers: { ...privateHeaders, ...extra } });
  if (!(path === '/api/admin/pk/settings' ? ['GET', 'POST'] : ['/api/pk/create', '/api/pk/action'].includes(path) ? ['POST'] : ['GET']).includes(request.method)) return json({ error: 'Ongeldig verzoek.' }, 405);
  const config = discordConfig(env); if (!config || !env.PK) return json({ error: 'De PK-pagina wordt klaargezet.' }, 503);
  if (url.origin !== config.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site' || (request.method === 'POST' && request.headers.get('Origin') !== config.origin)) return json({ error: 'Ververs de pagina en probeer opnieuw.' }, 403);
  try {
    const { member, roles } = await authorizeMemberWithRoles(request, config, fetcher);
    const actor = { id: member.id, name: member.displayName, staff: isStaff(member.clanRole), roleIds: roles };
    const store = env.PK.getByName(PK_STORE), settings = await store.getSettings();
    if (path === '/api/pk/access') return json({ allowed: pkAllowed(actor, roles, settings.roleId) });
    if (path === '/api/admin/pk/settings' ? !actor.staff : !pkAllowed(actor, roles, settings.roleId)) return json({ error: 'Voor deze pagina heb je de ingestelde PK-rol nodig. Vraag de clanleiding om toegang.' }, 403);
    if (request.method === 'GET') {
      if (path === '/api/admin/pk/settings') return json({ settings });
      if (path === '/api/pk') return json(await store.listSessions());
      const id = z.string().uuid().safeParse(url.searchParams.get('id')); if (!id.success) return json({ error: 'Ongeldige sessie.' }, 400);
      const result = await store.getSession(id.data, actor); return json(result, result.ok ? 200 : result.status);
    }
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Ongeldige invoer.' }, 415);
    let input: unknown; try { input = await body(request); } catch { return json({ error: 'De invoer is ongeldig of te groot.' }, 400); }
    if (path === '/api/admin/pk/settings') {
      const parsed = pkSettingsSchema.safeParse(input); if (!parsed.success) return json({ error: 'Controleer het Discord-rol-ID.' }, 400);
      const result = await store.saveSettings(parsed.data, actor); return json(result, result.ok ? 200 : result.status);
    }
    const parsed = path === '/api/pk/create' ? pkCreateSchema.safeParse(input) : pkActionSchema.safeParse(input);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || 'Controleer de invoer.' }, 400);
    const value = parsed.data;
    // Fail before a WOM request when this caller cannot change the session.
    if ('sessionId' in value) {
      const current = await store.getSession(value.sessionId, actor);
      if (!current.ok) return json(current, current.status);
      if (!['join_request', 'cancel_request'].includes(value.type) && current.session.ownerId !== actor.id && !actor.staff) return json({ error: 'Alleen de sessieleider en staff kunnen dit aanpassen.' }, 403);
    }
    let players: { id: number; name: string }[] = [];
    const playerIds = 'playerIds' in value ? value.playerIds : 'type' in value && value.type === 'join_request' ? [value.playerId] : [];
    if (playerIds.length) {
      const roster = rosterSchema.safeParse((await readWiseOldMan('/groups/7059', config.origin, { ...womConnection(env), fetcher })).data);
      if (!roster.success) return json({ error: 'De clanlijst is tijdelijk niet beschikbaar. Probeer later opnieuw.' }, 503);
      players = playerIds.flatMap(id => { const player = roster.data.memberships.find(m => m.player.id === id)?.player; return player ? [{ id, name: player.displayName }] : []; });
      if (players.length !== playerIds.length) return json({ error: 'Een gekozen speler staat niet in de huidige clanlijst. Vernieuw de spelerslijst.' }, 400);
    }
    // Recheck access settings after awaited roster reads to avoid granting a
    // newly removed role permission to mutate the ledger.
    if (!pkAllowed(actor, roles, (await store.getSettings()).roleId)) return json({ error: 'Je PK-toegang is gewijzigd.' }, 403);
    const result = 'type' in value ? await store.mutate(value, actor, players) : await store.create(value, actor, players);
    return json(result, result.ok ? 200 : result.status);
  } catch (error) {
    if (error instanceof DiscordAccessError) return json({ error: error.code === 'unavailable' ? 'Discord kan je toegang even niet controleren. Opnieuw verbinden volgt automatisch.' : 'Log in met een geldig clanaccount.' }, error.code === 'unavailable' ? 503 : error.code === 'expired' ? 401 : 403, error.code === 'unavailable' ? { 'Retry-After': String(error.retryAfter || 60) } : {});
    if (error instanceof WomUnavailable) return json({ error: 'Wise Old Man is tijdelijk niet bereikbaar. Bestaande sessies en splits blijven bewaard.' }, 503, { 'Retry-After': String(error.retryAfter) });
    return json({ error: 'Verbinding onderbroken. Je kunt hetzelfde verzoek veilig opnieuw proberen.' }, 503, { 'Retry-After': '30' });
  }
}
