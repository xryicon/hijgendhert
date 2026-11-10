'use client';
import { useState, type FormEvent } from 'react';
import { Check, Target } from 'lucide-react';
import { minimumLabel } from '@/lib/clan-event-rules';
import type { EventParticipant, EventView } from '@/lib/clan-discord';

function ResultRow({ participant, event, onChanged }: { participant: EventParticipant; event: EventView; onChanged: (event: EventView) => void }) {
  const [amount, setAmount] = useState(participant.progress.gained?.toString() || '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/clan-events/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: event.id, userId: participant.userId, revision: participant.progress.revision, gained: amount === '' ? null : Number(amount) }) });
      const result = await response.json() as { event: EventView; error?: string };
      if (!response.ok) throw new Error(result.error || 'Resultaat niet opgeslagen.');
      onChanged(result.event);
    } catch (e) { setError(e instanceof Error ? e.message : 'Probeer opnieuw.'); } finally { setBusy(false); }
  }
  return <form className="event-result-row" onSubmit={save}><div><strong>{participant.name}</strong><small>{participant.progress.qualified === true ? 'Minimum behaald' : participant.progress.qualified === false ? 'Minimum nog niet behaald' : 'Nog niet gecontroleerd'}</small></div><label><span>Behaalde {event.minimum?.unit.toUpperCase()}</span><input type="number" min="0" max={event.minimum?.unit === 'kc' ? 10000000 : 10000000000} step="1" placeholder="Nog onbekend" value={amount} disabled={busy} onChange={e => setAmount(e.target.value)}/></label><button className="button gold" disabled={busy} type="submit">{busy ? 'Opslaan…' : 'Vastleggen'}</button>{error && <p role="alert">{error}</p>}</form>;
}
export default function AdminEventResults({ event, onChanged }: { event: EventView; onChanged: (event: EventView) => void }) {
  if (!event.minimum) return null;
  return <div className="admin-event-results"><div className="admin-event-details"><span><Target size={15}/>{minimumLabel(event.minimum)}</span><span><Check size={15}/>{event.qualifiedCount} minimum behaald</span></div>{!!event.participants?.length && <details><summary>Deelnemers & resultaten</summary>{Date.parse(event.startsAt) <= Date.now() && event.status === 'scheduled' ? <><p>Vul alleen XP/KC uit de eventperiode in. Leeg laten betekent nog niet gecontroleerd. Deze controle staat los van de Wise Old Man-ranglijst.</p>{event.participants.map(participant => <ResultRow key={`${participant.userId}:${participant.progress.revision}`} participant={participant} event={event} onChanged={onChanged}/>)}</> : <p>Resultaten vastleggen kan vanaf de begintijd.</p>}</details>}</div>;
}
