'use client';
import { useEffect, useRef, useState } from 'react';
import { Anchor, ArrowRight, CalendarClock, Flag, LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import type { WarshipView } from '@/lib/warships';
import WarshipLiveReveal from './warship-live-reveal';
import ClanCrest from './clan-crest';
import WarshipTheater from './warship-theater';

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
export default function WarshipAnnouncement({ game, onBoard, onCrew, theater = false }: { game: WarshipView; onBoard: () => void; onCrew: () => void; theater?: boolean }) {
  const r = game.reveal;
  const now = useServerClock(game.serverTime, r?.phase === 'drawing');
  if (!r) return null;
  if (r.phase === 'drawing' && game.signedIn) return theater
    ? <WarshipTheater game={game} onExit={onCrew}><WarshipLiveReveal game={game} now={now}/></WarshipTheater>
    : <section className="sea-reveal-resume"><div><span className="sea-on-air"><i/> LIVE ONTHULLING</span><h2>De vloten worden verdeeld</h2><p>{r.revealed.length} van {r.count} spelers onthuld</p></div><button className="button gold" onClick={onBoard}>Bekijk de onthulling <ArrowRight size={16}/></button></section>;
  if (r.phase === 'open') return <section className="sea-team-arrival"><span className="sea-arrival-emblem"><Flag size={30}/></span><div><small>DE TEAMGEBIEDEN ZIJN OPEN</small><h2>{game.myTeam !== null ? `Welkom bij ${game.teams[game.myTeam].name}` : 'De vloten zijn verdeeld'}</h2><p>{game.myTeam !== null ? `${game.linkedPlayer?.rsn || 'Jij'} hoort bij deze bemanning. Jullie eigen vloot is alleen voor jullie team zichtbaar.` : game.signedIn ? 'Geen unieke naamovereenkomst gevonden. Kies bij Bemanning je RuneScape-naam voor een koppeling via staff.' : 'Log in met Discord om jouw team te bekijken.'}</p></div>{game.myTeam !== null ? <button type="button" className="button gold" onClick={onBoard}>Naar jouw vloot <ArrowRight size={16}/></button> : game.signedIn ? <button className="button gold" onClick={onCrew}>Koppel jouw naam</button> : <a className="button gold" href="/login">Inloggen met Discord</a>}</section>;
  const seconds = Math.max(0, Math.ceil((Date.parse(r.at) - now) / 1000));
  const units = [{ value: Math.floor(seconds / 86400), label: 'dagen' }, { value: Math.floor(seconds / 3600) % 24, label: 'uren' }, { value: Math.floor(seconds / 60) % 60, label: 'minuten' }, { value: seconds % 60, label: 'seconden' }];
  return <section className={`sea-prelude ${r.phase === 'drawing' ? 'is-drawing' : ''}`} aria-label="Zeeslag aankondiging"><div className="sea-prelude-grain" aria-hidden="true"/><div className="sea-prelude-heading"><ClanCrest className="sea-announcement-crest"/><p className="eyebrow">HIJGEND HERT · {game.config.title}</p><h1>{r.headline}</h1><p>{r.message}</p></div>
    {r.phase === 'countdown' ? <><div className="sea-launch-countdown" role="timer" aria-label="Tijd tot de onthulling">{units.map(unit => <div key={unit.label}><strong>{String(unit.value).padStart(2, '0')}</strong><span>{unit.label}</span></div>)}</div><p className="sea-reveal-date"><CalendarClock size={16}/>{new Date(r.at).toLocaleString('nl-NL', { dateStyle: 'full', timeStyle: 'short' })}<small>jouw lokale tijd</small></p></> : game.signedIn ? <WarshipLiveReveal game={game} now={now}/> : <div className="sea-guest-reveal"><Anchor size={40}/><h2>De onthulling is begonnen</h2><p>Log in om de kapiteins en hun bemanning live te zien.</p><a href="/login" className="button gold">Inloggen met Discord</a></div>}
    <div className="sea-prelude-bottom"><span><Users size={16}/>{r.count} deelnemers</span><span><LockKeyhole size={15}/>Vloten openen na de onthulling</span>{game.linkedPlayer ? <span><ShieldCheck size={16}/>{game.linkedPlayer.rsn} · account gekoppeld</span> : game.signedIn ? <button className="sea-text-button" type="button" onClick={onCrew}>Koppel alvast jouw RuneScape-naam →</button> : <a className="sea-text-button" href="/login">Log alvast in met Discord →</a>}</div>

  </section>;
}
