"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ArrowRight, ChevronLeft, ChevronRight, Check, Copy, Crown, ExternalLink, Flame, Globe2, Menu, Search, Shield, Sparkles, Swords, Target, Trophy, Users, X, RefreshCw, Clock3, Sprout, CalendarDays } from "lucide-react";
import CurrentEvent from "@/components/current-event";
import LiveEventBackdrop from "@/components/live-event-backdrop";
import PastEvents from "@/components/past-events";
import ClanCalendar from "@/components/clan-calendar";
import HallOfFame from "@/components/hall-of-fame";
import ClanMoments from "@/components/clan-moments";
import ClanStats from "@/components/clan-stats";

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
function useWom<T>(query: string, wait = 0, enabled = true) {
  const [result, setResult] = useState<Result<T> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError(""); setResult(null);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/clan?${query}`, { signal: controller.signal });
        const body = await response.json() as Result<T> & { error?: string };
        if (!response.ok) throw new Error(body.error || "De verbinding is tijdelijk onderbroken.");
        setResult(body);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Laden mislukt."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, wait);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, retry, wait, enabled]);
  return { result, error, loading, reload: () => setRetry(x => x + 1) };
}
function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="load-error" role="status"><p>{message}</p><button className="text-link" onClick={retry}><RefreshCw size={14}/> Opnieuw proberen</button><a href={WOM} target="_blank" rel="noreferrer">Bekijk op Wise Old Man <ArrowUpRight size={14}/></a></div>;
}
function Skeleton({ lines = 3 }: { lines?: number }) { return <div className="skeletons" aria-label="Gegevens worden geladen" role="status">{Array.from({ length: lines }, (_, i) => <div className="skeleton" key={i}/>)}</div>; }

export default function ClanSite({ view = 'home' }: { view?: 'home' | 'clan' | 'events' }) {
  const group = useWom<Group>("resource=group");
  const competitions = useWom<Competition[]>("resource=competitions", 400, view !== 'home');
  const [metric, setMetric] = useState("overall");
  const [period, setPeriod] = useState("week");
  const gains = useWom<Gain[]>(`resource=gained&metric=${metric}&period=${period}`, 800, view === 'clan');
  const [menu, setMenu] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [join, setJoin] = useState(false);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState("all");
  const [memberPage, setMemberPage] = useState(0);
  const [eventView, setEventView] = useState<"live" | "calendar" | "past">("live");
  useEffect(() => {
    if (view !== "events") return;
    const syncView = () => setEventView(window.location.hash === "#past-events" ? "past" : ["#kalender", "#agenda", "#clanleven", "#competities"].includes(window.location.hash) ? "calendar" : "live");
    syncView();
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, [view]);
  function changeEventView(next: "live" | "calendar" | "past") { setEventView(next); window.history.replaceState(null, "", next === "calendar" ? "/events#kalender" : next === "past" ? "/events#past-events" : "/events"); }
  const dialog = useRef<HTMLDialogElement>(null);
  const members = group.result?.data.memberships || [];
  const totals = useMemo(() => members.reduce((s, m) => ({ exp: s.exp + Math.max(0, m.player.exp || 0), ehb: s.ehb + Math.max(0, m.player.ehb || 0) }), { exp: 0, ehb: 0 }), [members]);
  const filteredMembers = useMemo(() => members.filter(m => m.player.displayName.toLowerCase().includes(query.toLowerCase()) && (account === "all" || (account === "ironman" ? ["ironman", "hardcore", "ultimate"].includes(m.player.type) : m.player.type === "regular"))).sort((a, b) => b.player.exp - a.player.exp), [members, query, account]);
  const events = competitions.result?.data || [];
  const now = Date.now();
  const currentEvents = events.filter(e => Date.parse(e.endsAt) > now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const featured = currentEvents.find(e => Date.parse(e.startsAt) <= now) || currentEvents[0];
  useEffect(() => { if (join) dialog.current?.showModal(); else dialog.current?.close(); }, [join]);
  useEffect(() => {
    const updateHeader = () => setHeaderScrolled(window.scrollY > 24);
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
    return () => window.removeEventListener('scroll', updateHeader);
  }, []);
  const nav = [{ id: "clan", label: "De clan", href: '/clan' }, { id: "events", label: "Events", href: '/events' }];
  async function copyClan() {
    try { await navigator.clipboard.writeText(group.result?.data.clanChat || "Hijgend Hert"); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setCopied(false); }
  }
  return <>
    <a className="skip-link" href="#main">Ga naar inhoud</a>
    <header className={`header${view === 'home' ? ' header-home' : ''}${view === 'events' && eventView === 'live' ? ' header-event' : ''}${headerScrolled ? ' is-scrolled' : ''}`}><div className="container nav-wrap">
      <a className="brand" href={view === 'home' ? '#home' : '/'} aria-label="Hijgend Hert home"><img src="/clan-logo.png" alt=""/><span>Hijgend Hert<small>OLD SCHOOL RUNESCAPE CLAN</small></span></a>
      <nav className={menu ? "navigation open" : "navigation"} aria-label="Hoofdnavigatie">{nav.map(n => <a key={n.label} className={view === n.id ? "active" : ""} href={n.href} aria-current={view === n.id ? "page" : undefined} onClick={() => setMenu(false)}>{n.label}</a>)}</nav>
      <a className="button gold nav-join" href={DISCORD} target="_blank" rel="noreferrer">Join Discord <ArrowUpRight size={16}/></a>
      <button className="menu-button" onClick={() => setMenu(!menu)} aria-label={menu ? "Menu sluiten" : "Menu openen"} aria-expanded={menu}>{menu ? <X/> : <Menu/>}</button>
    </div></header>
    <main id="main" className={view === 'home' ? 'homepage' : `clan-inner-page${view === 'events' && eventView === 'live' ? ' live-events-page' : ''}`}>
      {view === 'events' && eventView === 'live' && <LiveEventBackdrop/>}
      {view !== 'home' && <h1 className="sr-only">{view === 'clan' ? 'De clan — Hijgend Hert' : 'Clancompetities — Hijgend Hert'}</h1>}
      {view === 'home' && <><section id="home" className="hero">
        <img className="hero-landscape" src="/hijgend-hert-woodland.webp" alt="" aria-hidden="true" width="2172" height="724" fetchPriority="high"/>
        <div className="hero-pattern" aria-hidden="true"/>
        <div className="hero-shade" aria-hidden="true"/>
        <div className="container hero-inner"><div className="hero-copy hero-poem">
          <h1>Waarom join je<br/><em>Het Hijgend Hert?</em></h1>
          <div className="poem-rule" aria-hidden="true"><span/>◆<span/></div>
          <p className="clan-rhyme"><span>Omdat je daar pas echt een legend wordt!</span><span>Van raids tot PK, we strijden zij aan zij,</span><span>bij Het Hijgend Hert hoor jij erbij!</span></p>
          <a className="poem-discord" href={DISCORD} target="_blank" rel="noreferrer">Join Discord <ArrowUpRight size={15}/></a>
        </div><div className="hero-identity"><div className="emblem-ring"/><div className="hero-crest"><img className="hero-logo" src="/clan-logo.png" alt="Hijgend Hert — hert met kroon en zwart-gouden clanbanieren" fetchPriority="high" width="1254" height="1254"/><span className="stag-breath" aria-hidden="true"><i/><i/><i/><i/><i/><i/></span></div></div></div>
      </section>
      <ClanStats memberCount={group.result?.data.memberCount ?? null} totalXp={group.result ? totals.exp : null} homeWorld={group.result?.data.homeworld || null} fetchedAt={group.result?.fetchedAt ?? null} loading={group.loading} error={group.error} stale={!!group.result?.stale} onRetry={group.reload}/>
      </>}
      {view === 'events' && <div className="container event-page-controls"><div className="event-view-switch" role="group" aria-label="Evenementen bekijken"><button type="button" aria-pressed={eventView === 'live'} onClick={() => changeEventView('live')}>Live event</button><button type="button" aria-pressed={eventView === 'calendar'} onClick={() => changeEventView('calendar')}>Kalender</button><button type="button" aria-pressed={eventView === 'past'} onClick={() => changeEventView('past')}>Past events</button></div></div>}
      {view === 'events' && eventView === 'live' && <CurrentEvent/>}
      {view === 'events' && eventView === 'past' && <PastEvents competitions={events} loading={competitions.loading} error={competitions.error} onRetry={competitions.reload} stale={competitions.result?.stale} fetchedAt={competitions.result?.fetchedAt}/>}
      {view === 'events' && eventView === 'calendar' && <ClanCalendar context="events" competitions={events} loading={competitions.loading} error={competitions.error} onRetry={competitions.reload} stale={competitions.result?.stale} fetchedAt={competitions.result?.fetchedAt}/>} 
      {view === 'clan' && <>
      <section className="section container" id="de-clan"><div className="intro-grid">
        <div><p className="eyebrow">ONZE CLAN</p><h2>Over Hijgend Hert.</h2></div>
        <div className="intro-text"><p>Hijgend Hert is een Nederlandstalige OSRS-clan, opgericht in 2024. We spelen samen met leden uit Nederland en België: van raids en bossing tot PvP en skillcompetities.</p><a className="text-link" href="#leden">Ontmoet de clan <ArrowRight size={16}/></a></div>
      </div>
      <div className="pursuits"><div className="pursuit"><span className="pursuit-icon"><Swords/></span><div><h3>PvM en raids</h3><p>Van boss runs tot raids. Zoek je team en ga voor die volgende drop.</p><a href="#leden">Vind je team <ArrowRight size={14}/></a></div></div><div className="pursuit"><span className="pursuit-icon"><Trophy/></span><div><h3>Clancompetities</h3><p>Skill- en bosscompetities geven je volgende grind een extra doel.</p><a href="/events#agenda">Bekijk competities <ArrowRight size={14}/></a></div></div><div className="pursuit"><span className="pursuit-icon"><Sprout/></span><div><h3>Skills en bossing</h3><p>Volg je voortgang en die van je clanmates. Van XP tot bossing.</p><a href="#ranglijst">Bekijk de ranglijst <ArrowRight size={14}/></a></div></div></div></section>
      <ClanCalendar competitions={events} loading={competitions.loading} error={competitions.error} onRetry={competitions.reload} stale={competitions.result?.stale} fetchedAt={competitions.result?.fetchedAt}/>
      <HallOfFame/>
      <ClanMoments/>
      <section className="dashboard-section" id="ranglijst"><div className="container"><div className="section-heading"><div><p className="eyebrow">WISE OLD MAN</p><h2>Clanranglijst</h2></div><a className="text-link muted-link" href={WOM} target="_blank" rel="noreferrer">Alles op Wise Old Man <ArrowUpRight size={15}/></a></div>
        <div className="dashboard-grid"><div className="panel leaderboard"><div className="panel-heading"><h3><Trophy size={18}/> Clanranglijst</h3><label className="select-label"><span className="sr-only">Ranglijstperiode</span><select value={period} onChange={e => setPeriod(e.target.value)}><option value="week">Afgelopen 7 dagen</option><option value="month">Afgelopen maand</option></select></label></div><div className="tabs" role="group" aria-label="Ranglijstcategorie"><button className={metric === "overall" ? "selected" : ""} onClick={() => setMetric("overall")} aria-pressed={metric === "overall"}><Sparkles size={15}/> XP behaald</button><button className={metric === "ehb" ? "selected" : ""} onClick={() => setMetric("ehb")} aria-pressed={metric === "ehb"}><Swords size={15}/> Bossing (EHB)</button></div>
          {gains.loading ? <Skeleton lines={5}/> : gains.error ? <LoadError message={gains.error} retry={gains.reload}/> : <><div className="leader-labels"><span>RANG / SPELER</span><span>{metric === "overall" ? "XP BEHAALD" : "EHB BEHAALD"}</span></div><ol className="leader-list">{gains.result?.data.slice(0, 5).map((g, i) => <li key={g.player.id}><a href={playerUrl(g.player)} target="_blank" rel="noreferrer"><span className={`rank rank-${i}`}>{i === 0 ? <Crown size={17}/> : String(i + 1).padStart(2, "0")}</span><span className={`avatar avatar-${i}`}>{g.player.displayName.slice(0, 1).toUpperCase()}</span><span className="leader-name">{g.player.displayName}<small>{["ironman", "hardcore", "ultimate"].includes(g.player.type) ? "Ironman" : "Clanspeler"}</small></span><strong>+{metric === "overall" ? compact(Math.max(0, g.data.gained)) : number(Math.max(0, g.data.gained), 2)}</strong><ArrowUpRight className="row-arrow" size={14}/></a></li>)}</ol>{!gains.result?.data.length && <p className="empty">Nog geen voortgang beschikbaar voor deze periode.</p>}</>}
          <div className="panel-footer"><span><span className={gains.error ? "dot muted" : "dot"}/> {gains.result?.stale ? "Laatst bekende meting" : gains.error ? "Verbinding onderbroken" : "Gegevens via Wise Old Man"}</span><a href={`${WOM}/gained?metric=${metric}&period=${period}`} target="_blank" rel="noreferrer">Volledige ranglijst <ArrowUpRight size={14}/></a></div>
        </div>
        <div className="spotlight"><div className="spotlight-top"><span className="event-tag"><Flame size={13}/> {featured && Date.parse(featured.startsAt) <= now ? "COMPETITIE ACTIEF" : "CLANCOMPETITIES"}</span><Target size={24}/></div><div className="spotlight-art" aria-hidden="true"><Target/><span className="orbit orbit-one"/><span className="orbit orbit-two"/></div><div className="spotlight-content"><p className="eyebrow">SAMEN EEN DOEL ACHTERNA</p><h3>{competitions.loading ? "Een nieuwe uitdaging wacht." : featured ? featured.title : "Klaar voor de volgende uitdaging?"}</h3><p>{featured ? `${number(featured.participantCount)} geregistreerde deelnemers. Elke stap vooruit telt.` : "Ontdek de skill- en bosscompetities van Hijgend Hert op Wise Old Man."}</p>{featured && <div className="event-deadline"><Clock3 size={15}/>{Date.parse(featured.startsAt) > now ? `Start ${date(featured.startsAt)}` : `Loopt tot ${date(featured.endsAt)}`}</div>}<a className="button gold" href={featured ? `https://wiseoldman.net/competitions/${featured.id}` : `${WOM}/competitions`} target="_blank" rel="noreferrer">{featured ? "Bekijk de competitie" : "Bekijk alle competities"} <ArrowUpRight size={16}/></a></div></div>
      </div><p className="data-note">EHB = efficiënte boss-uren, de bossing-maatstaf van Wise Old Man. Gegevens worden maximaal vijf minuten gecachet; spelers hebben hun eigen laatste update.</p></div></section>
      <section className="section container" id="leden"><div className="section-heading"><div><p className="eyebrow">LEDENLIJST</p><h2>Clanleden<span className="count-badge">{group.result?.data.memberCount || "—"}</span></h2></div><p className="heading-note">Zoek een speler of filter op accounttype.</p></div><div className="panel members-panel"><div className="member-toolbar"><label className="search"><Search size={17}/><input value={query} onChange={e => { setQuery(e.target.value); setMemberPage(0); }} placeholder="Zoek een clanspeler…" aria-label="Zoek een clanspeler"/>{query && <button aria-label="Zoekopdracht wissen" onClick={() => { setQuery(""); setMemberPage(0); }}><X size={15}/></button>}</label><select aria-label="Filter op accounttype" value={account} onChange={e => { setAccount(e.target.value); setMemberPage(0); }}><option value="all">Alle accounttypes</option><option value="regular">Reguliere accounts</option><option value="ironman">Ironman-accounts</option></select></div>
        {group.loading ? <Skeleton lines={5}/> : group.error ? <LoadError message={group.error} retry={group.reload}/> : <><div className="table-scroll"><table><thead><tr><th>CLANSPELER</th><th>RANG</th><th>TOTALE XP ↓</th><th>EHB</th><th>LAATSTE UPDATE</th><th><span className="sr-only">Profiel</span></th></tr></thead><tbody>{filteredMembers.slice(memberPage * 8, memberPage * 8 + 8).map(m => <tr key={m.player.id}><td><a className="member-name" href={playerUrl(m.player)} target="_blank" rel="noreferrer"><span className={`member-avatar ${["ironman", "hardcore", "ultimate"].includes(m.player.type) ? "iron" : ""}`}>{["ironman", "hardcore", "ultimate"].includes(m.player.type) ? <Shield size={15}/> : <Users size={15}/>}</span>{m.player.displayName}</a></td><td><span className={`role ${m.role === "owner" || m.role === "deputy_owner" ? "owner" : ""}`}>{m.role === "owner" && <Crown size={12}/>} {roleLabel(m.role)}</span></td><td className="numeric">{compact(m.player.exp)}</td><td className="numeric muted-text">{number(m.player.ehb, 1)}</td><td className="muted-text">{m.player.updatedAt ? date(m.player.updatedAt) : "Onbekend"}</td><td><a className="profile-link" aria-label={`Bekijk ${m.player.displayName} op Wise Old Man`} href={playerUrl(m.player)} target="_blank" rel="noreferrer"><ArrowUpRight size={16}/></a></td></tr>)}</tbody></table></div>{!filteredMembers.length && <div className="empty"><Search size={22}/><p>Geen clanleden gevonden voor deze selectie.</p><button className="text-link" onClick={() => { setQuery(""); setAccount("all"); setMemberPage(0); }}>Filters wissen</button></div>}<div className="member-pagination"><span>{filteredMembers.length ? `${memberPage * 8 + 1}–${Math.min((memberPage + 1) * 8, filteredMembers.length)} van ${number(filteredMembers.length)} clanleden` : "0 clanleden"}</span><div><button aria-label="Vorige pagina" disabled={memberPage === 0} onClick={() => setMemberPage(p => p - 1)}><ChevronLeft size={17}/></button><span>Pagina {memberPage + 1} / {Math.max(1, Math.ceil(filteredMembers.length / 8))}</span><button aria-label="Volgende pagina" disabled={(memberPage + 1) * 8 >= filteredMembers.length} onClick={() => setMemberPage(p => p + 1)}><ChevronRight size={17}/></button></div></div></>}
      </div></section></>}
      {view === 'clan' && <section className="join-section container"><div className="join-banner"><div className="join-emblem"><img src="/clan-logo.png" alt=""/></div><div><p className="eyebrow">LID WORDEN</p><h2>Zin om mee te spelen?</h2><p>Je vindt ons in de clanchat en op Discord.</p></div><a className="button gold" href={DISCORD} target="_blank" rel="noreferrer">Join Discord <ArrowUpRight size={17}/></a></div></section>}
    </main>
    {view === 'clan' && <footer><div className="container footer-main"><a className="brand" href="/"><img src="/clan-logo.png" alt=""/><span>Hijgend Hert<small>OSRS · NL / BE</small></span></a><div><a href="/clan">De clan</a><a href="/clan#leden">Leden</a><button onClick={() => setJoin(true)}>In-game kennismaken</button><a href={DISCORD} target="_blank" rel="noreferrer">Discord</a><a href={WOM} target="_blank" rel="noreferrer">Wise Old Man <ExternalLink size={12}/></a></div><span className="footer-world"><span className="dot"/> NL / BE · Wereld {group.result?.data.homeworld || 333}</span></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Hijgend Hert</span><span>Een onafhankelijke clansite. Old School RuneScape is van Jagex Ltd.</span><span>Clanstatistieken via <a href={WOM} target="_blank" rel="noreferrer">Wise Old Man ↗</a></span></div></footer>}
    <dialog ref={dialog} className="join-dialog" aria-label="Kennismaken met Hijgend Hert" onCancel={() => setJoin(false)} onClick={e => { if (e.target === dialog.current) setJoin(false); }}><div className="dialog-content"><button className="dialog-close" aria-label="Sluiten" onClick={() => setJoin(false)}><X size={20}/></button><Stag/><p className="eyebrow">LEUK DAT JE ERBIJ WILT</p><h2>Lid worden van Hijgend Hert</h2><p>Zoek ons op in Old School RuneScape en maak kennis met de clan.</p><ol className="join-steps"><li><span>01</span><div><strong>Open het clanmenu</strong><p>Ga in OSRS naar het tabblad Clans en kies de optie om een clan als gast te bezoeken.</p></div></li><li><span>02</span><div><strong>Zoek Hijgend Hert</strong><p>Vul onze clannaam in en stap de clanchat binnen.</p></div></li><li><span>03</span><div><strong>Zeg even hallo</strong><p>Vraag een clanlid naar de mogelijkheden om lid te worden en eventuele voorwaarden.</p></div></li></ol><button className="copy-clan" onClick={copyClan}><span><small>CLANNAAM</small>{group.result?.data.clanChat || "Hijgend Hert"}</span>{copied ? <Check size={18}/> : <Copy size={18}/>}<span className="sr-only" aria-live="polite">{copied ? "Clannaam gekopieerd" : "Kopieer clannaam"}</span></button><a className="text-link" href={WOM} target="_blank" rel="noreferrer">Bekijk eerst onze clan op Wise Old Man <ArrowUpRight size={15}/></a></div></dialog>
  </>;
}


