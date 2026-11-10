"use client";
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, CalendarDays, LogOut, Menu, Shield, Swords, UserRound, Users, X } from 'lucide-react';
import { useMemberSession, VerifiedMemberSession } from './session-provider';
import type { DiscordMember } from '@/lib/member-types';

const navigation = [
  { id: 'clan', label: 'Leden', href: '/leden', icon: Users },
  { id: 'events', label: 'Events', href: '/events', icon: Swords },
];

export default function SiteHeader({ view, initialMember }: { view: 'home' | 'clan' | 'events' | 'member'; initialMember?: DiscordMember }) {
  const [menu, setMenu] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const session = useMemberSession();
  const member = session.member || (session.status === 'loading' ? initialMember : null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); setAccountOpen(false); if (accountOpen) accountButton.current?.focus(); } };
    const outside = (event: PointerEvent) => { if (!account.current?.contains(event.target as Node)) setAccountOpen(false); };
    window.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('keydown', close); document.removeEventListener('pointerdown', outside); };
  }, [accountOpen]);
  return <>
    {initialMember && <VerifiedMemberSession member={initialMember}/>}
    <a className="skip-link" href="#main">Ga naar inhoud</a>
    <header className={`header header-${view === 'events' ? 'event' : view}${scrolled ? ' is-scrolled' : ''}`}>
      <div className="container nav-wrap">
        <a className="brand" href={view === 'home' ? '#home' : '/'} aria-label="Hijgend Hert home"><img src="/clan-logo.png" alt=""/><span>Hijgend Hert<small>OLD SCHOOL RUNESCAPE CLAN</small></span></a>
        <nav id="main-navigation" className={menu ? 'navigation open' : 'navigation'} aria-label="Hoofdnavigatie">
          {navigation.map(item => <a key={item.id} href={item.href} className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => setMenu(false)}><item.icon size={15} strokeWidth={1.6} aria-hidden="true"/><span>{item.label}</span></a>)}
        </nav>
        <div className="nav-actions">
          {member ? <div className="nav-account" ref={account}>
            <button ref={accountButton} type="button" className={`button gold nav-login nav-account-button${view === 'member' ? ' active' : ''}`} onClick={() => setAccountOpen(!accountOpen)} aria-expanded={accountOpen} aria-controls="account-links" aria-label={`Account van ${member.displayName}`}>
              <span className="nav-account-initial" aria-hidden="true">{Array.from(member.displayName)[0]}</span><span className="nav-account-name">{member.displayName}</span><ChevronDown size={13}/>
            </button>
            {accountOpen && <div className="account-panel" id="account-links">
              <div className="account-panel-heading"><strong>{member.displayName}</strong><span>{member.clanRole} · Hijgend Hert</span></div>
              <a href="/profiel" onClick={() => setAccountOpen(false)}><UserRound size={16}/> Mijn profiel</a>
              <a href="/profiel#events" onClick={() => setAccountOpen(false)}><CalendarDays size={16}/> Mijn events</a>
              <form method="post" action="/api/auth/logout"><button type="submit"><LogOut size={16}/> Uitloggen</button></form>
            </div>}
          </div> : session.status === 'loading' ? <span className="button gold nav-login nav-session-loading" aria-label="Account controleren"><UserRound size={15}/><span>Account</span></span> : session.status === 'unavailable' ? <button type="button" className="button gold nav-login" onClick={() => void session.refresh()} title="Account opnieuw controleren"><UserRound size={15}/>Account</button> : <a className={`button gold nav-login${view === 'member' ? ' active' : ''}`} href="/login" aria-current={view === 'member' ? 'page' : undefined}><UserRound size={15} strokeWidth={1.6} aria-hidden="true"/>Login</a>}
          <a className="button gold nav-join" href="https://discord.gg/KFNqA6bnZ4" target="_blank" rel="noreferrer">Join Discord <ArrowUpRight size={16}/></a>
        </div>
        <button className="menu-button" onClick={() => setMenu(!menu)} aria-label={menu ? 'Menu sluiten' : 'Menu openen'} aria-expanded={menu} aria-controls="main-navigation">{menu ? <X/> : <Menu/>}</button>
      </div>
    </header>
  </>;
}
