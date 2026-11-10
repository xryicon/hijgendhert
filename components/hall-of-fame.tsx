"use client";
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Crown, Medal, RefreshCw, Trophy } from 'lucide-react';
import type { Award, Winner } from '@/lib/community';
import MetricImage from './metric-image';

type HallData = { month: string; months: string[]; awards: Award[]; leaders: (Winner & { wins: number })[]; partial: boolean; ongoingMonth: boolean };
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' });
const fmt = (v: number, unit: string) => new Intl.NumberFormat('nl-NL', { maximumFractionDigits: unit === 'uur' || unit === 'punten' ? 2 : 0 }).format(v);
const profile = (p: Winner) => `https://wiseoldman.net/players/${encodeURIComponent(p.username)}`;
export default function HallOfFame() {
  const section = useRef<HTMLElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [data, setData] = useState<HallData | null>(null);
  const [month, setMonth] = useState('');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [snapshotDate, setSnapshotDate] = useState('');
  useEffect(() => { const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setEnabled(true); observer.disconnect(); } }, { rootMargin: '500px' }); if (section.current) observer.observe(section.current); return () => observer.disconnect(); }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController(); setLoading(true); setError('');
    fetch(`/api/hall-of-fame${month ? `?month=${month}` : ''}`, { signal: controller.signal }).then(async r => { const b = await r.json() as { data: HallData; error?: string; stale?: boolean; fetchedAt: string }; if (!r.ok) throw new Error(b.error || 'De erelijst kon niet worden geladen.'); if (!controller.signal.aborted) { setData(b.data); setSnapshotDate(b.stale ? b.fetchedAt : ''); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [enabled, month, retry]);
  const awards = data?.awards.filter(a => category === 'all' || a.category === category) || [];
  return <section ref={section} className="community-section hall-section container" id="erelijst">
    <div className="section-heading"><div><p className="eyebrow">COMPETITIEWINNAARS</p><h2>Hall of Fame.</h2><p className="section-description">De winnaars van onze clancompetities. Rechtstreeks uit Wise Old Man.</p></div><label className="hall-month-label"><span>Resultaten van</span><select aria-label="Maand van de Hall of Fame" value={month || data?.month || ''} onChange={e => { setMonth(e.target.value); setPage(0); }}>{data?.months.length ? data.months.map(m => <option key={m} value={m}>{monthName(m)}</option>) : <option value="">Maand laden…</option>}</select></label></div>
    <div className="community-filters" role="group" aria-label="Hall of Fame categorie">{[{ id: 'all', label: 'Alle winnaars' }, { id: 'skill', label: 'Skilling' }, { id: 'boss', label: 'Bossing' }, { id: 'other', label: 'Overig' }].map(c => <button key={c.id} aria-pressed={category === c.id} className={category === c.id ? 'selected' : ''} onClick={() => { setCategory(c.id); setPage(0); }}>{c.label}</button>)}</div>
    <div aria-busy={loading}>
      {loading ? <div className="hall-loading panel" role="status"><Trophy size={30}/><h3>De erelijst wordt opgehaald.</h3><p>We verzamelen de uitslagen van de afgeronde competities.</p><span className="skeleton"/></div> : error ? <div className="load-error panel" role="status"><p>{error}</p><button className="text-link" onClick={() => setRetry(v => v + 1)}><RefreshCw size={14}/> Opnieuw proberen</button></div> : data && <>
        {snapshotDate && <p className="community-fallback" role="status">Wise Old Man is even druk. Laatst bevestigde uitslagen: {new Date(snapshotDate).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })}. <button className="text-link" onClick={() => setRetry(v => v + 1)}>Ververs</button></p>}
        <div className="month-champions"><div className="champion-emblem"><Crown size={34}/></div><div className="champion-copy"><span className="mini-label">{data.ongoingMonth ? 'DEZE MAAND · TUSSENSTAND' : 'DE MAANDWINNAARS'} · {monthName(data.month)}</span><h3>{data.partial ? 'Nog niet alle uitslagen zijn binnen.' : data.leaders.length ? 'De meeste overwinningen.' : 'Een nieuwe plek voor een nieuwe naam.'}</h3><p>{data.partial ? 'De maandtitel verschijnt zodra alle resultaten beschikbaar zijn.' : 'Elke eerste plaats telt als één overwinning. Een gedeelde eerste plaats telt voor iedere winnaar.'}</p></div><div className="champion-names">{data.leaders.map(p => <a href={profile(p)} key={p.id} target="_blank" rel="noreferrer"><Crown size={15}/><span>{p.displayName}<small>{p.wins} {p.wins === 1 ? 'overwinning' : 'overwinningen'}</small></span><ArrowUpRight size={13}/></a>)}</div></div>
        {data.partial && <div className="community-status" role="status">Een deel van Wise Old Man kon niet worden geladen. <button className="text-link" onClick={() => setRetry(v => v + 1)}>Opnieuw proberen</button></div>}
        {awards.length ? <div className="award-grid">{awards.slice(page * 6, page * 6 + 6).map(a => <article className="award-card" key={a.id}><div className="award-top"><span className="award-icon"><MetricImage metric={a.metric} size={28} fallback={<Medal size={23}/>}/></span><div><span className="mini-label">{a.category === 'skill' ? 'SKILLING' : a.category === 'boss' ? 'BOSSING' : 'CLANCOMPETITIE'}</span><small>Afgerond {new Date(a.endsAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' })}</small></div></div><h3>{a.title}</h3>{a.unavailable ? <p className="award-unavailable">Uitslag tijdelijk niet beschikbaar.</p> : a.winners.length ? <><div className="award-winner"><Crown size={17}/><a href={profile(a.winners[0])} target="_blank" rel="noreferrer">{a.winners[0].displayName}</a>{a.winners.length > 1 && <span>+{a.winners.length - 1}</span>}</div><p className="award-score">+{fmt(a.winners[0].gained, a.unit)} <span>{a.unit}</span></p>{a.winners.length > 1 && <details className="tied-winners"><summary>{a.winners.length} gedeelde winnaars</summary><div>{a.winners.map(p => <a key={p.id} href={profile(p)} target="_blank" rel="noreferrer">{p.displayName}<ArrowUpRight size={12}/></a>)}</div></details>}</> : <p className="award-unavailable">Geen positieve voortgang geregistreerd; geen winnaar toegekend.</p>}<a className="award-source" href={`https://wiseoldman.net/competitions/${a.id}`} target="_blank" rel="noreferrer">Bekijk de uitslag <ArrowUpRight size={14}/></a></article>)}</div> : <div className="empty panel"><Trophy size={28}/><h3>Nog geen winnaars in deze selectie.</h3><p>Kies een andere maand of categorie.</p></div>}
        {awards.length > 6 && <div className="member-pagination hall-pagination"><span>{page * 6 + 1}–{Math.min(page * 6 + 6, awards.length)} van {awards.length} competities</span><div><button aria-label="Vorige winnaars" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16}/></button><span>Pagina {page + 1} / {Math.ceil(awards.length / 6)}</span><button aria-label="Volgende winnaars" disabled={(page + 1) * 6 >= awards.length} onClick={() => setPage(p => p + 1)}><ChevronRight size={16}/></button></div></div>}
      </>}
    </div><p className="data-note">Per kalendermaand op basis van de einddatum in Nederlandse tijd. Alleen afgeronde individuele competities tellen mee; de maandtitel telt alle categorieën. Dit is onze berekening op basis van de <a href="https://wiseoldman.net/groups/7059/competitions" target="_blank" rel="noreferrer">Wise Old Man-uitslagen</a>.</p>
  </section>;
}

