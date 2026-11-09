"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import EventPodium from "@/components/event-podium";

type Participant = { rank: number; player: { id: number; username: string; displayName: string; updatedAt: string }; gained: number | null };
type EventData = { competition: { id: number; title: string; endsAt: string; unit: string; participants: Participant[] } | null };

export default function CurrentEvent() {
  const [data, setData] = useState<EventData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const interval = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(interval); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    async function fetchEvent() {
      try {
        const response = await fetch("/api/event", { signal: controller.signal });
        const body = await response.json() as { data: EventData; error?: string };
        if (!response.ok) throw new Error(body.error || "De tussenstand kon niet worden geladen.");
        setData(body.data); setNow(Date.now());
      } catch (e) { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : "Laden mislukt."); setData(null); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void fetchEvent();
    const timer = setInterval(fetchEvent, 300_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [refresh]);
  const event = data?.competition;
  const remaining = event ? Math.max(0, Date.parse(event.endsAt) - now) : 0;
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor(remaining / 3600000) % 24;
  const mins = Math.floor(remaining / 60000) % 60;

  return <section className="current-event-section container active-event" id="actueel-event" aria-label="Actieve clancompetitie" aria-busy={loading}>
    {loading ? <div className="panel"><div className="skeletons" role="status" aria-label="Eventranglijst laden"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div></div> : error ? <div className="panel load-error" role="status"><p>{error}</p><button className="text-link" onClick={() => setRefresh(r => r + 1)}><RefreshCw size={14}/> Opnieuw proberen</button></div> : event ? <>
      <div className="active-event-intro">
        <div className="active-event-timer" role="timer" aria-label={remaining > 0 ? `Nog ${days} dagen, ${hours} uren en ${mins} minuten` : "Event afgelopen"}>
          <span className="timer-label">{remaining > 0 ? "Nog te gaan" : "Afgelopen"}</span>
          <div className="active-timer-units" aria-hidden="true"><span><strong>{String(days).padStart(2, "0")}</strong><small>dagen</small></span><i>:</i><span><strong>{String(hours).padStart(2, "0")}</strong><small>uren</small></span><i>:</i><span><strong>{String(mins).padStart(2, "0")}</strong><small>minuten</small></span></div>
        </div>
        <h2>{event.title}</h2>
      </div>
      <div className="panel current-event-panel"><EventPodium participants={event.participants} unit={event.unit}/></div>
    </> : <div className="empty" role="status"><h2>Er is op dit moment geen actief event.</h2><p>Het volgende event verschijnt hier automatisch zodra het begint.</p></div>}
  </section>;
}

