"use client";
import Link from '@/components/site-link';
import { useSearchParams } from 'next/navigation';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Download, Gift, LockKeyhole, Plus, RefreshCw, Search, ShieldCheck, Ticket, Trash2, Trophy, Users, X } from 'lucide-react';
import { useMemberSession } from './session-provider';
import { RafflePlayerPicker, useRaffleRoster } from './raffle-player-picker';
import { RaffleEntryEditor } from './raffle-entry-editor';
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
  const previousId = useRef(id);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>; let running = false;
    setLoading(true); setError('');
    if (previousId.current !== id) { setData(null); previousId.current = id; }
    async function load() {
      if (running || controller.signal.aborted) return;
      if (document.hidden) { timer = setTimeout(load, 30_000); return; }
      running = true; let delay = 30_000;
      try {
        const started = Date.now();
        const response = await fetch(`/api/raffle${id ? `?id=${encodeURIComponent(id)}` : ''}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        const body = await response.json() as RaffleState & { error?: string };
        if (!response.ok) throw new Error(body.error || 'De loterij kon niet worden geladen.');
        if (controller.signal.aborted) return;
        setOffset(body.serverNow - (started + Date.now()) / 2); setData(body); setError('');
        if (body.round?.status === 'scheduled' && body.round.drawAt - body.serverNow < 35_000) delay = 2000;
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'De loterij is even niet bereikbaar.'); }
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
  return <div className="raffle-art" aria-hidden="true"><div className="raffle-art-halo"/><span className="raffle-art-ticket raffle-ticket-back"/><span className="raffle-art-ticket"><span className="raffle-ticket-word">HIJGEND HERT</span><img src="/clan-logo.png" alt=""/><span className="raffle-ticket-caption">DE CLANLOTERIJ</span><span className="raffle-ticket-perf"/></span><span className="raffle-art-spark raffle-spark-one">✦</span><span className="raffle-art-spark raffle-spark-two">✧</span></div>;
}

export function RaffleCard({ onOpen }: { onOpen: () => void }) {
  const { data, loading, error } = useRaffle();
  const round = data?.round;
  return <article className="weekly-event-card weekly-raffle">
    <a className="weekly-art-link" href="#raffle" onClick={e => { e.preventDefault(); onOpen(); }} aria-label="Bekijk de clanloterij"><RaffleArt/><span className="weekly-state">{round?.status === 'scheduled' ? 'Trekking gepland' : round?.status === 'drawn' ? 'Uitslag bekend' : 'Clanloterij'}</span></a>
    <div className="weekly-card-body"><p className="eyebrow">HIJGEND HERT · LOTERIJ</p><h2>De clanloterij</h2><p className="weekly-card-description">Jouw naam, jouw loten. Tel samen af en kijk live wie er met de prijs vandoor gaat.</p>
      <div className="weekly-card-current"><span>{loading ? 'Loterij ophalen…' : error && !data ? 'Loterij tijdelijk niet bereikbaar' : round?.status === 'scheduled' ? round.title : round?.status === 'drawn' ? `Gefeliciteerd, ${round.winner}!` : 'Nog geen trekking gepland'}</span>{round?.status === 'scheduled' && <small><Clock3 size={12}/>{dateTime(round.drawAt)} · NL/BE</small>}</div>
      <a className="weekly-card-link" href="#raffle" onClick={e => { e.preventDefault(); onOpen(); }}>Naar de loterij <ArrowRight size={18}/></a>
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
  useEffect(() => setVerified(null), [round.id, round.status, round.entriesHash]);
  async function verify() { setChecking(true); try { setVerified(await verifyRaffle(round)); } catch { setVerified(false); } finally { setChecking(false); } }
  function download() {
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify({ algorithm: 'hh-raffle-v1 / SHA-256 / rejection sampling', ...round }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = objectUrl; link.download = `hijgend-hert-raffle-${round.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  return <details className="raffle-proof"><summary><ShieldCheck size={18}/><span>Controleer de trekking<small>De trekkingscode ligt vast. De lijst sluit bij de trekking.</small></span><Plus size={16}/></summary>
    <div className="raffle-proof-body"><p>Elk lot heeft evenveel kans. Bij het plannen maakt de server een geheime willekeurige code. Die code blijft hetzelfde. De clanleiding kan namen en loten tot de trekking aanpassen; de vingerafdruk van de lijst verandert dan mee. Na de trekking worden de definitieve lijst en de code openbaar, zodat je browser de uitslag opnieuw kan berekenen.</p>
      <dl><div><dt>Vingerafdruk trekkingscode</dt><dd>{round.commitment}</dd></div><div><dt>Vingerafdruk lotenlijst</dt><dd>{round.entriesHash}</dd></div>{round.seed && <div><dt>Openbaar gemaakte trekkingscode</dt><dd>{round.seed}</dd></div>}</dl>
      <div className="raffle-proof-actions"><button className="button outline" onClick={download}><Download size={15}/> Bewijs downloaden</button>{round.status === 'drawn' && <button className="button gold" onClick={() => void verify()} disabled={checking}><ShieldCheck size={15}/>{checking ? 'Controleren…' : 'Controleer uitslag'}</button>}</div>
      {verified !== null && <p className={verified ? 'raffle-verified' : 'raffle-error'} role="status">{verified ? 'De code, lotenlijst en winnaar komen overeen. Deze trekking is gecontroleerd.' : 'Het bewijs komt niet overeen. Neem contact op met de clanleiding.'}</p>}
      <p className="raffle-proof-note">Je kunt de vingerafdruk van de trekkingscode vooraf bewaren en later vergelijken. De lotenlijst en lotnummers kunnen tot de trekking wijzigen. Controleer de uitslag met de definitieve lijst.</p>
    </div>
  </details>;
}

function Entrants({ round }: { round: RaffleRound }) {
  const [query, setQuery] = useState(''); const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); setQuery(''); }, [round.id]);
  const entries = round.entries.filter(entry => raffleNameKey(entry.name).includes(raffleNameKey(query)));
  const pages = Math.max(1, Math.ceil(entries.length / 25));
  const currentPage = Math.min(page, pages - 1);
  return <section className="raffle-entrants" aria-labelledby="raffle-entrants-title"><div className="raffle-section-heading"><div><p className="eyebrow">DE LOTENLĲST</p><h3 id="raffle-entrants-title">Wie doet er mee?</h3></div><span className="raffle-locked">{round.status === 'scheduled' ? <><Users size={13}/> Open tot de trekking</> : <><LockKeyhole size={13}/> Definitieve lijst</>}</span></div>
    <label className="raffle-search"><Search size={17}/><input value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Zoek een naam…" aria-label="Zoek een deelnemer"/></label>
    <div className="raffle-table-scroll"><table><thead><tr><th>NAAM</th><th>LOTEN</th><th>LOTNUMMERS</th><th>KANS</th></tr></thead><tbody>{entries.slice(currentPage * 25, currentPage * 25 + 25).map(entry => <tr key={raffleNameKey(entry.name)} className={round.status === 'drawn' && round.winner === entry.name ? 'raffle-winning-row' : ''}><td>{round.status === 'drawn' && round.winner === entry.name && <Trophy size={15}/>} {entry.name}</td><td>{number(entry.tickets)}</td><td>{number(entry.first)}{entry.last !== entry.first ? ` – ${number(entry.last)}` : ''}</td><td>{(entry.tickets / round.totalTickets * 100).toLocaleString('nl-NL', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}%</td></tr>)}</tbody></table></div>
    {!entries.length && <p className="raffle-muted">Geen deelnemers gevonden.</p>}
    <div className="raffle-table-footer"><span>{number(entries.length)} {entries.length === 1 ? 'deelnemer' : 'deelnemers'} · {number(round.totalTickets)} loten</span>{pages > 1 && <div><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Vorige deelnemers"><ChevronLeft size={16}/></button><span>{currentPage + 1} / {pages}</span><button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)} aria-label="Volgende deelnemers"><ChevronRight size={16}/></button></div>}</div>
  </section>;
}

type DraftEntry = { id: number; name: string; tickets: string };
function RaffleManager({ active, offset, canManage, onSaved }: { active: RaffleRound | null; offset: number; canManage: boolean; onSaved: () => void }) {
  const [title, setTitle] = useState('Hijgend Hert Loterij'); const [prize, setPrize] = useState(''); const [drawAt, setDrawAt] = useState('');
  const roster = useRaffleRoster(active?.status !== 'scheduled');
  const [zone, setZone] = useState('jouw tijdzone');
  const [rows, setRows] = useState<DraftEntry[]>([{ id: 1, name: '', tickets: '1' }]); const nextId = useRef(2);
  const [review, setReview] = useState<RaffleSchedule | null>(null); const requestId = useRef('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [reason, setReason] = useState(''); const [cancelOpen, setCancelOpen] = useState(false);
  useEffect(() => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  const changed = () => { setReview(null); setError(''); requestId.current = ''; };
  function prepare(e: FormEvent) {
    e.preventDefault(); setError('');
    if (!canManage) return;
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const parsed = raffleScheduleSchema.safeParse({ requestId: requestId.current, title, prize, drawAt: new Date(drawAt).getTime(), freeEntry: true, entries: rows.map(row => ({ name: row.name, tickets: Number(row.tickets) })) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Controleer de ingevulde gegevens.'); return; }
    if (parsed.data.drawAt < Date.now() + 60_000 || parsed.data.drawAt > Date.now() + 180 * 86_400_000) { setError('Kies een datum vanaf één minuut vooruit, binnen zes maanden.'); return; }
    setReview(parsed.data);
  }
  async function send(path: string, body: unknown) {
    if (!canManage) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/raffle/${path}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Opslaan is niet gelukt.');
      setReview(null); setCancelOpen(false); setReason(''); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Opslaan is niet gelukt. Je kunt veilig opnieuw proberen.'); }
    finally { setBusy(false); }
  }
  return <details className="raffle-manager" open={active?.status !== 'scheduled'}><summary><ShieldCheck size={18}/><span>Loterij beheren<small>Alleen voor Admin en Staff team</small></span><Plus size={16}/></summary><div className="raffle-manager-body">{!canManage && <p role="status">Discord kan je rol even niet controleren. Je invoer blijft bewaard; opslaan kan zodra je toegang opnieuw is gecontroleerd.</p>}<fieldset disabled={!canManage}>
    {active?.status === 'scheduled' ? <><p>Je kunt deelnemers en loten aanpassen tot de trekking op <strong>{dateTime(active.drawAt)} (NL/BE)</strong>. De trekking gebeurt automatisch.</p><RaffleEntryEditor key={active.id} round={active} offset={offset} canManage={canManage} onSaved={onSaved}/><button className="text-link raffle-cancel-toggle" onClick={() => setCancelOpen(value => !value)}>Trekking annuleren</button>{cancelOpen && <form onSubmit={e => { e.preventDefault(); void send('cancel', { id: active.id, reason }); }}><label>Reden voor annulering<input value={reason} onChange={e => setReason(e.target.value)} minLength={5} maxLength={200} required/></label><p className="raffle-muted">De annulering en reden blijven openbaar in de geschiedenis. Een getrokken winnaar kan niet worden gewijzigd.</p><button className="button outline" disabled={busy || reason.trim().length < 5}>Bevestig annulering</button></form>}</> : <form onSubmit={prepare}>
      <fieldset disabled={busy}><div className="raffle-form-grid"><label>Naam van de loterij<input value={title} onChange={e => { changed(); setTitle(e.target.value); }} required minLength={3} maxLength={80}/></label><label>Prijs <small>(optioneel)</small><input value={prize} onChange={e => { changed(); setPrize(e.target.value); }} placeholder="Wat geeft de clan weg?" maxLength={160}/></label><label className="raffle-date-field">Datum en tijd van de trekking<input type="datetime-local" value={drawAt} onChange={e => { changed(); setDrawAt(e.target.value); }} required/><small>In jouw tijdzone: {zone}</small></label></div>
        <div className="raffle-editor-heading"><h4>Deelnemers & loten</h4><span>{number(rows.reduce((sum, row) => sum + Math.max(0, Number(row.tickets) || 0), 0))} loten</span></div>
        <div className="raffle-roster-status" role="status"><Users size={15}/><span>{roster.loading && !roster.players.length ? 'Clanleden ophalen bij Wise Old Man…' : roster.message}{roster.players.length > 0 && <small>{number(roster.players.length)} namen beschikbaar</small>}</span>{!roster.loading && <button type="button" disabled={!roster.canRetry} onClick={roster.retry}>{roster.canRetry ? 'Vernieuwen' : 'Even wachten'}</button>}</div><div className="raffle-editor-labels"><span>NAAM</span><span>AANTAL LOTEN</span><span/></div>
        <div className="raffle-editor-rows">{rows.map((row, index) => <div className="raffle-editor-row" key={row.id}><RafflePlayerPicker name={row.name} index={index} players={roster.players} loading={roster.loading} usedNames={rows.filter(item => item.id !== row.id).map(item => item.name)} onChange={name => { changed(); setRows(old => old.map(item => item.id === row.id ? { ...item, name } : item)); }}/><input aria-label={`Loten deelnemer ${index + 1}`} type="number" min="1" max="10000" step="1" value={row.tickets} required onChange={e => { changed(); setRows(old => old.map(item => item.id === row.id ? { ...item, tickets: e.target.value } : item)); }}/><button type="button" aria-label={`Verwijder deelnemer ${index + 1}`} disabled={rows.length === 1} onClick={() => { changed(); setRows(old => old.filter(item => item.id !== row.id)); }}><Trash2 size={16}/></button></div>)}</div>
        <button className="raffle-add-name" type="button" disabled={rows.length >= 500} onClick={() => { changed(); setRows(old => [...old, { id: nextId.current++, name: '', tickets: '1' }]); }}><Plus size={16}/> Naam toevoegen</button>
        <p className="raffle-muted">Kies een naam uit Wise Old Man. Loten verschijnen ook bij het ledenprofiel met dezelfde RuneScape-naam. Namen en aantallen kun je tot de trekking aanpassen. De datum en trekkingscode liggen na het plannen vast.</p>
        {!review && <button className="button gold" type="submit"><CalendarDays size={16}/> Controleer & plan</button>}
        {review && <div className="raffle-review" role="status"><p className="eyebrow">CONTROLEER JE TREKKING</p><h4>{review.title}</h4><p><strong>{dateTime(review.drawAt)} (NL/BE)</strong></p><p>{review.entries.length} deelnemers · {number(review.entries.reduce((sum, entry) => sum + entry.tickets, 0))} loten{review.prize ? ` · Prijs: ${review.prize}` : ''}</p><p>De trekking loopt automatisch op dit tijdstip. Je kunt namen en aantallen tot die tijd blijven aanpassen.</p><div><button className="button gold" type="button" disabled={busy} onClick={() => void send('schedule', review)}>{busy ? <RefreshCw size={16}/> : <LockKeyhole size={16}/>} {busy ? 'Plannen…' : 'Bevestig & plan trekking'}</button><button type="button" className="text-link" disabled={busy} onClick={() => setReview(null)}>Terug</button></div></div>}
      </fieldset>
    </form>}
    {error && <p className="raffle-error" role="alert">{error}</p>}
  </fieldset></div></details>;
}

export default function ClanRaffle({ onBack }: { onBack: () => void }) {
  const requested = useSearchParams().get('id') || '';
  const [selected, setSelected] = useState(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requested) ? requested : '');
  const { data, loading, error, offset, refresh } = useRaffle(selected);
  const session = useMemberSession();
  const staff = session.status === 'authenticated' && ['Admin', 'Staff team'].includes(session.member?.clanRole || '');
  const showManager = staff || (session.status === 'unavailable' && ['Admin', 'Staff team'].includes(session.member?.clanRole || ''));
  const round = data?.round;
  return <section className="container clan-raffle" aria-labelledby="raffle-title">
    <div className="raffle-top"><a href="/events" className="text-link weekly-back" onClick={e => { e.preventDefault(); onBack(); }}><ArrowLeft size={14}/> Terug naar events</a><span><ShieldCheck size={14}/> Eén trekking. Eén winnaar.</span></div>
    <div className={`raffle-stage${round?.status === 'drawn' ? ' raffle-is-drawn' : ''}`}>
      <div className="raffle-stage-heading"><p className="eyebrow"><span/> HIJGEND HERT · CLANLOTERIJ <span/></p><h2 id="raffle-title">{round?.title || 'Het winnende lot'}</h2><p className="raffle-stage-intro">{round?.status === 'drawn' ? 'De loten zijn getrokken. De winnaar is bekend.' : 'Een prijs van de clan. Een naam om samen voor te juichen.'}</p></div>
      <div className="raffle-draw-layout">
        <div className="raffle-prize-display"><RaffleArt/><div className="raffle-prize-plaque"><span><Gift size={15}/> DE PRIJS</span><strong>{round?.prize || 'Wordt aangekondigd'}</strong><small>Hijgend Hert clanloterij</small></div></div>
        <div className="raffle-draw-panel">
          <p className={`raffle-round-status ${round?.status || ''}`}><span/>{round?.status === 'scheduled' ? 'DE LOTEN LIGGEN KLAAR' : round?.status === 'drawn' ? 'TREKKING AFGEROND' : round?.status === 'cancelled' ? 'GEANNULEERD' : 'DE VOLGENDE RONDE'}</p>
          {loading && !data ? <p className="raffle-muted" role="status">De loterij wordt opgehaald…</p> : round ? <>
            {round.status === 'scheduled' ? <><h3>Wie heeft het<br/><em>winnende lot?</em></h3><p className="raffle-countdown-label">WE TREKKEN OVER</p><Countdown at={round.drawAt} offset={offset}/><p className="raffle-draw-date"><CalendarDays size={15}/>{dateTime(round.drawAt)} · NL/BE</p><p className="raffle-draw-hint">Tel mee af. De winnaar verschijnt hier vanzelf.</p></> : round.status === 'drawn' ? <div className="raffle-winner" role="status"><Trophy size={33}/><p>GEFELICITEERD</p><h3>{round.winner}</h3><strong>{ticketCode(round.id, round.winningTicket!)}</strong><span>Getrokken op {dateTime(round.drawnAt!)} · NL/BE</span></div> : <div className="raffle-cancelled"><h3>Deze ronde<br/>gaat niet door.</h3><span>{round.cancellationReason}</span></div>}
          </> : !error && <div className="raffle-empty"><h3>Een nieuwe ronde<br/><em>komt eraan.</em></h3><p>Nog geen trekking gepland.</p><span>Hier zie je straks de prijzenpot, de loten en het moment waarop de winnaar bekend wordt.</span></div>}
          {error && !data && <p className="raffle-muted">De trekking is even niet bereikbaar.</p>}
        </div>
      </div>
      <div className="raffle-totals"><span><Users size={19}/><strong>{round ? number(round.entries.length) : '—'}</strong> {round?.entries.length === 1 ? 'deelnemer' : 'deelnemers'}</span><span><Ticket size={19}/><strong>{round ? number(round.totalTickets) : '—'}</strong> loten in de trekking</span><span><ShieldCheck size={19}/> Elk lot evenveel kans</span></div>
    </div>
    {error && <div className="raffle-error raffle-connection" role="status"><p>{error}{data ? ' Je ziet de laatst geladen gegevens.' : ''}</p><button className="text-link" onClick={refresh}><RefreshCw size={14}/> Opnieuw proberen</button></div>}
    {data && <>
      {showManager && !selected && <RaffleManager active={round || null} offset={offset} canManage={staff} onSaved={refresh}/>}
      <div className="raffle-content-grid"><div>{round && <><Entrants round={round}/><RaffleProof round={round}/></>}</div><aside className="raffle-how"><p className="eyebrow">VAN LOT TOT WINNAAR</p><h3>Zo werkt de loterij</h3><ol><li><span>01</span><div><h4>Jouw naam op de lijst</h4><p>De clanleiding voegt deelnemers en hun loten toe.</p></div></li><li><span>02</span><div><h4>Samen aftellen</h4><p>De clanleiding kan namen en loten tot de trekking aanpassen. Daarna sluit de lijst vanzelf.</p></div></li><li><span>03</span><div><h4>Het winnende lot</h4><p>Op het gekozen moment wordt één lot getrokken. De uitslag blijft hier staan.</p></div></li></ol><div className="raffle-fair-note"><ShieldCheck size={19}/><p>Elk lot heeft dezelfde kans.<br/><span>Je kunt de uitslag zelf controleren.</span></p></div><details className="raffle-terms"><summary>Over deelname</summary><p>Deelname is kosteloos en zonder inleg. Loten worden door de clanleiding toegekend.</p></details></aside></div>
      {!!data.history.length && <div className="raffle-history"><label>Vorige trekkingen<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Laatste loterij</option>{data.history.map(item => <option key={item.id} value={item.id}>{item.title} · {dateTime(item.drawAt)}{item.status === 'cancelled' ? ' · Geannuleerd' : ` · ${item.winner}`}</option>)}</select></label>{selected && <button className="text-link" onClick={() => setSelected('')}>Terug naar de laatste loterij <ArrowRight size={15}/></button>}</div>}
    </>}
    <p className="raffle-footer-note">Hijgend Hert · Samen spelen. Samen winnen.</p>
  </section>;
}

export function ProfileRaffle({ playerName }: { playerName: string }) {
  const { data, error } = useRaffle();
  const round = data?.round;
  const entry = round?.entries.find(entry => raffleNameKey(entry.name) === raffleNameKey(playerName));
  if (!round || !entry || error) return null;
  return <section className="profile-raffle"><span className="profile-raffle-icon"><Ticket size={23}/></span><div><p className="profile-section-label">CLANLOTERIJ</p><h3>{round.title}</h3><p><strong>{number(entry.tickets)} {entry.tickets === 1 ? 'lot' : 'loten'}</strong> voor {playerName}</p><small>{round.status === 'scheduled' ? `Trekking: ${dateTime(round.drawAt)} (NL/BE)` : round.status === 'drawn' ? `Winnaar: ${round.winner}` : 'Trekking geannuleerd'}</small></div><Link prefetch={false} href="/events#raffle" className="text-link">Bekijk loterij <ArrowRight size={15}/></Link></section>;
}
