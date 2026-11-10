'use client';
import { CalendarDays, Grid2X2, Sprout, Swords, Target, Users } from 'lucide-react';
import { EVENT_CATEGORIES, bossOptions, skillOptions, minimumLabel, type EventMinimum } from '@/lib/clan-event-rules';
import type { ClanEventInput } from '@/lib/clan-discord';
import MetricImage from './metric-image';

export function EventCategoryIcon({ category }: { category: ClanEventInput['category'] }) {
  if (category === 'skill') return <MetricImage metric="overall" size={25}/>;
  if (category === 'boss') return <MetricImage metric="vorkath" size={27}/>;
  if (category === 'raid') return <Swords size={24}/>;
  if (category === 'bingo') return <Grid2X2 size={24}/>;
  if (category === 'social') return <Users size={24}/>;
  return <CalendarDays size={24}/>;
}
export function EventCategoryFields({ event, onChange }: { event: ClanEventInput; onChange: (value: ClanEventInput) => void }) {
  const descriptions = { skill: 'Train samen een skill.', boss: 'Kills maken met de clan.', raid: 'Samen de raid in.', bingo: 'Bingo met twee teams.', social: 'Een avond met de herten.', other: 'Je eigen clanactiviteit.' };
  return <><p className="admin-field-heading">Wat staat er op de planning?</p><div className="event-category-picker" role="group" aria-label="Soort event">{(Object.keys(EVENT_CATEGORIES) as ClanEventInput['category'][]).map(category => <button type="button" key={category} aria-pressed={event.category === category} onClick={() => onChange({ ...event, category })}><EventCategoryIcon category={category}/><strong>{EVENT_CATEGORIES[category]}</strong><span>{descriptions[category]}</span></button>)}</div>{event.category === 'bingo' && <p className="admin-bingo-note"><Grid2X2 size={18}/> Plan hier de bingo en de inschrijvingen. Zet teams en spelregels in de beschrijving; dit eventformulier houdt geen bingobord bij.</p>}</>;
}
export function EventMinimumFields({ event, onChange }: { event: ClanEventInput; onChange: (value: ClanEventInput) => void }) {
  function changeUnit(unit: string) { onChange({ ...event, minimum: unit === 'none' ? null : { unit: unit as EventMinimum['unit'], metric: unit === 'xp' ? 'overall' : 'all_bosses', amount: event.minimum?.amount || 1 } }); }
  return <div className="event-minimum-editor"><div className="minimum-heading"><Target size={21}/><div><h4>Wanneer telt iemand mee?</h4><p>Alleen wat tijdens dit event wordt behaald. Geen vereiste om je vooraf aan te melden.</p></div></div>
    <div className="event-minimum-fields"><label>Deelname-eis<select value={event.minimum?.unit || 'none'} onChange={e => changeUnit(e.target.value)}><option value="none">Geen minimum</option><option value="xp">Minimum XP behalen</option><option value="kc">Minimum KC behalen</option></select></label>{event.minimum && <><label>{event.minimum.unit === 'xp' ? 'Welke skill?' : 'Welke boss?'}<span className="minimum-metric-select"><MetricImage metric={event.minimum.metric} size={22} fallback={<Swords size={21}/>}/><select value={event.minimum.metric} onChange={e => onChange({ ...event, minimum: { ...event.minimum!, metric: e.target.value } })}>{(event.minimum.unit === 'xp' ? skillOptions : bossOptions).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></span></label><label>Minimaal {event.minimum.unit.toUpperCase()}<input required type="number" min="1" step="1" max={event.minimum.unit === 'kc' ? 10000000 : 10000000000} value={event.minimum.amount || ''} onChange={e => onChange({ ...event, minimum: { ...event.minimum!, amount: Number(e.target.value) } })}/></label></>}</div>
    {event.minimum && <div className="minimum-preview"><span>DE AFSPRAAK</span><strong>{minimumLabel(event.minimum)}</strong><p>Per deelnemer, tussen begin- en eindtijd. Staff legt de behaalde aantallen vast; de website controleert het minimum.</p></div>}
  </div>;
}

export function EventBeginnerFields({ event, onChange }: { event: ClanEventInput; onChange: (value: ClanEventInput) => void }) {
  return <div className="event-minimum-editor beginner-editor"><div className="minimum-heading"><Sprout size={22}/><div><h4>Een fijne eerste clanavond</h4><p>Beginnersvriendelijke activiteiten verschijnen op de homepage en bij Nieuw hier?.</p></div></div><label className="welcome-check"><input type="checkbox" checked={event.beginnerFriendly ?? false} onChange={e => onChange({ ...event, beginnerFriendly: e.target.checked })}/> Beginnersvriendelijk: er is ruimte om te leren en vragen te stellen</label>{event.beginnerFriendly && <div className="clan-event-form-grid"><label>Welke ervaring is nodig?<textarea required minLength={3} maxLength={300} rows={2} placeholder="Bijvoorbeeld: geen ervaring met deze boss nodig; uitleg vooraf." value={event.experience || ''} onChange={e => onChange({ ...event, experience: e.target.value })}/></label><label>Welke gear en voorbereiding?<textarea required minLength={3} maxLength={500} rows={3} placeholder="Vermeld uitrusting, levels, quests en benodigdheden. Ook als er niets bijzonders nodig is." value={event.gear || ''} onChange={e => onChange({ ...event, gear: e.target.value })}/></label></div>}</div>;
}
