"use client";
import Link from '@/components/site-link';
import { useState } from 'react';
import { ArrowUpRight, Award, Check, Flame, RefreshCw, Shield, Swords, Target, Trophy } from 'lucide-react';
import type { MemberProfile, PublicMemberProfile } from '@/lib/member-types';
import MetricImage from './metric-image';
import RankIcon from './rank-icon';

const number = (value: number) => new Intl.NumberFormat('nl-NL').format(value);
export default function ProfileHighlights({ profile, reload, publicView = false }: { profile: MemberProfile | PublicMemberProfile; reload: () => Promise<void>; publicView?: boolean }) {
  const [checking, setChecking] = useState(false);
  const boss = profile.bosses?.favourite;
  const progress = profile.progression;
  const currentRank = profile.clanRank;
  const hasRankPath = !!progress?.rules.configured && progress.rules.steps.some(step => step.id === currentRank?.id);
  const podiums = [1, 2, 3].map(place => profile.events.filter(e => e.status === 'finished' && e.rank === place && e.gained !== null && e.gained > 0).length);
  async function checkEvents() {
    if (!profile.player) return;
    setChecking(true);
    try {
      await reload();
    }
    finally { setChecking(false); }
  }
  return <>
    <div className="profile-highlights">
      <section className="profile-boss-card" aria-labelledby="favourite-boss-title">
        <p className="profile-section-label"><Swords size={15}/> {publicView ? 'BOSSING' : 'JOUW SIGNATUUR'}</p>
        <h2 id="favourite-boss-title">Favoriete boss</h2>
        {profile.bossesError ? <p className="profile-feature-note" role="status">{profile.bossesError}</p> : boss ? <>
          <div className="profile-boss-focus"><span className="profile-boss-emblem"><MetricImage metric={boss.metric} size={64} fallback={<Swords size={48}/>}/></span><div><h3>{boss.name}</h3><strong>{number(boss.kills)} <small>KC</small></strong><span>Hoogste geregistreerde killcount</span></div></div>
          <ol className="profile-boss-top" aria-label="Drie meest verslagen bosses">{profile.bosses!.top.map((entry, i) => <li key={entry.metric}><span>{String(i + 1).padStart(2, '0')}</span><strong className="profile-boss-name"><MetricImage metric={entry.metric} size={24} fallback={<Swords size={20}/>}/><span>{entry.name}</span></strong><span>{number(entry.kills)} KC</span></li>)}</ol>
          <p className="profile-feature-note">Automatisch gekozen op basis van de hoogste KC op Wise Old Man.{profile.bosses?.updatedAt && ` Gemeten op ${new Date(profile.bosses.updatedAt).toLocaleDateString('nl-NL')}.`}</p>
        </> : <div className="profile-feature-empty"><Swords size={32}/><p>De eerste boss wacht.</p><span>Nog geen positieve bosskills zichtbaar op Wise Old Man.</span></div>}
      </section>
      <section className={`profile-rank-card${hasRankPath && progress?.ready ? ' is-ready' : ''}`} aria-labelledby="clan-rank-title">
        <p className="profile-section-label"><Shield size={15}/> {publicView ? 'PLEK IN DE CLAN' : 'JOUW PLEK IN DE CLAN'}</p><h2 id="clan-rank-title">Clanrang & voortgang</h2>
        {currentRank ? <div className="profile-current-rank"><span className="profile-rank-emblem"><RankIcon rank={currentRank.id} size={32}/></span><div><span>Huidige rang</span><h3>{currentRank.name}</h3><small>Via Wise Old Man</small></div></div> : <p className="profile-feature-note">{profile.player ? 'Er staat nog geen rang bij dit account in Wise Old Man.' : 'Kies je RuneScape-account om je rang te zien.'}</p>}
        {progress ? <>
          {hasRankPath && progress.next ? <>
            <div className="profile-rank-target"><span>{progress.ready ? <Check size={15}/> : <Target size={15}/>} {progress.ready ? 'Klaar voor promotie' : `Op weg naar ${progress.next.name}`}</span><strong>{progress.percent}%</strong></div>
            <div className="profile-rank-meter" role="progressbar" aria-label={`Voortgang naar ${progress.next.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent ?? 0}><span style={{ width: `${progress.percent}%` }}/></div>
            <p className="profile-rank-count"><strong>{number(progress.totalEvents)}</strong> / {number(progress.next.events)} events <span>{progress.ready ? `Promotie naar ${progress.next.name} kan worden bevestigd.` : `Nog ${number(progress.remaining!)} bevestigde ${progress.remaining === 1 ? 'deelname' : 'deelnames'} nodig`}</span></p>
          </> : <p className="profile-rank-count">{['owner', 'deputy_owner'].includes(currentRank?.id || '') ? 'Een leidende rol binnen Hijgend Hert.' : hasRankPath && progress.rules.steps.at(-1)?.id === currentRank?.id ? 'De hoogste rang in dit rangpad is bereikt.' : 'Jouw rang wordt overgenomen uit de Hijgend Hert-clanlijst.'}<span>{number(progress.totalEvents)} bevestigde eventdeelnames</span></p>}
          {hasRankPath && <div className="profile-rank-path" aria-label="Rangpad">{progress.rules.steps.map(step => <span key={step.id} className={step.id === currentRank?.id ? 'is-current' : ''} title={`${step.events} events`}><RankIcon rank={step.id} size={14}/>{step.name}<small>{step.events}</small></span>)}</div>}
          <p className="profile-feature-note">Elk afgerond clanevent met behaalde XP, kills of punten telt één keer.{hasRankPath && ' Een promotie verschijnt zodra de rang in Wise Old Man is bijgewerkt.'}</p>
          {!publicView && 'eventAdjustment' in progress && progress.eventAdjustment !== 0 && <p className="profile-feature-note">Beheercorrectie: {progress.eventAdjustment > 0 ? '+' : ''}{progress.eventAdjustment} events. {progress.adjustmentReason}</p>}
          {progress.pendingEvents > 0 && <div className="profile-pending"><span>{progress.pendingEvents} afgelopen events nog te controleren</span><button type="button" disabled={checking} onClick={() => void checkEvents()}><RefreshCw size={13}/>{checking ? 'Controleren…' : 'Controleer volgende events'}</button></div>}
        </> : profile.progressionError && <p className="profile-feature-note" role="status">{profile.progressionError}</p>}
      </section>
    </div>
    <section className="profile-trophy-cabinet" aria-labelledby="profile-trophy-title">
      <div><p className="profile-section-label"><Award size={15}/> VERDIEND MET DE CLAN</p><h2 id="profile-trophy-title">{publicView ? 'Prijzenkast' : 'Jouw prijzenkast'}</h2><p>Podiumplaatsen uit gecontroleerde, afgeronde clanevents.</p></div>
      <div className="profile-medals">{podiums.map((count, i) => <div className={`profile-medal medal-${i + 1}${count ? ' earned' : ''}`} key={i}><Trophy size={22}/><strong>{profile.eventsError ? '—' : number(count)}</strong><span>{['Goud', 'Zilver', 'Brons'][i]}</span></div>)}</div>
      <Link prefetch={false} href="/events#kalender"><Flame size={16}/>{podiums.some(Boolean) ? 'Op naar je volgende podium' : 'Verdien je eerste trofee'}<ArrowUpRight size={15}/></Link>
    </section>
  </>;
}
