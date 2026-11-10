import { authorizeMember, discordConfig, DiscordAccessError, privateHeaders, type DiscordEnv } from './discord-auth';
import { raffleCancellationSchema, raffleEntriesSchema, raffleRemovalSchema, raffleScheduleSchema } from './raffle-validation';
import type { ClanRaffle } from '../worker/clan-raffle';

type RaffleEnv = DiscordEnv & { RAFFLES?: DurableObjectNamespace<ClanRaffle> };
const headers = { ...privateHeaders, 'Referrer-Policy': 'same-origin' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
async function boundedBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 65_536) { await reader.cancel(); throw new Error('body'); }
    parts.push(value);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export async function raffleRoute(request: Request, env: RaffleEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url);
  if (!['/api/raffle', '/api/raffle/schedule', '/api/raffle/entries', '/api/raffle/cancel', '/api/raffle/remove'].includes(url.pathname)) return null;
  const publicRead = url.pathname === '/api/raffle';
  if (request.method !== (publicRead ? 'GET' : 'POST')) return json({ error: 'Ongeldig verzoek.' }, 405);
  if (!env.RAFFLES) return json({ error: 'De raffle wordt nog klaargezet. Probeer het later opnieuw.' }, 503);
  const raffle = env.RAFFLES.getByName('clan:7059');
  try {
    if (publicRead) {
      const id = url.searchParams.get('id') || undefined;
      if (id && !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) return json({ error: 'Ongeldige trekking.' }, 400);
      const state = await raffle.getPublic(id);
      return id && !state.round ? json({ error: 'Deze trekking is niet gevonden.' }, 404) : json(state);
    }
    const config = discordConfig(env);
    if (!config) return json({ error: 'De Discord-koppeling is niet beschikbaar.' }, 503);
    if (url.origin !== config.origin || request.headers.get('Origin') !== config.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Ververs de pagina en probeer opnieuw.' }, 403);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Ongeldig verzoek.' }, 415);
    const member = await authorizeMember(request, config, fetcher);
    if (!['Admin', 'Staff team'].includes(member.clanRole)) return json({ error: 'Alleen Admin en Staff team kunnen een raffle beheren.' }, 403);
    let body: unknown;
    try { body = await boundedBody(request); } catch { return json({ error: 'De deelnemerslijst is ongeldig of te groot.' }, 400); }
    if (url.pathname.endsWith('/schedule')) {
      const value = raffleScheduleSchema.safeParse(body);
      if (!value.success) return json({ error: value.error.issues[0]?.message || 'Controleer de ingevulde gegevens.' }, 400);
      if (value.data.drawAt < Date.now() + 60_000) return json({ error: 'Plan de trekking minimaal één minuut vooruit.' }, 400);
      const result = await raffle.schedule(value.data, member.id);
      return result.ok ? json(result) : json({ error: result.error }, result.status);
    }
    if (url.pathname.endsWith('/entries')) {
      const value = raffleEntriesSchema.safeParse(body);
      if (!value.success) return json({ error: value.error.issues[0]?.message || 'Controleer de namen en loten.' }, 400);
      const result = await raffle.updateEntries(value.data);
      return result.ok ? json(result) : json({ error: result.error }, result.status);
    }
    if (url.pathname.endsWith('/remove')) {
      const value = raffleRemovalSchema.safeParse(body);
      if (!value.success) return json({ error: 'Ongeldige trekking.' }, 400);
      const result = await raffle.remove(value.data, member.id);
      return result.ok ? json(result) : json({ error: result.error }, result.status);
    }
    const value = raffleCancellationSchema.safeParse(body);
    if (!value.success) return json({ error: 'Geef een reden van minimaal vijf tekens.' }, 400);
    const result = await raffle.cancel(value.data);
    return result.ok ? json(result) : json({ error: result.error }, result.status);
  } catch (error) {
    if (error instanceof DiscordAccessError) return json({ error: error.code === 'unavailable' ? 'Discord kan je rol even niet controleren. Probeer opnieuw.' : 'Log opnieuw in om de raffle te beheren.' }, error.code === 'unavailable' ? 503 : error.code === 'expired' ? 401 : 403);
    console.warn(JSON.stringify({ event: 'raffle_unavailable' }));
    return json({ error: 'De raffle is tijdelijk niet bereikbaar. Je kunt veilig opnieuw proberen.' }, 503);
  }
}
