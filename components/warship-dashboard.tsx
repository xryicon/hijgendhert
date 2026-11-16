'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Anchor, ArrowLeft, Check, Clock3, Crosshair, Eye, EyeOff, Flag, Gem, LockKeyhole, Plus, RefreshCw, ShieldCheck, Ship, Trophy, Users, X } from 'lucide-react';
import { useMemberSession } from './session-provider';
import MetricImage from './metric-image';
import { metricLabel } from '@/lib/osrs-metrics';
import { FLEET, otherTeam, seaCoordinate, type Team, type WarshipConfig, type WarshipOverview, type WarshipView } from '@/lib/warships';
import WarshipBoard from './warship-board';
import { FleetEditor, localInput, WarshipConfigForm } from './warship-forms';

const date = (value: string) => new Date(value).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const phases = { draft: 'Privéconcept', setup: 'De vloot verzamelen', active: 'Zeeslag actief', finished: 'Uitslag bekend', cancelled: 'Geannuleerd' };
function Countdown({ end, active }: { end: string; active: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.floor((Date.parse(end) - now) / 1000));
  return <span className="sea-countdown"><Clock3 size={15}/>{active ? `${Math.floor(seconds / 86400)}d ${String(Math.floor(seconds / 3600) % 24).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : date(end)}<small>laatste schot</small></span>;
}
function FleetArt() { return <svg className="sea-hero-art" viewBox="0 0 360 230" fill="none" aria-hidden="true"><circle cx="185" cy="112" r="90"/><circle cx="185" cy="112" r="75" strokeDasharray="2 10"/><path className="sea-art-hull" d="M50 162h258l-32 34H94z"/><path d="M176 35v126M226 70v91M105 91v70M176 39l-57 99h57zM184 49l52 89h-52zM226 83l42 55h-42zM105 105l-30 33h30z"/><path className="sea-art-flag" d="M177 36V16l48 10-48 10z"/><path d="m193 25-4-4m4 4 5-4m-3 5v4M29 207q22-10 44 0t44 0t44 0t44 0t44 0t44 0t44 0M61 220q22-10 44 0t44 0t44 0t44 0t44 0"/></svg>; }

export default function WarshipDashboard() {
  const session = useMemberSession();
  const viewerId = useRef(session.member?.id); viewerId.current = session.member?.id;
  const [id, setId] = useState(''); const [ready, setReady] = useState(false);
  const autoSelect = useRef(true);
  const [overview, setOverview] = useState<WarshipOverview | null>(null);
  const [game, setGame] = useState<WarshipView | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [writeError, setWriteError] = useState('');
  const [busy, setBusy] = useState(false); const writing = useRef(false);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [refresh, setRefresh] = useState(0); const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState(false); const [tab, setTab] = useState<'board' | 'drops' | 'crew' | 'staff'>('board');
  const [target, setTarget] = useState<number | null>(null); const [selectedDrop, setSelectedDrop] = useState('');
  const [joinTeam, setJoinTeam] = useState<Team>(0); const [rsn, setRsn] = useState('');
  const [evidence, setEvidence] = useState(''); const [droppedAt, setDroppedAt] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<'start' | 'cancel' | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  useEffect(() => { setId(new URLSearchParams(window.location.search).get('event') || ''); setReady(true); }, []);
  useEffect(() => { setGame(null); setOverview(null); setEditor(false); setTarget(null); setPending(null); setConfirmation(null); }, [session.member?.id]);
  const choose = useCallback((next: string) => { autoSelect.current = false; setId(next); setGame(null); setLoading(true); setTarget(null); setEditor(false); setPending(null); setWriteError(''); setNotice(''); setSelectedDrop(''); setEvidence(''); setDroppedAt(''); setTab('board'); setConfirmation(null); window.history.replaceState(null, '', next ? `/zeeslag?event=${next}` : '/zeeslag'); }, []);
  useEffect(() => {
    if (!ready || session.status === 'loading') return;
    const controller = new AbortController(); let fetching = false, retryAt = 0;
    async function load() {
      if (document.hidden || fetching || Date.now() < retryAt || controller.signal.aborted) return;
      fetching = true;
      try {
        const r = await fetch(`/api/warships${id ? `?id=${encodeURIComponent(id)}` : ''}`, { cache: 'no-store', signal: controller.signal });
        const data = await r.json() as Partial<WarshipOverview> & { game?: WarshipView; error?: string }; if (controller.signal.aborted) return;
        if (!r.ok) {
          if ([401, 403, 404].includes(r.status)) { setGame(null); setOverview(null); }
          retryAt = Date.now() + Math.max(15, Number(r.headers.get('Retry-After')) || 15) * 1000;
          throw new Error(data.error || 'De zeekaart kon niet worden opgehaald.');
        }
        if (id) { const next = data.game; if (!next) throw new Error('De zeekaart is tijdelijk niet beschikbaar.'); setGame(previous => previous && previous.id === next.id && previous.revision > next.revision ? previous : next); }
        else { const next = { games: data.games || [], canManage: !!data.canManage, signedIn: !!data.signedIn }; setOverview(next); if (autoSelect.current && next.games.length) choose(next.games[0].id); }
        setError('');
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'De verbinding is onderbroken.'); }
      finally { fetching = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); const timer = setInterval(load, id ? 5000 : 20000); document.addEventListener('visibilitychange', load);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [ready, id, refresh, session.status, session.member?.id, choose]);
  const canManage = !!(game?.canManage || overview?.canManage);
  async function send(body: Record<string, unknown>) {
    if (writing.current) return false;
    writing.current = true; setBusy(true); setWriteError(''); setNotice('');
    let ambiguous = true;
    const caller = viewerId.current;
    try {
      const r = await fetch('/api/warships/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      const result = await r.json() as { game?: WarshipView; error?: string };
      if (caller !== viewerId.current) { setPending(null); return false; }
      if (!r.ok) {
        ambiguous = r.status >= 500;
        if (r.status >= 500) setPending(body); else setPending(null);
        if ([401, 403, 404].includes(r.status)) { setGame(null); setOverview(null); }
        if (r.status === 409) setRefresh(n => n + 1);
        throw new Error(result.error || 'Opslaan is niet gelukt.');
      }
      if (!result.game) throw new Error('De bevestiging ontbreekt. Verzend hetzelfde verzoek opnieuw.');
      setPending(null); setGame(result.game); setTarget(null); setNotice(body.type === 'fire' ? 'Schot geregistreerd. De zeekaart is bijgewerkt.' : body.type === 'claim' ? 'Drop ingediend. Staff controleert het bewijs.' : 'Opgeslagen. De andere spelers zien de wijziging automatisch.');
      if (body.type === 'create') { setId(result.game.id); window.history.replaceState(null, '', `/zeeslag?event=${result.game.id}`); }
      setRefresh(n => n + 1); return true;
    } catch (e) { if (caller !== viewerId.current) return false; if (ambiguous) setPending(body); setWriteError(e instanceof Error ? e.message : 'Verbinding onderbroken.'); return false; }
    finally { writing.current = false; setBusy(false); }
  }
  const act = (type: string, fields: Record<string, unknown> = {}) => send({ type, gameId: game?.id, revision: game?.revision, ...fields, requestId: crypto.randomUUID() });
  async function saveConfig(config: WarshipConfig, revision?: number) { return act(game ? 'edit' : 'create', { config, ...(game ? { revision } : { gameId: undefined, revision: undefined }) }); }
  const active = game?.status === 'active'; const preparing = game?.status === 'setup' || game?.status === 'draft';
  const mine = game?.myTeam; const enemy = mine === null || mine === undefined ? null : otherTeam(mine);
  const canFire = !!(game?.canCaptain && active && mine !== null && mine !== undefined && game.teams[mine].ammo > 0 && !error && !pending);
  async function submitDrop(e: FormEvent) {
    e.preventDefault(); if (!droppedAt) return;
    if (await act('claim', { objectiveId: selectedDrop, evidence, droppedAt: new Date(droppedAt).toISOString() })) { setEvidence(''); setSelectedDrop(''); }
  }
  const disabled = busy || !!error || !!pending;
  return <main id="main" className="sea-page"><div className="container sea-shell">
    <a href="/events" className="sea-back"><ArrowLeft size={14}/> Terug naar events</a>
    <header className="sea-hero"><div className="sea-hero-copy"><p className="eyebrow">HIJGEND HERT · BOSS DROP BINGO</p><h1>Zeeslag<span>De jacht gaat het water op.</span></h1><p>Verdien je munitie bij de bosses. Kies je doel. Laat de andere vloot zinken.</p><div className="sea-steps"><span><Gem size={15}/> Boss drop</span><i>→</i><span><ShieldCheck size={15}/> Goedgekeurd</span><i>→</i><span><Crosshair size={15}/> Vuren</span></div></div><FleetArt/></header>
    <div className="sea-topline"><span className="sea-status"><span className={active ? 'sea-live-dot' : ''}/>{game ? phases[game.status] : 'De haven'}{game && !game.published && <><LockKeyhole size={13}/> Privé</>}</span>{game && <Countdown end={game.config.endsAt} active={!!active}/>}<div className="sea-buttons">{game && <button className="sea-text-button" disabled={busy || !!pending} onClick={() => choose('')}>Events & archief</button>}{canManage && preparing && <button className="button outline" disabled={busy || !!pending} onClick={() => setEditor(!editor)}>Instellingen</button>}{canManage && (!game || ['finished', 'cancelled'].includes(game.status)) && <button className="button gold" disabled={busy || !!pending} onClick={() => { choose(''); setOverview({ games: [], canManage: true, signedIn: true }); setEditor(true); }}><Plus size={15}/> Nieuwe zeeslag</button>}</div></div>
    {(error || writeError) && <div className="sea-error" role="alert"><span>{writeError || error}</span>{pending ? <button disabled={busy} onClick={() => void send(pending)}>Opnieuw verzenden</button> : <button disabled={busy} onClick={() => { setRefresh(n => n + 1); setWriteError(''); }}><RefreshCw size={14}/> Vernieuwen</button>}{!session.member && <a href="/login">Inloggen</a>}</div>}
    {notice && <p className="sea-success" role="status"><Check size={16}/>{notice}</p>}
    {editor && <WarshipConfigForm key={game?.id || 'new'} initial={game?.config} revision={game?.revision} busy={disabled} onSave={saveConfig} onClose={() => setEditor(false)}/>}
    {loading && !game && <div className="sea-empty" role="status"><Anchor size={36}/><h2>De zeekaart ophalen…</h2></div>}
    {!loading && !game && !editor && !error && <div className="sea-empty"><Ship size={48}/><h2>De vloot ligt nog in de haven.</h2><p>{canManage ? 'Maak een privéconcept, stel de boss drops in en publiceer zodra de clan kan aansluiten.' : 'Zodra de clanleiding een zeeslag publiceert, verschijnt de ronde hier.'}</p>{!session.member && <a className="button gold" href="/login">Inloggen met Discord</a>}</div>}
    {game && <>
      <div className="sea-event-title"><div><h2>{game.config.title}</h2><p>{game.config.description}</p></div>{game.status === 'finished' && <div className="sea-winner"><Trophy size={30}/><div><small>{game.winner === null ? 'GELIJKSPEL' : 'OVERWINNING'}</small><strong>{game.winner === null ? 'Beide vloten houden stand' : game.teams[game.winner].name}</strong><p>{game.finishReason}</p></div></div>}{game.status === 'cancelled' && <p className="sea-note">{game.finishReason}</p>}</div>
      <div className="sea-teams">{game.teams.map((team, index) => <article key={team.name} className={`sea-team sea-team-${index}${mine === index ? ' is-mine' : ''}`}><span className="sea-team-badge"><Anchor size={31}/></span><div><small>{mine === index ? 'JOUW VLOOT' : `VLOOT ${index + 1}`}</small><h3>{team.name}</h3><p>{team.members} bemanningsleden{preparing ? ` · ${team.ready ? 'Vloot staat klaar' : 'Vloot voorbereiden'}` : ''}</p></div><div className="sea-team-numbers"><span><strong>{team.ammo}</strong>schoten</span><span><strong>{team.hits}<small>/12</small></strong>treffers</span><span><strong>{team.sunk}<small>/4</small></strong>gezonken</span></div></article>)}</div>
      <nav className="sea-tabs" aria-label="Zeeslag onderdelen">{([{ id: 'board', text: 'Zeekaart', Icon: Anchor }, { id: 'drops', text: 'Boss drops', Icon: Gem }, { id: 'crew', text: 'Bemanning', Icon: Users }, ...(canManage ? [{ id: 'staff', text: 'Clanleiding', Icon: ShieldCheck }] : [])] as const).map(item => <button type="button" key={item.id} aria-pressed={tab === item.id} onClick={() => { setTab(item.id as typeof tab); setTarget(null); }}><item.Icon size={17}/>{item.text}{item.id === 'staff' && game.claims.some(c => c.status === 'pending') && <span className="sea-tab-count">{game.claims.filter(c => c.status === 'pending').length}</span>}</button>)}</nav>
      {tab === 'board' && <>
        {preparing && game.canCaptain && mine !== null && <FleetEditor key={`${game.id}:${mine}`} game={game} busy={disabled} onSave={(placements, locked, revision) => act('fleet', { placements, locked, revision })}/>}
        {!(preparing && game.canCaptain) && <><div className="sea-board-instruction"><Crosshair size={22}/><div><strong>{canFire ? 'Kapitein, kies je doel.' : active && game.canCaptain ? 'Verdien eerst schoten met boss drops.' : preparing ? 'De kapiteins brengen hun vloot in positie.' : game.status === 'finished' ? 'De volledige zeekaart is vrijgegeven.' : 'Volg de zeeslag.'}</strong><p>{canFire ? 'Klik een onbekend vak op de vijandelijke kaart en bevestig je schot.' : 'De andere vloot blijft geheim. Alleen treffers, missers en gezonken schepen zijn zichtbaar.'}</p></div></div>
        <div className="sea-boards">{game.teams.map((team, index) => <WarshipBoard key={index} title={team.name} subtitle={mine === index ? 'Jouw vloot · alleen zichtbaar voor je team' : 'Vijandelijke wateren'} fleet={team.fleet} shots={game.shots.filter(s => s.team === otherTeam(index as Team))} revealed={team.revealedCells} selected={enemy === index ? target : null} onSelect={enemy === index && canFire ? setTarget : undefined} disabled={disabled}/>)}</div>
        {target !== null && canFire && <div className="sea-fire-confirm"><Crosshair size={25}/><span>Doel <strong>{seaCoordinate(target)}</strong><small>Dit kost 1 schot. Je kunt het niet terugdraaien.</small></span><button type="button" className="button gold" disabled={disabled} onClick={() => void act('fire', { cell: target })}>Vuur op {seaCoordinate(target)}</button><button className="sea-icon-button" aria-label="Schot annuleren" onClick={() => setTarget(null)}><X size={19}/></button></div>}</>}
        <section className="sea-panel sea-log"><div className="sea-section-heading"><div><small>HET SCHEEPSJOURNAAL</small><h2>Laatste schoten</h2></div><span>{game.shots.length} afgevuurd</span></div>{game.shots.length ? [...game.shots].reverse().slice(0, 12).map((shot, index) => <div className={`sea-log-row ${shot.result}`} key={`${shot.team}:${shot.cell}`}><span className="sea-log-index">{String(game.shots.length - index).padStart(2, '0')}</span><strong>{game.teams[shot.team].name}</strong><span>{seaCoordinate(shot.cell)}</span><b>{shot.result === 'sunk' ? `${FLEET[shot.sunkShip!].name} gezonken` : shot.result === 'hit' ? 'Raak' : 'Mis'}</b><time>{date(shot.at)}</time></div>) : <p className="sea-note">Nog geen schoten. De eerste goedgekeurde boss-drop levert munitie op.</p>}</section>
      </>}
      {tab === 'drops' && <section><div className="sea-section-heading"><div><small>VAN BOSS NAAR BOORDKANON</small><h2>De buit van deze ronde</h2><p>1 goedgekeurde drop = de vermelde schoten. De limiet geldt per team. Alleen drops behaald ná de start tellen.</p></div></div><div className="sea-objectives">{game.config.objectives.map((o, index) => <article className="sea-objective" key={o.id}><div className="sea-objective-top"><span>{String(index + 1).padStart(2, '0')}</span><MetricImage metric={o.boss} size={55}/><span className="sea-reward"><Crosshair size={14}/>+{o.shots}</span></div><small>{metricLabel(o.boss)}</small><h3>{o.item}</h3><div className="sea-objective-counts">{game.teams.map((t, i) => <span key={i}>{t.name}<b>{game.progress.find(p => p.id === o.id)?.counts[i] || 0}/{o.limit}</b></span>)}</div>{active && mine !== null && <button type="button" className="button outline" disabled={disabled} onClick={() => { setSelectedDrop(o.id); setDroppedAt(localInput(new Date().toISOString(), true)); document.getElementById('sea-drop-submit')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Drop melden</button>}</article>)}</div>
        {active && mine !== null && <form id="sea-drop-submit" className="sea-panel sea-claim-form" onSubmit={submitDrop}><div className="sea-section-heading"><div><h2>Een drop binnen?</h2><p>Voeg een screenshot of Discord-bericht toe met de spelernaam, drop en tijd. Staff controleert het bewijs.</p></div></div><div className="sea-form-grid"><label>Welke drop?<select required value={selectedDrop} onChange={e => setSelectedDrop(e.target.value)}><option value="">Kies een drop</option>{game.config.objectives.map(o => <option key={o.id} value={o.id}>{metricLabel(o.boss)} · {o.item}</option>)}</select></label><label>Behaald op <small>(jouw lokale tijd)</small><input required type="datetime-local" step={1} value={droppedAt} onChange={e => setDroppedAt(e.target.value)}/></label></div><label>Bewijslink<input required type="url" maxLength={1500} placeholder="https://discord.com/channels/…" value={evidence} onChange={e => setEvidence(e.target.value)}/></label><p className="sea-note">Gebruik een Discord-bericht, Discord-afbeelding of i.imgur.com-link. Eén bewijs per drop. Wachtende drops verdienen pas schoten na goedkeuring, vóór de eindtijd.</p><button className="button gold" disabled={disabled}>Indienen bij staff</button></form>}
        {game.claims.length > 0 && <div className="sea-panel"><h2>Ingediende drops</h2>{[...game.claims].reverse().map(c => <div className="sea-claim-row" key={c.id}><div><strong>{c.rsn} · {game.config.objectives.find(o => o.id === c.objectiveId)?.item}</strong><small>{date(c.droppedAt)} · {game.teams[c.team].name}</small>{c.reason && <p>{c.reason}</p>}</div><span className={`sea-claim-status ${c.status}`}>{c.status === 'approved' ? 'Goedgekeurd' : c.status === 'rejected' ? 'Afgewezen' : 'Wacht op staff'}</span><a href={c.evidence} target="_blank" rel="noreferrer">Bewijs ↗</a></div>)}</div>}
      </section>}
      {tab === 'crew' && <section className="sea-panel"><div className="sea-section-heading"><div><small>TWEE TEAMS · ÉÉN CLAN</small><h2>De bemanning</h2><p>Staff controleert de RuneScape-naam en bevestigt je team. De eerste goedgekeurde speler wordt kapitein.</p></div></div>{!game.signedIn ? <a className="button gold" href="/login">Inloggen om mee te doen</a> : preparing && mine === null && <form className="sea-join-form" onSubmit={e => { e.preventDefault(); void act('join', { team: joinTeam, rsn }); }}><label>RuneScape-naam<input required maxLength={12} pattern="[a-zA-Z0-9 _-]+" value={rsn} onChange={e => setRsn(e.target.value)}/></label><label>Jouw team<select value={joinTeam} onChange={e => setJoinTeam(Number(e.target.value) as Team)}>{game.teams.map((team, index) => <option key={index} value={index}>{team.name}</option>)}</select></label><button className="button gold" disabled={disabled}>Vraag deelname aan</button></form>}
        {game.requests.map(r => <div className="sea-claim-row" key={r.userId}><div><strong>{r.rsn}</strong><small>{r.name} · {game.teams[r.team].name} · wacht op staff</small></div>{game.canManage ? <><button className="button outline" disabled={disabled} onClick={() => void act('enrol', { userId: r.userId, accept: true })}>Toelaten</button><button className="sea-text-button" disabled={disabled} onClick={() => void act('enrol', { userId: r.userId, accept: false })}>Afwijzen</button></> : <button className="sea-text-button" disabled={disabled} onClick={() => void act('withdraw')}>Intrekken</button>}</div>)}
        <div className="sea-crew-columns">{game.teams.map((team, index) => <div key={index}><h3>{team.name}</h3>{game.crew.filter(p => p.team === index).map(p => <div className="sea-crew-row" key={p.rsn}><span>{p.captain ? <Flag size={16}/> : <Users size={15}/>}</span><div><strong>{p.rsn}</strong><small>{p.captain ? 'Kapitein' : 'Bemanning'} · {p.name}</small></div>{canManage && preparing && <button className="sea-icon-button" aria-label={`${p.rsn} verwijderen`} disabled={disabled} onClick={() => void act('remove_member', { userId: p.userId })}><X size={15}/></button>}{canManage && !p.captain && (preparing || active) && <button className="sea-text-button" disabled={disabled} onClick={() => void act('captain', { userId: p.userId })}>Kapitein maken</button>}</div>)}{!game.signedIn && <p className="sea-note">Log in om de bemanning te bekijken.</p>}{game.signedIn && !team.members && <p className="sea-note">Nog geen bemanningsleden.</p>}</div>)}</div>
      </section>}
      {tab === 'staff' && canManage && <section className="sea-panel"><div className="sea-section-heading"><div><small>CLANLEIDING</small><h2>De havenmeester</h2><p>Controleer bewijs voordat je schoten toekent. Ook staff ziet tijdens het spel geen vijandelijke schepen.</p></div></div><div className="sea-buttons"><button className="button outline" disabled={disabled} onClick={() => void act('publish', { published: !game.published })}>{game.published ? <EyeOff size={16}/> : <Eye size={16}/>} {game.published ? 'Maak privé' : 'Publiceer event'}</button>{preparing && <button className="button gold" disabled={disabled || !game.teams.every(t => t.ready)} onClick={() => setConfirmation('start')}>Start de zeeslag</button>}{(preparing || active) && <button className="sea-text-button" disabled={disabled} onClick={() => setConfirmation('cancel')}>Event annuleren</button>}</div>
        {confirmation && <div className="sea-confirm" role="group" aria-label="Eventactie bevestigen"><h3>{confirmation === 'start' ? 'Klaar om uit te varen?' : 'Event annuleren?'}</h3><p>{confirmation === 'start' ? 'Teams, schepen en drops liggen hierna vast. Alleen nieuwe boss drops tellen vanaf dit moment.' : 'De ronde stopt definitief. De geschiedenis blijft bewaard.'}</p>{confirmation === 'cancel' && <label>Reden<input maxLength={200} value={cancelReason} onChange={e => setCancelReason(e.target.value)}/></label>}<div className="sea-buttons"><button className="button gold" disabled={disabled || (confirmation === 'cancel' && !cancelReason.trim())} onClick={() => void act(confirmation, confirmation === 'cancel' ? { reason: cancelReason } : {}).then(ok => { if (ok) setConfirmation(null); })}>Bevestigen</button><button className="button outline" onClick={() => setConfirmation(null)}>Terug</button></div></div>}
        <h3 className="sea-review-title">Drops ter beoordeling ({game.claims.filter(c => c.status === 'pending').length})</h3>{game.claims.filter(c => c.status === 'pending').map(c => { const o = game.config.objectives.find(o => o.id === c.objectiveId)!; return <article className="sea-review" key={c.id}><MetricImage metric={o.boss} size={44}/><div><strong>{o.item}</strong><p>{c.rsn} · {game.teams[c.team].name} · {date(c.droppedAt)}</p><a href={c.evidence} target="_blank" rel="noreferrer">Open dropbewijs ↗</a><label>Opmerking / reden afwijzing<input maxLength={200} value={reasons[c.id] || ''} onChange={e => setReasons({ ...reasons, [c.id]: e.target.value })}/></label></div><div className="sea-review-actions"><button className="button gold" disabled={disabled || !active} onClick={() => void act('review', { claimId: c.id, approve: true, reason: reasons[c.id] || '' })}>Goedkeuren · +{o.shots} schoten</button><button className="button outline" disabled={disabled || !active || !reasons[c.id]?.trim()} onClick={() => void act('review', { claimId: c.id, approve: false, reason: reasons[c.id] || '' })}>Afwijzen</button></div></article>; })}{!game.claims.some(c => c.status === 'pending') && <p className="sea-note">Er zijn geen drops die op goedkeuring wachten.</p>}
        <details className="sea-audit"><summary>Beheerlogboek</summary>{game.audit.map((a, i) => <p key={i}><time>{date(a.at)}</time> · {a.name} · {({ create: 'Event gemaakt', edit: 'Regels aangepast', publish: 'Zichtbaarheid gewijzigd', join: 'Deelname aangevraagd', enrol: 'Teamindeling beoordeeld', fleet: 'Eigen vloot opgeslagen', start: 'Zeeslag gestart', claim: 'Drop ingediend', review: 'Drop beoordeeld', fire: 'Schot afgevuurd', captain: 'Kapitein aangewezen', remove_member: 'Speler verwijderd', withdraw: 'Aanvraag ingetrokken', cancel: 'Event geannuleerd' } as Record<string, string>)[a.action] || a.action}</p>)}</details>
      </section>}
      <details className="sea-rules"><summary><Anchor size={16}/> Spelregels & eerlijk spel</summary><p>Elke vloot heeft vier schepen van 4, 3, 3 en 2 vakken. Je kapitein plaatst ze voor de start. Vloten zijn daarna onveranderbaar. Alleen je eigen team kan je schepen zien; een gezonken schip wordt voor iedereen zichtbaar.</p><p>Een goedgekeurde boss drop geeft het vermelde aantal schoten. Elk schot kost één munitie, ook bij een misser. Je mag schoten bewaren en schieten zodra je munitie hebt; er zijn geen vaste beurten. Een eerder beschoten vak kan niet nogmaals worden gekozen.</p><p>De eerste vloot die alle twaalf vijandelijke scheepsvakken raakt, wint. Bij de eindtijd wint het team met de meeste treffers; evenveel treffers betekent gelijkspel. Niet beoordeelde drops leveren geen schoten op. Staff controleert drops handmatig: killcounts van Wise Old Man bewijzen geen individuele items.</p></details>
    </>}
    {overview && overview.games.length > 0 && <details className="sea-rules"><summary>Andere zeeslagen</summary>{overview.games.map(g => <button className="sea-archive-link" key={g.id} disabled={busy || !!pending} onClick={() => choose(g.id)}>{g.title}<span>{phases[g.status]}</span></button>)}</details>}
    <footer className="sea-footer"><Anchor size={16}/> Hijgend Hert · Samen jagen. Samen varen.</footer>
  </div></main>;
}
