"use client";

import { ArrowUpRight, Globe2, Sparkles, Users } from "lucide-react";

type Props = {
  memberCount: number | null;
  totalXp: number | null;
  homeWorld: number | null;
  fetchedAt: string | null;
  loading: boolean;
  error: string;
  stale: boolean;
  onRetry: () => void;
};
const format = (value: number, digits = 0) => new Intl.NumberFormat("nl-NL", { maximumFractionDigits: digits }).format(value);

export default function ClanStats({ memberCount, totalXp, homeWorld, fetchedAt, loading, error, stale, onRetry }: Props) {
  const xp = totalXp === null ? null : totalXp >= 1e9 ? { value: totalXp / 1e9, unit: 'mld' } : totalXp >= 1e6 ? { value: totalXp / 1e6, unit: 'mln' } : { value: totalXp, unit: '' };
  return <section className="container clan-stats" aria-label="Hijgend Hert in cijfers">
    <div className="clan-stats-grid" aria-busy={loading}>
      <article className="clan-stat-card">
        <div className="clan-stat-heading"><span className="clan-stat-medallion"><Users size={20} strokeWidth={1.5}/></span><h2>Clanleden</h2></div>
        <div className="clan-stat-amount">{memberCount === null ? '—' : format(memberCount)}</div>
      </article>
      <article className="clan-stat-card clan-stat-xp">
        <div className="clan-stat-heading"><span className="clan-stat-medallion"><Sparkles size={20} strokeWidth={1.5}/></span><h2>Totale clan-XP</h2></div>
        <div className="clan-stat-amount" aria-label={totalXp === null ? 'Clan-XP nog niet beschikbaar' : `${format(totalXp)} ervaringspunten`}>{xp ? <>{format(xp.value, xp.unit ? 2 : 0)}<small>{xp.unit}</small></> : '—'}</div>
      </article>
      <article className="clan-stat-card">
        <div className="clan-stat-heading"><span className="clan-stat-medallion"><Globe2 size={20} strokeWidth={1.5}/></span><h2>Clanwereld</h2></div>
        <div className="clan-stat-amount">{homeWorld || '—'}<small>{homeWorld ? 'wereld' : ''}</small></div>
        {!loading && !error && !homeWorld && <p>Nog niet ingesteld op Wise Old Man.</p>}
      </article>
    </div>
    <div className="clan-stats-source"><span className="clan-stats-status"><i className={error ? 'is-offline' : ''} aria-hidden="true"/>{loading ? 'Clangegevens laden…' : error ? 'Clangegevens tijdelijk niet beschikbaar' : stale ? 'Laatst bekende clangegevens' : 'Clangegevens via Wise Old Man'}{error && <button type="button" onClick={onRetry}>Opnieuw proberen</button>}</span><a href="https://wiseoldman.net/groups/7059" target="_blank" rel="noreferrer">{fetchedAt ? `Bijgewerkt om ${new Date(fetchedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })} · NL-tijd` : 'Bekijk op Wise Old Man'}<ArrowUpRight size={12}/></a></div>
  </section>;
}
