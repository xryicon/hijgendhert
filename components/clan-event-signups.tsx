'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Users } from 'lucide-react';
import Link from './site-link';
import { useMemberSession } from './session-provider';
import type { EventView } from '@/lib/clan-discord';

export function useClanEvents() {
  const session = useMemberSession();
  const [events, setEvents] = useState<EventView[]>([]);
  const [error, setError] = useState('');
  const authenticated = session.status === 'authenticated';
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(authenticated ? '/api/members/clan-events' : '/api/clan-events', { cache: 'no-store', signal });
    const data = await response.json() as { events: EventView[]; error?: string };
    if (!response.ok) { if (response.status === 401 || response.status === 403) setEvents([]); throw new Error(data.error || 'Clanactiviteiten konden niet worden geladen.'); }
    setEvents(data.events); setError('');
  }, [authenticated]);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => { if (!document.hidden) void refresh(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); }); };
    load(); const interval = window.setInterval(load, 60000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [refresh]);
  const visibleEvents = authenticated ? events : events.map(({ participants: _participants, ...event }) => ({ ...event, joined: false }));
  return { events: visibleEvents, error, refresh, authenticated };
}

export function MyClanSignups() {
  const { events, error, refresh, authenticated } = useClanEvents();
  const joined = events.filter(e => e.joined).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  if (!authenticated || (!joined.length && !error)) return null;
  return <section className="profile-events my-clan-signups" aria-labelledby="my-clan-signups"><div className="profile-events-heading"><div><p className="profile-section-label">SAMEN OP PAD</p><h2 id="my-clan-signups">Mijn inschrijvingen</h2></div><Link className="text-link" href="/events#kalender">Clanagenda →</Link></div>{error && <p role="status">{error}</p>}{joined.map(event => <article key={event.id}><h3>{event.title}</h3><p>{new Date(event.startsAt).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })} · Nederlandse tijd</p><EventSignup event={event} onChange={refresh}/></article>)}</section>;
}
export function EventSignup({ event, onChange }: { event: EventView; onChange: () => Promise<void> }) {
  const session = useMemberSession(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const closed = event.status === 'cancelled' || Date.parse(event.startsAt) <= Date.now();
  async function submit() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/members/clan-events/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: event.id, action: event.joined ? 'leave' : 'join' }) });
      const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || 'Inschrijving niet gelukt.');
      await onChange();
    } catch (e) { setError(e instanceof Error ? e.message : 'Probeer opnieuw.'); } finally { setBusy(false); }
  }
  return <div className="event-signup"><p><Users size={14}/>{event.participantCount} deelnemers {event.joined && <strong><Check size={14}/> Jij doet mee</strong>}</p>
    {event.participants && event.participants.length > 0 && <details><summary>Bekijk deelnemers</summary><ul>{event.participants.map(p => <li key={p.userId}>{p.name}</li>)}</ul></details>}
    {closed ? <span className="signup-closed">{event.status === 'cancelled' ? 'Event geannuleerd' : 'Inschrijving gesloten'}</span> : session.status === 'authenticated' ? <button className="button gold" onClick={() => void submit()} disabled={busy}>{busy ? 'Opslaan…' : event.joined ? 'Afmelden' : 'Aanmelden'}</button> : <Link className="text-link" href="/login" prefetch={false}>Log in om mee te doen →</Link>}
    {error && <p role="alert">{error}</p>}</div>;
}
