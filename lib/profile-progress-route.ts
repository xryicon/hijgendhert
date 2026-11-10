import { z } from 'zod';
import { authorizeMember, discordConfig, DiscordAccessError, privateHeaders, type DiscordEnv } from './discord-auth';
import { memberRankSchema, rankRulesSchema } from './profile-progress';
import { readWiseOldMan, womConnection, type WomEnv } from './wise-old-man';
import type { ClanProgress } from '../worker/clan-progress';

type ProgressEnv = DiscordEnv & WomEnv & { PROGRESS?: DurableObjectNamespace<ClanProgress> };
async function bodyJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  const parts: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    bytes += value.length;
    if (bytes > 8192) { await reader.cancel(); throw new Error('body'); }
    parts.push(value);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
}
export async function profileProgressRoute(request: Request, env: ProgressEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url);
  const routes = ['/api/members/progress/admin', '/api/members/progress/rules', '/api/members/progress/member'];
  if (!routes.includes(url.pathname)) return null;
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: privateHeaders });
  const isRead = url.pathname.endsWith('/admin');
  if (request.method !== (isRead ? 'GET' : 'POST')) return json({ error: 'Ongeldig verzoek.' }, 405);
  const config = discordConfig(env);
  if (!config || !env.PROGRESS) return json({ error: 'Rangbeheer is tijdelijk niet beschikbaar.' }, 503);
  if (url.origin !== config.origin || (!isRead && (request.headers.get('Origin') !== config.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site'))) return json({ error: 'Ververs de pagina en probeer opnieuw.' }, 403);
  try {
    const member = await authorizeMember(request, config, fetcher);
    if (!['Admin', 'Staff team'].includes(member.clanRole)) return json({ error: 'Alleen Admin en Staff team kunnen rangen beheren.' }, 403);
    const rulesStore = env.PROGRESS.getByName('clan:7059:rules');
    if (isRead) {
      const playerId = url.searchParams.get('playerId');
      if (playerId && !/^[1-9]\d{0,9}$/.test(playerId)) return json({ error: 'Ongeldig clanlid.' }, 400);
      return json({ rules: await rulesStore.getRules(), state: playerId ? await env.PROGRESS.getByName(`clan:7059:player:${Number(playerId)}`).getPlayer() : null });
    }
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Ongeldig verzoek.' }, 415);
    let body: unknown;
    try { body = await bodyJson(request); } catch { return json({ error: 'De invoer is ongeldig of te groot.' }, 400); }
    if (url.pathname.endsWith('/rules')) {
      const parsed = rankRulesSchema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
      const result = await rulesStore.saveRules(parsed.data, member.id);
      return json(result, result.ok ? 200 : result.status);
    }
    const parsed = memberRankSchema.safeParse(body);
    if (!parsed.success) return json({ error: 'Controleer het gekozen lid en de ingevulde gegevens.' }, 400);
    if (parsed.data.rankOverride !== null) return json({ error: 'De clanrang volgt Wise Old Man. Pas de rang daar aan.' }, 400);
    const { playerId } = parsed.data;
    const readWom = async (path: string) => (await readWiseOldMan<unknown>(path, config.origin, { fetcher, ...womConnection(env) })).data;
    const group = z.object({ id: z.literal(7059), memberships: z.array(z.object({ player: z.object({ id: z.number().int(), username: z.string().min(1).max(30) }) })).max(2000) }).parse(await readWom('/groups/7059'));
    const player = group.memberships.find(m => m.player.id === playerId)?.player;
    if (!player) return json({ error: 'Dit account staat niet in de clanlijst.' }, 400);
    const playerStore = env.PROGRESS.getByName(`clan:7059:player:${playerId}`);
    const value = parsed.data;
    const result = await playerStore.savePlayer(value, member.id);
    return json(result, result.ok ? 200 : result.status);
  } catch (error) {
    if (error instanceof DiscordAccessError) return json({ error: 'Je Discord-toegang kon niet worden bevestigd.' }, error.code === 'unavailable' ? 503 : 401);
    return json({ error: 'De gegevens zijn tijdelijk niet bereikbaar. Opgeslagen voortgang blijft bewaard; probeer het later opnieuw.' }, 503);
  }
}
