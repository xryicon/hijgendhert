"use client";
import { useEffect, useState } from 'react';
import { ArrowUpRight, Menu, Shield, Swords, UserRound, X } from 'lucide-react';

const navigation = [
  { id: 'clan', label: 'De clan', href: '/clan', icon: Shield },
  { id: 'events', label: 'Events', href: '/events', icon: Swords },
  { id: 'member', label: 'Ledenomgeving', href: '/ledenomgeving', icon: UserRound },
];

export default function SiteHeader({ view }: { view: 'home' | 'clan' | 'events' | 'member' }) {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  return <>
    <a className="skip-link" href="#main">Ga naar inhoud</a>
    <header className={`header header-${view === 'events' ? 'event' : view}${scrolled ? ' is-scrolled' : ''}`}>
      <div className="container nav-wrap">
        <a className="brand" href={view === 'home' ? '#home' : '/'} aria-label="Hijgend Hert home"><img src="/clan-logo.png" alt=""/><span>Hijgend Hert<small>OLD SCHOOL RUNESCAPE CLAN</small></span></a>
        <nav id="main-navigation" className={menu ? 'navigation open' : 'navigation'} aria-label="Hoofdnavigatie">
          {navigation.map(item => <a key={item.id} href={item.href} className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => setMenu(false)}><item.icon size={15} strokeWidth={1.6} aria-hidden="true"/><span>{item.label}</span></a>)}
        </nav>
        <a className="button gold nav-join" href="https://discord.gg/KFNqA6bnZ4" target="_blank" rel="noreferrer">Join Discord <ArrowUpRight size={16}/></a>
        <button className="menu-button" onClick={() => setMenu(!menu)} aria-label={menu ? 'Menu sluiten' : 'Menu openen'} aria-expanded={menu} aria-controls="main-navigation">{menu ? <X/> : <Menu/>}</button>
      </div>
    </header>
  </>;
}
