"use client";
import Link from '@/components/site-link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, Swords, Trophy, Users } from 'lucide-react';
import { activities } from '@/content/clan-life';
import { localDay, overlapsDay, type CalendarEntry, type Competition } from '@/lib/community';
import MetricImage from './metric-image';

const DISCORD = 'https://discord.gg/KFNqA6bnZ4';
const categoryLabels: Record<string, string> = { raid: 'Raids', boss: 'Boss trips', social: 'Sociaal' };
type AgendaEntry = CalendarEntry & { metric?: string };
const stamp = (s: string) => new Date(s).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' });

export default function ClanCalendar({ competitions, loading, error, onRetry, stale, fetchedAt, context = 'clan' }: { competitions: Competition[]; loading: boolean; error: string; onRetry: () => void; stale?: boolean; fetchedAt?: string; context?: 'clan' | 'events' }) {
  const [month, setMonth] = useState('');
  const [today, setToday] = useState('');
  const [day, setDay] = useState('');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { const date = localDay(Date.now()); setToday(date); setMonth(date.slice(0, 7)); setDay(date); }, []);
  const entries = useMemo<AgendaEntry[]>(() => [
    ...activities.map(e => ({ ...e, source: 'clan' as const, url: e.discordUrl })),
    ...competitions.map(e => ({ id: `wom-${e.id}`, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, category: 'competition', metric: e.metric, source: 'wom' as const, url: `https://wiseoldman.net/competitions/${e.id}`, description: `${e.participantCount} geregistreerde deelnemers · ${e.metric.replaceAll('_', ' ')}` })),
  ].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)), [competitions]);
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5)) - 1;
  const days = month ? new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate() : 0;
  const offset = month ? (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7 : 0;
  const trailing = month ? (7 - ((offset + days) % 7)) % 7 : 0;
  const inMonth = entries.filter(e => localDay(e.startsAt).slice(0, 7) <= month && localDay(e.endsAt).slice(0, 7) >= month);
  const visible = day ? inMonth.filter(e => overlapsDay(e, day)) : inMonth;
  const dayLabel = day ? new Date(`${day}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' }) : 'Deze maand';
  function changeMonth(delta: number) { const d = new Date(Date.UTC(year, monthIndex + delta, 15)); setMonth(d.toISOString().slice(0, 7)); setDay(''); setExpanded(false); }
  return <section className="clan-calendar community-section container" id="clanleven">
    <div className="section-heading"><div><p className="eyebrow">HIJGEND HERT</p><h2>De clanagenda</h2><p className="section-description">Competities, raids en clanavonden. Kies een dag voor de details.</p></div>{context === 'events' ? <Link prefetch={false} className="calendar-back" href="/events"><ArrowLeft size={15}/> Terug naar events</Link> : <nav className="community-links" aria-label="Clanleven"><a className="selected" href="#clanleven"><CalendarDays size={15}/> Agenda</a><a href="#erelijst"><Trophy size={15}/> Hall of Fame</a><a href="#clanmomenten">Clanmomenten <ArrowUpRight size={14}/></a></nav>}</div>
    {stale && fetchedAt && <p className="community-fallback" role="status"><Clock3 size={14}/> Wise Old Man is even druk. Laatst bevestigde competities: {stamp(fetchedAt)}. <button className="text-link" onClick={onRetry}>Ververs</button></p>}
    <div className="calendar-layout panel">
      <div className="calendar-month"><div className="calendar-heading"><div className="calendar-month-title"><span className="mini-label">KIES JE DAG</span><h3 aria-live="polite">{month ? monthName(month) : 'Agenda laden…'}</h3></div><div className="calendar-month-controls"><button aria-label="Vorige maand" onClick={() => changeMonth(-1)} disabled={!month}><ChevronLeft size={18}/></button><button className="today-button" disabled={!today} onClick={() => { setMonth(today.slice(0, 7)); setDay(today); setExpanded(false); }}>Vandaag</button><button aria-label="Volgende maand" onClick={() => changeMonth(1)} disabled={!month}><ChevronRight size={18}/></button></div></div>
        <div className="calendar-weekdays" aria-hidden="true">{['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(d => <span key={d}>{d}</span>)}</div>
        <div className="calendar-days" role="group" aria-label="Kies een dag">{Array.from({ length: offset }, (_, i) => <span className="calendar-blank" key={`blank-${i}`} aria-hidden="true"/>)}{Array.from({ length: days }, (_, i) => { const date = `${month}-${String(i + 1).padStart(2, '0')}`; const matches = inMonth.filter(e => overlapsDay(e, date)); const hasHunter = matches.some(e => e.metric === 'hunter'); const dayMetric = !hasHunter ? matches.find(e => e.source === 'wom' && e.metric)?.metric : undefined; return <button key={date} aria-pressed={day === date} aria-current={today === date ? 'date' : undefined} className={`${day === date ? 'selected' : ''} ${today === date ? 'is-today' : ''} ${matches.length ? 'has-events' : ''} ${hasHunter ? 'hunter-day' : dayMetric ? 'metric-day' : ''}`} aria-label={`${i + 1} ${monthName(month)}, ${matches.length} ${matches.length === 1 ? 'activiteit' : 'activiteiten'}${hasHunter ? ', Hunter' : ''}${today === date ? ', vandaag' : ''}`} aria-controls="calendar-agenda" onClick={() => { setDay(day === date ? '' : date); setExpanded(false); }}><span className="calendar-day-number">{i + 1}</span>{hasHunter && <img className="calendar-day-chinchompa" src="/red-chinchompa.png" alt="" width={36} height={32} aria-hidden="true"/>}{dayMetric && <MetricImage metric={dayMetric} size={20} className="calendar-day-metric"/>}<span className="calendar-day-events" aria-hidden="true">{matches.length ? `${matches.length} ${matches.length === 1 ? 'event' : 'events'}` : '\u00a0'}</span><span className="calendar-markers" aria-hidden="true">{matches.slice(0, 3).map(e => <i className={e.source} key={e.id}/>)}</span></button>; })}{Array.from({ length: trailing }, (_, i) => <span className="calendar-blank" key={`trailing-${i}`} aria-hidden="true"/>)}</div>
        <div className="calendar-footer"><div className="calendar-legend"><span><i/> Competitie</span><span><i className="clan"/> Clanactiviteit</span><span><i className="today"/> Vandaag</span></div><p className="calendar-timezone"><Clock3 size={12}/> Nederlandse tijd</p></div>
      </div>
      <div className="calendar-agenda" id="calendar-agenda"><div className="agenda-heading"><div aria-live="polite"><span className="mini-label">{day === today && today ? 'VANDAAG BIJ HIJGEND HERT' : 'OP DE PLANNING'}</span><h3>{dayLabel}</h3><p className="agenda-count">{loading ? 'Agenda wordt bijgewerkt…' : `${visible.length} ${visible.length === 1 ? 'activiteit' : 'activiteiten'}${day ? ' op deze dag' : ' deze maand'}`}</p></div>{day && <button className="text-link" onClick={() => { setDay(''); setExpanded(false); }}>Hele maand <ChevronRight size={13}/></button>}</div>
        {loading ? <p className="community-status" role="status">Competities worden opgehaald…</p> : error ? <div className="community-status" role="status"><p>{error}</p><button className="text-link" onClick={onRetry}>Opnieuw proberen</button></div> : null}
        {visible.length ? <div className="agenda-list">{visible.slice(0, expanded ? undefined : 4).map(e => { const active = Date.parse(e.startsAt) <= Date.now() && Date.parse(e.endsAt) > Date.now(); return <article className="agenda-item" key={e.id}><span className={`agenda-icon ${e.source} ${e.metric === 'hunter' ? 'hunter-icon' : ''}`}>{e.metric === 'hunter' ? <img src="/red-chinchompa.png" alt="Red chinchompa" width={36} height={32}/> : e.source === 'wom' ? <MetricImage metric={e.metric} size={28} fallback={<Trophy size={20}/>}/> : e.category === 'social' ? <Users size={20}/> : <Swords size={20}/>}</span><div><span className="mini-label">{e.source === 'wom' ? 'CLANCOMPETITIE' : categoryLabels[e.category] || 'Clanactiviteit'}{active && <b> · Actief</b>}</span><h4>{e.title}</h4><p className="agenda-date">{stamp(e.startsAt)} — {stamp(e.endsAt)}</p><p>{e.description}</p>{e.host && <p>Georganiseerd door {e.host}</p>}<a className="text-link" href={e.url} target="_blank" rel="noreferrer">{e.source === 'wom' ? 'Bekijk de competitie' : 'Aanmelden via Discord'} <ArrowUpRight size={14}/></a></div></article>; })}{visible.length > 4 && <button className="text-link" onClick={() => setExpanded(!expanded)}>{expanded ? 'Minder tonen' : `Alle ${visible.length} activiteiten tonen`}</button>}</div> : !loading && !error && <div className="agenda-empty"><CalendarDays size={28}/><h4>Nog niets op de planning.</h4><p>{day ? 'Kies een andere dag of bekijk de hele maand.' : 'Nieuwe activiteiten krijgen hier hun plek zodra ze zijn aangekondigd.'}</p></div>}
        <div className="agenda-discord"><Users size={20}/><div><h4>Zelf iets organiseren?</h4><p>{activities.length ? 'Details en aanmeldingen vind je bij de activiteit.' : 'Raids, boss trips en clanavonden volgen zodra er data bekend zijn.'}</p><a className="text-link" href={DISCORD} target="_blank" rel="noreferrer">Overleg op Discord <ArrowUpRight size={14}/></a></div></div>
      </div>
    </div>
  </section>;
}

