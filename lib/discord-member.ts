import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authorizeMember, discordConfig, DiscordAccessError, discordErrorReference } from './discord-auth';

// Call inside every protected server page/action; hiding a link is not access control.
export async function currentDiscordMember() {
  const config = discordConfig(env);
  if (!config) return { member: null, reason: 'setup' as const, reference: null };
  const incoming = await headers();
  try {
    const member = await authorizeMember(new Request(`${config.origin}/profiel`, { headers: { Cookie: incoming.get('cookie') || '' } }), config);
    return { member, reason: null, reference: null };
  } catch (error) {
    const reason = error instanceof DiscordAccessError ? error.code : 'unavailable' as const;
    const reference = reason === 'unavailable' ? discordErrorReference('PAGE', error) : null;
    if (reference) console.warn(JSON.stringify({ event: 'discord_page_failed', reference }));
    return { member: null, reason, reference };
  }
}

export async function requireDiscordMember() {
  const result = await currentDiscordMember();
  if (!result.member) redirect(`/login?error=${result.reason}${result.reference ? `&ref=${result.reference}` : ''}`);
  return result.member;
}
