"use client";
import Link from '@/components/site-link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ArrowRight, ChevronLeft, ChevronRight, Check, Copy, ExternalLink, Flame, Globe2, Menu, Search, Shield, Sparkles, Swords, Target, Trophy, Users, X, RefreshCw, Clock3, Sprout, CalendarDays } from "lucide-react";
import SiteHeader from "@/components/site-header";
import CurrentEvent from "@/components/current-event";
import { BreathingCrest, WoodlandBackdrop } from "@/components/home-ambience";
import EventsOverview, { WeeklyEvent, eventHash, type EventView } from "@/components/events-overview";
import LiveEventBackdrop from "@/components/live-event-backdrop";
import PastEvents from "@/components/past-events";
import ClanCalendar from "@/components/clan-calendar";
import ClanStats from "@/components/clan-stats";
import { WOM_REFRESH_MS } from "@/lib/wom-refresh";
import ClanRaffle from '@/components/clan-raffle';
import RankIcon from './rank-icon';
import MemberAvatar from './member-avatar';
import MemberLeaderboard from './member-leaderboard';
import { rankLabel as roleLabel } from '@/lib/osrs-ranks';

const WOM = "https://wiseoldman.net/groups/7059";
const DISCORD = "https://discord.gg/KFNqA6bnZ4";
type Player = { id: number; username: string; displayName: string; type: string; exp: number; ehp: number; ehb: number; updatedAt: string };
type Member = { role: string; player: Player };
type Group = { memberCount: number; homeworld: number; clanChat: string; memberships: Member[] };
type Competition = { id: number; title: string; metric: string; startsAt: string; endsAt: string; participantCount: number };
type Gain = { player: Player; data: { gained: number } };
type Result<T> = { data: T; fetchedAt: string; stale?: boolean };
const number = (v: number, digits = 0) => new Intl.NumberFormat("nl-NL", { maximumFractionDigits: digits }).format(v);
const compact = (v: number) => v >= 1e9 ? `${number(v / 1e9, 2)} mld` : v >= 1e6 ? `${number(v / 1e6, 1)} mln` : number(v);
const date = (v: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(new Date(v));
const playerUrl = (p: Player) => `/leden/${encodeURIComponent(p.username)}`;

function Stag({ className = "" }: { className?: string }) {
  return <svg className={className} width="42" height="46" viewBox="0 0 64 70" fill="none" aria-hidden="true"><path d="M24 31 13 20 10 6M14 21 4 16 2 8M13 14 21 9 22 2M40 31 51 20 54 6M50 21 60 16 62 8M51 14 43 9 42 2" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="m22 28 10 5 10-5 7 3-8 10-3 17-6 8-6-8-3-17-8-10 7-3Z" stroke="currentColor" strokeWidth="2.5"/><path d="m25 41 7 6 7-6M32 48v16M26 56h12" stroke="currentColor" strokeWidth="2"/></svg>;
}
function useWom<T>(query: string, wait = 0, enabled = true, pollMs = 0) {
  const [result, setResult] = useState<Result<T> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const loadedQuery = useRef(query);
  const lastResult = useRef<Result<T> | null>(null);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const controller = new AbortController();
    if (loadedQuery.current !== query) { loadedQuery.current = query; lastResult.current = null; setResult(null); }
    setLoading(!lastResult.current); setError("");
    let fetching = false;
    let retryAt = 0;
    let nextPollAt = 0;
    async function load() {
      if (fetching || controller.signal.aborted || Date.now() < Math.max(retryAt, nextPollAt)) return;
      fetching = true;
      nextPollAt = Date.now() + (pollMs || WOM_REFRESH_MS);
      try {
        const response = await fetch(`/api/clan?${query}${retry ? '&retry=1' : ''}`, { signal: controller.signal });
        const body = await response.json() as Result<T> & { error?: string };
        if (!response.ok) {
          const delay = Number(response.headers.get('Retry-After'));
          if (Number.isFinite(delay) && delay > 0) retryAt = Date.now() + delay * 1000;
          throw new Error(body.error || "De verbinding is tijdelijk onderbroken.");
        }
        if (!controller.signal.aborted) { lastResult.current = body; setResult(body); setError(""); }
      } catch (e) {
        if (!controller.signal.aborted) {
          if (lastResult.current) { lastResult.current = { ...lastResult.current, stale: true }; setResult(lastResult.current); }
          else setError(e instanceof Error ? e.message : "Laden mislukt.");
        }
      }
      finally { fetching = false; if (!controller.signal.aborted) setLoading(false); }
    }
    const timer = setTimeout(load, wait);
    const poll = pollMs ? setInterval(() => { if (!document.hidden) void load(); }, pollMs) : undefined;
    const onVisible = () => { if (!document.hidden && pollMs) void load(); };
    if (pollMs) document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(timer); clearInterval(poll); controller.abort(); document.removeEventListener('visibilitychange', onVisible); };
  }, [query, retry, wait, enabled, pollMs]);
  return { result, error, loading, reload: () => setRetry(x => x + 1) };
}
function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="load-error" role="status"><p>{message}</p><button className="text-link" onClick={retry}><RefreshCw size={14}/> Opnieuw proberen</button><a href={WOM} target="_blank" rel="noreferrer">Bekijk op Wise Old Man <ArrowUpRight size={14}/></a></div>;
}
function Skeleton({ lines = 3 }: { lines?: number }) { return <div className="skeletons" aria-label="Gegevens worden geladen" role="status">{Array.from({ length: lines }, (_, i) => <div className="skeleton" key={i}/>)}</div>; }

export default function ClanSite({ view = 'home' }: { view?: 'home' | 'clan' | 'events' }) {
  const group = useWom<Group>("resource=group", 0, view !== 'events', WOM_REFRESH_MS);
  const competitions = useWom<Competition[]>("resource=competitions", 400, view === 'events', WOM_REFRESH_MS);
  const [join, setJoin] = useState(false);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState("all");
  const [memberPage, setMemberPage] = useState(0);
  const [eventView, setEventView] = useState<EventView>("overview");
  const calendarDay = useSearchParams().get('dag');
  useEffect(() => {
    if (view !== "events") return;
    const syncView = () => {
      const hash = window.location.hash;
      setEventView((Object.keys(eventHash) as EventView[]).find(key => eventHash[key] === hash) || (["#agenda", "#clanleven", "#competities"].includes(hash) ? "calendar" : "overview"));
    };
    syncView();
    window.addEventListener("hashchange", syncView);
    window.addEventListener("popstate", syncView);
    return () => { window.removeEventListener("hashchange", syncView); window.removeEventListener("popstate", syncView); };
  }, [view, calendarDay]);
  function changeEventView(next: EventView) {
    setEventView(next);
    const href = '/events' + eventHash[next];
    if (window.location.pathname + window.location.hash !== href) window.history.pushState(null, '', href);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const dialog = useRef<HTMLDialogElement>(null);
  const members = group.result?.data.memberships || [];
  const totals = useMemo(() => members.reduce((s, m) => ({ exp: s.exp + Math.max(0, m.player.exp || 0), ehb: s.ehb + Math.max(0, m.player.ehb || 0) }), { exp: 0, ehb: 0 }), [members]);
  const filteredMembers = useMemo(() => members.filter(m => [m.player.displayName, m.player.username].some(name => name.toLowerCase().includes(query.trim().toLowerCase())) && (account === "all" || (account === "ironman" ? ["ironman", "hardcore", "ultimate"].includes(m.player.type) : m.player.type === "regular"))).sort((a, b) => b.player.exp - a.player.exp), [members, query, account]);
  const events = competitions.result?.data || [];
  const now = Date.now();
  const currentEvents = events.filter(e => Date.parse(e.endsAt) > now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const featured = currentEvents.find(e => Date.parse(e.startsAt) <= now) || currentEvents[0];
  useEffect(() => { if (join) dialog.current?.showModal(); else dialog.current?.close(); }, [join]);
  async function copyClan() {
    try { await navigator.clipboard.writeText(group.result?.data.clanChat || "Hijgend Hert"); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setCopied(false); }
  }
  return <>
    <SiteHeader view={view}/>
    <main id="main" className={view === 'home' ? 'homepage' : `clan-inner-page${view === 'clan' ? ' clan-page' : ''}${view === 'events' ? ' events-page live-events-page' : ''}`}>
      {view === 'events' && <LiveEventBackdrop/>}
      {view === 'events' && <h1 className="sr-only">Clancompetities — Hijgend Hert</h1>}
      {view === 'home' && <><section id="home" className="hero">
        <WoodlandBackdrop/>
        <div className="hero-pattern" aria-hidden="true"/>
        <div className="hero-shade" aria-hidden="true"/>
        <div className="container hero-inner"><div className="hero-copy hero-poem">
          <h1>Waarom join je<br/><em>Hijgend Hert?</em></h1>
          <div className="poem-rule" aria-hidden="true"><span/>◆<span/></div>
          <p className="clan-rhyme"><span>Omdat je daar pas echt een legend wordt!</span><span>Van raids tot PK, we strijden zij aan zij,</span><span>bij Hijgend Hert hoor jij erbij!</span></p>
          <a className="poem-discord" href={DISCORD} target="_blank" rel="noreferrer">Join Discord <ArrowUpRight size={15}/></a>
        </div><div className="hero-identity"><div className="emblem-ring"/><BreathingCrest/></div></div>
      </section>
      <ClanStats memberCount={group.result?.data.memberCount ?? null} totalXp={group.result ? totals.exp : null} homeWorld={group.result?.data.homeworld || null} fetchedAt={group.result?.fetchedAt ?? null} loading={group.loading} error={group.error} stale={!!group.result?.stale} onRetry={group.reload}/>
      </>}
      {view === 'events' && eventView === 'overview' && <EventsOverview competitions={events} loading={competitions.loading} error={competitions.error} onRetry={competitions.reload} stale={competitions.result?.stale} onNavigate={changeEventView}/>}
      {view === 'events' && (eventView === 'skill' || eventView === 'boss') && <WeeklyEvent key={eventView} category={eventView} competitions={events} loading={competitions.loading} error={competitions.error} onRetry={competitions.reload} stale={competitions.result?.stale} onNavigate={changeEventView}/>}
      {view === 'events' && eventView === 'live' && <CurrentEvent/>}
      {view === 'events' && eventView === 'raffle' && <ClanRaffle onBack={() => changeEventView('overview')}/>}
      {view === 'events' && eventView === 'past' && <PastEvents competitions={events} loading={competitions.loading} error={competitions.error} onRetry={competitions.reload} stale={competitions.result?.stale} fetchedAt={competitions.result?.fetchedAt}/>}
      {view === 'events' && eventView === 'calendar' && <ClanCalendar context="events" competitions={events} loading={competitions.loading} error={competitions.error} onRetry={competitions.reload} stale={competitions.result?.stale} fetchedAt={competitions.result?.fetchedAt}/>} 
      {view === 'clan' && <>
      <section className="section container" id="leden"><div className="section-heading"><div><p className="eyebrow">HIJGEND HERT</p><h1>Onze clanleden<span className="count-badge">{group.result?.data.memberCount || "—"}</span></h1></div><p className="heading-note">Zoek een clanlid en ontdek hun profiel.</p></div><div className="panel members-panel"><div className="member-toolbar"><label className="search"><Search size={17}/><input value={query} onChange={e => { setQuery(e.target.value); setMemberPage(0); }} placeholder="Zoek op RuneScape-naam…" aria-label="Zoek een clanspeler"/>{query && <button aria-label="Zoekopdracht wissen" onClick={() => { setQuery(""); setMemberPage(0); }}><X size={15}/></button>}</label><select aria-label="Filter op accounttype" value={account} onChange={e => { setAccount(e.target.value); setMemberPage(0); }}><option value="all">Alle accounttypes</option><option value="regular">Reguliere accounts</option><option value="ironman">Ironman-accounts</option></select></div>
        {group.loading ? <Skeleton lines={5}/> : group.error ? <LoadError message={group.error} retry={group.reload}/> : <><div className="table-scroll"><table><caption className="sr-only">Clanleden, gesorteerd op totale XP. Open een Hijgend Hert-profiel. Statistieken via Wise Old Man.</caption><thead><tr><th>CLANSPELER</th><th>RANG</th><th>TOTALE XP ↓</th><th>EHB</th><th>LAATSTE UPDATE</th><th><span className="sr-only">Profiel</span></th></tr></thead><tbody>{filteredMembers.slice(memberPage * 8, memberPage * 8 + 8).map(m => <tr key={m.player.id}><td><Link prefetch={false} className="member-name" href={playerUrl(m.player)}><MemberAvatar playerId={m.player.id} name={m.player.displayName} className={`member-avatar ${["ironman", "hardcore", "ultimate"].includes(m.player.type) ? "iron" : ""}`} fallback={["ironman", "hardcore", "ultimate"].includes(m.player.type) ? <Shield size={15}/> : <Users size={15}/>}/>{m.player.displayName}</Link></td><td><span className={`role ${m.role === "owner" || m.role === "deputy_owner" ? "owner" : ""}`}><RankIcon rank={m.role} size={16}/>{roleLabel(m.role)}</span></td><td className="numeric">{compact(m.player.exp)}</td><td className="numeric muted-text">{number(m.player.ehb, 1)}</td><td className="muted-text">{m.player.updatedAt ? date(m.player.updatedAt) : "Onbekend"}</td><td><Link prefetch={false} className="profile-link" aria-label={`Bekijk het profiel van ${m.player.displayName}`} href={playerUrl(m.player)}><ArrowUpRight size={16}/></Link></td></tr>)}</tbody></table></div>{!filteredMembers.length && <div className="empty"><Search size={22}/><p>Geen clanleden gevonden voor deze selectie.</p><button className="text-link" onClick={() => { setQuery(""); setAccount("all"); setMemberPage(0); }}>Filters wissen</button></div>}<div className="member-pagination"><span>{filteredMembers.length ? `${memberPage * 8 + 1}–${Math.min((memberPage + 1) * 8, filteredMembers.length)} van ${number(filteredMembers.length)} clanleden` : "0 clanleden"}</span><div><button aria-label="Vorige pagina" disabled={memberPage === 0} onClick={() => setMemberPage(p => p - 1)}><ChevronLeft size={17}/></button><span>Pagina {memberPage + 1} / {Math.max(1, Math.ceil(filteredMembers.length / 8))}</span><button aria-label="Volgende pagina" disabled={(memberPage + 1) * 8 >= filteredMembers.length} onClick={() => setMemberPage(p => p + 1)}><ChevronRight size={17}/></button></div></div></>}
      </div>{group.result && <MemberLeaderboard members={members} query={query} account={account}/>}</section></>}
    </main>
    {view === 'clan' && <footer><div className="container footer-main"><Link prefetch={false} className="brand" href="/"><img src="/clan-logo.png" alt=""/><span>Hijgend Hert<small>OSRS · NL / BE</small></span></Link><div><Link prefetch={false} href="/leden">Leden</Link><button onClick={() => setJoin(true)}>In-game kennismaken</button><a href={DISCORD} target="_blank" rel="noreferrer">Discord</a><a href={WOM} target="_blank" rel="noreferrer">Wise Old Man <ExternalLink size={12}/></a></div><span className="footer-world"><span className="dot"/> NL / BE · Wereld {group.result?.data.homeworld || 333}</span></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Hijgend Hert</span><span>Een onafhankelijke clansite. Old School RuneScape is van Jagex Ltd.</span><span>Clanstatistieken via <a href={WOM} target="_blank" rel="noreferrer">Wise Old Man ↗</a></span></div></footer>}
    <dialog ref={dialog} className="join-dialog" aria-label="Kennismaken met Hijgend Hert" onCancel={() => setJoin(false)} onClick={e => { if (e.target === dialog.current) setJoin(false); }}><div className="dialog-content"><button className="dialog-close" aria-label="Sluiten" onClick={() => setJoin(false)}><X size={20}/></button><Stag/><p className="eyebrow">LEUK DAT JE ERBIJ WILT</p><h2>Lid worden van Hijgend Hert</h2><p>Zoek ons op in Old School RuneScape en maak kennis met de clan.</p><ol className="join-steps"><li><span>01</span><div><strong>Open het clanmenu</strong><p>Ga in OSRS naar het tabblad Clans en kies de optie om een clan als gast te bezoeken.</p></div></li><li><span>02</span><div><strong>Zoek Hijgend Hert</strong><p>Vul onze clannaam in en stap de clanchat binnen.</p></div></li><li><span>03</span><div><strong>Zeg even hallo</strong><p>Vraag een clanlid naar de mogelijkheden om lid te worden en eventuele voorwaarden.</p></div></li></ol><button className="copy-clan" onClick={copyClan}><span><small>CLANNAAM</small>{group.result?.data.clanChat || "Hijgend Hert"}</span>{copied ? <Check size={18}/> : <Copy size={18}/>}<span className="sr-only" aria-live="polite">{copied ? "Clannaam gekopieerd" : "Kopieer clannaam"}</span></button><a className="text-link" href={WOM} target="_blank" rel="noreferrer">Bekijk eerst onze clan op Wise Old Man <ArrowUpRight size={15}/></a></div></dialog>
  </>;
}


