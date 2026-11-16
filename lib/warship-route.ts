import { z } from 'zod';
import { authorizeMember, discordConfig, DiscordAccessError, privateHeaders, type DiscordEnv } from './discord-auth';
import { isStaff } from './clan-discord';
import type { ClanWarships } from '../worker/clan-warships';
import type { WarshipActor } from './warships';
type WarshipEnv = DiscordEnv & { WARSHIPS?: DurableObjectNamespace<ClanWarships> };
export async function warshipRoute(request: Request, env: WarshipEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url);
  if (!['/api/warships', '/api/warships/action'].includes(url.pathname)) return null;
  const json = (data: unknown, status = 200, extra = {}) => Response.json(data, { status, headers: { ...privateHeaders, ...extra } });
  const writing = url.pathname.endsWith('/action');
  if (request.method !== (writing ? 'POST' : 'GET')) return json({ error: 'Ongeldig verzoek.' }, 405);
  const config = discordConfig(env);
  if (!config || !env.WARSHIPS) return json({ error: 'Zeeslag wordt klaargezet.' }, 503);
  if (url.origin !== config.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site' || (writing && request.headers.get('Origin') !== config.origin)) return json({ error: 'Ververs de pagina en probeer opnieuw.' }, 403);
  try {
    let actor: WarshipActor | null = null;
    if (writing || (request.headers.get('Cookie') || '').includes('__Host-hh-member=')) {
      const member = await authorizeMember(request, config, fetcher);
      actor = { id: member.id, name: member.displayName, staff: isStaff(member.clanRole) };
    }
    const game = env.WARSHIPS.getByName('clan:7059');
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
    const result = await game.mutate(input, actor!); return json(result, result.ok ? 200 : result.status);
  } catch (error) {
    if (error instanceof DiscordAccessError) return json({ error: error.code === 'unavailable' ? 'Discord controleert je toegang straks opnieuw. Je spel blijft bewaard.' : 'Log in met je clanaccount om mee te spelen.' }, error.code === 'unavailable' ? 503 : error.code === 'expired' ? 401 : 403, error.code === 'unavailable' ? { 'Retry-After': String(error.retryAfter || 60) } : {});
    return json({ error: 'De verbinding is onderbroken. Probeer opnieuw; een schot wordt nooit dubbel geteld.' }, 503, { 'Retry-After': '30' });
  }
}
