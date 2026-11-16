'use client';
import { useEffect, useState } from 'react';
import { Check, Flag, Search, Shuffle, Users, X } from 'lucide-react';
import type { WarshipView } from '@/lib/warships';
import type { SeaRoster, SeaTeamDraw } from '@/lib/warship-teams';
import WarshipDraw, { ehbText, TeamBalance } from './warship-draw';
import WarshipRevealSettings from './warship-reveal-settings';

type Act = (type: string, fields?: Record<string, unknown>) => Promise<boolean>;
export default function WarshipTeamBuilder({ game, busy, act }: { game: WarshipView; busy: boolean; act: Act }) {
  const preparing = game.status === 'draft' || game.status === 'setup';
  const canEdit = game.canManage && preparing && !game.reveal;
  const initial = game.teamDraft || game.teamAssignment;
  const [roster, setRoster] = useState<SeaRoster | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0), [retryAt, setRetryAt] = useState(0), [clock, setClock] = useState(Date.now());
  const [selected, setSelected] = useState<number[]>(() => initial?.players.map(p => p.id) || game.crew.flatMap(p => p.playerId ? [p.playerId] : []));
  const [assignments, setAssignments] = useState<Record<number, 0 | 1>>(() => Object.fromEntries(initial?.players.map(p => [p.id, p.team]) || []));
  const [captains, setCaptains] = useState<[number | null, number | null]>(() => [initial?.players.find(p => p.captain && p.team === 0)?.id || null, initial?.players.find(p => p.captain && p.team === 1)?.id || null]);
  const [mode, setMode] = useState<'random' | 'captains' | 'manual'>('random'), [search, setSearch] = useState(''), [limit, setLimit] = useState(24);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setConfirm(false); }, [game.teamDraft?.id]);
  useEffect(() => {
    if (!canEdit) return;
    const controller = new AbortController(); setLoading(true);
    void (async () => {
      try {
        const r = await fetch('/api/warships/roster', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
        const data = await r.json() as SeaRoster & { error?: string };
        if (controller.signal.aborted) return;
        if (!r.ok) { setRetryAt(Date.now() + Math.max(30, Number(r.headers.get('Retry-After')) || 30) * 1000); throw new Error(data.error || 'De clanlijst is tijdelijk niet beschikbaar.'); }
        if (!Array.isArray(data.players)) throw new Error('De clanlijst is onvolledig.');
        setRoster(data); setError(''); setRetryAt(0);
      } catch (e) { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : 'De clanlijst kon niet worden geladen.'); setRetryAt(value => value || Date.now() + 30000); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [canEdit, retry]);
  useEffect(() => { if (!retryAt) return; const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, [retryAt]);
  const chosen = selected.flatMap(id => { const player = roster?.players.find(p => p.id === id); return player ? [player] : []; });
  const missing = chosen.some(p => p.ehb === null), unavailable = chosen.length !== selected.length;
  const found = (roster?.players || []).filter(p => !selected.includes(p.id) && `${p.rsn} ${p.username}`.toLowerCase().includes(search.toLowerCase()));
  const manual = chosen.map(p => ({ ...p, team: assignments[p.id] ?? 0, captain: captains.includes(p.id) }));
  const validCaptains = captains.every((id, t) => id !== null && selected.includes(id) && (mode !== 'manual' || assignments[id] === t)) && captains[0] !== captains[1];
  const manualSizes = [0, 1].map(t => manual.filter(p => p.team === t).length);
  const valid = selected.length >= 2 && selected.length <= 100 && !unavailable && (mode === 'manual' ? validCaptains && manualSizes.every(n => n >= 1 && n <= 50) : !missing && (mode === 'random' || validCaptains));
  const draw = game.teamDraft || game.teamAssignment;
  function edit(draw: SeaTeamDraw) {
    setSelected(draw.players.map(p => p.id)); setAssignments(Object.fromEntries(draw.players.map(p => [p.id, p.team])));
    setCaptains([draw.players.find(p => p.team === 0 && p.captain)!.id, draw.players.find(p => p.team === 1 && p.captain)!.id]); setMode('manual'); setConfirm(false);
    document.getElementById('sea-team-picker')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function generate() {
    if (!valid) return;
    setConfirm(false);
    const fields = mode === 'manual' ? { teams: [0, 1].map(t => selected.filter(id => assignments[id] === t)), captainIds: captains } : { playerIds: selected, captainIds: mode === 'captains' ? captains : null };
    if (await act(mode === 'manual' ? 'manual_teams' : 'draw_teams', fields)) document.getElementById('sea-team-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return <div className="sea-team-builder">
    {canEdit && <section id="sea-team-picker" className="sea-team-picker"><div className="sea-section-heading"><div><small>DE BEMANNING VERDELEN</small><h2>Wie vaart er mee?</h2><p>Kies clanleden uit Wise Old Man. Het rad kiest kapiteins; EHB helpt de teams in balans te houden.</p></div><span className="sea-selected-count">{selected.length}/100 spelers</span></div>
      {error && <div className="sea-error" role="alert"><span>{error}</span><button type="button" disabled={loading || clock < retryAt} onClick={() => setRetry(n => n + 1)}>{clock < retryAt ? `Opnieuw over ${Math.ceil((retryAt - clock) / 1000)}s` : 'Probeer opnieuw'}</button></div>}
      <label className="sea-player-search"><Search size={18}/><input type="search" value={search} onChange={e => { setSearch(e.target.value); setLimit(24); }} placeholder="Zoek een clanlid…" aria-label="Zoek spelers in Wise Old Man"/></label>
      {loading && !roster && <p role="status">Wise Old Man-clanleden ophalen…</p>}
      <div className="sea-player-options">{found.slice(0, limit).map(p => <button type="button" key={p.id} disabled={busy || selected.length >= 100} onClick={() => { setSelected([...selected, p.id]); setAssignments({ ...assignments, [p.id]: selected.length % 2 as 0 | 1 }); }}><Users size={16}/><span><strong>{p.rsn}</strong><small>{ehbText(p.ehb)}</small></span><span className="sea-add-mark">+</span></button>)}</div>
      {found.length > limit && <button type="button" className="sea-text-button" onClick={() => setLimit(n => n + 24)}>Meer clanleden ({found.length - limit})</button>}
      {roster && !found.length && <p className="sea-note">Geen andere clanleden gevonden.</p>}
      {roster && <p className="sea-note">{roster.players.length} clanleden · gegevens opgehaald {new Date(roster.fetchedAt).toLocaleString('nl-NL')}{roster.stale ? ' · laatst bekende gegevens' : ''}. De site gebruikt één gedeelde clanlijst en respecteert de wachttijd van Wise Old Man.</p>}
      <fieldset className="sea-draw-modes"><legend>Hoe delen we de teams in?</legend>{([{ value: 'random', title: 'Laat het rad kiezen', text: 'Willekeurige kapiteins + EHB-balans' }, { value: 'captains', title: 'Kies de kapiteins', text: 'Vaste kapiteins + EHB-balans' }, { value: 'manual', title: 'Zelf indelen', text: 'Bepaal elk team en vergelijk de EHB' }] as const).map(m => <label key={m.value}><input type="radio" name="sea-team-mode" value={m.value} checked={mode === m.value} disabled={busy} onChange={() => setMode(m.value)}/><span><strong>{m.title}</strong><small>{m.text}</small></span></label>)}</fieldset>
      <div className="sea-selected-players">{selected.map(id => { const p = roster?.players.find(p => p.id === id) || initial?.players.find(p => p.id === id); return <div key={id}><span><b>{p?.rsn || `Speler #${id}`}</b><small>{p ? ehbText(p.ehb) : 'Niet in de geladen clanlijst'}</small></span>{mode === 'manual' && <select aria-label={`Team voor ${p?.rsn || id}`} value={assignments[id] ?? 0} disabled={busy} onChange={e => setAssignments({ ...assignments, [id]: Number(e.target.value) as 0 | 1 })}>{game.config.teams.map((team, i) => <option key={i} value={i}>{team}</option>)}</select>}<button type="button" className="sea-icon-button" disabled={busy} aria-label={`${p?.rsn || id} uit selectie verwijderen`} onClick={() => setSelected(selected.filter(value => value !== id))}><X size={15}/></button></div>; })}</div>
      {mode !== 'random' && <div className="sea-form-grid sea-captain-picker">{([0, 1] as const).map(t => <label key={t}><Flag size={15}/> Kapitein · {game.config.teams[t]}<select value={captains[t] || ''} disabled={busy} onChange={e => { const next: typeof captains = [...captains]; next[t] = Number(e.target.value) || null; setCaptains(next); }}><option value="">Kies een kapitein</option>{chosen.filter(p => mode !== 'manual' || assignments[p.id] === t).map(p => <option key={p.id} value={p.id}>{p.rsn} · {ehbText(p.ehb)}</option>)}</select></label>)}</div>}
      {mode === 'manual' && chosen.length > 0 && <TeamBalance players={manual}/>}
      {(missing || unavailable) && <p className="sea-note">{unavailable ? 'Een geselecteerde speler ontbreekt in de geladen clanlijst. Verwijder deze of probeer later opnieuw.' : 'EHB ontbreekt bij een geselecteerde speler. Een automatische verdeling is daarom niet beschikbaar; je kunt wel handmatig indelen.'}</p>}
      <div className="sea-buttons"><button type="button" className="button gold" disabled={busy || !valid || loading} onClick={() => void generate()}>{mode === 'manual' ? <Check size={17}/> : <Shuffle size={17}/>} {busy ? 'Indeling voorbereiden…' : mode === 'manual' ? 'Bekijk handmatige indeling' : game.teamDraft ? 'Nieuwe loting maken' : 'Draai & verdeel'}</button>{selected.length > 0 && <button type="button" className="sea-text-button" disabled={busy} onClick={() => { setSelected([]); setCaptains([null, null]); }}>Selectie wissen</button>}</div><p className="sea-note">Iedere loting wordt opgeslagen in het logboek. Bevestig het voorstel om de teams vast te zetten. Een nieuwe indeling wist beide scheepsopstellingen.</p>
    </section>}
    {draw && <section id="sea-team-result"><div className="sea-section-heading"><div><small>{game.teamDraft ? 'VOORSTEL · NOG NIET VASTGEZET' : 'BEVESTIGDE TEAMINDELING'}</small><h2>{draw.mode === 'manual' ? 'De gekozen bemanning' : 'Het rad van Hijgend Hert'}</h2></div>{canEdit && <button type="button" className="button outline" disabled={busy} onClick={() => edit(draw)}>Pas deze indeling aan</button>}</div><WarshipDraw key={draw.id} draw={draw} teams={game.config.teams} autoPlay={!game.reveal}/>
      {canEdit && game.teamDraft && <div className="sea-confirm-teams">{!confirm ? <button className="button gold" type="button" disabled={busy} onClick={() => setConfirm(true)}>Deze teams gebruiken</button> : <><p>Dit vervangt de huidige bemanning en wist beide geheime scheepsopstellingen. Kapiteins plaatsen daarna een nieuwe vloot.</p><div className="sea-buttons"><button type="button" className="button gold" disabled={busy} onClick={() => void act('confirm_teams', { drawId: game.teamDraft!.id }).then(ok => { if (ok) setConfirm(false); })}>Bevestig teamindeling</button><button type="button" className="button outline" disabled={busy} onClick={() => setConfirm(false)}>Terug</button></div></>}</div>}
    </section>}
    <WarshipRevealSettings key={game.reveal?.at || 'unplanned'} game={game} busy={busy} act={act}/>
    {game.drawLog.length > 0 && <details className="sea-draw-history"><summary>Lotinglogboek ({game.drawLog.length} meest recente indelingen)</summary>{[...game.drawLog].reverse().map(d => <div key={d.id}><strong>{d.captains.join(' · ')}</strong><span>{new Date(d.at).toLocaleString('nl-NL')} · {d.mode === 'random' ? 'Willekeurige kapiteins' : d.mode === 'captains' ? 'Gekozen kapiteins' : 'Handmatig'}</span><small>{ehbText(d.totals[0])} / {ehbText(d.totals[1])} · {d.confirmed ? 'Bevestigd' : 'Voorstel'} · #{d.id.slice(0, 8)}</small></div>)}</details>}
  </div>;
}
