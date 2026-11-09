"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { raffleEntriesSchema } from '@/lib/raffle-validation';
import type { RaffleRound } from '@/lib/raffle-types';
import { RafflePlayerPicker, useRaffleRoster } from './raffle-player-picker';

type Row = { id: number; name: string; tickets: string };
type Draft = { hash: string; rows: Row[] };
const number = (value: number) => value.toLocaleString('nl-NL');

export function RaffleEntryEditor({ round, offset, canManage, onSaved }: { round: RaffleRound; offset: number; canManage: boolean; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [now, setNow] = useState(0);
  const nextId = useRef(1);
  const sending = useRef(false);
  const roster = useRaffleRoster(draft !== null);
  useEffect(() => {
    setNow(Date.now() + offset);
    const timer = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(timer);
  }, [offset]);
  const closed = round.status !== 'scheduled' || now >= round.drawAt;
  const outdated = !!draft && (conflict || draft.hash !== round.entriesHash);
  function start() {
    setDraft({ hash: round.entriesHash, rows: round.entries.map(entry => ({ id: nextId.current++, name: entry.name, tickets: String(entry.tickets) })) });
    setError(''); setConflict(false);
  }
  function changeRows(change: (rows: Row[]) => Row[]) {
    setDraft(value => value ? { ...value, rows: change(value.rows) } : value);
    setError('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || sending.current || closed || outdated || !canManage) return;
    const parsed = raffleEntriesSchema.safeParse({ id: round.id, expectedEntriesHash: draft.hash, entries: draft.rows.map(row => ({ name: row.name, tickets: Number(row.tickets) })) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Controleer de namen en aantallen loten.'); return; }
    sending.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/raffle/entries', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data), signal: AbortSignal.timeout(25_000) });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        if (response.status === 409) setConflict(true);
        throw new Error(result.error || 'De wijzigingen konden niet worden opgeslagen.');
      }
      setDraft(null); onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan is niet gelukt. Je kunt veilig opnieuw proberen.');
    } finally { sending.current = false; setBusy(false); }
  }
  if (closed) return <p className="raffle-muted" role="status">De inschrijving is gesloten. De definitieve deelnemerslijst wordt gebruikt voor de trekking.</p>;
  if (!draft) return <button className="button gold" type="button" onClick={start}><Users size={16}/> Deelnemers aanpassen</button>;
  return <form className="raffle-entry-edit" onSubmit={save}>
    <fieldset disabled={busy}>
      <div className="raffle-editor-heading"><h4>Deelnemers & loten</h4><span>{number(draft.rows.reduce((total, row) => total + Math.max(0, Number(row.tickets) || 0), 0))} loten</span></div>
      <p className="raffle-muted">Voeg namen toe, pas lotenaantallen aan of verwijder iemand met het prullenbakje. Klik daarna op Wijzigingen opslaan.</p>
      <div className="raffle-roster-status" role="status"><Users size={15}/><span>{roster.loading && !roster.players.length ? 'Clanleden ophalen bij Wise Old Man…' : roster.message}{roster.players.length > 0 && <small>{number(roster.players.length)} namen beschikbaar</small>}</span>{!roster.loading && <button type="button" disabled={!roster.canRetry} onClick={roster.retry}>{roster.canRetry ? 'Vernieuwen' : 'Even wachten'}</button>}</div>
      <div className="raffle-editor-labels"><span>NAAM</span><span>AANTAL LOTEN</span><span/></div>
      <div className="raffle-editor-rows">{draft.rows.map((row, index) => <div className="raffle-editor-row" key={row.id}>
        <RafflePlayerPicker name={row.name} index={index} players={roster.players} loading={roster.loading} usedNames={draft.rows.filter(item => item.id !== row.id).map(item => item.name)} onChange={name => changeRows(rows => rows.map(item => item.id === row.id ? { ...item, name } : item))}/>
        <input aria-label={`Loten deelnemer ${index + 1}`} type="number" min="1" max="10000" step="1" required value={row.tickets} onChange={event => changeRows(rows => rows.map(item => item.id === row.id ? { ...item, tickets: event.target.value } : item))}/>
        <button type="button" aria-label={`Verwijder ${row.name || `deelnemer ${index + 1}`}`} onClick={() => changeRows(rows => rows.filter(item => item.id !== row.id))}><Trash2 size={16}/></button>
      </div>)}</div>
      <button className="raffle-add-name" type="button" disabled={draft.rows.length >= 500} onClick={() => changeRows(rows => [...rows, { id: nextId.current++, name: '', tickets: '1' }])}><Plus size={16}/> Naam toevoegen</button>
      {!draft.rows.length && <p className="raffle-muted">De lijst is leeg. Je kunt tot de trekking weer deelnemers toevoegen. Zonder deelnemers wordt er geen winnaar getrokken.</p>}
      {outdated && <div className="raffle-edit-conflict" role="status"><p>De lijst is intussen gewijzigd of de inschrijving is gesloten. Je invoer is nog niet opgeslagen.</p><button className="text-link" type="button" onClick={() => { setDraft(null); onSaved(); }}>Mijn wijzigingen verwerpen en actuele lijst laden</button></div>}
      <div className="raffle-edit-actions"><button className="button gold" type="submit" disabled={busy || outdated}>{busy ? <RefreshCw size={16}/> : <Check size={16}/>} {busy ? 'Opslaan…' : 'Wijzigingen opslaan'}</button><button className="text-link" type="button" onClick={() => { setDraft(null); setError(''); }}>Niet opslaan</button></div>
      <p className="raffle-muted">Lotnummers en kansen worden na het opslaan opnieuw berekend. De datum en trekkingscode blijven hetzelfde.</p>
    </fieldset>
    {error && <p className="raffle-error" role="alert">{error}</p>}
  </form>;
}
