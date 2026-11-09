import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authorizeMember, discordConfig, DiscordAccessError } from './discord-auth';

// Call inside every protected server page/action; hiding a link is not access control.
export async function requireDiscordMember() {
  const config = discordConfig(env);
  if (!config) redirect('/login?error=setup');
  const incoming = await headers();
  try {
    return await authorizeMember(new Request(`${config.origin}/ledenomgeving`, { headers: { Cookie: incoming.get('cookie') || '' } }), config);
  } catch (error) {
    const code = error instanceof DiscordAccessError ? error.code : 'unavailable';
    redirect(`/login?error=${code}`);
  }
}
