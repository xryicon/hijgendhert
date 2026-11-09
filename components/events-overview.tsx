"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, RefreshCw } from "lucide-react";
import CurrentEvent from "@/components/current-event";
import { weeklyRound, type Competition, type WeeklyCategory } from "@/lib/community";

export type EventView = "overview" | "live" | "calendar" | "past" | "skill" | "boss";
export const eventHash: Record<EventView, string> = { overview: "", live: "#live", calendar: "#kalender", past: "#past-events", skill: "#sotw", boss: "#botw" };
type Props = { competitions: Competition[]; loading: boolean; error: string; onRetry: () => void; onNavigate: (view: EventView) => void; stale?: boolean };
const names = { skill: "Skill of the Week", boss: "Boss of the Week" };
const stateLabels = { active: "Nu bezig", upcoming: "Binnenkort", past: "Laatste ronde", empty: "Nog niet gepland" };
const date = (value: string) => new Date(value).toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });
const metricName = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
function useEventTime() {
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  return now;
}

export default function EventsOverview({ competitions, loading, error, onRetry, onNavigate, stale }: Props) {
  const now = useEventTime();
  return <section className="container events-overview" aria-label="Events van Hijgend Hert">
    <div className="agenda-banner">
      <span className="agenda-banner-icon" aria-hidden="true"><CalendarDays size={29} strokeWidth={1.5}/></span>
      <div className="agenda-banner-copy"><p className="eyebrow">HIJGEND HERT · CLANAGENDA</p><h2>Bekijk alle events</h2><p>SOTW, BOTW, raids en clanavonden. Samen op pad, de hele week.</p></div>
      <a className="button gold" href="#kalender" onClick={e => { e.preventDefault(); onNavigate("calendar"); }}>Open agenda <ArrowRight size={17}/></a>
    </div>
    {error && <div className="weekly-data-message" role="status"><p>{error}</p><button className="text-link" onClick={onRetry}><RefreshCw size={14}/> Opnieuw proberen</button></div>}
    {stale && <p className="weekly-data-message" role="status">Laatst bekende competities. <button className="text-link" onClick={onRetry}>Ververs</button></p>}
    <div className="weekly-event-grid">
      {(["skill", "boss"] as const).map(category => {
        const round = weeklyRound(competitions, category, now);
        const event = round.events[0];
        const busy = loading || !now;
        return <article className={`weekly-event-card weekly-${category}`} key={category}>
          <a className="weekly-art-link" href={eventHash[category]} aria-label={`Bekijk ${names[category]}`} onClick={e => { e.preventDefault(); onNavigate(category); }}>
            <img src={`/hijgend-hert-${category === 'skill' ? 'sotw' : 'botw'}.webp`} alt="" width="1536" height="1024"/>
            <span className={`weekly-state ${!busy && !error ? round.state : ''}`}>{busy ? "Laden…" : error ? "Even niet beschikbaar" : stateLabels[round.state]}</span>
          </a>
          <div className="weekly-card-body">
            <p className="eyebrow">{category === "skill" ? "WEKELIJKS · SKILLING" : "WEKELIJKS · BOSSING"}</p>
            <h2>{names[category]}</h2>
            <p className="weekly-card-description">{category === "skill" ? "Samen trainen, XP pakken en strijden om de eerste plaats. Wie zet deze week de hoogste score neer?" : "Tijd voor een nieuwe jacht. Verzamel kills, daag je clanmates uit en pak een plek op het podium."}</p>
            <div className="weekly-card-current" aria-busy={busy}>
              <span>{busy ? "Competitie ophalen…" : error ? "Bekijk de competities zodra de verbinding terug is." : event ? round.events.length > 1 ? `${round.events.length} ${category === 'boss' ? 'bosses' : 'skills'} in deze ronde` : metricName(event.metric) : "De volgende ronde wordt hier aangekondigd."}</span>
              {!busy && !error && event && <small><Clock3 size={12}/>{date(event.startsAt)} — {date(event.endsAt)}{round.state === 'past' ? ' · Afgelopen' : ''}</small>}
            </div>
            <a className="weekly-card-link" href={eventHash[category]} onClick={e => { e.preventDefault(); onNavigate(category); }}>Naar {category === 'skill' ? 'SOTW' : 'BOTW'} <ArrowRight size={18}/></a>
          </div>
        </article>;
      })}
    </div>
    <p className="weekly-source">Competities en standen via <a href="https://wiseoldman.net/groups/7059/competitions" target="_blank" rel="noreferrer">Wise Old Man ↗</a></p>
  </section>;
}

export function WeeklyEvent({ category, competitions, loading, error, onRetry, onNavigate, stale }: Props & { category: WeeklyCategory }) {
  const now = useEventTime();
  const round = weeklyRound(competitions, category, now);
  const [selected, setSelected] = useState<number | null>(null);
  const event = round.events.find(e => e.id === selected) || round.events[0];
  const busy = loading || !now;
  return <div className="weekly-event-view">
    <div className="container weekly-view-heading">
      <a className="text-link weekly-back" href="/events" onClick={e => { e.preventDefault(); onNavigate('overview'); }}><ArrowLeft size={14}/> Alle events</a>
      <h2>{names[category]}</h2>
      <p>{category === 'skill' ? 'De skillcompetitie van Hijgend Hert.' : 'De bosscompetitie van Hijgend Hert.'}</p>
      {stale && <p role="status">Laatst bekende ronde. <button className="text-link" onClick={onRetry}>Ververs</button></p>}
      {!busy && !error && round.events.length > 1 && <label className="weekly-selection"><span>{category === 'boss' ? 'Kies een boss' : 'Kies een skill'}</span><select value={event.id} onChange={e => setSelected(Number(e.target.value))}>{round.events.map(e => <option key={e.id} value={e.id}>{metricName(e.metric)}</option>)}</select></label>}
    </div>
    {busy ? <div className="container weekly-loading skeletons" role="status" aria-label="Weekcompetitie laden"><div className="skeleton"/><div className="skeleton"/></div> : error ? <div className="container load-error" role="status"><p>{error}</p><button className="text-link" onClick={onRetry}><RefreshCw size={14}/> Opnieuw proberen</button></div> : event ? <CurrentEvent key={event.id} competitionId={event.id} category={category}/> : <div className="container weekly-empty"><CalendarDays size={30}/><h3>Er staat nog geen {category === 'skill' ? 'SOTW' : 'BOTW'} klaar.</h3><p>Zodra de clan een competitie op Wise Old Man aanmaakt, verschijnt die hier.</p><a className="button gold" href="#kalender" onClick={e => { e.preventDefault(); onNavigate('calendar'); }}>Open agenda <ArrowRight size={16}/></a></div>}
  </div>;
}
