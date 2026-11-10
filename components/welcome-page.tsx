import { ArrowUpRight, ShieldCheck, Sprout } from 'lucide-react';
import SiteHeader from './site-header';
import ClanCrest from './clan-crest';
import { FirstWeek, WelcomeFaq, WelcomeSections } from './welcome-experience';
import { CLAN_DISCORD, type WelcomeContent } from '@/lib/welcome';

export default function WelcomePage({ content }: { content: WelcomeContent }) {
  return <><SiteHeader view="welcome"/><main id="main" className="welcome-page"><section className="welcome-page-hero container"><div><p className="eyebrow"><Sprout size={15}/> WELKOM BIJ HIJGEND HERT</p><h1>Een nieuw avontuur.<br/><em>Een clan om het mee<br/>te delen.</em></h1><p>Nieuw in de clan, klaar voor je eerste boss of op zoek naar mensen om mee te spelen? Maak kennis met de herten en ontdek jouw volgende stap.</p><div className="welcome-hero-actions"><a className="button gold" href={CLAN_DISCORD} target="_blank" rel="noreferrer">Zeg hallo op Discord <ArrowUpRight size={17}/></a><a className="welcome-secondary" href="#eerste-week">Zo sluit je aan ↓</a></div></div><aside className="welcome-entry-pass" aria-label="Toelatingseis"><ClanCrest alt="Hijgend Hert"/><p className="eyebrow">JOUW PLEK BIJ DE HERTEN</p><strong>{content.minimumTotal.toLocaleString('nl-NL')}</strong><span>TOTAL LEVEL</span><div><ShieldCheck size={18}/><p>Dit is de minimale total voor clanlidmaatschap. De clanleiding helpt je met de volgende stap.</p></div><small>NEDERLANDSTALIGE OSRS-CLAN · NL / BE</small></aside></section><FirstWeek content={content}/><WelcomeFaq content={content}/><WelcomeSections content={content} mode="welcome"/></main></>;
}
