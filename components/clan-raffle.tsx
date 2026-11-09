"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Download, Gift, LockKeyhole, Plus, RefreshCw, Search, ShieldCheck, Ticket, Trash2, Trophy, Users, X } from 'lucide-react';
import { useMemberSession } from './session-provider';
import { raffleScheduleSchema } from '@/lib/raffle-validation';
import { verifyRaffle } from '@/lib/raffle-proof';
import { raffleNameKey, ticketCode, type RaffleRound, type RaffleSchedule, type RaffleState } from '@/lib/raffle-types';

const number = (value: number) => value.toLocaleString('nl-NL');
const dateTime = (value: number) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(value);

function useRaffle(id = '') {
  const [data, setData] = useState<RaffleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>; let running = false;
    setLoading(true); setError(''); setData(null);
    async function load() {
      if (running || controller.signal.aborted) return;
      if (document.hidden) { timer = setTimeout(load, 30_000); return; }
      running = true; let delay = 30_000;
      try {
        const started = Date.now();
        const response = await fetch(`/api/raffle${id ? `?id=${encodeURIComponent(id)}` : ''}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        const body = await response.json() as RaffleState & { error?: string };
        if (!response.ok) throw new Error(body.error || 'De raffle kon niet worden geladen.');
        if (controller.signal.aborted) return;
        setOffset(body.serverNow - (started + Date.now()) / 2); setData(body); setError('');
        if (body.round?.status === 'scheduled' && body.round.drawAt - body.serverNow < 35_000) delay = 2000;
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'De raffle is even niet bereikbaar.'); }
      finally { running = false; if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(load, delay); } }
    }
    void load();
    const visible = () => { if (!document.hidden) { clearTimeout(timer); void load(); } };
    document.addEventListener('visibilitychange', visible);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [id, reload]);
  return { data, loading, error, offset, refresh: () => setReload(value => value + 1) };
}

export function RaffleArt() {
  return <div className="raffle-art" aria-hidden="true"><div className="raffle-art-halo"/><span className="raffle-art-ticket raffle-ticket-back"/><span className="raffle-art-ticket"><span className="raffle-ticket-word">HIJGEND HERT</span><img src="/clan-logo.png" alt=""/><span className="raffle-ticket-caption">DE CLANRAFFLE</span><span className="raffle-ticket-perf"/></span><span className="raffle-art-spark raffle-spark-one">✦</span><span className="raffle-art-spark raffle-spark-two">✧</span></div>;
}

export function RaffleCard({ onOpen }: { onOpen: () => void }) {
  const { data, loading } = useRaffle();
  const round = data?.round;
  return <article className="weekly-event-card weekly-raffle">
    <a className="weekly-art-link" href="#raffle" onClick={e => { e.preventDefault(); onOpen(); }} aria-label="Bekijk de clanraffle"><RaffleArt/><span className="weekly-state">Gratis deelname</span></a>
    <div className="weekly-card-body"><p className="eyebrow">VOOR DE CLAN · RAFFLE</p><h2>De clanraffle</h2><p className="weekly-card-description">Jouw naam, jouw loten. Tel samen af en kijk live wie er met de prijs vandoor gaat.</p>
      <div className="weekly-card-current"><span>{loading ? 'Raffle ophalen…' : round?.status === 'scheduled' ? round.title : round?.status === 'drawn' ? `Gefeliciteerd, ${round.winner}!` : 'Nog geen trekking gepland'}</span>{round?.status === 'scheduled' && <small><Clock3 size={12}/>{dateTime(round.drawAt)} · NL/BE</small>}</div>
      <a className="weekly-card-link" href="#raffle" onClick={e => { e.preventDefault(); onOpen(); }}>Naar de raffle <ArrowRight size={18}/></a>
    </div>
  </article>;
}

function Countdown({ at, offset }: { at: number; offset: number }) {
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.ceil((at - (now + offset)) / 1000));
  const units = [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60];
  if (now && seconds === 0) return <p className="raffle-drawing" role="status"><RefreshCw size={20}/> De trekking loopt…<small>De uitslag verschijnt vanzelf.</small></p>;
  return <div className="raffle-countdown" role="timer" aria-label="Tijd tot de trekking">{units.map((value, index) => <div key={index}><strong>{now ? String(value).padStart(2, '0') : '—'}</strong><span>{['dagen', 'uren', 'minuten', 'seconden'][index]}</span></div>)}</div>;
}

function RaffleProof({ round }: { round: RaffleRound }) {
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  useEffect(() => setVerified(null), [round.id, round.status]);
  async function verify() { setChecking(true); try { setVerified(await verifyRaffle(round)); } catch { setVerified(false); } finally { setChecking(false); } }
  function download() {
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify({ algorithm: 'hh-raffle-v1 / SHA-256 / rejection sampling', ...round }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = objectUrl; link.download = `hijgend-hert-raffle-${round.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  return <details className="raffle-proof"><summary><ShieldCheck size={18}/><span>Controleer de trekking<small>De lotenlijst en trekkingscode zijn vooraf vastgelegd.</small></span><Plus size={16}/></summary>
    <div className="raffle-proof-body"><p>Elk gratis lot heeft evenveel kans. Bij het plannen zet de server de lijst vast en maakt hij een geheime willekeurige code. De vingerafdruk daarvan staat hieronder. Na de trekking wordt de code openbaar, zodat je browser de uitslag opnieuw kan berekenen.</p>
      <dl><div><dt>Vingerafdruk trekkingscode</dt><dd>{round.commitment}</dd></div><div><dt>Vingerafdruk lotenlijst</dt><dd>{round.entriesHash}</dd></div>{round.seed && <div><dt>Openbaar gemaakte trekkingscode</dt><dd>{round.seed}</dd></div>}</dl>
      <div className="raffle-proof-actions"><button className="button outline" onClick={download}><Download size={15}/> Bewijs downloaden</button>{round.status === 'drawn' && <button className="button gold" onClick={() => void verify()} disabled={checking}><ShieldCheck size={15}/>{checking ? 'Controleren…' : 'Controleer uitslag'}</button>}</div>
      {verified !== null && <p className={verified ? 'raffle-verified' : 'raffle-error'} role="status">{verified ? 'De code, lotenlijst en winnaar komen overeen. Deze trekking is gecontroleerd.' : 'Het bewijs komt niet overeen. Neem contact op met de clanleiding.'}</p>}
      <p className="raffle-proof-note">Je kunt het bewijs vooraf bewaren en na de trekking vergelijken. Deze controle bevestigt de vastgelegde uitslag; de server genereert de willekeurige code.</p>
    </div>
  </details>;
}

function Entrants({ round }: { round: RaffleRound }) {
  const [query, setQuery] = useState(''); const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); setQuery(''); }, [round.id]);
  const entries = round.entries.filter(entry => raffleNameKey(entry.name).includes(raffleNameKey(query)));
  const pages = Math.max(1, Math.ceil(entries.length / 25));
  return <section className="raffle-entrants" aria-labelledby="raffle-entrants-title"><div className="raffle-section-heading"><div><p className="eyebrow">DE LOTENLĲST</p><h3 id="raffle-entrants-title">Wie doet er mee?</h3></div><span className="raffle-locked"><LockKeyhole size={13}/> Vastgelegd</span></div>
    <label className="raffle-search"><Search size={17}/><input value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Zoek een naam…" aria-label="Zoek een deelnemer"/></label>
    <div className="raffle-table-scroll"><table><thead><tr><th>NAAM</th><th>GRATIS LOTEN</th><th>LOTNUMMERS</th><th>KANS</th></tr></thead><tbody>{entries.slice(page * 25, page * 25 + 25).map(entry => <tr key={entry.first} className={round.status === 'drawn' && round.winner === entry.name ? 'raffle-winning-row' : ''}><td>{round.status === 'drawn' && round.winner === entry.name && <Trophy size={15}/>} {entry.name}</td><td>{number(entry.tickets)}</td><td>{number(entry.first)}{entry.last !== entry.first ? ` – ${number(entry.last)}` : ''}</td><td>{(entry.tickets / round.totalTickets * 100).toLocaleString('nl-NL', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}%</td></tr>)}</tbody></table></div>
    {!entries.length && <p className="raffle-muted">Geen deelnemers gevonden.</p>}
    <div className="raffle-table-footer"><span>{number(entries.length)} {entries.length === 1 ? 'deelnemer' : 'deelnemers'} · {number(round.totalTickets)} gratis loten</span>{pages > 1 && <div><button disabled={page === 0} onClick={() => setPage(value => value - 1)} aria-label="Vorige deelnemers"><ChevronLeft size={16}/></button><span>{page + 1} / {pages}</span><button disabled={page + 1 >= pages} onClick={() => setPage(value => value + 1)} aria-label="Volgende deelnemers"><ChevronRight size={16}/></button></div>}</div>
  </section>;
}

type DraftEntry = { id: number; name: string; tickets: string };
function RaffleManager({ active, onSaved }: { active: RaffleRound | null; onSaved: () => void }) {
  const [title, setTitle] = useState('Clandraffle'); const [prize, setPrize] = useState(''); const [drawAt, setDrawAt] = useState('');
  const [zone, setZone] = useState('jouw tijdzone');
  const [rows, setRows] = useState<DraftEntry[]>([{ id: 1, name: '', tickets: '1' }]); const nextId = useRef(2);
  const [review, setReview] = useState<RaffleSchedule | null>(null); const requestId = useRef('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [reason, setReason] = useState(''); const [cancelOpen, setCancelOpen] = useState(false);
  useEffect(() => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  const changed = () => { setReview(null); setError(''); requestId.current = ''; };
  function prepare(e: FormEvent) {
    e.preventDefault(); setError('');
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const parsed = raffleScheduleSchema.safeParse({ requestId: requestId.current, title, prize, drawAt: new Date(drawAt).getTime(), freeEntry: true, entries: rows.map(row => ({ name: row.name, tickets: Number(row.tickets) })) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Controleer de ingevulde gegevens.'); return; }
    if (parsed.data.drawAt < Date.now() + 60_000 || parsed.data.drawAt > Date.now() + 180 * 86_400_000) { setError('Kies een datum vanaf één minuut vooruit, binnen zes maanden.'); return; }
    setReview(parsed.data);
  }
  async function send(path: string, body: unknown) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/raffle/${path}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Opslaan is niet gelukt.');
      setReview(null); setCancelOpen(false); setReason(''); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Opslaan is niet gelukt. Je kunt veilig opnieuw proberen.'); }
    finally { setBusy(false); }
  }
  return <details className="raffle-manager" open={active?.status !== 'scheduled'}><summary><ShieldCheck size={18}/><span>Raffle beheren<small>Alleen voor Admin en Staff team</small></span><Plus size={16}/></summary><div className="raffle-manager-body">
    {active?.status === 'scheduled' ? <><p>De deelnemers en loten staan vast. De trekking gebeurt automatisch op <strong>{dateTime(active.drawAt)} (NL/BE)</strong>, ook als niemand de pagina open heeft.</p><button className="text-link" onClick={() => setCancelOpen(value => !value)}>Trekking annuleren</button>{cancelOpen && <form onSubmit={e => { e.preventDefault(); void send('cancel', { id: active.id, reason }); }}><label>Reden voor annulering<input value={reason} onChange={e => setReason(e.target.value)} minLength={5} maxLength={200} required/></label><p className="raffle-muted">De annulering en reden blijven openbaar in de geschiedenis. Een getrokken winnaar kan niet worden gewijzigd.</p><button className="button outline" disabled={busy || reason.trim().length < 5}>Bevestig annulering</button></form>}</> : <form onSubmit={prepare}>
      <fieldset disabled={busy}><div className="raffle-form-grid"><label>Naam van de raffle<input value={title} onChange={e => { changed(); setTitle(e.target.value); }} required minLength={3} maxLength={80}/></label><label>Prijs <small>(optioneel)</small><input value={prize} onChange={e => { changed(); setPrize(e.target.value); }} placeholder="Wat geeft de clan weg?" maxLength={160}/></label><label className="raffle-date-field">Datum en tijd van de trekking<input type="datetime-local" value={drawAt} onChange={e => { changed(); setDrawAt(e.target.value); }} required/><small>In jouw tijdzone: {zone}</small></label></div>
        <div className="raffle-editor-heading"><h4>Namen & gratis loten</h4><span>{number(rows.reduce((sum, row) => sum + Math.max(0, Number(row.tickets) || 0), 0))} loten</span></div>
        <div className="raffle-editor-labels"><span>NAAM</span><span>AANTAL LOTEN</span><span/></div>
        <div className="raffle-editor-rows">{rows.map((row, index) => <div className="raffle-editor-row" key={row.id}><input aria-label={`Naam deelnemer ${index + 1}`} value={row.name} maxLength={30} placeholder="RuneScape-naam" required onChange={e => { changed(); setRows(old => old.map(item => item.id === row.id ? { ...item, name: e.target.value } : item)); }}/><input aria-label={`Gratis loten deelnemer ${index + 1}`} type="number" min="1" max="10000" step="1" value={row.tickets} required onChange={e => { changed(); setRows(old => old.map(item => item.id === row.id ? { ...item, tickets: e.target.value } : item)); }}/><button type="button" aria-label={`Verwijder deelnemer ${index + 1}`} disabled={rows.length === 1} onClick={() => { changed(); setRows(old => old.filter(item => item.id !== row.id)); }}><Trash2 size={16}/></button></div>)}</div>
        <button className="raffle-add-name" type="button" disabled={rows.length >= 500} onClick={() => { changed(); setRows(old => [...old, { id: nextId.current++, name: '', tickets: '1' }]); }}><Plus size={16}/> Naam toevoegen</button>
        <p className="raffle-muted">Gebruik de RuneScape-naam uit het ledenprofiel om de gratis loten daar ook te tonen. Na het plannen worden de lijst, aantallen en tijd vastgezet.</p>
        {!review && <button className="button gold" type="submit"><CalendarDays size={16}/> Controleer & plan</button>}
        {review && <div className="raffle-review" role="status"><p className="eyebrow">CONTROLEER JE TREKKING</p><h4>{review.title}</h4><p><strong>{dateTime(review.drawAt)} (NL/BE)</strong></p><p>{review.entries.length} deelnemers · {number(review.entries.reduce((sum, entry) => sum + entry.tickets, 0))} gratis loten{review.prize ? ` · Prijs: ${review.prize}` : ''}</p><p>De bovenstaande namen en aantallen worden vastgelegd. De trekking loopt daarna automatisch.</p><div><button className="button gold" type="button" disabled={busy} onClick={() => void send('schedule', review)}>{busy ? <RefreshCw size={16}/> : <LockKeyhole size={16}/>} {busy ? 'Plannen…' : 'Bevestig & plan trekking'}</button><button type="button" className="text-link" disabled={busy} onClick={() => setReview(null)}>Terug</button></div></div>}
      </fieldset>
    </form>}
    {error && <p className="raffle-error" role="alert">{error}</p>}
  </div></details>;
}

export default function ClanRaffle({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState('');
  const { data, loading, error, offset, refresh } = useRaffle(selected);
  const session = useMemberSession();
  const staff = session.status === 'authenticated' && ['Admin', 'Staff team'].includes(session.member?.clanRole || '');
  const round = data?.round;
  return <section className="container clan-raffle" aria-labelledby="raffle-title">
    <div className="raffle-top"><a href="/events" className="text-link weekly-back" onClick={e => { e.preventDefault(); onBack(); }}><ArrowLeft size={14}/> Alle events</a><span><Ticket size={14}/> Gratis deelname</span></div>
    <div className={`raffle-stage${round?.status === 'drawn' ? ' raffle-is-drawn' : ''}`}>
      <div className="raffle-stage-crest" aria-hidden="true"><img src="/clan-logo.png" alt=""/></div>
      <p className="eyebrow">HIJGEND HERT · DE CLANRAFFLE</p><h2 id="raffle-title">{round?.title || 'Een lot voor de clan'}</h2>
      {loading && !data ? <p className="raffle-muted" role="status">De raffle wordt opgehaald…</p> : round ? <>
        {round.prize && <p className="raffle-prize"><Gift size={17}/>{round.prize}</p>}
        {round.status === 'scheduled' ? <><p className="raffle-countdown-label">DE TREKKING BEGINT OVER</p><Countdown at={round.drawAt} offset={offset}/><p className="raffle-draw-date"><CalendarDays size={14}/>{dateTime(round.drawAt)} · NL/BE</p></> : round.status === 'drawn' ? <div className="raffle-winner" role="status"><Trophy size={33}/><p>HET WINNENDE LOT IS VAN</p><h3>{round.winner}</h3><strong>{ticketCode(round.id, round.winningTicket!)}</strong><span>Getrokken op {dateTime(round.drawnAt!)} · NL/BE</span></div> : <div className="raffle-cancelled"><p>Deze trekking is geannuleerd.</p><span>{round.cancellationReason}</span></div>}
        <div className="raffle-totals"><span><Users size={17}/><strong>{number(round.entries.length)}</strong> deelnemers</span><span><Ticket size={17}/><strong>{number(round.totalTickets)}</strong> gratis loten</span><span><ShieldCheck size={17}/> Controleerbare trekking</span></div>
      </> : !error && <div className="raffle-empty"><p>Nog geen raffle gepland.</p><span>Zodra de clanleiding een trekking plant, vind je hier de deelnemers, de gratis loten en de countdown.</span></div>}
    </div>
    {error && <div className="raffle-error raffle-connection" role="status"><p>{error}{data ? ' Je ziet de laatst geladen gegevens.' : ''}</p><button className="text-link" onClick={refresh}><RefreshCw size={14}/> Opnieuw proberen</button></div>}
    {data && <>
      {staff && !selected && <RaffleManager active={round || null} onSaved={refresh}/>}
      {round && <><Entrants round={round}/><RaffleProof round={round}/></>}
      {!!data.history.length && <div className="raffle-history"><label>Vorige trekkingen<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Laatste raffle</option>{data.history.map(item => <option key={item.id} value={item.id}>{item.title} · {dateTime(item.drawAt)}{item.status === 'cancelled' ? ' · Geannuleerd' : ` · ${item.winner}`}</option>)}</select></label>{selected && <button className="text-link" onClick={() => setSelected('')}>Terug naar de laatste raffle <ArrowRight size={15}/></button>}</div>}
    </>}
    <p className="raffle-footer-note">Een gratis giveaway voor Hijgend Hert. Deelname kost niets. De clanleiding voegt namen en gratis loten toe.</p>
  </section>;
}

export function ProfileRaffle({ playerName }: { playerName: string }) {
  const { data, error } = useRaffle();
  const round = data?.round;
  const entry = round?.entries.find(entry => raffleNameKey(entry.name) === raffleNameKey(playerName));
  if (!round || !entry || error) return null;
  return <section className="profile-raffle"><span className="profile-raffle-icon"><Ticket size={23}/></span><div><p className="profile-section-label">GRATIS CLANRAFFLE</p><h3>{round.title}</h3><p><strong>{number(entry.tickets)} gratis {entry.tickets === 1 ? 'lot' : 'loten'}</strong> voor {playerName}</p><small>{round.status === 'scheduled' ? `Trekking: ${dateTime(round.drawAt)} (NL/BE)` : round.status === 'drawn' ? `Winnaar: ${round.winner}` : 'Trekking geannuleerd'}</small></div><a href="/events#raffle" className="text-link">Bekijk raffle <ArrowRight size={15}/></a></section>;
}
