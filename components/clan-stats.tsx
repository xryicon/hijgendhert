"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, Copy, Globe2, Sparkles, Users } from "lucide-react";

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
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current); }, []);
  async function copyWorld() {
    if (!homeWorld) return;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try { await navigator.clipboard.writeText(String(homeWorld)); setCopyStatus('copied'); }
    catch { setCopyStatus('failed'); }
    resetTimer.current = setTimeout(() => setCopyStatus('idle'), 3500);
  }
  const xp = totalXp === null ? null : totalXp >= 1e9 ? { value: totalXp / 1e9, unit: 'mld' } : totalXp >= 1e6 ? { value: totalXp / 1e6, unit: 'mln' } : { value: totalXp, unit: '' };
  return <section className="container clan-stats" aria-label="Hijgend Hert in cijfers">
    <div className="clan-stats-grid" aria-busy={loading}>
      <article className="clan-stat-card">
        <div className="clan-stat-heading"><span className="clan-stat-medallion"><Users size={20} strokeWidth={1.5}/></span><h2>Clanleden</h2></div>
        <div className="clan-stat-amount">{memberCount === null ? '—' : format(memberCount)}</div>
        <a className="clan-stat-button" href="/clan#leden"><span>Bekijk leden</span><ArrowRight size={16}/></a>
      </article>
      <article className="clan-stat-card clan-stat-xp">
        <div className="clan-stat-heading"><span className="clan-stat-medallion"><Sparkles size={20} strokeWidth={1.5}/></span><h2>Totale clan-XP</h2></div>
        <div className="clan-stat-amount" aria-label={totalXp === null ? 'Clan-XP nog niet beschikbaar' : `${format(totalXp)} ervaringspunten`}>{xp ? <>{format(xp.value, xp.unit ? 2 : 0)}<small>{xp.unit}</small></> : '—'}</div>
        <a className="clan-stat-button" href="/clan#ranglijst"><span>Bekijk ranglijst</span><ArrowRight size={16}/></a>
      </article>
      <article className="clan-stat-card">
        <div className="clan-stat-heading"><span className="clan-stat-medallion"><Globe2 size={20} strokeWidth={1.5}/></span><h2>Clanwereld</h2></div>
        <div className="clan-stat-amount">{homeWorld || '—'}<small>{homeWorld ? 'wereld' : ''}</small></div>
        {!loading && !error && !homeWorld && <p>Nog niet ingesteld op Wise Old Man.</p>}
        <button className={`clan-stat-button ${copyStatus === 'copied' ? 'is-copied' : ''}`} type="button" disabled={!homeWorld} onClick={copyWorld}><span>{copyStatus === 'copied' ? 'Wereld gekopieerd' : 'Kopieer wereld'}</span>{copyStatus === 'copied' ? <Check size={16}/> : <Copy size={15}/>}</button>
        <span className="sr-only" role="status">{copyStatus === 'copied' ? `Wereld ${homeWorld} gekopieerd.` : copyStatus === 'failed' ? `Kopiëren is niet gelukt. Selecteer en kopieer het wereldnummer ${homeWorld} handmatig.` : ''}</span>
        {copyStatus === 'failed' && <p className="clan-copy-error">Selecteer en kopieer het nummer hierboven.</p>}
      </article>
    </div>
    <div className="clan-stats-source"><span className="clan-stats-status"><i className={error ? 'is-offline' : ''} aria-hidden="true"/>{loading ? 'Clangegevens laden…' : error ? 'Clangegevens tijdelijk niet beschikbaar' : stale ? 'Laatst bekende clangegevens' : 'Clangegevens via Wise Old Man'}{error && <button type="button" onClick={onRetry}>Opnieuw proberen</button>}</span><a href="https://wiseoldman.net/groups/7059" target="_blank" rel="noreferrer">{fetchedAt ? `Bijgewerkt om ${new Date(fetchedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })} · NL-tijd` : 'Bekijk op Wise Old Man'}<ArrowUpRight size={12}/></a></div>
  </section>;
}
