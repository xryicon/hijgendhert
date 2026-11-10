import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SiteHeader from '@/components/site-header';
import MemberSession from '@/components/member-session';
import DiscordAdmin from '@/components/discord-admin';
import { requireDiscordMember } from '@/lib/discord-member';
import { isStaff } from '@/lib/clan-discord';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Clanbeheer | Hijgend Hert', robots: { index: false, follow: false } };
export default async function Page() {
  const member = await requireDiscordMember();
  if (!isStaff(member.clanRole)) notFound();
  return <><SiteHeader view="member" initialMember={member}/><main className="clan-admin-page" id="main"><MemberSession><DiscordAdmin/></MemberSession></main></>;
}
