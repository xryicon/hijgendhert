"use client";
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Trophy } from 'lucide-react';
import type { EventLeaderboard } from '@/lib/event-leaderboard';
import Link from './site-link';
import MemberAvatar from './member-avatar';

type Member = { player: { id: number; username: string; displayName: string; type: string } };
export default function MemberLeaderboard({ members, query, account }: { members: Member[]; query: string; account: string }) {
  const [data, setData] = useState<EventLeaderboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      if (document.hidden) { timer = setTimeout(load, 15_000); return; }
      setLoading(true);
      try {
        const response = await fetch('/api/clan/leaderboard', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]), cache: 'no-store' });
        const body = await response.json() as EventLeaderboard & { error?: string };
        if (!response.ok) { setRetryAt(Date.now() + Math.max(60, Number(response.headers.get('Retry-After')) || 60) * 1000); throw new Error(body.error || 'De uitslagen zijn even niet beschikbaar.'); }
        if (!Array.isArray(body.rows)) throw new Error('De uitslagen konden niet worden gelezen.');
        if (controller.signal.aborted) return;
        setData(body); setError(''); setRetryAt(0);
        timer = setTimeout(load, Math.max(10, body.retryAfter) * 1000);
      } catch (error) {
        if (!controller.signal.aborted) { setError(error instanceof Error ? error.message : 'De uitslagen zijn even niet beschikbaar.'); setRetryAt(old => old || Date.now() + 60_000); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [attempt]);
  useEffect(() => { setPage(0); }, [query, account]);
  useEffect(() => { if (!retryAt) return; setClock(Date.now()); const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, [retryAt]);
  const rows = useMemo(() => {
    const byId = new Map(members.map(member => [member.player.id, member.player]));
    return (data?.rows || []).flatMap(row => { const player = byId.get(row.playerId); return player ? [{ ...row, player }] : []; }).filter(({ player }) =>
      [player.username, player.displayName].some(name => name.toLowerCase().includes(query.trim().toLowerCase())) &&
      (account === 'all' || (account === 'ironman' ? ['ironman', 'hardcore', 'ultimate'].includes(player.type) : player.type === 'regular')));
  }, [members, data, query, account]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 10) - 1));
  const minimumEvents = data?.minimumEvents ?? 5;
  return <section className="member-leaderboard panel" aria-labelledby="event-leaderboard-title">
    <div className="leaderboard-heading"><div><p className="eyebrow"><Trophy size={14}/> OP HET PODIUM</p><h2 id="event-leaderboard-title">Eventleaderboard</h2><p>Elke deelname telt. Ontdek wie gemiddeld het hoogst eindigt.</p></div><span>{data ? `${data.loadedEvents} / ${data.totalEvents} events` : 'Uitslagen ophalen…'}</span></div>
    <p className="leaderboard-rule">Vanaf {minimumEvents} events krijg je een positie, gebaseerd op je gemiddelde eindplaats. Bij een gelijk gemiddelde gaan meer deelnames voor; daarna geldt een vaste volgorde. Elke positie is uniek.</p>
    {error && <div className="leaderboard-status" role="status">{error} <button className="text-link" disabled={loading || clock < retryAt} onClick={() => { setRetryAt(0); setAttempt(n => n + 1); }}><RefreshCw size={14}/> {clock < retryAt ? 'Even wachten…' : 'Opnieuw proberen'}</button></div>}
    {data && !data.complete && <div className="leaderboard-status" role="status">We verzamelen de historie: {data.loadedEvents} van {data.totalEvents} afgeronde events verwerkt. De cijfers zijn voorlopig; de clanpositie verschijnt wanneer alle uitslagen binnen zijn.</div>}
    {data?.stale && data.complete && <p className="leaderboard-status">Je ziet de laatst beschikbare uitslagen. Wise Old Man wordt later opnieuw gecontroleerd.</p>}
    {!data && loading ? <div className="leaderboard-empty" role="status"><RefreshCw size={25}/><p>De clanresultaten worden opgehaald…</p></div> : data && <>
      <div className="table-scroll"><table><caption className="sr-only">Eventklassement van huidige clanleden op gemiddelde eindplaats</caption><thead><tr><th>POSITIE</th><th>CLANSPELER</th><th>EVENTS MEEGEDAAN</th></tr></thead><tbody>{rows.slice(currentPage * 10, currentPage * 10 + 10).map(row => <tr key={row.playerId}><td><span className={`leaderboard-position${row.position && row.position <= 3 ? ' is-podium' : ''}`}>{row.position ?? '—'}</span></td><td><Link className="member-name" prefetch={false} href={`/leden/${encodeURIComponent(row.player.username)}`}><MemberAvatar playerId={row.playerId} name={row.player.displayName}/>{row.player.displayName}</Link>{data.complete && row.events < minimumEvents && <span className="leaderboard-qualifying">Nog {minimumEvents - row.events} {minimumEvents - row.events === 1 ? 'event' : 'events'} nodig voor een positie</span>}</td><td className="numeric">{row.events}{!data.complete && row.events ? '+' : ''}</td></tr>)}</tbody></table></div>
      {!rows.length && <p className="leaderboard-empty">Geen clanleden gevonden voor deze selectie.</p>}
      {rows.length > 10 && <div className="member-pagination"><span>{currentPage * 10 + 1}–{Math.min((currentPage + 1) * 10, rows.length)} van {rows.length} clanleden</span><div><button aria-label="Vorige leaderboardpagina" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16}/></button><span>{currentPage + 1} / {Math.ceil(rows.length / 10)}</span><button aria-label="Volgende leaderboardpagina" disabled={(currentPage + 1) * 10 >= rows.length} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16}/></button></div></div>}
    </>}
    <details className="leaderboard-explanation"><summary>Hoe worden deelnames en posities geteld?</summary><p>Eén afgerond clanevent of één eventweek telt als één deelname. Boss- of skillonderdelen met dezelfde begin- en einddatum worden samengenomen; dubbele lijsten tellen één keer. Team-events tellen ook mee. Alleen inschrijven zonder gemeten voortgang telt niet.</p><p>Per event gebruiken we de gemiddelde eindplaats van de onderdelen waarin je voortgang behaalde. Elk event weegt daarna even zwaar. Bij teamonderdelen gebruiken we de eindplaats van je team in Wise Old Man. Vanaf {minimumEvents} events doe je mee aan het klassement. De zichtbare positie is altijd een uniek volgnummer; onder het minimum blijven je deelnames zichtbaar.</p>{data?.totalCompetitions !== undefined && <p>{data.loadedCompetitions} van {data.totalCompetitions} WOM-uitslagen gecontroleerd voor {data.totalEvents} events. Dit eventklassement staat los van je clanrang.</p>}</details>
  </section>;
}
