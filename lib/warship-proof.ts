import { z } from 'zod';
import type { DropClaim, Team, WarshipConfig, WarshipGame } from './warships';
import { metricLabel } from './osrs-metrics';
import { cleanDiscordText } from './clan-discord';

const snowflake = z.string().regex(/^\d{17,20}$/);
export const seaDiscordSettingsSchema = z.object({ revision: z.number().int().nonnegative(), channelId: z.union([z.literal(''), snowflake]), enabled: z.boolean() }).strict().refine(s => !s.enabled || !!s.channelId, 'Kies eerst een kanaal.');
export type SeaDiscordSettings = z.infer<typeof seaDiscordSettingsSchema>;
export const EMPTY_SEA_DISCORD: SeaDiscordSettings = { revision: 0, channelId: '', enabled: false };
export type DiscordDropProof = { guildId: string; channelId: string; messageId: string; attachmentId: string; filename: string; contentType: string; size: number; authorId: string; caption: string };
export const discordScreenshotSchema = z.object({ id: snowflake, filename: z.string().min(1).max(200), content_type: z.enum(['image/png', 'image/jpeg', 'image/webp']), size: z.number().int().min(1).max(8 * 1024 * 1024), url: z.string().url(), ephemeral: z.boolean().optional() });
export const discordDropMessageSchema = z.object({ id: snowflake, channel_id: snowflake, timestamp: z.string().datetime({ offset: true }), content: z.string().min(1).max(4000), author: z.object({ id: snowflake, username: z.string().max(100), global_name: z.string().max(100).nullable().optional(), bot: z.boolean().optional() }), attachments: z.array(discordScreenshotSchema).length(1) });
export function safeDiscordAttachment(url: string, channelId: string, attachmentId: string) {
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'cdn.discordapp.com' && !u.username && !u.password && !u.port && u.pathname.startsWith(`/attachments/${channelId}/${attachmentId}/`); } catch { return false; }
}
const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
// Whole, configured item names only. A matching boss can disambiguate the same
// item across bosses; substring guesses and multiple reported items are refused.
function itemAliases(item: string) {
  const parts=item.split(/\s*[/\n|]\s*/).map(normalize).filter(Boolean);
  if(parts.length<2)return parts;
  const first=parts[0].split(' '),last=parts.at(-1)!.split(' ');
  return parts.map(p=>p.includes(' ')?p:first.length>1?[...first.slice(0,-1),p].join(' '):last.length>1?[p,...last.slice(1)].join(' '):p);
}
export function matchDiscordDrop(caption: string, objectives: WarshipConfig['objectives']) {
  const words = ` ${normalize(caption)} `;
  const matches = objectives.filter(o => itemAliases(o.item).some(item => words.includes(` ${item} `)));
  if (matches.length <= 1) return matches[0] || null;
  const withBoss = matches.filter(o => words.includes(` ${normalize(metricLabel(o.boss))} `));
  return withBoss.length === 1 ? withBoss[0] : null;
}
export const proofImageUrl = (p: DiscordDropProof) => `https://cdn.discordapp.com/attachments/${p.channelId}/${p.attachmentId}/${encodeURIComponent(p.filename)}`;
export function nextShotClaim(g: WarshipGame, team: Team) {
  // Old shots remain explicitly unlinked. Reserve their spent credits before
  // allocating new evidence, while never reassigning an existing shot.
  let legacy = g.shots.filter(s => s.team === team && !s.claimId).length;
  for (const c of g.claims.filter(c => c.team === team && c.status === 'approved').sort((a, b) => (a.reviewedAt || '').localeCompare(b.reviewedAt || '') || a.id.localeCompare(b.id))) {
    const reward = g.config.objectives.find(o => o.id === c.objectiveId)?.shots || 0;
    const used = g.shots.filter(s => s.team === team && s.claimId === c.id).length;
    const old = Math.min(legacy, Math.max(0, reward - used)); legacy -= old;
    if (reward > used + old) return c;
  }
  return null;
}
export function discordClaimCard(g: WarshipGame, c: DropClaim, origin: string) {
  const objective = g.config.objectives.find(o => o.id === c.objectiveId)!;
  const status = c.status === 'approved' ? `Goedgekeurd · +${objective.shots} schoten` : c.status === 'rejected' ? 'Afgewezen' : 'Wacht op een admin';
  const e = cleanDiscordText;
  return { allowed_mentions: { parse: [] }, content: '', embeds: [{ title: `${metricLabel(objective.boss)} · ${objective.item}`.slice(0, 256), color: c.status === 'approved' ? 0x749561 : c.status === 'rejected' ? 0x9f5b49 : 0xb99142,
    description: `**${e(c.rsn)}** · ${e(g.config.teams[c.team])}\nUploader: ${e(c.name)}\n**${status}**${c.reviewer ? `\nBeoordeeld door ${e(c.reviewer)}` : ''}${c.reason ? `\n${e(c.reason)}` : ''}\n[Oorspronkelijk bericht](${c.evidence})`,
    ...(c.discordProof ? { image: { url: proofImageUrl(c.discordProof) } } : {}), timestamp: c.droppedAt, footer: { text: 'Hijgend Hert · Zeeslag' } }], components: [{ type: 1, components: [
      { type: 2, style: 3, label: 'Goedkeuren', custom_id: `hh:sea:yes:${g.id}:${c.id}`, disabled: c.status !== 'pending' || g.status !== 'active' },
      { type: 2, style: 4, label: 'Afwijzen', custom_id: `hh:sea:no:${g.id}:${c.id}`, disabled: c.status !== 'pending' || g.status !== 'active' },
      { type: 2, style: 5, label: 'Bekijk Zeeslag', url: `${origin}/zeeslag?event=${g.id}` },
    ] }] };
}
