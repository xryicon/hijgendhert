"use client";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, CalendarDays, Check, ChevronDown, Crown, ExternalLink, RefreshCw, ShieldCheck, Sprout, Swords, Trophy, UserRound } from 'lucide-react';
import type { DiscordMember, MemberEvent, MemberProfile } from '@/lib/member-types';
import { normalizePlayerName } from '@/lib/player-name';
import { SKILLS } from '@/lib/community';
import { useMemberSession } from './session-provider';
import { ProfileRaffle } from './clan-raffle';

const number = (value: number) => new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(value);
const day = (value: string) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Amsterdam' }).format(new Date(value));

export default function MemberProfileView({ member }: { member: DiscordMember }) {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [limit, setLimit] = useState(8);
  const [results, setResults] = useState<Record<number, 'loading' | 'loaded' | 'error'>>({});
  const session = useMemberSession();
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const timeout = AbortSignal.timeout(30_000);
      const response = await fetch('/api/members/profile', { credentials: 'same-origin', cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      const body = await response.json() as MemberProfile & { error?: string };
      if (response.status === 401) { await session.refresh(); throw new Error('Je toegang wordt opnieuw gecontroleerd.'); }
      if (!response.ok) throw new Error(body.error || 'Je profiel is tijdelijk niet beschikbaar.');
      if (!signal?.aborted) { setProfile(body); setName(body.player?.displayName || ''); setLimit(8); setResults({}); }
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Je profiel kon niet worden geladen.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [session.refresh]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault(); setFormError('');
    const player = profile?.players.find(p => normalizePlayerName(p.displayName) === normalizePlayerName(name) || normalizePlayerName(p.username) === normalizePlayerName(name));
    if (!player) { setFormError('Kies je naam uit de clanlijst hieronder.'); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/members/profile', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId: player.id }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Opslaan is niet gelukt.');
      setEditing(false); await load();
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Opslaan is niet gelukt.'); }
    finally { setSaving(false); }
  }
  const events = profile?.events || [];
  const stats = useMemo(() => ({
    total: events.length,
    finished: events.filter(e => e.status === 'finished').length,
    active: events.filter(e => e.status === 'active').length,
  }), [profile]);
  async function loadResult(id: number) {
    setResults(old => ({ ...old, [id]: 'loading' }));
    try {
      const response = await fetch(`/api/members/event?id=${id}`, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(30_000) });
      const body = await response.json() as { event?: MemberEvent; stale?: boolean };
      if (!response.ok || !body.event) throw new Error('unavailable');
      const result = body.event;
      setProfile(old => old ? { ...old, stale: old.stale || body.stale, events: old.events.map(e => e.id === id ? result : e) } : old);
      setResults(old => ({ ...old, [id]: 'loaded' }));
    } catch { setResults(old => ({ ...old, [id]: 'error' })); }
  }
  const statsReady = !!profile?.player && !profile.eventsError && !error && !loading;
  return <div className="profile-shell">
    <div className="profile-breadcrumb"><a href="/">Hijgend Hert</a><span>/</span><span>Mijn profiel</span></div>
    <section className="profile-identity" aria-labelledby="profile-title">
      <div className="profile-avatar" aria-hidden="true"><span>{Array.from(member.displayName)[0]}</span><ShieldCheck size={19}/></div>
      <div className="profile-heading"><p className="member-eyebrow">HIJGEND HERT · CLANGENOOT</p><h1 id="profile-title">{member.displayName}</h1><p className="profile-discord"><span>@{member.username}</span><span className="profile-role"><ShieldCheck size={13}/>{member.clanRole}</span></p>{member.joinedAt && <p className="profile-since">Bij de Discord sinds {day(member.joinedAt)}</p>}</div>
      <a className="profile-agenda" href="/events#kalender"><CalendarDays size={17}/><span>Clanagenda</span><ArrowUpRight size={15}/></a>
      <img className="profile-watermark" src="/clan-logo.png" alt=""/>
    </section>

    {profile?.stale && <p className="profile-muted" role="status">Wise Old Man is even druk. Je ziet de laatst bevestigde gegevens.</p>}
    <div className="profile-layout">
      <aside className="profile-character" aria-labelledby="character-title">
        <div className="profile-section-label"><Swords size={17}/><span>IN GIELINOR</span></div><h2 id="character-title">Jouw RuneScape-account</h2>
        {loading && !profile ? <p className="profile-muted" role="status">Clanlijst wordt opgehaald…</p> : error ? <div className="profile-error" role="status"><p>{error}</p><button onClick={() => void load()}><RefreshCw size={14}/> Opnieuw proberen</button></div> : <>
          {profile?.player && !editing ? <>
            <div className="profile-player-name"><img src="/clan-logo.png" alt=""/><div><strong>{profile.player.displayName}</strong><span>{({ regular: 'Main account', ironman: 'Ironman', hardcore: 'Hardcore Ironman', ultimate: 'Ultimate Ironman' } as Record<string, string>)[profile.player.type] || 'RuneScape-account'}</span></div></div>
            <dl className="profile-player-stats"><div><dt>Totale XP</dt><dd>{profile.player.exp !== null ? number(profile.player.exp) : '—'}</dd></div><div><dt>EHP</dt><dd>{profile.player.ehp !== null ? number(profile.player.ehp) : '—'}</dd></div><div><dt>EHB</dt><dd>{profile.player.ehb !== null ? number(profile.player.ehb) : '—'}</dd></div></dl>
            <a className="profile-wom-link" href={`https://wiseoldman.net/players/${encodeURIComponent(profile.player.username)}`} target="_blank" rel="noreferrer">Bekijk op Wise Old Man <ExternalLink size={13}/></a>
            <button className="profile-change" type="button" onClick={() => setEditing(true)}>Ander account kiezen</button>
            <p className="profile-footnote">{profile.selection === 'discord' ? 'Deze naam komt overeen met je Discord-naam. Klopt hij niet? Kies dan je eigen account.' : 'Je accountkeuze wordt in deze browser onthouden.'}</p>
          </> : <form className="profile-link-form" onSubmit={save}>
            <p>Selecteer je RuneScape-naam om je clancompetities en resultaten te bekijken.</p>
            <label htmlFor="rsn">RuneScape-naam</label><input id="rsn" list="clan-player-names" value={name} onChange={event => setName(event.target.value)} placeholder="Zoek je naam…" autoComplete="off" maxLength={30} required/>
            <datalist id="clan-player-names">{profile?.players.map(p => <option key={p.id} value={p.displayName}/>)}</datalist>
            <button className="profile-save" type="submit" disabled={saving}>{saving ? <RefreshCw size={15}/> : <Check size={15}/>} {saving ? 'Opslaan…' : 'Account gebruiken'}</button>
            {editing && <button className="profile-change" type="button" onClick={() => setEditing(false)}>Annuleren</button>}
            {formError && <p className="profile-error" role="alert">{formError}</p>}
            <p className="profile-footnote">Je kiest uit de Hijgend Hert-clanlijst. We onthouden je keuze in deze browser.</p>
          </form>}
        </>}
      </aside>

      <div className="profile-activity">
        {profile?.player && <ProfileRaffle playerName={profile.player.displayName}/>}
        <div className="profile-summary" aria-label="Jouw clancompetities">
          <div><Swords size={20}/><strong>{statsReady ? stats.total : '—'}</strong><span>Clancompetities</span></div>
          <div><Trophy size={20}/><strong>{statsReady ? stats.finished : '—'}</strong><span>Afgeronde events</span></div>
          <div><CalendarDays size={20}/><strong>{statsReady ? stats.active : '—'}</strong><span>Lopende events</span></div>
        </div>
        <section className="profile-events" id="events" aria-labelledby="profile-events-title">
          <div className="profile-events-heading"><div><p className="profile-section-label">JOUW CLANAVONTUREN</p><h2 id="profile-events-title">Mijn events</h2></div><a href="/events">Naar events <ArrowUpRight size={14}/></a></div>
          {loading ? <div className="profile-empty" role="status"><RefreshCw size={24}/><p>Je gegevens worden opgehaald…</p></div> : error || profile?.eventsError ? <div className="profile-empty" role="status"><RefreshCw size={24}/><h3>Even niet beschikbaar</h3><p>{error || profile?.eventsError}</p><button onClick={() => void load()}>Opnieuw proberen</button></div> : !profile?.player ? <div className="profile-empty"><UserRound size={28}/><h3>Welke avonturier ben jij?</h3><p>Kies je RuneScape-account. Hier verschijnen daarna je clancompetities, behaalde XP of kills en eindklasseringen.</p></div> : events.length === 0 ? <div className="profile-empty"><Swords size={28}/><h3>Je eerste avontuur wacht</h3><p>Wise Old Man heeft nog geen Hijgend Hert-competities voor dit account. Nieuwe deelnames verschijnen hier vanzelf.</p><a href="/events#kalender">Bekijk de clanagenda <ArrowUpRight size={14}/></a></div> : <>
            <div className="profile-event-list">{events.slice(0, limit).map(event => {
              const podium = event.status === 'finished' && event.rank !== null && event.rank <= 3 && event.gained !== null && event.gained > 0;
              const Icon = podium ? Crown : SKILLS.has(event.metric) ? Sprout : Swords;
              return <div className={`profile-event-row${podium ? ' is-podium' : ''}`} key={event.id}>
                <span className="profile-event-icon"><Icon size={20}/></span><div className="profile-event-title"><a href={`https://wiseoldman.net/competitions/${event.id}`} target="_blank" rel="noreferrer"><strong>{event.title}</strong><ArrowUpRight size={12}/></a><span>{day(event.startsAt)} – {day(event.endsAt)}</span></div>
                <div className="profile-event-result">{event.gained !== null ? <strong>+{number(Math.max(0, event.gained))} <small>{event.unit}</small></strong> : <button type="button" disabled={results[event.id] === 'loading' || results[event.id] === 'loaded'} onClick={() => void loadResult(event.id)} aria-label={`Bekijk resultaat: ${event.title}`}>{results[event.id] === 'loading' ? 'Laden…' : results[event.id] === 'error' ? 'Opnieuw proberen' : results[event.id] === 'loaded' ? 'Stand onbekend' : 'Bekijk resultaat'}</button>}<span>{event.status === 'active' ? 'Nu bezig' : event.status === 'upcoming' ? 'Binnenkort' : event.gained === null ? 'Afgelopen' : event.gained > 0 ? 'Meegedaan' : 'Ingeschreven'}</span></div>
                <span className={`profile-event-rank${podium ? ' podium-rank' : ''}`}>{event.rank && event.gained !== null && event.gained > 0 ? `#${event.rank}` : '—'}</span><span className="profile-event-arrow"/>
              </div>;
            })}</div>
            {events.length > limit && <button className="profile-more" onClick={() => setLimit(n => n + 12)}>Meer events bekijken <ChevronDown size={15}/></button>}
            <p className="profile-events-note">Competities waarvoor dit account op de deelnemerslijst staat. Bekijk het resultaat voor je XP, kills en plaats. Alleen inschrijven telt niet als actief meedoen.</p>
          </>}
        </section>
      </div>
    </div>
    <p className="profile-footer"><ShieldCheck size={13}/> Je profiel is alleen zichtbaar wanneer je bent ingelogd.</p>
  </div>;
}
