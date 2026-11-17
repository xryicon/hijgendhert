'use client';
import type { ReactNode } from 'react';
import { Anchor, Crosshair, Gem, ShieldCheck, Ship, Trophy } from 'lucide-react';
import { SEA_BRIEFING, SEA_BRIEFING_MS, seaBriefingStep } from '@/lib/warship-briefing';
import type { WarshipView } from '@/lib/warships';

const icons = [Anchor, Ship, Gem, ShieldCheck, Crosshair, Trophy];
export default function WarshipBriefing({ game, now, sound }: { game: WarshipView; now: number; sound: ReactNode }) {
  const elapsed = now - Date.parse(game.reveal!.at), step = seaBriefingStep(elapsed);
  if (!step) return null;
  const Icon = icons[step.index];
  return <div className="sea-briefing">
    <div className="sea-briefing-top"><span className="sea-on-air"><i/> VOOR WE UITVAREN</span><span>Spelregel {step.index + 1} van {SEA_BRIEFING.length}</span></div>
    <article className="sea-rule-slide" key={step.rule.id} aria-live="polite" aria-atomic="true">
      <span className="sea-rule-number" aria-hidden="true">{String(step.index + 1).padStart(2, '0')}</span>
      <div className="sea-rule-emblem"><Icon size={52} strokeWidth={1.2}/></div>
      <small>HIJGEND HERT · DE SPELREGELS</small><h2>{step.rule.title}</h2><p>{step.rule.text}</p>
      <div className="sea-rule-detail">{step.index === 1 ? <span className="sea-rule-ships" aria-label="Vier schepen van vier, drie, drie en twee vakken">{[4,3,3,2].map((length, i) => <span key={i}>{Array.from({length}, (_, j) => <i key={j}/>)}</span>)}</span> : step.index === 2 ? <span>{game.config.objectives.length} ingestelde boss drops · bekijk de volledige lijst bij Boss drops</span> : step.index === 5 ? <span>Eindtijd: {new Date(game.config.endsAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })} · jouw lokale tijd</span> : <span>{['Samen jagen. Samen varen.', '', '', 'Zonder goedkeuring nog geen munitie.', 'Raak of mis: ieder schot telt.'][step.index]}</span>}</div>
    </article>
    <div className="sea-briefing-bottom"><div className="sea-rule-progress" role="progressbar" aria-label="Voortgang spelregelintroductie" aria-valuemin={0} aria-valuemax={6} aria-valuenow={step.index + 1}>{SEA_BRIEFING.map((rule, i) => <span key={rule.id} className={i === step.index ? 'is-current' : ''}><i style={{ width: `${i < step.index ? 100 : i === step.index ? Math.min(100, step.elapsedMs / rule.durationMs * 100) : 0}%` }}/></span>)}</div><div className="sea-rule-controls">{sound}<span>Teamonthulling over <b>{Math.max(0, Math.ceil((SEA_BRIEFING_MS + 5000 - elapsed) / 1000))}s</b></span></div></div>
  </div>;
}
