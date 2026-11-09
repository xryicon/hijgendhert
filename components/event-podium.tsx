import { ArrowUpRight, Crown, Shield } from 'lucide-react';

type RankedPlayer = { rank: number; player: { id: number; username: string; displayName: string; updatedAt: string }; gained: number | null };
const amount = (value: number | null, unit: string) => value === null ? '—' : `+${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: ['uur', 'punten'].includes(unit) ? 2 : 0 }).format(value)}`;
const playerUrl = (username: string) => `https://wiseoldman.net/players/${encodeURIComponent(username)}`;

export default function EventPodium({ participants, unit, finished = false }: { participants: RankedPlayer[]; unit: string; finished?: boolean }) {
  const leaders = participants.slice(0, 3);
  const contenders = participants.slice(3, 10);
  return <>
    <section className="hert-podium" aria-label={finished ? "Top drie van de eindstand" : "Top drie van het live event"}>
      <div className="hert-podium-title"><span/><p>TOP 3</p><span/></div>
      <div className="hert-podium-stage">
        {leaders.map((player, index) => <a key={player.player.id} className={`hert-podium-step hert-place-${index + 1}`} href={playerUrl(player.player.username)} target="_blank" rel="noreferrer" aria-label={`Plaats ${player.rank}: ${player.player.displayName}, ${amount(player.gained, unit)} ${unit}`}>
          <div className="hert-podium-player"><span className="hert-podium-medal">{index === 0 ? <Crown size={28} strokeWidth={1.3}/> : <Shield size={23} strokeWidth={1.3}/>}</span><small>{index === 0 && !finished ? 'AAN KOP' : `PLAATS ${player.rank}`}</small><h4>{player.player.displayName}</h4><strong>{amount(player.gained, unit)} <span>{unit}</span></strong></div>
          <div className="hert-podium-plinth"><span className="hert-podium-rank" aria-hidden="true">{player.rank}</span></div>
        </a>)}
      </div>
      {!leaders.length && <p className="hert-standings-empty">De eerste deelnemers krijgen hier hun plek.</p>}
    </section>
    <section className="hert-top-ten" aria-label="Overige spelers in de top 10">
      {contenders.length ? <ol className="hert-contenders" start={4}>{contenders.map(player => <li key={player.player.id}><span className="hert-contender-rank">{String(player.rank).padStart(2, '0')}</span><a href={playerUrl(player.player.username)} target="_blank" rel="noreferrer"><span>{player.player.displayName}</span><ArrowUpRight size={13}/></a><strong>{amount(player.gained, unit)}<small>{unit}</small></strong></li>)}</ol> : <p className="hert-standings-empty">Er zijn nog geen deelnemers buiten de podiumplaatsen.</p>}
    </section>
  </>;
}
