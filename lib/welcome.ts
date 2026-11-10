import { z } from 'zod';
import type { ClanDiscord } from '../worker/clan-discord';

export const CLAN_DISCORD = 'https://discord.gg/KFNqA6bnZ4';
const imageUrl = z.string().trim().max(1500).refine(value => {
  if (/^\/(?!\/)[a-zA-Z0-9/_\-.]+\.(png|jpe?g|webp|gif)$/i.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}, 'Gebruik een volledige https-afbeeldingslink.');
export const welcomeInput = z.object({
  revision: z.number().int().nonnegative(),
  minimumTotal: z.number().int().min(1).max(10000),
  contact: z.string().trim().min(3).max(350),
  photos: z.array(z.object({ imageUrl, caption: z.string().trim().min(3).max(180) }).strict()).max(6),
  members: z.array(z.object({ name: z.string().trim().min(1).max(60), introduction: z.string().trim().min(3).max(300), rsName: z.string().trim().max(30), avatarUrl: z.union([z.literal(''), imageUrl]) }).strict()).max(6),
}).strict();
export type WelcomeContent = z.infer<typeof welcomeInput>;
export const DEFAULT_WELCOME: WelcomeContent = {
  revision: 0, minimumTotal: 1250,
  contact: 'Meld je in onze Discord en vraag naar Admin of Staff team. Vertel je RuneScape-naam en dat je graag bij Hijgend Hert wilt aansluiten.',
  photos: [], members: [],
};
export async function loadWelcomeContent(env: { DISCORD_SYNC?: DurableObjectNamespace<ClanDiscord> }): Promise<WelcomeContent> {
  try { return env.DISCORD_SYNC ? await env.DISCORD_SYNC.getByName('clan:7059').getWelcome() : DEFAULT_WELCOME; }
  catch { return DEFAULT_WELCOME; }
}

export function nextBeginnerEvent<T extends { id: string; status: string; startsAt: string; beginnerFriendly?: boolean }>(events: T[], now: number): T | null {
  return [...events].filter(event => event.beginnerFriendly === true && event.status === 'scheduled' && Date.parse(event.startsAt) > now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id))[0] || null;
}
