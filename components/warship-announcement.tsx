'use client';
import { useEffect, useRef, useState } from 'react';
import { Anchor, ArrowRight, CalendarClock, Flag, LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import type { WarshipView } from '@/lib/warships';
import { REVEAL_INTRO_MS, REVEAL_STEP_MS, REVEAL_SPIN_MS } from '@/lib/warship-reveal';
import ClanCrest from './clan-crest';

function useServerClock(serverTime: string, moving: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const anchor = useRef({ snapshot: serverTime, at: Date.parse(serverTime), received: 0 });
  useEffect(() => {
    anchor.current = { snapshot: serverTime, at: Date.parse(serverTime), received: performance.now() }; setElapsed(0);
    const timer = setInterval(() => setElapsed(performance.now() - anchor.current.received), moving ? 100 : 1000);
    return () => clearInterval(timer);
  }, [serverTime, moving]);
  return anchor.current.snapshot === serverTime ? anchor.current.at + elapsed : Date.parse(serverTime);
}
function LiveWheel({ game, now }: { game: WarshipView; now: number }) {
  const r = game.reveal!;
  const current = r.current;
  const [reduced, setReduced] = useState(false);
  useEffect(() => { const q = window.matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(q.matches); update(); q.addEventListener('change', update); return () => q.removeEventListener('change', update); }, []);
  const slotAt = Date.parse(r.at) + REVEAL_INTRO_MS + r.index * REVEAL_STEP_MS;
  const t = Math.max(0, Math.min(1, (now - slotAt) / REVEAL_SPIN_MS));
  const index = r.pool.findIndex(p => p.id === current?.id);
  const stop = index < 0 ? 0 : (360 - (index + .5) * 360 / r.pool.length) % 360;
  const previous = r.revealed[r.index - 1];
  const previousIndex = r.pool.findIndex(p => p.id === previous?.id);
  const previousStop = previousIndex < 0 ? 0 : (360 - (previousIndex + .5) * 360 / r.pool.length) % 360;
  const base = Math.max(0, r.index) * 1800 + previousStop;
  const target = (Math.max(0, r.index) + 1) * 1800 + stop;
  const rotation = reduced ? target : base + (target - base) * (1 - (1 - t) ** 3);
  const point = (angle: number) => [160 + Math.cos(angle * Math.PI / 180) * 148, 160 + Math.sin(angle * Math.PI / 180) * 148];
  return <div className="sea-live-draw"><div className="sea-wheel-wrap"><span className="sea-wheel-pointer"/><svg className="sea-draw-wheel sea-live-wheel" viewBox="0 0 320 320" style={{ transform: `rotate(${rotation}deg)` }} role="img" aria-label="Live onthulling van de teamindeling"><circle cx="160" cy="160" r="156" className="sea-wheel-rim"/>{r.pool.map((p, i) => { const a = i * 360 / r.pool.length - 90, b = (i + 1) * 360 / r.pool.length - 90, [x, y] = point(a), [u, v] = point(b); return <g key={p.id}><path className={`${i % 2 ? 'alternate' : ''} ${p.id === current?.id && t >= 1 ? 'landed' : ''}`} d={`M160 160 L${x} ${y} A148 148 0 ${b - a > 180 ? 1 : 0} 1 ${u} ${v} Z`}/>{r.pool.length <= 24 && <text x="252" y="164" transform={`rotate(${(a + b) / 2},160,160)`}>{p.rsn.slice(0, 12)}</text>}</g>; })}<circle cx="160" cy="160" r="40" className="sea-wheel-hub"/></svg><Anchor className="sea-wheel-anchor" size={34}/></div><div className="sea-live-draw-copy"><span className="sea-on-air"><i/> DE ONTHULLING IS LIVE</span><small>{current ? `${current.captain ? 'KAPITEIN' : 'BEMANNING'} · ${game.teams[current.team].name}` : r.index < 0 ? 'BEIDE VLOTEN VERZAMELEN' : 'DE TEAMS STAAN KLAAR'}</small><h2 aria-live="polite">{current ? t >= 1 ? current.rsn : 'Het rad draait…' : r.index < 0 ? 'Het moment is daar.' : 'Welkom aan boord.'}</h2><p>{current && t >= 1 ? `${current.rsn} vaart mee met ${game.teams[current.team].name}.` : 'Iedereen volgt dezelfde onthulling. Vernieuwen of later aansluiten verandert de uitslag niet.'}</p><span className="sea-reveal-progress">{r.revealed.length} / {r.count} spelers bekend</span></div></div>;
}
export default function WarshipAnnouncement({ game, onBoard, onCrew }: { game: WarshipView; onBoard: () => void; onCrew: () => void }) {
  const r = game.reveal;
  const now = useServerClock(game.serverTime, r?.phase === 'drawing');
  if (!r) return null;
  if (r.phase === 'open') return <section className="sea-team-arrival"><span className="sea-arrival-emblem"><Flag size={30}/></span><div><small>DE TEAMGEBIEDEN ZIJN OPEN</small><h2>{game.myTeam !== null ? `Welkom bij ${game.teams[game.myTeam].name}` : 'De vloten zijn verdeeld'}</h2><p>{game.myTeam !== null ? `${game.linkedPlayer?.rsn || 'Jij'} hoort bij deze bemanning. Jullie eigen vloot is alleen voor jullie team zichtbaar.` : game.signedIn ? 'Laat staff je RuneScape-naam aan je Discordaccount koppelen om jouw vloot te openen.' : 'Log in met Discord om jouw team te bekijken.'}</p></div>{game.myTeam !== null ? <button type="button" className="button gold" onClick={onBoard}>Naar jouw vloot <ArrowRight size={16}/></button> : game.signedIn ? <button className="button gold" onClick={onCrew}>Koppel jouw naam</button> : <a className="button gold" href="/login">Inloggen met Discord</a>}</section>;
  const seconds = Math.max(0, Math.ceil((Date.parse(r.at) - now) / 1000));
  const units = [{ value: Math.floor(seconds / 86400), label: 'dagen' }, { value: Math.floor(seconds / 3600) % 24, label: 'uren' }, { value: Math.floor(seconds / 60) % 60, label: 'minuten' }, { value: seconds % 60, label: 'seconden' }];
  return <section className={`sea-prelude ${r.phase === 'drawing' ? 'is-drawing' : ''}`} aria-label="Zeeslag aankondiging"><div className="sea-prelude-grain" aria-hidden="true"/><div className="sea-prelude-heading"><ClanCrest className="sea-announcement-crest"/><p className="eyebrow">HIJGEND HERT · {game.config.title}</p><h1>{r.headline}</h1><p>{r.message}</p></div>
    {r.phase === 'countdown' ? <><div className="sea-launch-countdown" role="timer" aria-label="Tijd tot de onthulling">{units.map(unit => <div key={unit.label}><strong>{String(unit.value).padStart(2, '0')}</strong><span>{unit.label}</span></div>)}</div><p className="sea-reveal-date"><CalendarClock size={16}/>{new Date(r.at).toLocaleString('nl-NL', { dateStyle: 'full', timeStyle: 'short' })}<small>jouw lokale tijd</small></p></> : game.signedIn ? <LiveWheel game={game} now={now}/> : <div className="sea-guest-reveal"><Anchor size={40}/><h2>De onthulling is begonnen</h2><p>Log in om de kapiteins en hun bemanning live te zien.</p><a href="/login" className="button gold">Inloggen met Discord</a></div>}
    <div className="sea-prelude-bottom"><span><Users size={16}/>{r.count} deelnemers</span><span><LockKeyhole size={15}/>Vloten openen na de onthulling</span>{game.linkedPlayer ? <span><ShieldCheck size={16}/>{game.linkedPlayer.rsn} · account gekoppeld</span> : game.signedIn ? <button className="sea-text-button" type="button" onClick={onCrew}>Koppel alvast jouw RuneScape-naam →</button> : <a className="sea-text-button" href="/login">Log alvast in met Discord →</a>}</div>
    {r.revealed.length > 0 && <div className="sea-announced-crews">{([0, 1] as const).map(team => <section key={team}><h3>{game.teams[team].name}</h3><div>{r.revealed.filter(p => p.team === team).map(p => <span key={p.id}>{p.captain && <Flag size={13}/>}<b>{p.rsn}</b>{p.captain && <small>Kapitein</small>}</span>)}</div></section>)}</div>}
  </section>;
}
