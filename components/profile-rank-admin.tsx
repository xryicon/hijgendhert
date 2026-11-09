"use client";
import { useEffect, useState, type FormEvent } from 'react';
import { Check, Plus, Settings2, Trash2 } from 'lucide-react';
import type { MemberProfile } from '@/lib/member-types';
import type { PlayerProgressState, RankRules } from '@/lib/profile-progress';

export default function ProfileRankAdmin({ players, selectedPlayer, onChanged }: { players: MemberProfile['players']; selectedPlayer?: number; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [playerId, setPlayerId] = useState(selectedPlayer || players[0]?.id || 0);
  const [rules, setRules] = useState<RankRules | null>(null);
  const [state, setState] = useState<PlayerProgressState | null>(null);
  const [loadedPlayer, setLoadedPlayer] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setLoading(true); setLoadedPlayer(0); setState(null);
    void (async () => {
      try {
        const response = await fetch(`/api/members/progress/admin${playerId ? `?playerId=${playerId}` : ''}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        const body = await response.json() as { rules: RankRules; state: PlayerProgressState | null; error?: string };
        if (!response.ok) throw new Error(body.error || 'Beheer kon niet worden geladen.');
        if (!controller.signal.aborted) { setRules(body.rules); setState(body.state); setLoadedPlayer(playerId); }
      } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Laden is niet gelukt.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [open, playerId, refresh]);
  async function save(event: FormEvent, kind: 'rules' | 'member') {
    event.preventDefault(); if (!rules) return;
    if (kind === 'member' && (!state || loadedPlayer !== playerId)) return;
    setBusy(true); setMessage('');
    try {
      const payload = kind === 'rules' ? { revision: rules.revision, steps: rules.steps } : { playerId, revision: state!.revision, rankOverride: state!.rankOverride, eventAdjustment: state!.eventAdjustment, reason: state!.reason || '' };
      const response = await fetch(`/api/members/progress/${kind}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Opslaan is niet gelukt.');
      setMessage(kind === 'rules' ? 'Rangdoelen opgeslagen voor de hele clan.' : 'Rang en eventcorrectie opgeslagen.');
      setRefresh(n => n + 1); await onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Opslaan is niet gelukt.'); }
    finally { setBusy(false); }
  }
  return <details className="profile-admin" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><Settings2 size={18}/><span>Clanbeheer <small>Rangen & eventdeelname</small></span><span>Beheren</span></summary>
    {open && <div className="profile-admin-content">
      <p>Stel het totale aantal eventdeelnames per rang in. Je kunt ook iemands getoonde rang aanpassen of deelname aan handmatig bijgehouden clanevents meetellen.</p>
      {loading && <p role="status">Instellingen laden…</p>}
      {rules && <div className="profile-admin-grid">
        <form onSubmit={event => void save(event, 'rules')}><h3>Rangdoelen voor de clan</h3><fieldset disabled={busy || loading}>
          <div className="profile-admin-columns"><span>Rangnaam</span><span>Totaal events</span><span/></div>
          {rules.steps.map((step, index) => <div className="profile-admin-rank-row" key={step.id}>
            <input aria-label={`Naam van rang ${index + 1}`} value={step.name} required maxLength={32} onChange={event => setRules({ ...rules, steps: rules.steps.map((s, i) => i === index ? { ...s, name: event.target.value } : s) })}/>
            <input aria-label={`Eventdoel voor ${step.name}`} type="number" min={0} max={10000} step={1} required value={step.events} onChange={event => setRules({ ...rules, steps: rules.steps.map((s, i) => i === index ? { ...s, events: event.target.valueAsNumber } : s) })}/>
            <button className="profile-admin-remove" type="button" disabled={rules.steps.length <= 2 || index === 0} aria-label={`${step.name} verwijderen`} onClick={() => setRules({ ...rules, steps: rules.steps.filter((_, i) => i !== index) })}><Trash2 size={15}/></button>
          </div>)}
          <button className="profile-admin-add" type="button" disabled={rules.steps.length >= 12} onClick={() => setRules({ ...rules, steps: [...rules.steps, { id: `rank_${crypto.randomUUID().slice(0, 8)}`, name: 'Nieuwe rang', events: Math.min(10000, rules.steps.at(-1)!.events + 10) }] })}><Plus size={14}/> Rang toevoegen</button>
          <p className="profile-feature-note">Aantallen zijn totale deelnames, niet extra events per rang. De eerste rang begint bij 0.</p>
          <button className="profile-save" type="submit"><Check size={15}/> Rangdoelen opslaan</button>
        </fieldset></form>
        <form onSubmit={event => void save(event, 'member')}><h3>Een clanlid aanpassen</h3>
          <label htmlFor="rank-player">RuneScape-account</label><select id="rank-player" disabled={busy} value={playerId} onChange={event => { setPlayerId(Number(event.target.value)); setMessage(''); }}>{players.map(player => <option key={player.id} value={player.id}>{player.displayName}</option>)}</select>
          {state && loadedPlayer === playerId && <fieldset disabled={busy || loading}>
            <label htmlFor="rank-override">Getoonde clanrang</label><select id="rank-override" value={state.rankOverride || ''} onChange={event => setState({ ...state, rankOverride: event.target.value || null })}><option value="">Volg Wise Old Man</option>{rules.steps.map(step => <option key={step.id} value={step.id}>{step.name}</option>)}<option value="deputy_owner">Deputy owner</option><option value="owner">Clanleider</option></select>
            <label htmlFor="rank-adjustment">Eventcorrectie (+ of −)</label><input id="rank-adjustment" type="number" min={-10000} max={10000} step={1} required value={state.eventAdjustment} onChange={event => setState({ ...state, eventAdjustment: event.target.valueAsNumber })}/>
            <p className="profile-feature-note">Deze correctie wordt bij gecontroleerde WOM-deelnames opgeteld. Gebruik bijvoorbeeld +2 voor twee apart bijgehouden events.</p>
            <label htmlFor="rank-reason">Reden voor de aanpassing</label><textarea id="rank-reason" minLength={5} maxLength={300} required rows={2} value={state.reason || ''} onChange={event => setState({ ...state, reason: event.target.value })} placeholder="Bijvoorbeeld: twee clanraids buiten WOM"/>
            <button className="profile-save" type="submit"><Check size={15}/> Lid opslaan</button>
          </fieldset>}
        </form>
      </div>}
      <p className="profile-feature-note">Een profielrang geeft geen extra beheerrechten. Rollen in Discord en in de game worden hierdoor niet gewijzigd.</p>
      {message && <p className="profile-admin-message" role="status">{message}</p>}
      <button className="profile-change" type="button" disabled={busy || loading} onClick={() => { setMessage(''); setRefresh(n => n + 1); }}>Instellingen opnieuw laden</button>
    </div>}
  </details>;
}
