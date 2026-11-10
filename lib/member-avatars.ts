import { normalizePlayerName } from './player-name';

const snowflake = /^\d{17,20}$/;
const hash = /^(?:a_)?[a-f0-9]{32}$/;
export const AVATAR_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
export type AvatarIdentity = { id: string; displayName: string; username: string; avatarUrl?: string | null };
export type StoredAvatar = { id: string; names: string[]; avatarUrl: string | null; updatedAt: number };
export type AvatarPlayer = { id: number; username: string; displayName: string };

// Only Discord's documented public image endpoints; never an arbitrary URL.
export function isDiscordAvatarUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\/cdn\.discordapp\.com\/(?:avatars\/\d{17,20}\/(?:a_)?[a-f0-9]{32}|guilds\/\d{17,20}\/users\/\d{17,20}\/avatars\/(?:a_)?[a-f0-9]{32})\.png\?size=128$/.test(value);
}
export function discordAvatarUrl(user: { id: string; avatar?: string | null }, guildId: string, guildAvatar?: string | null): string | null {
  if (!snowflake.test(user.id)) return null;
  if (snowflake.test(guildId) && guildAvatar && hash.test(guildAvatar)) return `https://cdn.discordapp.com/guilds/${guildId}/users/${user.id}/avatars/${guildAvatar}.png?size=128`;
  return user.avatar && hash.test(user.avatar) ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null;
}
export function rememberAvatar(previous: StoredAvatar[], member: AvatarIdentity, now = Date.now()): StoredAvatar[] {
  if (!snowflake.test(member.id)) return previous;
  const names = [...new Set([member.displayName, member.username].map(normalizePlayerName))].filter(name => /^[a-z0-9 ]{1,30}$/.test(name));
  const row: StoredAvatar = { id: member.id, names, avatarUrl: isDiscordAvatarUrl(member.avatarUrl) ? member.avatarUrl : null, updatedAt: now };
  const saved = previous.find(item => item.id === member.id);
  if (saved && saved.updatedAt > now) return previous;
  // Keep a null-photo identity too: duplicate names must remain ambiguous.
  return [...previous.filter(item => item.id !== member.id && now - item.updatedAt < AVATAR_MAX_AGE), row].slice(-2000);
}
export function matchMemberAvatars(rows: StoredAvatar[], players: AvatarPlayer[], now = Date.now()): Record<string, string> {
  const candidates = new Map<number, StoredAvatar[]>();
  for (const row of rows) {
    if (now < row.updatedAt || now - row.updatedAt >= AVATAR_MAX_AGE) continue;
    const matches = players.filter(player => [player.username, player.displayName].some(name => row.names.includes(normalizePlayerName(name))));
    if (matches.length !== 1) continue;
    const id = matches[0].id;
    candidates.set(id, [...(candidates.get(id) || []), row]);
  }
  return Object.fromEntries([...candidates].filter(([, rows]) => rows.length === 1 && isDiscordAvatarUrl(rows[0].avatarUrl)).map(([id, rows]) => [String(id), rows[0].avatarUrl!]));
}
