import { z } from 'zod';
import type { ClanDiscord } from '../worker/clan-discord';

export const siteAppearanceInput = z.object({ christmasEnabled: z.boolean(), revision: z.number().int().nonnegative() }).strict();
export type SiteAppearance = z.infer<typeof siteAppearanceInput>;
export const DEFAULT_SITE_APPEARANCE: SiteAppearance = { christmasEnabled: true, revision: 0 };
export type AppearanceEnv = { DISCORD_SYNC?: DurableObjectNamespace<ClanDiscord> };

export async function loadSiteAppearance(env: AppearanceEnv): Promise<{ appearance: SiteAppearance; available: boolean }> {
  try {
    if (!env.DISCORD_SYNC) throw new Error('binding');
    return { appearance: await env.DISCORD_SYNC.getByName('clan:7059').getAppearance(), available: true };
  } catch {
    return { appearance: { christmasEnabled: false, revision: 0 }, available: false };
  }
}
