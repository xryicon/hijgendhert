import { z } from 'zod';
import { authorizeMember, discordConfig, DiscordAccessError, privateHeaders, type DiscordEnv } from './discord-auth';
import { eventInputSchema, isStaff, SYNC_NAME } from './clan-discord';

async function readBody(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new Error('body');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 16000) { await reader.cancel(); throw new Error('body'); } chunks.push(value); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
export async function clanDiscordRoute(request: Request, env: DiscordEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url);
  const paths = ['/api/clan-events', '/api/members/clan-events', '/api/members/clan-events/register', '/api/admin/clan-events', '/api/admin/discord'];
  if (!paths.includes(url.pathname)) return null;
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: privateHeaders });
  const store = env.DISCORD_SYNC?.getByName(SYNC_NAME);
  if (!store) return json({ error: 'De eventkoppeling is nog niet beschikbaar.' }, 503);
  const publicRead = url.pathname === '/api/clan-events';
  const allowed = url.pathname.startsWith('/api/admin/') ? ['GET', 'POST'] : url.pathname.endsWith('/register') ? ['POST'] : ['GET'];
  if (!allowed.includes(request.method)) return json({ error: 'Ongeldig verzoek.' }, 405);
  try {
    if (publicRead) return json({ events: await store.listEvents() });
    const config = discordConfig(env);
    if (!config) return json({ error: 'Discord-login is niet beschikbaar.' }, 503);
    if (url.origin !== config.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site' || (request.method === 'POST' && request.headers.get('Origin') !== config.origin)) return json({ error: 'Ververs de pagina en probeer opnieuw.' }, 403);
    const member = await authorizeMember(request, config, fetcher);
    if (url.pathname.startsWith('/api/admin/') && !isStaff(member.clanRole)) return json({ error: 'Alleen Admin en Staff team kunnen dit beheren.' }, 403);
    if (request.method === 'GET') return json(url.pathname === '/api/admin/discord' ? await store.getSettings() : { events: await store.listEvents(member.id, true) });
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Ongeldig verzoek.' }, 415);
    let body: unknown;
    try { body = await readBody(request); } catch { return json({ error: 'De invoer is ongeldig of te groot.' }, 400); }
    if (url.pathname === '/api/admin/discord') { const result = await store.saveSettings(body); return json(result, result.ok ? 200 : result.status); }
    if (url.pathname === '/api/admin/clan-events') {
      const value = eventInputSchema.safeParse(body);
      if (!value.success) return json({ error: value.error.issues[0].message }, 400);
      const result = await store.saveEvent(value.data, member.displayName); return json(result, result.ok ? 200 : result.status);
    }
    const parsed = z.object({ id: z.string().uuid(), action: z.enum(['join', 'leave']) }).strict().safeParse(body);
    if (!parsed.success) return json({ error: 'Ongeldige inschrijving.' }, 400);
    const result = await store.register(parsed.data.id, member.id, member.displayName, parsed.data.action);
    return json(result, result.ok ? 200 : 'status' in result && typeof result.status === 'number' ? result.status : 400);
  } catch (error) {
    if (error instanceof DiscordAccessError) return json({ error: error.code === 'unavailable' ? 'Discord kan je toegang even niet controleren. Probeer later opnieuw.' : 'Log in met je clanaccount.' }, error.code === 'unavailable' ? 503 : 401);
    return json({ error: 'De verbinding is tijdelijk niet beschikbaar. Probeer opnieuw.' }, 503);
  }
}
