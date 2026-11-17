'use client';
import { useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Check, Plus, Trash2 } from 'lucide-react';
import { seaRulesSchema, type SeaRule } from '@/lib/warship-intro';
import type { WarshipView } from '@/lib/warships';

export default function WarshipIntroEditor({ game, busy, act }: { game: WarshipView; busy: boolean; act: (type: string, fields?: Record<string, unknown>) => Promise<boolean> }) {
  const [rules, setRules] = useState<SeaRule[]>(game.briefingRules);
  const [baseline, setBaseline] = useState(JSON.stringify(game.briefingRules));
  const [error, setError] = useState(''), [saved, setSaved] = useState(false);
  if (!game.canManage) return null;
  const locked = !['draft', 'setup'].includes(game.status) || !!game.reveal && game.reveal.phase !== 'countdown';
  const disabled = busy || !game.canEditRules || locked;
  const conflict = baseline !== JSON.stringify(game.briefingRules);
  const update = (id: string, patch: Partial<SeaRule>) => { setRules(value => value.map(r => r.id === id ? { ...r, ...patch } : r)); setSaved(false); };
  const move = (index: number, direction: number) => { const next = [...rules]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; setRules(next); setSaved(false); };
  const seconds = rules.reduce((sum, r) => sum + r.seconds, 0);
  async function save() {
    setError('');
    const parsed = seaRulesSchema.safeParse(rules);
    if (!parsed.success) { setError('Vul iedere titel en regel in. Kies per regel 8 tot 45 seconden.'); return; }
    if (conflict) { setError('Een andere admin heeft de regels aangepast. Laad eerst de opgeslagen versie.'); return; }
    if (await act('set_briefing', { rules: parsed.data })) { setRules(parsed.data); setBaseline(JSON.stringify(parsed.data)); setSaved(true); }
  }
  return <details className="sea-intro-editor"><summary><BookOpen size={19}/><span>Introductieregels<small>{rules.length} regels · alleen admins kunnen bewerken</small></span><span>Bewerken</span></summary><div className="sea-intro-editor-body"><div className="sea-section-heading"><div><small>DE BRIEFING · ALLEEN ADMINS</small><h2><BookOpen size={22}/> Jullie spelregels</h2><p>Schrijf de kaarten die vóór de bosses, drops en teams verschijnen. De volgorde hieronder is de volgorde op het scherm.</p></div><span className="sea-editor-duration">{Math.floor(seconds / 60)}m {seconds % 60}s<small>leestijd</small></span></div>
    {(!game.canEditRules || locked) && <p className="sea-note">{locked ? 'De introductie is begonnen of het event is afgesloten. Deze regels liggen vast.' : 'Alleen de Discord-rol Admin kan deze regels wijzigen.'}</p>}
    <div className="sea-rule-edit-list">{rules.map((rule, index) => <article key={rule.id}><header><span>{String(index + 1).padStart(2, '0')}</span><strong>Spelregel {index + 1}</strong><div><button type="button" className="sea-icon-button" aria-label={`Regel ${index + 1} omhoog`} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp size={15}/></button><button type="button" className="sea-icon-button" aria-label={`Regel ${index + 1} omlaag`} disabled={disabled || index + 1 === rules.length} onClick={() => move(index, 1)}><ArrowDown size={15}/></button><button type="button" className="sea-icon-button" aria-label={`Regel ${index + 1} verwijderen`} disabled={disabled || rules.length <= 1} onClick={() => { setRules(rules.filter(r => r.id !== rule.id)); setSaved(false); }}><Trash2 size={15}/></button></div></header><div className="sea-rule-edit-fields"><label>Titel<input required maxLength={80} value={rule.title} disabled={disabled} onChange={e => update(rule.id, { title: e.target.value })}/></label><label>Seconden in beeld<input required type="number" min={8} max={45} value={rule.seconds} disabled={disabled} onChange={e => update(rule.id, { seconds: Number(e.target.value) })}/></label><label>Regel<textarea required maxLength={360} value={rule.text} disabled={disabled} onChange={e => update(rule.id, { text: e.target.value })}/><small>{rule.text.length}/360 tekens</small></label></div></article>)}</div>
    {game.canEditRules && !locked && <><div className="sea-buttons"><button type="button" className="button outline" disabled={disabled || rules.length >= 12} onClick={() => { setRules([...rules, { id: crypto.randomUUID(), title: '', text: '', seconds: 12 }]); setSaved(false); }}><Plus size={16}/> Regel toevoegen</button><button type="button" className="button gold" disabled={disabled || conflict} onClick={() => void save()}>Spelregels opslaan</button></div><p className="sea-note">De bosses en drops komen uit de eventinstellingen en krijgen ieder 8 seconden. Opslaan werkt een geplande introductie bij, zonder de teams opnieuw te loten. De tekst verandert de spelmechaniek niet; schoten en limieten stel je bij de drops in.</p></>}
    {conflict && <p className="sea-error">De opgeslagen regels zijn gewijzigd. <button type="button" onClick={() => { setRules(game.briefingRules); setBaseline(JSON.stringify(game.briefingRules)); setSaved(false); setError(''); }}>Laad opgeslagen regels</button></p>}
    {error && <p className="sea-error" role="alert">{error}</p>}{saved && <p className="sea-success" role="status"><Check size={16}/> Spelregels opgeslagen.</p>}
  </div></details>;
}
