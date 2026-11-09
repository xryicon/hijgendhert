"use client";
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Save, X } from 'lucide-react';
import { starterTiles, type BingoConfig, type BingoEvent, type BingoTile } from '@/lib/bingo';

const localInput = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export default function BingoEditor({ event, busy, error, onClose, onSave }: { event?: BingoEvent; busy: boolean; error: string; onClose: () => void; onSave: (config: BingoConfig) => Promise<void> }) {
  const modal = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(event?.title || 'Clanbingo');
  const [description, setDescription] = useState(event?.description || 'Twee teams. Samen grinden, samen winnen.');
  const [rules, setRules] = useState(event?.rules || 'Alleen voortgang tijdens het event telt. Deel bewijs met de clanleiding. De clanleiding controleert en verwerkt de stand. Bij gelijke punten delen de teams de eerste plaats.');
  const [start, setStart] = useState(localInput(event?.startsAt || new Date().toISOString()));
  const [end, setEnd] = useState(localInput(event?.endsAt || new Date(Date.now() + 7 * 86400000).toISOString()));
  const [teams, setTeams] = useState<[string, string]>(event?.teams || ['Team 1', 'Team 2']);
  const [tiles, setTiles] = useState<BingoTile[]>(event?.tiles.map(t => ({ ...t })) || Array.from({ length: 25 }, () => ({ title: '', description: '', target: 1, points: 1, category: 'other' })));
  const [localError, setLocalError] = useState('');
  const [template, setTemplate] = useState(false);
  useEffect(() => { modal.current?.showModal(); }, []);
  function tileChange(index: number, value: Partial<BingoTile>) { setTiles(old => old.map((tile, i) => i === index ? { ...tile, ...value } : tile)); }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLocalError('');
    if (teams[0].trim().toLowerCase() === teams[1].trim().toLowerCase()) { setLocalError('Geef de twee teams verschillende namen.'); return; }
    if (new Date(end).getTime() <= new Date(start).getTime()) { setLocalError('De eindtijd moet na de starttijd liggen.'); return; }
    if (step === 0) { setStep(1); modal.current?.scrollTo({ top: 0 }); return; }
    await onSave({ title, description, rules, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), teams, tiles });
  }
  return <dialog ref={modal} className="bingo-dialog bingo-editor" aria-labelledby="bingo-editor-title" onCancel={e => { if (busy) e.preventDefault(); else onClose(); }}><div className="bingo-dialog-heading"><div><span className="mini-label">{event ? 'CONCEPT AANPASSEN' : 'EEN NIEUW CLANAVONTUUR'}</span><h2 id="bingo-editor-title">{step === 0 ? 'Maak het jullie bingo.' : 'Vul het speelveld.'}</h2></div><button className="bingo-icon-button" aria-label="Bingobeheer sluiten" onClick={onClose} disabled={busy}><X size={21}/></button></div>
    <div className="bingo-steps"><span className={step === 0 ? 'current' : 'done'}><i>{step ? <Check size={12}/> : '1'}</i> Event & teams</span><span className={step === 1 ? 'current' : ''}><i>2</i> De 25 doelen</span></div>
    <form onSubmit={submit}><fieldset disabled={busy} className="bingo-fields">
      {step === 0 ? <div className="bingo-setup-grid"><label className="wide">Naam van het event<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={100}/></label><label className="wide">Korte omschrijving<textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={2}/></label><label>Team 1<input value={teams[0]} onChange={e => setTeams([e.target.value, teams[1]])} required maxLength={35}/></label><label>Team 2<input value={teams[1]} onChange={e => setTeams([teams[0], e.target.value])} required maxLength={35}/></label><label>Start<input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} required/></label><label>Einde<input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} required/></label><p className="bingo-input-note wide">Vul tijden in volgens de tijdzone van je apparaat. Op de website tonen we Nederlandse tijd.</p><label className="wide">Spelregels<textarea value={rules} onChange={e => setRules(e.target.value)} maxLength={3000} rows={4}/></label><div className="bingo-setup-note wide"><Check size={18}/><p>Je slaat eerst een concept op. Daarna kun je het bord controleren en publiceren. Beide teams spelen met dezelfde doelen.</p></div></div> : <><div className="bingo-template-bar"><div><strong>25 vakjes, jullie doelen.</strong><p>Stel per tegel een doel en punten in. Punten tellen pas als de tegel helemaal af is.</p></div><button type="button" className="button outline" disabled={tiles.some(t => t.title.trim())} onClick={() => { setTiles(starterTiles.map(t => ({ ...t }))); setTemplate(true); }}><Copy size={14}/> Vul met voorbeelden</button></div>{template && <p className="bingo-template-note">Voorbeeldtaken ingevuld — pas ze aan jullie niveaus en afspraken aan voordat je publiceert.</p>}<div className="bingo-tile-editor">{tiles.map((tile, index) => <div className="bingo-edit-tile" key={index}><span className="bingo-tile-index">{String(index + 1).padStart(2, '0')}</span><label>Doel {index + 1}<input value={tile.title} onChange={e => tileChange(index, { title: e.target.value })} placeholder="Bijvoorbeeld: tien Scurrius-kills" maxLength={80} required/></label><div className="bingo-tile-fields"><label>Aantal<input type="number" value={tile.target} onChange={e => tileChange(index, { target: Number(e.target.value) })} min={1} max={100000000} required/></label><label>Punten<input type="number" value={tile.points} onChange={e => tileChange(index, { points: Number(e.target.value) })} min={1} max={1000} required/></label><label>Categorie<select value={tile.category} onChange={e => tileChange(index, { category: e.target.value as BingoTile['category'] })}><option value="boss">Bossing</option><option value="drop">Drop / pet</option><option value="skill">Skilling</option><option value="other">Overig</option></select></label></div><label className="bingo-tile-description">Toelichting<textarea value={tile.description} onChange={e => tileChange(index, { description: e.target.value })} maxLength={350} rows={2} placeholder="Wat telt mee? Welk bewijs is nodig?"/></label></div>)}</div></>}
      {(error || localError) && <p className="bingo-error" role="alert">{localError || error}</p>}
      <div className="bingo-editor-actions">{step === 1 ? <button type="button" className="text-link" onClick={() => { setStep(0); setLocalError(''); modal.current?.scrollTo({ top: 0 }); }}><ArrowLeft size={15}/> Terug</button> : <span>5 × 5 bord · precies 2 teams</span>}<button className="button gold" type="submit">{busy ? 'Opslaan…' : step === 0 ? <>Naar de doelen <ArrowRight size={16}/></> : <>Concept opslaan <Save size={15}/></>}</button></div>
    </fieldset></form>
  </dialog>;
}
