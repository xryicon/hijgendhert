import { z } from 'zod';
import { authorizeMember, discordConfig, DiscordAccessError, privateHeaders, type DiscordEnv } from './discord-auth';
import { isStaff } from './clan-discord';
import type { ClanWarships } from '../worker/clan-warships';
import { warshipActionSchema, type WarshipActor } from './warships';
import { warshipRoster } from './warship-roster';
import { WomUnavailable, type WomEnv } from './wise-old-man';
type WarshipEnv = DiscordEnv & WomEnv & { WARSHIPS?: DurableObjectNamespace<ClanWarships> };
export async function warshipRoute(request: Request, env: WarshipEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url);
  if (!['/api/warships', '/api/warships/action', '/api/warships/roster', '/api/warships/navigation', '/api/admin/warships/discord', '/api/warships/evidence', '/api/warships/proof'].includes(url.pathname)) return null;
  const json = (data: unknown, status = 200, extra = {}) => Response.json(data, { status, headers: { ...privateHeaders, ...extra } });
  const adminSettings = url.pathname === '/api/admin/warships/discord';
  const proofRead = url.pathname === '/api/warships/evidence' || url.pathname === '/api/warships/proof';
  const writing = url.pathname.endsWith('/action') || adminSettings && request.method === 'POST';
  if (request.method !== (writing ? 'POST' : 'GET')) return json({ error: 'Ongeldig verzoek.' }, 405);
  const config = discordConfig(env);
  if (!config || !env.WARSHIPS) return json({ error: 'Zeeslag wordt klaargezet.' }, 503);
  if (url.origin !== config.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site' || (writing && request.headers.get('Origin') !== config.origin)) return json({ error: 'Ververs de pagina en probeer opnieuw.' }, 403);
  try {
    if (url.pathname.endsWith('/navigation')) {
      const publicGames = await env.WARSHIPS.getByName('clan:7059').overview(null);
      return json({ event: publicGames.games.find(g => g.published && !['finished', 'cancelled'].includes(g.status)) || null });
    }
    let actor: WarshipActor | null = null;
    if (writing || adminSettings || proofRead || url.pathname.endsWith('/roster') || (request.headers.get('Cookie') || '').includes('__Host-hh-member=')) {
      const member = await authorizeMember(request, config, fetcher);
      actor = { id: member.id, name: member.displayName, username: member.username, staff: isStaff(member.clanRole), admin: member.clanRole === 'Admin' };
    }
    const game = env.WARSHIPS.getByName('clan:7059');
    if (adminSettings) {
      if (!actor?.staff) return json({ error: 'Alleen de clanleiding kan het bewijskanaal instellen.' }, 403);
      if (!writing) return json(await game.getDiscordSettings());
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Gebruik JSON.'},415);
      const text = await readSmallJson(request);
      if (!text.ok) return json({error:'Controleer de invoer.'},400);
      const result = await game.saveDiscordSettings(text.body);
      return json(result,result.ok?200:result.status);
    }
    if (proofRead) {
      const params = z.object({ gameId: z.string().uuid(), claimId:z.string().uuid().optional(), team:z.coerce.number().int().min(0).max(1).optional(), cell:z.coerce.number().int().min(0).max(63).optional() }).strict().safeParse(Object.fromEntries(url.searchParams));
      if (!params.success || !(params.data.claimId ? params.data.team===undefined && params.data.cell===undefined : params.data.team!==undefined && params.data.cell!==undefined)) return json({error:'Ongeldig bewijsverzoek.'},400);
      const q=params.data;
      if (url.pathname.endsWith('/proof')) {
        if (!q.claimId) return json({error:'Kies een bewijs.'},400);
        const result=await game.getScreenshot(q.gameId,q.claimId,actor!);
        return result.ok ? new Response(null,{status:302,headers:{...privateHeaders,Location:result.url,'Referrer-Policy':'no-referrer'}}) : json({error:result.error},result.status);
      }
      const result=await game.getEvidence(q.gameId,actor!,{claimId:q.claimId,team:q.team as 0|1|undefined,cell:q.cell});
      return json(result,result.ok?200:result.status);
    }
    if (url.pathname.endsWith('/roster')) {
      if (!actor?.staff) return json({ error: 'Alleen de clanleiding kan teams indelen.' }, 403);
      return json(await warshipRoster(env, config.origin, fetcher));
    }
    if (!writing) {
      if (!url.searchParams.has('id')) return json(await game.overview(actor));
      const id = z.string().uuid().safeParse(url.searchParams.get('id'));
      if (!id.success) return json({ error: 'Ongeldig event.' }, 400);
      const result = await game.getGame(id.data, actor); return json(result, result.ok ? 200 : result.status);
    }
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Gebruik JSON.' }, 415);
    const reader = request.body?.getReader(); if (!reader) return json({ error: 'Invoer ontbreekt.' }, 400);
    const parts: Uint8Array[] = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 24000) { await reader.cancel(); return json({ error: 'De invoer is te groot.' }, 413); } parts.push(value); }
    let input: unknown; try { input = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return json({ error: 'Ongeldige invoer.' }, 400); }
    const parsed = warshipActionSchema.safeParse(input);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || 'Controleer de invoer.' }, 400);
    let roster;
    if (parsed.data.type === 'draw_teams' || parsed.data.type === 'manual_teams') {
      if (!actor?.staff) return json({ error: 'Alleen de clanleiding kan teams indelen.' }, 403);
      const replay = await game.replay(parsed.data, actor);
      if (replay) return json(replay, replay.ok ? 200 : replay.status);
      roster = await warshipRoster(env, config.origin, fetcher);
    }
    const result = await game.mutate(parsed.data, actor!, roster); return json(result, result.ok ? 200 : result.status);
  } catch (error) {
    if (error instanceof WomUnavailable) return json({ error: error.message }, 503, { 'Retry-After': String(error.retryAfter) });
    if (error instanceof DiscordAccessError) return json({ error: error.code === 'unavailable' ? 'Discord controleert je toegang straks opnieuw. Je spel blijft bewaard.' : 'Log in met je clanaccount om mee te spelen.' }, error.code === 'unavailable' ? 503 : error.code === 'expired' ? 401 : 403, error.code === 'unavailable' ? { 'Retry-After': String(error.retryAfter || 60) } : {});
    return json({ error: 'De verbinding is onderbroken. Probeer opnieuw; een schot wordt nooit dubbel geteld.' }, 503, { 'Retry-After': '30' });
  }
}

async function readSmallJson(request: Request): Promise<{ok:true;body:unknown}|{ok:false}> {
  const reader=request.body?.getReader(); if(!reader)return {ok:false};
  const chunks:Uint8Array[]=[]; let size=0;
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2000){await reader.cancel();return {ok:false};}chunks.push(value);} return {ok:true,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))};}catch{return {ok:false};}
}
