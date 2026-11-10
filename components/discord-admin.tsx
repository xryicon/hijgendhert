'use client';
import ClanCrest from './clan-crest';
import { useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, Check, MessageCircle, ShieldCheck, Snowflake, Ticket, Users } from 'lucide-react';
import AdminAppearance from './admin-appearance';
import { EMPTY_SYNC_SETTINGS, type ClanEventInput, type EventView, type SyncSettings } from '@/lib/clan-discord';
import Link from './site-link';
import { EventCategoryFields, EventMinimumFields } from './admin-event-fields';
import AdminEventResults from './admin-event-results';
import PkSettingsPanel from './pk-settings';
import { EVENT_CATEGORIES } from '@/lib/clan-event-rules';

type SettingsState = { settings: SyncSettings; botConfigured: boolean; deliveries: { kind: string; waiting: number; failed: number }[]; recent: { kind: string; error: string }[] };
const freshEvent = (): ClanEventInput => ({ id: crypto.randomUUID(), revision: 0, title: '', description: '', category: 'boss', startsAt: '', endsAt: '', status: 'scheduled', minimum: null });
const localInput = (value: string) => { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const labels = { login: 'Inlogmeldingen', events: 'Events en inschrijvingen', raffle: 'Loterijuitslagen' };
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const data = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(data.error || 'Opslaan niet gelukt.'); return data;
}
export default function DiscordAdmin() {
  const [state, setState] = useState<SettingsState | null>(null); const [settings, setSettings] = useState(EMPTY_SYNC_SETTINGS);
  const [events, setEvents] = useState<EventView[]>([]); const [editing, setEditing] = useState<ClanEventInput | null>(null);
  const [tab, setTab] = useState<'events' | 'discord' | 'appearance'>('events');
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function load() {
    const [s, e] = await Promise.all([api<SettingsState>('/api/admin/discord'), api<{ events: EventView[] }>('/api/admin/clan-events')]);
    setState(s); setSettings(s.settings); setEvents(e.events);
  }
  useEffect(() => { void load().catch(e => setError(e.message)); }, []);
  async function saveSettings(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { const result = await api<SettingsState>('/api/admin/discord', settings); setState(result); setSettings(result.settings); setMessage('Discord-instellingen opgeslagen.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Probeer opnieuw.'); } finally { setBusy(false); }
  }
  async function saveEvent(e: FormEvent) {
    e.preventDefault(); if (!editing) return; setBusy(true); setError(''); setMessage('');
    try { await api('/api/admin/clan-events', editing); await load(); setEditing(null); setMessage('Event opgeslagen. De agenda is bijgewerkt.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Probeer opnieuw.'); } finally { setBusy(false); }
  }
  return <div className="clan-admin container"><header className="clan-admin-heading"><ClanCrest className="admin-clan-crest" alt="Hijgend Hert"/><div><p className="eyebrow">HIJGEND HERT</p><h1>De clanleiding</h1><p>Onze events, onze afspraken, onze clan.</p><span className="admin-access"><ShieldCheck size={14}/> Alleen Admin & Staff team</span></div><Link href="/events#kalender" className="button gold">Naar de agenda</Link></header>
    <nav className="admin-tabs" aria-label="Clanbeheer"><button aria-pressed={tab === 'events'} onClick={() => setTab('events')}><CalendarDays size={17}/> Clanactiviteiten</button><button aria-pressed={tab === 'discord'} onClick={() => setTab('discord')}><MessageCircle size={17}/> Discord</button><button aria-pressed={tab === 'appearance'} onClick={() => setTab('appearance')}><Snowflake size={17}/> Uiterlijk</button></nav>
    {tab === 'appearance' && <AdminAppearance/>}
    <div className="sync-status" hidden={tab !== 'discord'}><ShieldCheck size={22}/><div><strong>{state?.botConfigured ? 'Botgegevens aanwezig' : 'Discord staat klaar voor later'}</strong><p>{state?.botConfigured ? 'Kies per onderdeel een kanaal en zet de melding aan.' : 'Je kunt alvast events plannen en kanalen bewaren. Meldingen blijven uit totdat de bot en kanalen zijn ingesteld.'}</p></div></div>
    {error && <p className="clan-admin-feedback error" role="alert">{error} <button className="text-link" onClick={() => void load().then(() => setError('')).catch(e => setError(e.message))}>Opnieuw laden</button></p>}
    {message && <p className="clan-admin-feedback" role="status"><Check size={16}/>{message}</p>}
    <section className="clan-admin-panel" hidden={tab !== 'discord'}><div className="clan-admin-section-title"><MessageCircle size={24}/><div><h2>De verbinding met Discord</h2><p>Drie kanalen, elk met een eigen schakelaar.</p></div></div>
      <form onSubmit={saveSettings}><fieldset disabled={busy || !state}><div className="sync-channel-grid">{(['login', 'events', 'raffle'] as const).map(kind => { const Icon = kind === 'login' ? ShieldCheck : kind === 'events' ? CalendarDays : Ticket; return <div className="sync-channel" key={kind}><Icon size={23}/><h3>{labels[kind]}</h3><p>{kind === 'login' ? 'Een melding na een geslaagde login. Alleen in een afgeschermd staffkanaal.' : kind === 'events' ? 'Een eventbericht met Aanmelden en Afmelden. De deelnemerslijst volgt de website.' : 'Winnaar, prijs, winnend lot en een link naar het controlebewijs na de trekking.'}</p><label>Kanaal-ID<input inputMode="numeric" pattern="[0-9]{17,20}" placeholder="Nog geen kanaal gekozen" value={settings[`${kind}Channel`]} onChange={e => setSettings({ ...settings, [`${kind}Channel`]: e.target.value.trim() })}/></label><label className="sync-switch"><input type="checkbox" checked={settings[`${kind}Enabled`]} onChange={e => setSettings({ ...settings, [`${kind}Enabled`]: e.target.checked })}/><span>{settings[`${kind}Enabled`] ? 'Ingeschakeld' : 'Uitgeschakeld'}</span></label></div>; })}</div>
      <div className="clan-admin-form-footer"><p>Uitgeschakelde meldingen worden niet achteraf verstuurd. Bij het aanzetten van events worden toekomstige clanactiviteiten geplaatst.</p><button className="button gold" type="submit">{busy ? 'Opslaan…' : 'Instellingen bewaren'}</button></div></fieldset></form>
      {state?.deliveries.some(d => d.waiting || d.failed) && <div className="sync-deliveries">{state.deliveries.map(d => <p key={d.kind}>{labels[d.kind as keyof typeof labels]}: {d.waiting} in wachtrij · {d.failed} hebben aandacht nodig</p>)}{state.recent.map((d, i) => <p key={i} role="status">{d.error}</p>)}</div>}
      <details className="sync-help"><summary>Later activeren</summary><ol><li>Voeg in Cloudflare het geheim <code>DISCORD_BOT_TOKEN</code> toe. Dit is het bot-token van de bestaande Hijgend Hert-app, niet de client secret.</li><li>Geef de bot in de gekozen kanalen Kanaal bekijken, Berichten verzenden, Links insluiten en Berichtgeschiedenis lezen.</li><li>Maak het inlogkanaal privé: @everyone mag het niet bekijken; alleen Admin, Staff team en de bot krijgen toegang.</li><li>Vul de kanaal-ID’s hierboven in en zet de gewenste meldingen aan.</li></ol><p>De bestaande Discord-knoppenkoppeling gebruikt <code>/api/discord/interactions</code>. Er is geen toegang tot gewone chatberichten nodig.</p></details>
    </section>
    <section className="clan-admin-panel" hidden={tab !== 'discord'}><PkSettingsPanel/></section>
    <section className="clan-admin-panel" hidden={tab !== 'events'}><div className="clan-admin-section-title"><CalendarDays size={24}/><div><h2>Onze activiteiten</h2><p>Van skillweek tot clanbingo. Inschrijvingen sluiten bij de begintijd; het minimum geldt tijdens het event.</p></div><button className="button gold" disabled={!state || busy} onClick={() => setEditing(freshEvent())}>Nieuw event</button></div>
      {editing && <form className="clan-event-editor" onSubmit={saveEvent}><fieldset disabled={busy}><EventCategoryFields event={editing} onChange={setEditing}/><div className="clan-event-form-grid"><label>Naam<input required minLength={3} maxLength={100} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })}/></label><label>Begint<input required type="datetime-local" value={localInput(editing.startsAt)} onChange={e => setEditing({ ...editing, startsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })}/></label><label>Eindigt<input required type="datetime-local" value={localInput(editing.endsAt)} onChange={e => setEditing({ ...editing, endsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })}/></label><label className="wide">Beschrijving<textarea required minLength={3} maxLength={1200} rows={4} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })}/></label>{editing.revision > 0 && <label>Status<select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value as ClanEventInput['status'] })}><option value="scheduled">Gepland</option><option value="cancelled">Geannuleerd</option></select></label>}</div><EventMinimumFields event={editing} onChange={setEditing}/><p className="admin-date-note">Tijden in jouw tijdzone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. De agenda toont Nederlandse tijd. Vanaf de start staan de regels vast.</p><div className="clan-admin-actions"><button className="button gold" type="submit">Event opslaan</button><button className="text-link" type="button" onClick={() => setEditing(null)}>Sluiten</button></div></fieldset></form>}
      <div className="admin-event-list">{!events.length ? <p className="admin-empty">Nog geen clanactiviteiten gepland. Een skillweek, boss trip of bingo — het volgende avontuur begint hier.</p> : events.map(event => <article key={event.id}><div><span className="mini-label">{EVENT_CATEGORIES[event.category]} · {event.status === 'cancelled' ? 'GEANNULEERD' : Date.parse(event.startsAt) <= Date.now() ? 'GESLOTEN' : 'GEPLAND'}</span><h3>{event.title}</h3><p>{new Date(event.startsAt).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })} · Nederlandse tijd</p><span className="admin-event-count"><Users size={15}/>{event.participantCount} aangemeld</span>{!event.minimum && !!event.participants?.length && <details><summary>Deelnemers</summary><p>{event.participants.map(p => p.name).join(', ')}</p></details>}</div><button className="text-link" disabled={Date.parse(event.startsAt) <= Date.now()} onClick={() => { const { id, revision, title, description, category, startsAt, endsAt, status, minimum } = event; setEditing({ id, revision, title, description, category, startsAt, endsAt, status, minimum: minimum || null }); }}>Bewerken</button><AdminEventResults event={event} onChanged={updated => setEvents(list => list.map(row => row.id === updated.id ? updated : row))}/></article>)}</div>
    </section>
  </div>;
}
