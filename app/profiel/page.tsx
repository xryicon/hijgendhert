import type { Metadata } from 'next';
import SiteHeader from '@/components/site-header';
import MemberSession from '@/components/member-session';
import MemberProfileView from '@/components/member-profile-view';
import { requireDiscordMember } from '@/lib/discord-member';
import '../member-access.css';
import '../member-profile.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mijn profiel | Hijgend Hert', robots: { index: false, follow: false } };
export default async function ProfilePage() {
  const member = await requireDiscordMember();
  return <><SiteHeader view="member" initialMember={member}/><main id="main" className="member-page profile-page"><MemberSession><MemberProfileView member={member}/></MemberSession></main></>;
}
