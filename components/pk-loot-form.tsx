'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Coins, Plus } from 'lucide-react';
import { gpText, type PkPlayer } from '@/lib/pk';
import { parsePkGp } from '@/lib/pk-gp';

export default function PkLootForm({ players, playerId, focusToken, onSelect, active, busy, onSave }: { players: PkPlayer[]; playerId: number | null; focusToken: number; onSelect: (id: number) => void; active: number; busy: boolean; onSave: (playerId: number, gp: number) => Promise<boolean> }) {
  const [amount, setAmount] = useState(''); const input = useRef<HTMLInputElement>(null);
  const value = parsePkGp(amount), player = players.find(p => p.id === playerId);
  useEffect(() => { if (playerId !== null && !busy) input.current?.focus(); }, [playerId, focusToken, busy]);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!player || value === null) return;
    if (await onSave(player.id, value)) { setAmount(''); input.current?.focus(); }
  }
  return <form className="pk-drop-form pk-key-form" onSubmit={submit}><fieldset disabled={busy || !active}>
    <div className="pk-key-heading"><Coins size={17}/><strong>Key toevoegen</strong></div>
    <p className="pk-key-hint">Klik de speler aan die deze loot heeft gepakt.</p>
    <div className="pk-loot-owners" role="group" aria-label="Van wie is deze key?">{players.map(p => <button type="button" key={p.id} aria-pressed={p.id === playerId} onClick={() => onSelect(p.id)}>{p.name}</button>)}</div>
    <div className="pk-drop-inputs"><label className="pk-field" htmlFor="pk-key-amount">{player ? `GP gepakt door ${player.name}` : 'Bedrag van deze key'}<div className="pk-gp-input"><input ref={input} id="pk-key-amount" required type="text" inputMode="text" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={32} placeholder="Bijv. 250k of 2,5m" value={amount} onChange={e => setAmount(e.target.value)} aria-describedby="pk-key-preview" aria-invalid={!!amount.trim() && value === null}/><span>GP</span></div></label><button className="pk-button primary" disabled={!player || value === null} type="submit"><Plus size={16}/> {busy ? 'Opslaan…' : 'Key toevoegen'}</button></div>
    <p id="pk-key-preview" className={`pk-split-preview${amount.trim() && value === null ? ' invalid' : ''}`}>{!active ? 'Er zijn geen actieve spelers. Hervat een speler voordat je een key toevoegt.' : amount.trim() && value === null ? 'Gebruik hele GP, k of m. Bijvoorbeeld 250k, 2.5m of 2,5m (maximaal 100.000m).' : value !== null ? `${gpText(value)} GP totaal · ${gpText(Math.floor(value / active))} GP per actieve speler · ${gpText(value % active)} GP rest` : 'k = duizend · m = miljoen · één invoer is één key.'}</p>
  </fieldset></form>;
}
