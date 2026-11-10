import { z } from 'zod';
import { activities } from '../content/clan-life';
import { authorizeMember, discordConfig, DiscordAccessError, privateHeaders, type DiscordEnv } from './discord-auth';
import { readWiseOldMan, womConnection, type WomEnv } from './wise-old-man';
import type { NotificationSourceUpdates } from './notifications';
import type { ClanProgress } from '../worker/clan-progress';
import type { ClanRaffle } from '../worker/clan-raffle';

type NotificationEnv = DiscordEnv & WomEnv & {
  PROGRESS?: DurableObjectNamespace<ClanProgress>;
  RAFFLES?: DurableObjectNamespace<ClanRaffle>;
};
const readSchema = z.object({ ids: z.array(z.string().min(1).max(200)).max(50) }).strict();
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 12_000) { await reader.cancel(); throw new Error('body'); }
    chunks.push(value);
  }
  return readSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}

export async function notificationRoute(request: Request, env: NotificationEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/members/notifications') return null;
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...privateHeaders, ...extra } });
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Ongeldig verzoek.' }, 405);
  const config = discordConfig(env);
  if (!config) return json({ error: 'De Discord-koppeling is niet beschikbaar.' }, 503);
  if (url.origin !== config.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site'
    || (request.method === 'POST' && request.headers.get('Origin') !== config.origin)) return json({ error: 'Ververs de pagina en probeer opnieuw.' }, 403);
  try {
    const member = await authorizeMember(request, config, fetcher);
    if (!env.PROGRESS) return json({ error: 'Meldingen zijn tijdelijk niet beschikbaar.' }, 503);
    const feed = env.PROGRESS.getByName('clan:7059:notifications');
    const account = env.PROGRESS.getByName(`clan:7059:account:${member.id}`);
    if (request.method === 'POST') {
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Ongeldig verzoek.' }, 415);
      let body: z.infer<typeof readSchema>;
      try { body = await readBody(request); } catch { return json({ error: 'Ongeldige meldingen.' }, 400); }
      const known = new Set((await feed.syncNotifications()).map(item => item.id));
      const ids = body.ids.filter(id => known.has(id));
      const readIds = await account.markNotificationsRead(ids);
      return json({ readIds });
    }
    const startedAt = Date.now();
    const updates: NotificationSourceUpdates = { calendar: activities };
    const checkedAt: Partial<Record<keyof NotificationSourceUpdates, number>> = { calendar: startedAt };
    const unavailableSources: string[] = [];
    let stale = false;
    const [competitions, raffles, readIds] = await Promise.all([
      readWiseOldMan<unknown>('/groups/7059/competitions', config.origin, { fetcher, ...womConnection(env) })
        .then(value => ({ ok: true as const, value }), () => ({ ok: false as const })),
      env.RAFFLES ? env.RAFFLES.getByName('clan:7059').getNotificationRounds()
        .then(value => ({ ok: true as const, value }), () => ({ ok: false as const })) : Promise.resolve({ ok: false as const }),
      account.getNotificationReads(),
    ]);
    if (competitions.ok && Array.isArray(competitions.value.data) && Number.isFinite(Date.parse(competitions.value.fetchedAt))) {
      updates.competitions = competitions.value.data;
      checkedAt.competitions = Date.parse(competitions.value.fetchedAt);
      stale ||= competitions.value.stale;
      if (competitions.value.stale) unavailableSources.push('events');
    } else { stale = true; unavailableSources.push('events'); }
    if (raffles.ok) { updates.raffles = raffles.value; checkedAt.raffles = startedAt; }
    else { stale = true; unavailableSources.push('loterijen'); }
    const read = new Set(readIds);
    const notifications = (await feed.syncNotifications(updates, checkedAt)).map(item => ({ ...item, read: read.has(item.id) }));
    return json({ notifications, unreadCount: notifications.filter(item => !item.read).length, stale, unavailableSources, serverNow: new Date().toISOString() });
  } catch (error) {
    if (error instanceof DiscordAccessError) {
      const unavailable = error.code === 'unavailable';
      return json({ error: unavailable ? 'Je Discord-toegang kan nu niet worden gecontroleerd.' : 'Log opnieuw in om je meldingen te bekijken.' }, unavailable ? 503 : 401,
        unavailable ? { 'Retry-After': String(error.retryAfter || 60) } : {});
    }
    console.warn(JSON.stringify({ event: 'notifications_unavailable' }));
    return json({ error: 'Meldingen zijn tijdelijk niet bereikbaar. Probeer het later opnieuw.' }, 503, { 'Retry-After': '60' });
  }
}
