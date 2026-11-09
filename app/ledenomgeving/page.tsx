import type { Metadata } from 'next';
import { CalendarDays, Sprout, Swords, ArrowUpRight, ShieldCheck, LogOut } from 'lucide-react';
import SiteHeader from '@/components/site-header';
import MemberSession from '@/components/member-session';
import { requireDiscordMember } from '@/lib/discord-member';
import '../member-access.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Jouw ledenomgeving | Hijgend Hert', robots: { index: false, follow: false } };

export default async function MembersPage() {
  const member = await requireDiscordMember();
  return <><SiteHeader view="member"/><main id="main" className="member-page member-dashboard"><MemberSession>
    <section className="member-welcome">
      <img className="member-crest" src="/clan-logo.png" alt=""/>
      <p className="member-eyebrow">HIJGEND HERT · LEDENOMGEVING</p>
      <h1>Welkom, <em>{member.displayName}.</em></h1>
      <p className="member-intro">De clan wacht op je. Tijd voor de volgende grind.</p>
      <div className="member-role"><ShieldCheck size={17}/> Discord gekoppeld · Member</div>
    </section>
    <div className="member-links">
      <a href="/events#kalender"><CalendarDays/><span><small>SAMEN OP PAD</small><strong>Clanagenda</strong><p>Bekijk wat er op de planning staat.</p></span><ArrowUpRight/></a>
      <a href="/events#sotw"><Sprout/><span><small>PAK DIE XP</small><strong>Skill of the Week</strong><p>Volg de skillcompetitie en je clanmates.</p></span><ArrowUpRight/></a>
      <a href="/events#botw"><Swords/><span><small>TIJD VOOR DE JACHT</small><strong>Boss of the Week</strong><p>Bekijk de kills en het podium.</p></span><ArrowUpRight/></a>
    </div>
    <form action="/api/auth/logout" method="post" className="member-logout"><button type="submit"><LogOut size={15}/> Uitloggen</button></form>
  </MemberSession></main></>;
}
