import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from 'cloudflare:workers';
import SiteHeader from '@/components/site-header';
import PkDashboard from '@/components/pk-dashboard';
import Link from '@/components/site-link';
import { authorizeMemberWithRoles, discordConfig } from '@/lib/discord-auth';
import { isStaff } from '@/lib/clan-discord';
import { PK_STORE } from '@/lib/pk';
import { pkAllowed } from '@/lib/pk-route';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'PK-sessies | Hijgend Hert', robots: { index: false, follow: false } };
export default async function Page() {
  const config = discordConfig(env); if (!config) redirect('/login?error=setup');
  const incoming = await headers();
  let access;
  try { access = await authorizeMemberWithRoles(new Request(`${config.origin}/pk`, { headers: { Cookie: incoming.get('cookie') || '' } }), config); }
  catch { redirect('/login'); }
  const settings = await env.PK?.getByName(PK_STORE).getSettings();
  const allowed = Boolean(settings && pkAllowed({ id: access.member.id, name: access.member.displayName, staff: isStaff(access.member.clanRole) }, access.roles, settings.roleId));
  return <><SiteHeader view="member" initialMember={access.member}/><main className="pk-page" id="main">{allowed ? <PkDashboard/> : <div className="container pk-locked"><img src="/clan-logo.png" alt="Hijgend Hert" width="110" height="110"/><p className="eyebrow">DE WILDERNESS WACHT</p><h1>Alleen voor de PK-groep</h1><p>Vraag de clanleiding om de PK-rol in Discord. Je sessies, loot en splits staan veilig achter deze toegang.</p><Link href="/" className="button gold">Terug naar de clan</Link></div>}</main></>;
}
