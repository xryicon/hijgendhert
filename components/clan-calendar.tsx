"use client";
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, Swords, Trophy, Users } from 'lucide-react';
import { activities } from '@/content/clan-life';
import { localDay, overlapsDay, type CalendarEntry, type Competition } from '@/lib/community';

const DISCORD = 'https://discord.gg/KFNqA6bnZ4';
const filters = [{ id: 'all', label: 'Alles' }, { id: 'competition', label: 'Competities' }, { id: 'raid', label: 'Raids' }, { id: 'boss', label: 'Boss trips' }, { id: 'social', label: 'Sociaal' }];
const stamp = (s: string) => new Date(s).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' });

export default function ClanCalendar({ competitions, loading, error, onRetry, stale, fetchedAt, context = 'clan' }: { competitions: Competition[]; loading: boolean; error: string; onRetry: () => void; stale?: boolean; fetchedAt?: string; context?: 'clan' | 'events' }) {
  const [month, setMonth] = useState('');
  const [today, setToday] = useState('');
  const [day, setDay] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { const date = localDay(Date.now()); setToday(date); setMonth(date.slice(0, 7)); setDay(date); }, []);
  const entries = useMemo<CalendarEntry[]>(() => [
    ...activities.map(e => ({ ...e, source: 'clan' as const, url: e.discordUrl })),
    ...competitions.map(e => ({ id: `wom-${e.id}`, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, category: 'competition', source: 'wom' as const, url: `https://wiseoldman.net/competitions/${e.id}`, description: `${e.participantCount} geregistreerde deelnemers · ${e.metric.replaceAll('_', ' ')}` })),
  ].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)), [competitions]);
  const matching = entries.filter(e => filter === 'all' || e.category === filter);
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5)) - 1;
  const days = month ? new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate() : 0;
  const offset = month ? (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7 : 0;
  const inMonth = matching.filter(e => localDay(e.startsAt).slice(0, 7) <= month && localDay(e.endsAt).slice(0, 7) >= month);
  const visible = day ? inMonth.filter(e => overlapsDay(e, day)) : inMonth;
  const dayLabel = day ? new Date(`${day}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' }) : 'Deze maand';
  function changeMonth(delta: number) { const d = new Date(Date.UTC(year, monthIndex + delta, 15)); setMonth(d.toISOString().slice(0, 7)); setDay(''); setExpanded(false); }
  return <section className="community-section container" id="clanleven">
    <div className="section-heading"><div><p className="eyebrow">CLANAGENDA</p><h2>Kalender</h2><p className="section-description">Competities, raids en andere clanactiviteiten.</p></div><nav className="community-links" aria-label="Clanleven"><a className="selected" href="#clanleven"><CalendarDays size={15}/> Agenda</a><a href={context === 'events' ? '/clan#erelijst' : '#erelijst'}><Trophy size={15}/> Hall of Fame</a><a href={context === 'events' ? '/clan#clanmomenten' : '#clanmomenten'}>Clanmomenten <ArrowUpRight size={14}/></a></nav></div>
    <div className="community-filters" role="group" aria-label="Activiteitstype">{filters.map(f => <button key={f.id} aria-pressed={filter === f.id} className={filter === f.id ? 'selected' : ''} onClick={() => { setFilter(f.id); setExpanded(false); }}>{f.label}</button>)}</div>
    {stale && fetchedAt && <p className="community-fallback" role="status"><Clock3 size={14}/> Wise Old Man is even druk. Laatst bevestigde competities: {stamp(fetchedAt)}. <button className="text-link" onClick={onRetry}>Ververs</button></p>}
    <div className="calendar-layout panel">
      <div className="calendar-month"><div className="calendar-heading"><h3 aria-live="polite">{month ? monthName(month) : 'Agenda laden…'}</h3><div><button aria-label="Vorige maand" onClick={() => changeMonth(-1)} disabled={!month}><ChevronLeft size={18}/></button><button className="today-button" onClick={() => { setMonth(today.slice(0, 7)); setDay(today); setExpanded(false); }}>Vandaag</button><button aria-label="Volgende maand" onClick={() => changeMonth(1)} disabled={!month}><ChevronRight size={18}/></button></div></div>
        <div className="calendar-weekdays" aria-hidden="true">{['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(d => <span key={d}>{d}</span>)}</div>
        <div className="calendar-days" role="group" aria-label="Kies een dag">{Array.from({ length: offset }, (_, i) => <span className="calendar-blank" key={`blank-${i}`}/>)}{Array.from({ length: days }, (_, i) => { const date = `${month}-${String(i + 1).padStart(2, '0')}`; const matches = inMonth.filter(e => overlapsDay(e, date)); return <button key={date} aria-pressed={day === date} aria-current={today === date ? 'date' : undefined} className={`${day === date ? 'selected' : ''} ${today === date ? 'is-today' : ''}`} aria-label={`${i + 1} ${monthName(month)}, ${matches.length} activiteiten`} onClick={() => { setDay(day === date ? '' : date); setExpanded(false); }}><span>{i + 1}</span><span className="calendar-markers" aria-hidden="true">{matches.slice(0, 3).map(e => <i className={e.source} key={e.id}/>)}</span></button>; })}</div>
        <div className="calendar-legend"><span><i/> Wise Old Man</span><span><i className="clan"/> Clanactiviteit</span></div><p className="calendar-timezone"><Clock3 size={12}/> Alle tijden zijn Nederlandse tijd.</p>
      </div>
      <div className="calendar-agenda"><div className="agenda-heading"><div><span className="mini-label">DE AGENDA</span><h3>{dayLabel}</h3></div>{day && <button className="text-link" onClick={() => { setDay(''); setExpanded(false); }}>Hele maand</button>}</div>
        {loading && (filter === 'all' || filter === 'competition') ? <p className="community-status" role="status">Competities worden opgehaald…</p> : error && (filter === 'all' || filter === 'competition') ? <div className="community-status" role="status"><p>{error}</p><button className="text-link" onClick={onRetry}>Opnieuw proberen</button></div> : null}
        {visible.length ? <div className="agenda-list">{visible.slice(0, expanded ? undefined : 4).map(e => { const active = Date.parse(e.startsAt) <= Date.now() && Date.parse(e.endsAt) > Date.now(); return <article className="agenda-item" key={e.id}><span className={`agenda-icon ${e.source}`}>{e.source === 'wom' ? <Trophy size={20}/> : e.category === 'social' ? <Users size={20}/> : <Swords size={20}/>}</span><div><span className="mini-label">{e.source === 'wom' ? 'CLANCOMPETITIE' : filters.find(f => f.id === e.category)?.label}{active && <b> · Actief</b>}</span><h4>{e.title}</h4><p className="agenda-date">{stamp(e.startsAt)} — {stamp(e.endsAt)}</p><p>{e.description}</p>{e.host && <p>Georganiseerd door {e.host}</p>}<a className="text-link" href={e.url} target="_blank" rel="noreferrer">{e.source === 'wom' ? 'Bekijk de competitie' : 'Aanmelden via Discord'} <ArrowUpRight size={14}/></a></div></article>; })}{visible.length > 4 && <button className="text-link" onClick={() => setExpanded(!expanded)}>{expanded ? 'Minder tonen' : `Alle ${visible.length} activiteiten tonen`}</button>}</div> : !loading && !(error && (filter === 'all' || filter === 'competition')) && <div className="agenda-empty"><CalendarDays size={28}/><h4>{filter === 'competition' ? 'Geen competities in deze selectie.' : 'Nog niets op de planning.'}</h4><p>{day ? 'Kies een andere dag of bekijk de hele maand.' : 'Nieuwe activiteiten krijgen hier hun plek zodra ze zijn aangekondigd.'}</p></div>}
        <div className="agenda-discord"><Users size={20}/><div><h4>Zelf iets organiseren?</h4><p>{activities.length ? 'Details en aanmeldingen vind je bij de activiteit.' : 'Raids, boss trips en clanavonden volgen zodra er data bekend zijn.'}</p><a className="text-link" href={DISCORD} target="_blank" rel="noreferrer">Overleg op Discord <ArrowUpRight size={14}/></a></div></div>
      </div>
    </div>
  </section>;
}

