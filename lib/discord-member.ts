import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authorizeMember, discordConfig, DiscordAccessError } from './discord-auth';

// Call inside every protected server page/action; hiding a link is not access control.
export async function currentDiscordMember() {
  const config = discordConfig(env);
  if (!config) return { member: null, reason: 'setup' as const };
  const incoming = await headers();
  try {
    const member = await authorizeMember(new Request(`${config.origin}/profiel`, { headers: { Cookie: incoming.get('cookie') || '' } }), config);
    return { member, reason: null };
  } catch (error) {
    return { member: null, reason: error instanceof DiscordAccessError ? error.code : 'unavailable' as const };
  }
}

export async function requireDiscordMember() {
  const result = await currentDiscordMember();
  if (!result.member) redirect(`/login?error=${result.reason}`);
  return result.member;
}
