'use client';
import { BookOpen, Crosshair, Gem } from 'lucide-react';
import { SEA_BRIEFING } from '@/lib/warship-briefing';
import { seaIntroStep, type SeaIntroSlide } from '@/lib/warship-intro';
import { metricLabel } from '@/lib/osrs-metrics';
import type { WarshipView } from '@/lib/warships';
import MetricImage from './metric-image';

export default function WarshipBriefing({ game, now }: { game: WarshipView; now: number }) {
  const slides: SeaIntroSlide[] = game.reveal!.briefing?.slides || SEA_BRIEFING.map(r => ({ ...r, kind: 'rule' as const }));
  const step = seaIntroStep(slides, now - Date.parse(game.reveal!.at));
  if (!step) return null;
  const { slide, index } = step, ruleCount = slides.filter(s => s.kind === 'rule').length;
  const isRule = slide.kind === 'rule';
  return <div className="sea-briefing">
    <div className="sea-briefing-top"><span className="sea-on-air"><i/> VOOR WE UITVAREN</span><span>{isRule ? `Spelregel ${index + 1} van ${ruleCount}` : `Boss & drop ${index - ruleCount + 1} van ${slides.length - ruleCount}`}</span></div>
    <article className={`sea-rule-slide${!isRule ? ' sea-drop-slide' : ''}`} key={slide.id} aria-live="polite" aria-atomic="true">
      <span className="sea-rule-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <div className="sea-rule-emblem">{slide.kind === 'drop' ? <MetricImage metric={slide.boss} size={80}/> : <BookOpen size={48} strokeWidth={1.2}/>}</div>
      <small>HIJGEND HERT · {isRule ? 'DE SPELREGELS' : 'DE JACHT'}</small>
      {slide.kind === 'rule' ? <><h2>{slide.title}</h2><p>{slide.text}</p></> : slide.kind === 'drop' ? <><h2>{metricLabel(slide.boss)}</h2><p className="sea-reveal-item"><Gem size={22}/>{slide.item}</p><div className="sea-drop-rewards"><span><Crosshair size={20}/><strong>+{slide.shots}</strong> schoten</span><span>Maximaal <strong>{slide.limit}×</strong> per team</span></div><p className="sea-drop-proof">Alleen drops tijdens de strijd tellen. Staff controleert het bewijs.</p></> : <><h2>De volgende drop verschijnt…</h2><p>De zeekaart wordt bijgewerkt.</p></>}
    </article>
    <div className="sea-briefing-bottom"><div className="sea-rule-progress" style={{ gridTemplateColumns: `repeat(${slides.length}, minmax(0, 1fr))` }} role="progressbar" aria-label="Voortgang introductie" aria-valuemin={0} aria-valuemax={slides.length} aria-valuenow={index + 1}>{slides.map((s, i) => <span key={s.id} className={i === index ? 'is-current' : ''}><i style={{ width: `${i < index ? 100 : i === index ? Math.min(100, step.elapsedMs / s.durationMs * 100) : 0}%` }}/></span>)}</div><div className="sea-rule-controls"><ol className="sea-intro-track"><li aria-current={isRule ? 'step' : undefined}>Spelregels</li><li aria-current={!isRule ? 'step' : undefined}>Bosses & drops</li><li>Teams</li></ol><span>Teams over <b>{Math.max(0, Math.ceil((Date.parse(game.reveal!.briefing!.firstSpinAt) - now) / 1000))}s</b></span></div></div>
  </div>;
}
