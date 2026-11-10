"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Search, Shield, Users } from 'lucide-react';
import { z } from 'zod';
import { raffleNameKey } from '@/lib/raffle-types';
import { WOM_FAILURE_RETRY_SECONDS } from '@/lib/wom-refresh';
import MemberAvatar from './member-avatar';

const playerSchema = z.object({ id: z.number().int().positive(), username: z.string().min(1).max(30), displayName: z.string().min(1).max(30), type: z.string().max(40).optional() });
const groupSchema = z.object({ id: z.literal(7059), memberships: z.array(z.object({ player: playerSchema })).max(2000) });
type Player = z.infer<typeof playerSchema>;
const savedSchema = z.object({ players: z.array(playerSchema).max(2000), fetchedAt: z.string() });
const savedKey = 'hh-wom-roster-v1';

// One shared roster request per form, never a provider request per keystroke.
// This contains public WOM names only; it never establishes membership/access.
export function useRaffleRoster(enabled: boolean) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [message, setMessage] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(0);
  const lastRoster = useRef<Player[]>([]);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const controller = new AbortController();
    try {
      const cached = savedSchema.safeParse(JSON.parse(localStorage.getItem(savedKey) || 'null'));
      const age = cached.success ? Date.now() - Date.parse(cached.data.fetchedAt) : NaN;
      if (cached.success && age >= 0 && age < 7 * 86400_000) {
        lastRoster.current = cached.data.players; setPlayers(cached.data.players);
        setMessage('Opgeslagen clanlijst. De actuele namen worden opgehaald.');
      }
    } catch { /* Storage is optional. */ }
    async function load() {
      setLoading(true);
      let serverWait = false;
      try {
        const response = await fetch('/api/clan?resource=group', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]) });
        if (!response.ok) {
          const wait = Number(response.headers.get('Retry-After'));
          serverWait = true;
          setRetryAt(Date.now() + (Number.isFinite(wait) && wait > 0 ? wait * 1000 : WOM_FAILURE_RETRY_SECONDS * 1000));
          throw new Error('unavailable');
        }
        const result = await response.json() as { data: unknown; stale?: boolean; fetchedAt?: string };
        const group = groupSchema.parse(result.data);
        const roster = [...new Map(group.memberships.map(({ player }) => [player.id, player])).values()].sort((a, b) => a.displayName.localeCompare(b.displayName, 'nl'));
        if (controller.signal.aborted) return;
        lastRoster.current = roster; setPlayers(roster); setRetryAt(0);
        setMessage(result.stale ? 'Laatst bekende clanlijst van Wise Old Man.' : 'Clanleden van Hijgend Hert op Wise Old Man.');
        try { localStorage.setItem(savedKey, JSON.stringify({ players: roster, fetchedAt: result.fetchedAt || new Date().toISOString() })); } catch { /* Names remain usable without storage. */ }
      } catch {
        if (!controller.signal.aborted) {
          if (!serverWait) setRetryAt(Date.now() + WOM_FAILURE_RETRY_SECONDS * 1000);
          setMessage(lastRoster.current.length ? 'Wise Old Man is even niet bereikbaar. Je kunt de opgeslagen clanlijst gebruiken.' : 'Wise Old Man is even niet bereikbaar. Je kunt een RuneScape-naam handmatig invullen.');
        }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [enabled, attempt]);
  useEffect(() => {
    if (!retryAt) return;
    setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  return { players, loading, message, retryAt, canRetry: !loading && (!retryAt || now >= retryAt), retry: () => { if (Date.now() >= retryAt) setAttempt(value => value + 1); } };
}

export function RafflePlayerPicker({ name, index, players, loading, usedNames, onChange }: {
  name: string; index: number; players: Player[]; loading: boolean; usedNames: string[]; onChange: (name: string) => void;
}) {
  const id = useId(); const [open, setOpen] = useState(false); const [highlight, setHighlight] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const query = raffleNameKey(name);
  const selected = players.find(player => raffleNameKey(player.displayName) === query || raffleNameKey(player.username) === query);
  const used = new Set(usedNames.map(raffleNameKey));
  const results = players.filter(player => !used.has(raffleNameKey(player.displayName)) && (!query || raffleNameKey(player.displayName).includes(query) || raffleNameKey(player.username).includes(query))).slice(0, 7);
  const active = Math.min(highlight, Math.max(0, results.length - 1));
  useEffect(() => {
    if (open) list.current?.children.item(active)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, name]);
  const choose = (player: Player) => { onChange(player.displayName); setOpen(false); setHighlight(0); };
  return <div className={`raffle-player-picker${selected ? ' has-player' : ''}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <div className="raffle-player-input"><Search size={15} aria-hidden="true"/><input
      role="combobox" aria-label={`Naam deelnemer ${index + 1}`} aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && results.length ? `${id}-option-${active}` : undefined}
      value={name} autoComplete="off" maxLength={30} placeholder={loading && !players.length ? 'Namen ophalen…' : 'Zoek een clanlid…'} required
      onFocus={() => { setOpen(true); setHighlight(0); }} onChange={event => { onChange(event.target.value); setOpen(true); setHighlight(0); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setHighlight(value => Math.max(0, Math.min(results.length - 1, value + (event.key === 'ArrowDown' ? 1 : -1)))); }
        else if (event.key === 'Enter' && open) { event.preventDefault(); if (results[active]) choose(results[active]); else setOpen(false); }
      }}/>{selected ? <Check size={15} className="raffle-player-check" aria-label="Naam uit Wise Old Man"/> : <ChevronDown size={14} aria-hidden="true"/>}</div>
    {open && <div className="raffle-player-menu"><div className="raffle-player-menu-title">HIJGEND HERT · WISE OLD MAN</div><ul ref={list} id={`${id}-list`} role="listbox" aria-label="Clanleden">{results.map((player, option) => <li id={`${id}-option-${option}`} key={player.id} role="option" aria-selected={active === option} onPointerDown={event => event.preventDefault()} onClick={() => choose(player)}>
      <MemberAvatar playerId={player.id} name={player.displayName} className="raffle-player-avatar" fallback={player.type && player.type !== 'regular' ? <Shield size={14}/> : <Users size={14}/>}/><span><strong>{player.displayName}</strong><small>{player.type && player.type !== 'regular' ? 'Ironman' : 'Clanspeler'}</small></span>{selected?.id === player.id && <Check size={14}/>}
    </li>)}</ul>{!results.length && <p>{loading ? 'De clanlijst wordt opgehaald…' : players.length ? 'Geen ander clanlid gevonden. Controleer de naam of vul hem handmatig in.' : 'Vul de RuneScape-naam handmatig in zolang de clanlijst niet beschikbaar is.'}</p>}</div>}
  </div>;
}
