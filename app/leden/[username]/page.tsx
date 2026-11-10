import type { Metadata } from 'next';
import SiteHeader from '@/components/site-header';
import PublicMemberProfileView from '@/components/public-member-profile';
import '../../member-access.css';
import '../../member-profile.css';
import '../../profile-highlights.css';
import '../members.css';

export const metadata: Metadata = { title: 'Lidprofiel | Hijgend Hert', robots: { index: false, follow: true } };
export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <><SiteHeader view="clan"/><main id="main" className="member-page profile-page public-member-page"><PublicMemberProfileView key={username} username={username}/></main></>;
}
