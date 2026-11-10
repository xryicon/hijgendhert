"use client";

import ClanCrest from './clan-crest';
import { ArrowRight, ArrowUpRight, CalendarDays, Camera, Crown, Swords, Users } from 'lucide-react';

export const clanSections = [
  { id: 'leden', label: 'Clanleden', icon: Users },
  { id: 'ranglijst', label: 'Ranglijst', icon: Swords },
  { id: 'erelijst', label: 'Hall of Fame', icon: Crown },
  { id: 'clanleven', label: 'Kalender', icon: CalendarDays },
  { id: 'clanmomenten', label: 'Clanmomenten', icon: Camera },
] as const;
export type ClanSection = typeof clanSections[number]['id'];

type Props = {
  selected: ClanSection;
  onNavigate: (section: ClanSection) => void;
  members: number | null;
  totalXp: number | null;
  world: number | null;
  loading: boolean;
  error: string;
  stale: boolean;
  onRetry: () => void;
  onJoin: () => void;
};

const format = (value: number) => new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(value);

export default function ClanOverview({ selected, onNavigate, members, totalXp, world, loading, error, stale, onRetry, onJoin }: Props) {
  return <>
    <section className="clan-masthead" aria-labelledby="clan-title" id="de-clan">
      <img className="clan-masthead-landscape" src="/hijgend-hert-woodland.webp" alt="" aria-hidden="true" width="2172" height="724" fetchPriority="high"/>
      <div className="container clan-masthead-inner">
        <div className="clan-masthead-copy">
          <p className="eyebrow"><span/> DE CLAN <span className="clan-founded">SINDS 2024</span></p>
          <h1 id="clan-title">Hijgend Hert</h1>
          <p>Een Nederlandstalige Old School RuneScape-clan.<br className="clan-desktop-break"/> Samen op pad voor raids, bossing, PvP en skillcompetities.</p>
          <div className="clan-masthead-actions">
            <button className="button gold" onClick={onJoin}>Maak kennis met de clan <ArrowRight size={15}/></button>
            <a className="text-link" href="https://wiseoldman.net/groups/7059" target="_blank" rel="noreferrer">Wise Old Man <ArrowUpRight size={14}/></a>
          </div>
        </div>
        <ClanCrest className="clan-masthead-crest"/>
        <div className="clan-masthead-bottom">
          <dl className="clan-facts" aria-label="De clan in cijfers" aria-busy={loading}>
            <div><dt>Clanleden</dt><dd>{members === null ? '—' : format(members)}</dd></div>
            <div><dt>Totale clan-XP</dt><dd>{totalXp === null ? '—' : <>{format(totalXp / 1e9)} <small>mld</small></>}</dd></div>
            <div><dt>Thuiswereld</dt><dd>{world || '—'}</dd></div>
          </dl>
          <div className="clan-source"><span className={`dot${error || stale || loading ? ' muted' : ''}`}/><span>{loading ? 'Clangegevens ophalen' : error ? 'Clangegevens tijdelijk niet beschikbaar' : stale ? 'Laatst bekende meting' : 'Via Wise Old Man'}</span>{error && <button className="text-link" onClick={onRetry}>Opnieuw</button>}</div>
        </div>
      </div>
    </section>
    <div className="clan-section-bar">
      <nav className="container clan-section-nav" aria-label="Onderdelen van de clanpagina">
        {clanSections.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={selected === id ? 'location' : undefined} onClick={event => { event.preventDefault(); onNavigate(id); }}><Icon size={16}/>{label}{id === 'leden' && members !== null && <span>{format(members)}</span>}</a>)}
      </nav>
    </div>
  </>;
}
