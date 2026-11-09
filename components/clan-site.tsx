"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ArrowRight, ChevronLeft, ChevronRight, Check, Copy, Crown, ExternalLink, Flame, Globe2, Menu, Search, Shield, Sparkles, Swords, Target, Trophy, Users, X, RefreshCw, Clock3, Sprout, CalendarDays } from "lucide-react";
import SiteHeader from "@/components/site-header";
import CurrentEvent from "@/components/current-event";
import { BreathingCrest, WoodlandBackdrop } from "@/components/home-ambience";
import EventsOverview, { WeeklyEvent, eventHash, type EventView } from "@/components/events-overview";
import LiveEventBackdrop from "@/components/live-event-backdrop";
import PastEvents from "@/components/past-events";
import ClanCalendar from "@/components/clan-calendar";
import HallOfFame from "@/components/hall-of-fame";
import ClanMoments from "@/components/clan-moments";
import ClanStats from "@/components/clan-stats";
import ClanOverview, { clanSections, type ClanSection } from "@/components/clan-overview";
import { WOM_REFRESH_MS } from "@/lib/wom-refresh";

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
const roles: Record<string, string> = { owner: "Clanleider", deputy_owner: "Deputy owner", general: "Generaal", captain: "Kapitein", lieutenant: "Luitenant", sergeant: "Sergeant", corporal: "Korporaal", recruit: "Rekruut", member: "Lid" };
const roleLabel = (role: string) => roles[role] || role.replaceAll("_", " ");
const playerUrl = (p: Player) => `https://wiseoldman.net/players/${encodeURIComponent(p.username)}`;

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
        const response = await fetch(`/api/clan?${query}`, { signal: controller.signal });
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
  const competitions = useWom<Competition[]>("resource=competitions", 400, view !== 'home', WOM_REFRESH_MS);
  const [clanSection, setClanSection] = useState<ClanSection>('leden');
  const [metric, setMetric] = useState("overall");
  const [period, setPeriod] = useState("week");
  const gains = useWom<Gain[]>(`resource=gained&metric=${metric}&period=${period}`, 0, view === 'clan' && clanSection === 'ranglijst');
  const [join, setJoin] = useState(false);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState("all");
  const [memberPage, setMemberPage] = useState(0);
  const [eventView, setEventView] = useState<EventView>("overview");
  useEffect(() => {
    if (view !== 'clan') return;
    const syncSection = () => {
      const requested = window.location.hash.slice(1);
      setClanSection(clanSections.find(section => section.id === requested)?.id || 'leden');
    };
    syncSection();
    window.addEventListener('hashchange', syncSection);
    window.addEventListener('popstate', syncSection);
    return () => { window.removeEventListener('hashchange', syncSection); window.removeEventListener('popstate', syncSection); };
  }, [view]);
  function changeClanSection(next: ClanSection) {
    setClanSection(next);
    if (window.location.hash !== `#${next}`) window.history.pushState(null, '', `/clan#${next}`);
  }
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
  }, [view]);
  function changeEventView(next: EventView) {
    setEventView(next);
    const href = '/events' + eventHash[next];
    if (window.location.pathname + window.location.hash !== href) window.history.pushState(null, '', href);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const dialog = useRef<HTMLDialogElement>(null);
  const members = group.result?.data.memberships || [];
  const totals = useMemo(() => members.reduce((s, m) => ({ exp: s.exp + Math.max(0, m.player.exp || 0), ehb: s.ehb + Math.max(0, m.player.ehb || 0) }), { exp: 0, ehb: 0 }), [members]);
  const filteredMembers = useMemo(() => members.filter(m => m.player.displayName.toLowerCase().includes(query.toLowerCase()) && (account === "all" || (account === "ironman" ? ["ironman", "hardcore", "ultimate"].includes(m.player.type) : m.player.type === "regular"))).sort((a, b) => b.player.exp - a.player.exp), [members, query, account]);
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
      {view === 'events' && eventView === 'past' && <PastEvents competitions={events} loading={competitions.loading} error={competitions.error} onRetry={competitions.reload} stale={competitions.result?.stale} fetchedAt={competitions.result?.fetchedAt}/>}
      {view === 'events' && eventView === 'calendar' && <ClanCalendar context="events" competitions={events} loading={competitions.loading} error={competitions.error} onRetry={competitions.reload} stale={competitions.result?.stale} fetchedAt={competitions.result?.fetchedAt}/>} 
      {view === 'clan' && <>
      <ClanOverview selected={clanSection} onNavigate={changeClanSection} members={group.result?.data.memberCount ?? null} totalXp={group.result ? totals.exp : null} world={group.result?.data.homeworld ?? null} loading={group.loading} error={group.error} stale={!!group.result?.stale} onRetry={group.reload} onJoin={() => setJoin(true)}/>
      {clanSection === 'clanleven' && <ClanCalendar competitions={events} loading={competitions.loading} error={competitions.error} onRetry={competitions.reload} stale={competitions.result?.stale} fetchedAt={competitions.result?.fetchedAt}/>}
      {clanSection === 'erelijst' && <HallOfFame/>}
      {clanSection === 'clanmomenten' && <ClanMoments/>}
      {clanSection === 'ranglijst' && <section className="dashboard-section" id="ranglijst"><div className="container"><div className="section-heading"><div><p className="eyebrow">WISE OLD MAN</p><h2>Clanranglijst</h2></div><a className="text-link muted-link" href={WOM} target="_blank" rel="noreferrer">Alles op Wise Old Man <ArrowUpRight size={15}/></a></div>
        <div className="dashboard-grid"><div className="panel leaderboard"><div className="panel-heading"><h3><Trophy size={18}/> Clanranglijst</h3><label className="select-label"><span className="sr-only">Ranglijstperiode</span><select value={period} onChange={e => setPeriod(e.target.value)}><option value="week">Afgelopen 7 dagen</option><option value="month">Afgelopen maand</option></select></label></div><div className="tabs" role="group" aria-label="Ranglijstcategorie"><button className={metric === "overall" ? "selected" : ""} onClick={() => setMetric("overall")} aria-pressed={metric === "overall"}><Sparkles size={15}/> XP behaald</button><button className={metric === "ehb" ? "selected" : ""} onClick={() => setMetric("ehb")} aria-pressed={metric === "ehb"}><Swords size={15}/> Bossing (EHB)</button></div>
          {gains.loading ? <Skeleton lines={5}/> : gains.error ? <LoadError message={gains.error} retry={gains.reload}/> : <><div className="leader-labels"><span>RANG / SPELER</span><span>{metric === "overall" ? "XP BEHAALD" : "EHB BEHAALD"}</span></div><ol className="leader-list">{gains.result?.data.slice(0, 5).map((g, i) => <li key={g.player.id}><a href={playerUrl(g.player)} target="_blank" rel="noreferrer"><span className={`rank rank-${i}`}>{i === 0 ? <Crown size={17}/> : String(i + 1).padStart(2, "0")}</span><span className={`avatar avatar-${i}`}>{g.player.displayName.slice(0, 1).toUpperCase()}</span><span className="leader-name">{g.player.displayName}<small>{["ironman", "hardcore", "ultimate"].includes(g.player.type) ? "Ironman" : "Clanspeler"}</small></span><strong>+{metric === "overall" ? compact(Math.max(0, g.data.gained)) : number(Math.max(0, g.data.gained), 2)}</strong><ArrowUpRight className="row-arrow" size={14}/></a></li>)}</ol>{!gains.result?.data.length && <p className="empty">Nog geen voortgang beschikbaar voor deze periode.</p>}</>}
          <div className="panel-footer"><span><span className={gains.error ? "dot muted" : "dot"}/> {gains.result?.stale ? "Laatst bekende meting" : gains.error ? "Verbinding onderbroken" : "Gegevens via Wise Old Man"}</span><a href={`${WOM}/gained?metric=${metric}&period=${period}`} target="_blank" rel="noreferrer">Volledige ranglijst <ArrowUpRight size={14}/></a></div>
        </div>
        <div className="spotlight"><div className="spotlight-top"><span className="event-tag"><Flame size={13}/> {featured && Date.parse(featured.startsAt) <= now ? "COMPETITIE ACTIEF" : "CLANCOMPETITIES"}</span><Target size={24}/></div><div className="clan-competition-art" aria-hidden="true"><img src="/hijgend-hert-event-arena.webp" alt="" loading="lazy" width="1536" height="1024"/></div><div className="spotlight-content"><p className="eyebrow">DE CLANCOMPETITIE</p><h3>{competitions.loading ? "Competitie ophalen…" : featured ? featured.title : "De volgende competitie"}</h3><p>{featured ? `${number(featured.participantCount)} geregistreerde deelnemers.` : "Ontdek de skill- en bosscompetities van Hijgend Hert op Wise Old Man."}</p>{featured && <div className="event-deadline"><Clock3 size={15}/>{Date.parse(featured.startsAt) > now ? `Start ${date(featured.startsAt)}` : `Loopt tot ${date(featured.endsAt)}`}</div>}<a className="button gold" href={featured && Date.parse(featured.startsAt) <= now ? "/events#live" : "/events#kalender"}>{featured && Date.parse(featured.startsAt) <= now ? "Bekijk de live stand" : "Bekijk de kalender"} <ArrowUpRight size={16}/></a></div></div>
      </div><p className="data-note">EHB = efficiënte boss-uren, de bossing-maatstaf van Wise Old Man. Gegevens worden maximaal vijf minuten gecachet; spelers hebben hun eigen laatste update.</p></div></section>}
      {clanSection === 'leden' && <section className="section container" id="leden"><div className="section-heading"><div><p className="eyebrow">HIJGEND HERT</p><h2>Onze clanleden<span className="count-badge">{group.result?.data.memberCount || "—"}</span></h2></div><p className="heading-note">Vind je clanmates. Gesorteerd op totale XP.</p></div><div className="panel members-panel"><div className="member-toolbar"><label className="search"><Search size={17}/><input value={query} onChange={e => { setQuery(e.target.value); setMemberPage(0); }} placeholder="Zoek op RuneScape-naam…" aria-label="Zoek een clanspeler"/>{query && <button aria-label="Zoekopdracht wissen" onClick={() => { setQuery(""); setMemberPage(0); }}><X size={15}/></button>}</label><select aria-label="Filter op accounttype" value={account} onChange={e => { setAccount(e.target.value); setMemberPage(0); }}><option value="all">Alle accounttypes</option><option value="regular">Reguliere accounts</option><option value="ironman">Ironman-accounts</option></select></div>
        {group.loading ? <Skeleton lines={5}/> : group.error ? <LoadError message={group.error} retry={group.reload}/> : <><div className="table-scroll"><table><caption className="sr-only">Clanleden, gesorteerd op totale XP. Profielen en statistieken via Wise Old Man.</caption><thead><tr><th>CLANSPELER</th><th>RANG</th><th>TOTALE XP ↓</th><th>EHB</th><th>LAATSTE UPDATE</th><th><span className="sr-only">Profiel</span></th></tr></thead><tbody>{filteredMembers.slice(memberPage * 8, memberPage * 8 + 8).map(m => <tr key={m.player.id}><td><a className="member-name" href={playerUrl(m.player)} target="_blank" rel="noreferrer"><span className={`member-avatar ${["ironman", "hardcore", "ultimate"].includes(m.player.type) ? "iron" : ""}`}>{["ironman", "hardcore", "ultimate"].includes(m.player.type) ? <Shield size={15}/> : <Users size={15}/>}</span>{m.player.displayName}</a></td><td><span className={`role ${m.role === "owner" || m.role === "deputy_owner" ? "owner" : ""}`}>{m.role === "owner" && <Crown size={12}/>} {roleLabel(m.role)}</span></td><td className="numeric">{compact(m.player.exp)}</td><td className="numeric muted-text">{number(m.player.ehb, 1)}</td><td className="muted-text">{m.player.updatedAt ? date(m.player.updatedAt) : "Onbekend"}</td><td><a className="profile-link" aria-label={`Bekijk ${m.player.displayName} op Wise Old Man`} href={playerUrl(m.player)} target="_blank" rel="noreferrer"><ArrowUpRight size={16}/></a></td></tr>)}</tbody></table></div>{!filteredMembers.length && <div className="empty"><Search size={22}/><p>Geen clanleden gevonden voor deze selectie.</p><button className="text-link" onClick={() => { setQuery(""); setAccount("all"); setMemberPage(0); }}>Filters wissen</button></div>}<div className="member-pagination"><span>{filteredMembers.length ? `${memberPage * 8 + 1}–${Math.min((memberPage + 1) * 8, filteredMembers.length)} van ${number(filteredMembers.length)} clanleden` : "0 clanleden"}</span><div><button aria-label="Vorige pagina" disabled={memberPage === 0} onClick={() => setMemberPage(p => p - 1)}><ChevronLeft size={17}/></button><span>Pagina {memberPage + 1} / {Math.max(1, Math.ceil(filteredMembers.length / 8))}</span><button aria-label="Volgende pagina" disabled={(memberPage + 1) * 8 >= filteredMembers.length} onClick={() => setMemberPage(p => p + 1)}><ChevronRight size={17}/></button></div></div></>}
      </div></section>}</>}
      {view === 'clan' && <section className="join-section container"><div className="join-banner"><div className="join-emblem"><img src="/clan-logo.png" alt=""/></div><div><p className="eyebrow">LID WORDEN</p><h2>Zin om mee te spelen?</h2><p>Je vindt ons in de clanchat en op Discord.</p></div><a className="button gold" href={DISCORD} target="_blank" rel="noreferrer">Join Discord <ArrowUpRight size={17}/></a></div></section>}
    </main>
    {view === 'clan' && <footer><div className="container footer-main"><a className="brand" href="/"><img src="/clan-logo.png" alt=""/><span>Hijgend Hert<small>OSRS · NL / BE</small></span></a><div><a href="/clan">De clan</a><a href="/clan#leden">Leden</a><button onClick={() => setJoin(true)}>In-game kennismaken</button><a href={DISCORD} target="_blank" rel="noreferrer">Discord</a><a href={WOM} target="_blank" rel="noreferrer">Wise Old Man <ExternalLink size={12}/></a></div><span className="footer-world"><span className="dot"/> NL / BE · Wereld {group.result?.data.homeworld || 333}</span></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Hijgend Hert</span><span>Een onafhankelijke clansite. Old School RuneScape is van Jagex Ltd.</span><span>Clanstatistieken via <a href={WOM} target="_blank" rel="noreferrer">Wise Old Man ↗</a></span></div></footer>}
    <dialog ref={dialog} className="join-dialog" aria-label="Kennismaken met Hijgend Hert" onCancel={() => setJoin(false)} onClick={e => { if (e.target === dialog.current) setJoin(false); }}><div className="dialog-content"><button className="dialog-close" aria-label="Sluiten" onClick={() => setJoin(false)}><X size={20}/></button><Stag/><p className="eyebrow">LEUK DAT JE ERBIJ WILT</p><h2>Lid worden van Hijgend Hert</h2><p>Zoek ons op in Old School RuneScape en maak kennis met de clan.</p><ol className="join-steps"><li><span>01</span><div><strong>Open het clanmenu</strong><p>Ga in OSRS naar het tabblad Clans en kies de optie om een clan als gast te bezoeken.</p></div></li><li><span>02</span><div><strong>Zoek Hijgend Hert</strong><p>Vul onze clannaam in en stap de clanchat binnen.</p></div></li><li><span>03</span><div><strong>Zeg even hallo</strong><p>Vraag een clanlid naar de mogelijkheden om lid te worden en eventuele voorwaarden.</p></div></li></ol><button className="copy-clan" onClick={copyClan}><span><small>CLANNAAM</small>{group.result?.data.clanChat || "Hijgend Hert"}</span>{copied ? <Check size={18}/> : <Copy size={18}/>}<span className="sr-only" aria-live="polite">{copied ? "Clannaam gekopieerd" : "Kopieer clannaam"}</span></button><a className="text-link" href={WOM} target="_blank" rel="noreferrer">Bekijk eerst onze clan op Wise Old Man <ArrowUpRight size={15}/></a></div></dialog>
  </>;
}


