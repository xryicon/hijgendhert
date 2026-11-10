"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Bell, CalendarDays, CheckCheck, Clock3, RefreshCw, Swords, Ticket, X } from 'lucide-react';
import Link from '@/components/site-link';
import { useMemberSession } from './session-provider';

type Notification = {
  id: string;
  kind: 'raffle' | 'event' | 'event_start' | 'calendar' | 'calendar_update';
  title: string; detail: string; href: string; createdAt: string; read: boolean;
};
type Feed = { notifications: Notification[]; unreadCount: number; stale: boolean; unavailableSources: string[]; serverNow: string };
type State = { owner: string | null; feed: Feed | null; loading: boolean; saving: boolean; error: string; readError: string };
const empty = (owner: string | null): State => ({ owner, feed: null, loading: false, saving: false, error: '', readError: '' });
const NotificationContext = createContext<State & { refresh: (force?: boolean) => Promise<void>; markRead: (ids: string[]) => Promise<void> }>({ ...empty(null), refresh: async () => {}, markRead: async () => {} });
const everyMinute = 60_000;
const time = (value: number | string) => new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(new Date(value));
const date = (value: string) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(new Date(value));
function waitUntil(response: Response | undefined, failures: number) {
  const header = response?.headers.get('Retry-After');
  const seconds = header && /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : header ? Date.parse(header) - Date.now() : 0;
  return Date.now() + Math.max(Math.min(15 * everyMinute, everyMinute * 2 ** Math.min(failures - 1, 4)), Number.isFinite(seconds) ? seconds : 0);
}
function isNotification(value: unknown): value is Notification {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Notification>;
  return typeof item.id === 'string' && item.id.length <= 200 && ['raffle', 'event', 'event_start', 'calendar', 'calendar_update'].includes(item.kind || '')
    && typeof item.title === 'string' && typeof item.detail === 'string' && typeof item.read === 'boolean'
    && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt))
    && typeof item.href === 'string' && /^\/events(?:[?#].*)?$/.test(item.href);
}

export default function NotificationProvider({ children }: { children: ReactNode }) {
  const session = useMemberSession();
  const owner = session.status === 'authenticated' ? session.member?.id || null : null;
  const identity = useRef(owner); identity.current = owner;
  const [state, setState] = useState<State>(() => empty(owner));
  const running = useRef<AbortController | null>(null);
  const saving = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const nextCheck = useRef(0);
  const retryAt = useRef(0);
  const writeRetryAt = useRef(0);
  const failures = useRef(0);
  const confirmed = useRef(new Set<string>());
  const queuedReads = useRef(new Set<string>());

  const refresh = useCallback(async (force = false) => {
    if (!owner || identity.current !== owner || document.hidden || running.current || Date.now() < retryAt.current || (!force && Date.now() < nextCheck.current)) return;
    const controller = new AbortController(); running.current = controller;
    const version = generation.current;
    const current = () => identity.current === owner && generation.current === version && running.current === controller;
    setState(old => ({ ...(old.owner === owner ? old : empty(owner)), loading: true, error: '' }));
    let response: Response | undefined;
    try {
      response = await fetch('/api/members/notifications', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(40_000)]) });
      if (response.status === 401) await session.refresh();
      const body = await response.json() as Partial<Feed> & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Je meldingen kunnen nu niet worden opgehaald.');
      if (!Array.isArray(body.notifications) || body.notifications.length > 50 || !body.notifications.every(isNotification) || !Number.isFinite(body.unreadCount)) throw new Error('Je meldingen konden niet worden geladen.');
      if (!current()) return;
      const knownRead = body.notifications.filter(item => !item.read && confirmed.current.has(item.id)).length;
      const feed: Feed = { notifications: body.notifications.map(item => ({ ...item, read: item.read || confirmed.current.has(item.id) })),
        unreadCount: Math.max(0, (body.unreadCount || 0) - knownRead), stale: !!body.stale,
        unavailableSources: Array.isArray(body.unavailableSources) ? body.unavailableSources : [], serverNow: body.serverNow || new Date().toISOString() };
      failures.current = 0; retryAt.current = 0; nextCheck.current = Date.now() + everyMinute;
      setState(old => old.owner === owner ? { ...old, feed, error: '' } : old);
    } catch (error) {
      if (!current() || controller.signal.aborted) return;
      retryAt.current = waitUntil(response, ++failures.current);
      const message = error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Het ophalen duurt even te lang.';
      setState(old => old.owner === owner ? { ...old, error: `${message} We proberen het opnieuw om ${time(retryAt.current)}.` } : old);
    } finally {
      if (current()) { running.current = null; setState(old => old.owner === owner ? { ...old, loading: false } : old); }
    }
  }, [owner, session.refresh]);

  const markRead = useCallback(async (ids: string[]): Promise<void> => {
    if (!owner || identity.current !== owner || !ids.length || Date.now() < writeRetryAt.current) return;
    ids.slice(0, 50).forEach(id => queuedReads.current.add(id));
    if (saving.current) return;
    const requestedIds = [...queuedReads.current].slice(0, 50);
    requestedIds.forEach(id => queuedReads.current.delete(id));
    const controller = new AbortController(); saving.current = controller;
    const version = generation.current;
    const current = () => identity.current === owner && generation.current === version && saving.current === controller;
    setState(old => old.owner === owner ? { ...old, saving: true, readError: '' } : old);
    let response: Response | undefined;
    try {
      response = await fetch('/api/members/notifications', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: requestedIds }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
      if (response.status === 401) await session.refresh();
      const body = await response.json() as { readIds?: string[]; error?: string };
      if (!response.ok || !Array.isArray(body.readIds) || body.readIds.length > 500) throw new Error(body.error || 'Als gelezen bewaren is niet gelukt.');
      if (!current()) return;
      const requested = new Set(requestedIds);
      const accepted = new Set(body.readIds.filter(id => typeof id === 'string' && requested.has(id)));
      accepted.forEach(id => confirmed.current.add(id));
      while (confirmed.current.size > 500) confirmed.current.delete(confirmed.current.values().next().value!);
      writeRetryAt.current = 0;
      setState(old => {
        if (old.owner !== owner || !old.feed) return old;
        const changed = old.feed.notifications.filter(item => !item.read && accepted.has(item.id)).length;
        return { ...old, feed: { ...old.feed, notifications: old.feed.notifications.map(item => accepted.has(item.id) ? { ...item, read: true } : item), unreadCount: Math.max(0, old.feed.unreadCount - changed) } };
      });
    } catch (error) {
      if (!current() || controller.signal.aborted) return;
      writeRetryAt.current = waitUntil(response, 1);
      queuedReads.current.clear();
      setState(old => old.owner === owner ? { ...old, readError: `${error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Bewaren duurt even te lang.'}${writeRetryAt.current ? ` Probeer het opnieuw na ${time(writeRetryAt.current)}.` : ' Je meldingen blijven ongelezen.'}` } : old);
    } finally {
      if (current()) {
        saving.current = null; setState(old => old.owner === owner ? { ...old, saving: false } : old);
        if (queuedReads.current.size) void markRead([...queuedReads.current]);
      }
    }
  }, [owner, session.refresh]);

  useEffect(() => {
    generation.current++;
    running.current?.abort(); running.current = null;
    saving.current?.abort(); saving.current = null;
    nextCheck.current = 0; retryAt.current = 0; writeRetryAt.current = 0; failures.current = 0; confirmed.current.clear(); queuedReads.current.clear();
    setState(empty(owner));
    if (!owner) return;
    void refresh();
    const visible = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(() => void refresh(), 15_000);
    document.addEventListener('visibilitychange', visible);
    return () => { generation.current++; running.current?.abort(); running.current = null; saving.current?.abort(); saving.current = null; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [owner, refresh]);
  const visible = state.owner === owner ? state : empty(owner);
  return <NotificationContext.Provider value={{ ...visible, refresh, markRead }}>{children}</NotificationContext.Provider>;
}

const kinds = {
  raffle: { icon: Ticket, label: 'Loterij' }, event: { icon: Swords, label: 'Nieuw event' },
  event_start: { icon: Clock3, label: 'Van start' }, calendar: { icon: CalendarDays, label: 'Clanagenda' }, calendar_update: { icon: CalendarDays, label: 'Agenda gewijzigd' },
};

export function NotificationBell({ onOpen }: { onOpen?: () => void }) {
  const session = useMemberSession();
  const { feed, loading, saving, error, readError, refresh, markRead } = useContext(NotificationContext);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const id = useId();
  const unread = feed?.unreadCount || 0;
  useEffect(() => setOpen(false), [session.status, session.member?.id]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const focusOutside = (event: FocusEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('focusin', focusOutside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', focusOutside); document.removeEventListener('keydown', escape); };
  }, [open]);
  if (session.status !== 'authenticated' || !session.member) return null;
  return <div className="notification-center" ref={container}>
    <button className={`notification-bell${open ? ' is-open' : ''}`} ref={button} type="button" aria-label={`Meldingen${unread ? `, ${unread} ongelezen` : ''}`} aria-expanded={open} aria-controls={id} aria-haspopup="dialog" onClick={() => { setOpen(value => !value); if (!open) { onOpen?.(); void refresh(); } }}>
      <Bell size={20} strokeWidth={1.6} aria-hidden="true"/>
      {unread > 0 && <span className="notification-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <section className="notification-panel" id={id} ref={panel} tabIndex={-1} role="dialog" aria-labelledby={`${id}-title`}>
      <div className="notification-heading"><div><span className="notification-eyebrow">UIT HET CLANHUIS</span><h2 id={`${id}-title`}>Meldingen</h2></div><button className="notification-close" type="button" aria-label="Meldingen sluiten" onClick={() => { setOpen(false); button.current?.focus(); }}><X size={18}/></button></div>
      <div className="notification-toolbar"><span>{unread ? `${unread} ongelezen` : !feed ? loading ? 'Even ophalen…' : 'Nog niet beschikbaar' : feed.stale ? 'Nog niet volledig bijgewerkt' : 'Helemaal bij'}</span><button type="button" disabled={!unread || saving} onClick={() => void markRead(feed?.notifications.filter(item => !item.read).map(item => item.id) || [])}><CheckCheck size={15}/>{saving ? 'Bewaren…' : 'Alles gelezen'}</button></div>
      {(error || readError) && <div className="notification-message is-error" role="status"><p>{readError || error}</p>{error && <button type="button" disabled={loading} onClick={() => void refresh(true)}><RefreshCw size={14}/> Opnieuw proberen</button>}</div>}
      {feed?.stale && !error && <p className="notification-message" role="status">Een deel van de agenda kan nu niet worden vernieuwd. Je opgeslagen meldingen blijven zichtbaar.</p>}
      {loading && !feed ? <div className="notification-empty" role="status"><RefreshCw size={25}/><p>Meldingen ophalen…</p></div> : !feed?.notifications.length ? <div className="notification-empty"><Bell size={28}/><h3>{error || feed?.stale ? 'Je meldingen zijn nog niet beschikbaar' : 'Nog even rustig in het bos'}</h3><p>{error || feed?.stale ? 'Zodra de verbinding herstelt, wordt je overzicht bijgewerkt.' : 'Nieuwe loterijen, events en agendanieuws verschijnen hier.'}</p></div> : <ul className="notification-list">{feed.notifications.map(item => {
        const kind = kinds[item.kind]; const Icon = kind.icon;
        return <li key={item.id} className={item.read ? 'is-read' : 'is-unread'}><Link href={item.href} prefetch={false} onClick={() => { if (!item.read) void markRead([item.id]); setOpen(false); }}>
          <span className={`notification-kind kind-${item.kind}`}><Icon size={19}/></span><span className="notification-copy"><span className="notification-label">{kind.label}{!item.read && <span className="notification-dot" aria-label="Ongelezen"/>}</span><strong>{item.title}</strong><span className="notification-detail">{item.detail}</span><time dateTime={item.createdAt}>{date(item.createdAt)}</time></span><ArrowUpRight className="notification-arrow" size={14}/>
        </Link></li>;
      })}</ul>}
      <div className="notification-footer"><Bell size={12}/><span>Jouw clan, op de voet gevolgd.</span></div>
    </section>}
  </div>;
}
