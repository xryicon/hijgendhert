import { z } from 'zod';
import { readWiseOldMan, womConnection, WomUnavailable, type WomEnv } from './wise-old-man';
import type { SeaRoster } from './warship-teams';
const schema = z.object({ id: z.literal(7059), memberships: z.array(z.object({ player: z.object({
  id: z.number().int().positive(), username: z.string().min(1).max(30), displayName: z.string().min(1).max(30),
  ehb: z.number().finite().nullish(), updatedAt: z.string().nullish(),
}) })).max(2000) });

export async function warshipRoster(env: WomEnv, origin: string, fetcher: typeof fetch): Promise<SeaRoster> {
  // Shared cached group read: never fan out into one stats request per player.
  const response = await readWiseOldMan('/groups/7059', origin, { ...womConnection(env), fetcher });
  const result = schema.safeParse(response.data);
  if (!result.success) throw new WomUnavailable('De clanlijst bevat ongeldige gegevens. Probeer later opnieuw.');
  const players = result.data.memberships.map(({ player: p }) => ({ id: p.id, username: p.username, rsn: p.displayName,
    ehb: typeof p.ehb === 'number' && p.ehb >= 0 && p.ehb <= 10000000 ? p.ehb : null,
    updatedAt: p.updatedAt && Number.isFinite(Date.parse(p.updatedAt)) ? p.updatedAt : null,
  }));
  if (new Set(players.map(p => p.id)).size !== players.length) throw new WomUnavailable('De clanlijst bevat dubbele spelers. Probeer later opnieuw.');
  return { players, fetchedAt: response.fetchedAt, stale: response.stale };
}
