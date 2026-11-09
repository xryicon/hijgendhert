"use client";
import { useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";

type Competition = { id: number; title: string; metric: string; startsAt: string; endsAt: string };
const date = (value: string) => new Date(value).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" });

export default function PastEvents({ competitions, loading, error, onRetry, stale, fetchedAt }: { competitions: Competition[]; loading: boolean; error: string; onRetry: () => void; stale?: boolean; fetchedAt?: string }) {
  const [limit, setLimit] = useState(12);
  const past = competitions.filter(event => Date.parse(event.endsAt) <= Date.now()).sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt));
  return <section className="container past-events" aria-labelledby="past-events-title">
    <h2 id="past-events-title">Afgelopen events</h2>
    {loading ? <div className="skeletons" role="status" aria-label="Afgelopen events laden"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div> : error ? <div className="load-error" role="status"><p>{error}</p><button className="text-link" onClick={onRetry}><RefreshCw size={14}/> Opnieuw proberen</button></div> : <>
      {stale && <p className="data-note" role="status">Laatst bekende overzicht{fetchedAt ? ` van ${date(fetchedAt)}` : ""}. <button className="text-link" onClick={onRetry}>Opnieuw laden</button></p>}
      {past.length ? <ol className="past-event-list">{past.slice(0, limit).map(event => <li key={event.id}><a href={`https://wiseoldman.net/competitions/${event.id}`} target="_blank" rel="noreferrer"><span><small>{event.metric.replaceAll("_", " ")}</small><h3>{event.title}</h3><span>{date(event.startsAt)} — {date(event.endsAt)}</span></span><span className="past-event-result">Uitslag <ArrowUpRight size={16}/><span className="sr-only"> op Wise Old Man (nieuw tabblad)</span></span></a></li>)}</ol> : <p className="empty">Er zijn nog geen afgelopen events.</p>}
      {past.length > limit && <button className="button past-events-more" onClick={() => setLimit(value => value + 12)}>Meer events tonen</button>}
    </>}
    <a className="text-link past-events-source" href="https://wiseoldman.net/groups/7059/competitions" target="_blank" rel="noreferrer">Volledig archief op Wise Old Man <ArrowUpRight size={14}/></a>
  </section>;
}

