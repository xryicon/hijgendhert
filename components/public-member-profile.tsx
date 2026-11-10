"use client";
import Link from '@/components/site-link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, RefreshCw, Shield, Users } from 'lucide-react';
import type { PublicMemberProfile } from '@/lib/member-types';
import ProfileHighlights from './profile-highlights';
import MemberActivityFeed from './member-activity';
import RankIcon from './rank-icon';
import MemberAvatar from './member-avatar';

const number = (n: number | null) => n === null ? '—' : new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(n);
export default function PublicMemberProfileView({ username }: { username: string }) {
  const [profile, setProfile] = useState<PublicMemberProfile | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const timer = setTimeout(() => controller.abort(), 65000);
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/clan/member?username=${encodeURIComponent(username)}`, { signal: controller.signal });
      const data = await response.json() as PublicMemberProfile & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Het profiel kan niet worden geladen.');
      if (active.current === controller) setProfile(data);
    } catch (e) { if (active.current === controller) setError(controller.signal.aborted ? 'Het ophalen duurt te lang. Probeer het later opnieuw.' : e instanceof Error ? e.message : 'Het profiel kan niet worden geladen.'); }
    finally { clearTimeout(timer); if (active.current === controller) setBusy(false); }
  }, [username]);
  useEffect(() => { setProfile(null); void load(); return () => { active.current?.abort(); active.current = null; }; }, [load]);
  return <div className="container public-member-content">
    <Link prefetch={false} className="text-link member-back" href="/leden"><ArrowLeft size={16}/> Alle clanleden</Link>
    <section className="public-member-identity"><MemberAvatar playerId={profile?.player.id} name={profile?.player.displayName || username}/><div><p className="profile-section-label"><Users size={14}/> HIJGEND HERT · LIDPROFIEL</p><h1>{profile?.player.displayName || username}</h1><p className="public-member-rank">{profile ? <><RankIcon rank={profile.clanRank?.id} size={18}/><span>{profile.clanRank?.name || 'Rang onbekend'} · {['ironman', 'hardcore', 'ultimate'].includes(profile.player.type) ? 'Ironman' : 'Regulier account'}</span></> : 'Profiel en voortgang van een clanlid'}</p></div>{profile && <a className="text-link" href={`https://wiseoldman.net/players/${encodeURIComponent(profile.player.username)}`} target="_blank" rel="noreferrer">Wise Old Man <ArrowUpRight size={15}/></a>}</section>
    {error && <div className="public-profile-status" role="status"><p>{error}</p><button className="button gold" disabled={busy} onClick={() => void load()}><RefreshCw size={15}/> Opnieuw proberen</button></div>}
    {!profile && busy && <div className="public-profile-status" role="status"><Shield size={24}/><p>Het clanprofiel wordt opgehaald…</p></div>}
    {profile && <>
      {profile.stale && <p className="profile-feature-note">Laatst beschikbare meting van {new Date(profile.fetchedAt).toLocaleString('nl-NL')}.</p>}
      <div className="public-member-stats"><div><span>Totale XP</span><strong>{number(profile.player.exp)}</strong></div><div><span>Boss-uren (EHB)</span><strong>{number(profile.player.ehb)}</strong></div><div><span>Bevestigde events</span><strong>{profile.progression ? number(profile.progression.totalEvents) : '—'}</strong></div></div>
      <ProfileHighlights profile={profile} reload={load} publicView/>
      <MemberActivityFeed key={profile.player.id} username={profile.player.username}/>
    </>}
  </div>;
}
