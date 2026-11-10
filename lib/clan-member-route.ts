import { z } from 'zod';
import { loadPlayerHighlights, playerSchema } from './member-profile';
import { normalizePlayerName } from './player-name';
import { memberActivities } from './member-activity';
import { readWiseOldMan, womConnection, womErrorCode, womRetryAfter, type WomEnv } from './wise-old-man';
import type { ClanProgress } from '../worker/clan-progress';
import type { ClanPlayer, PublicMemberProfile } from './member-types';

export async function clanMemberRoute(request: Request, env: WomEnv & { PROGRESS?: DurableObjectNamespace<ClanProgress> }, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url);
  if (!['/api/clan/member', '/api/clan/member/activity'].includes(url.pathname)) return null;
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
  if (request.method !== 'GET') return json({ error: 'Ongeldig verzoek.' }, 405, { Allow: 'GET' });
  const username = url.searchParams.get('username')?.trim() || '';
  if (!/^[a-zA-Z0-9 _-]{1,30}$/.test(username)) return json({ error: 'Ongeldige spelersnaam.' }, 400);
  let stale = false, fetchedAt = new Date().toISOString();
  const readWom = async (path: string) => {
    const value = await readWiseOldMan<unknown>(path, url.origin, { fetcher, ...womConnection(env) });
    stale ||= value.stale;
    if (Date.parse(value.fetchedAt) < Date.parse(fetchedAt)) fetchedAt = value.fetchedAt;
    return value.data;
  };
  try {
    // Validate membership before making any per-player request. No arbitrary WOM search proxy.
    const group = z.object({ id: z.literal(7059), memberships: z.array(z.object({ player: playerSchema, role: z.string().max(80).optional() })).max(2000) }).parse(await readWom('/groups/7059'));
    const matches = group.memberships.filter(({ player }) => [player.username, player.displayName].some(name => normalizePlayerName(name) === normalizePlayerName(username)));
    if (matches.length !== 1) return json({ error: 'Dit account staat niet in de ledenlijst van Hijgend Hert.' }, 404);
    const { player: p, role = 'member' } = matches[0];
    const player: ClanPlayer = { ...p, exp: p.exp ?? null, ehp: p.ehp ?? null, ehb: p.ehb ?? null };
    if (url.pathname.endsWith('/activity')) {
      const playerStore = env.PROGRESS?.getByName(`clan:7059:player:${player.id}`);
      try {
        const rows = await readWom(`/players/${encodeURIComponent(player.username)}/snapshots?period=month&limit=20`);
        if (!Array.isArray(rows)) throw new Error('snapshots');
        const saved = playerStore ? await playerStore.getPlayer() : null;
        const activities = memberActivities(rows, player.id, saved?.events);
        if (playerStore) await playerStore.saveActivities({ activities, fetchedAt });
        return json({ activities, fetchedAt, stale });
      } catch (error) {
        const saved = playerStore ? await playerStore.getActivities() : null;
        if (saved) return json({ ...saved, stale: true });
        throw error;
      }
    }
    const highlights = await loadPlayerHighlights(player, role, env, readWom);
    // Administrative notes, revisions and Discord identity never leave the private profile API.
    const progress = highlights.progression;
    const progression = progress ? { current: progress.current, source: progress.source, next: progress.next,
      confirmedEvents: progress.confirmedEvents, totalEvents: progress.totalEvents, pendingEvents: progress.pendingEvents,
      remaining: progress.remaining, percent: progress.percent, ready: progress.ready,
      rules: { steps: progress.rules.steps, configured: progress.rules.configured } } : null;
    const profile: PublicMemberProfile = { ...highlights, progression, player, fetchedAt, stale };
    return json(profile);
  } catch (error) {
    return json({ error: 'De ledengegevens zijn tijdelijk niet beschikbaar. Probeer het later opnieuw.', code: womErrorCode(error) }, 503, { 'Retry-After': womRetryAfter(error) });
  }
}
