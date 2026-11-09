"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Clock3, RefreshCw } from "lucide-react";
import EventPodium from "@/components/event-podium";

type Participant = { rank: number; player: { id: number; username: string; displayName: string; updatedAt: string }; gained: number | null };
type EventData = { competition: { id: number; title: string; startsAt: string; endsAt: string; unit: string; participants: Participant[] } | null };

export default function CurrentEvent({ competitionId, category = 'all' }: { competitionId?: number; category?: 'all' | 'skill' | 'boss' }) {
  const [data, setData] = useState<EventData | null>(null);
  const [stale, setStale] = useState(false);
  const [fetchedAt, setFetchedAt] = useState('');
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(0);
  const loadedSelection = useRef('');
  useEffect(() => { setNow(Date.now()); const interval = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(interval); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const selection = `${category}:${competitionId || 'current'}`;
    if (loadedSelection.current !== selection) {
      loadedSelection.current = selection; setData(null); setFetchedAt(''); setStale(false);
    }
    let fetching = false;
    let retryAt = 0;
    async function fetchEvent() {
      if (fetching || controller.signal.aborted || document.hidden || Date.now() < retryAt) return;
      fetching = true;
      try {
        const response = await fetch(`/api/event?category=${category}${competitionId ? `&id=${competitionId}` : ''}`, { signal: controller.signal });
        const body = await response.json() as { data: EventData; error?: string; stale?: boolean; fetchedAt?: string };
        if (!response.ok) {
          const delay = Number(response.headers.get('Retry-After'));
          if (Number.isFinite(delay) && delay > 0) retryAt = Date.now() + delay * 1000;
          throw new Error(body.error || "De tussenstand kon niet worden geladen.");
        }
        if (!controller.signal.aborted) { setData(body.data); setNow(Date.now()); setStale(!!body.stale); setFetchedAt(body.fetchedAt || ''); setError(''); }
      } catch (e) { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : "Laden mislukt."); setStale(true); } }
      finally { fetching = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void fetchEvent();
    const timer = setInterval(fetchEvent, 300_000);
    const visible = () => { if (!document.hidden) void fetchEvent(); };
    document.addEventListener('visibilitychange', visible);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [refresh, competitionId, category]);
  const event = data?.competition;
  const upcoming = !!event && Date.parse(event.startsAt) > now;
  const finished = !!event && Date.parse(event.endsAt) <= now;
  const remaining = event ? Math.max(0, Date.parse(upcoming ? event.startsAt : event.endsAt) - now) : 0;
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor(remaining / 3600000) % 24;
  const mins = Math.floor(remaining / 60000) % 60;

  return <section className="current-event-section container active-event" id="actueel-event" aria-label="Clancompetitie en stand" aria-busy={loading}>
    {loading ? <div className="panel"><div className="skeletons" role="status" aria-label="Eventranglijst laden"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div></div> : error && !data ? <div className="panel load-error" role="status"><p>{error}</p><button className="text-link" onClick={() => setRefresh(r => r + 1)}><RefreshCw size={14}/> Opnieuw proberen</button></div> : event ? <>
      <div className="active-event-intro">
        {finished ? <p className="event-finished-stamp"><Clock3 size={14}/> Eindstand · Afgelopen op {new Date(event.endsAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' })}</p> : <div className="active-event-timer" role="timer" aria-label={`${upcoming ? 'Start over' : 'Nog'} ${days} dagen, ${hours} uren en ${mins} minuten`}>
          <span className="timer-label">{upcoming ? "Start over" : "Nog te gaan"}</span>
          <div className="active-timer-units" aria-hidden="true"><span><strong>{String(days).padStart(2, "0")}</strong><small>dagen</small></span><i>:</i><span><strong>{String(hours).padStart(2, "0")}</strong><small>uren</small></span><i>:</i><span><strong>{String(mins).padStart(2, "0")}</strong><small>minuten</small></span></div>
        </div>}
        <h2>{event.title}</h2>
        {stale && <p className="community-fallback" role="status">Wise Old Man is even druk. Laatst bevestigde stand{fetchedAt ? `: ${new Date(fetchedAt).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })}` : ''}.</p>}
      </div>
      <div className="panel current-event-panel">{upcoming ? <div className="event-upcoming-note"><p>De competitie begint binnenkort. De eerste scores verschijnen hier zodra het event start.</p><a className="text-link" href={`https://wiseoldman.net/competitions/${event.id}`} target="_blank" rel="noreferrer">Bekijk op Wise Old Man <ArrowUpRight size={14}/></a></div> : <EventPodium participants={event.participants} unit={event.unit} finished={finished}/>}</div>
    </> : <div className="empty" role="status"><h2>Er is op dit moment geen actief event.</h2><p>Het volgende event verschijnt hier automatisch zodra het begint.</p></div>}
  </section>;
}

