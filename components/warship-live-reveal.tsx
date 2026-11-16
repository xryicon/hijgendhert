'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Anchor, Crown, Shield, Swords } from 'lucide-react';
import type { WarshipView } from '@/lib/warships';
import ClanCrest from './clan-crest';
import MemberAvatar from './member-avatar';

type RevealedPlayer = NonNullable<WarshipView['reveal']>['revealed'][number];
const ease = (value: number) => 1 - (1 - Math.max(0, Math.min(1, value))) ** 3;

export default function WarshipLiveReveal({ game, now }: { game: WarshipView; now: number }) {
  const r = game.reveal!, current = r.current, timing = r.timing;
  const slot = now - Date.parse(r.at) - timing.introMs - r.index * timing.stepMs;
  const departure = timing.spinMs + timing.spotlightMs, arrival = departure + timing.flightMs;
  const landed = slot >= arrival;
  const spotlight = !!current && slot >= timing.spinMs && !landed;
  const progress = timing.flightMs ? ease((slot - departure) / timing.flightMs) : 1;
  const spin = ease(slot / timing.spinMs);
  const [reduced, setReduced] = useState(false);
  const arena = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState({ x: 0, y: 0, dx: 0, dy: 0, scale: .4 });
  const placed = [...r.revealed];
  if (current && landed && !placed.some(p => p.id === current.id)) placed.push(current);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches); update();
    query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    const root = arena.current, focus = stage.current;
    if (!root || !focus || !current) return;
    const target = root.querySelector<HTMLElement>(`[data-sea-player="${current.id}"]`);
    if (!target) return;
    const list = target.parentElement;
    if (list) list.scrollTop = Math.max(0, target.offsetTop + target.offsetHeight - list.clientHeight);
    const measure = () => {
      const a = root.getBoundingClientRect(), s = focus.getBoundingClientRect(), t = target.getBoundingClientRect();
      const x = s.left + s.width / 2 - a.left, y = s.top + s.height / 2 - a.top;
      setFlight({ x, y, dx: t.left + t.width / 2 - a.left - x, dy: t.top + t.height / 2 - a.top - y, scale: Math.min(.65, t.width / Math.min(510, a.width - 24), t.height / 210) });
    };
    measure(); const resize = new ResizeObserver(measure); resize.observe(root); resize.observe(focus);
    list?.addEventListener('scroll', measure, { passive: true });
    return () => { resize.disconnect(); list?.removeEventListener('scroll', measure); };
  }, [current?.id]);

  const personCard = (p: RevealedPlayer, pending: boolean) => <article key={p.id} data-sea-player={p.id} className={`sea-loading-card${p.captain ? ' is-captain' : ''}${pending ? ' is-pending' : ''}`} aria-hidden={pending || undefined}>
    <span className="sea-loading-portrait"><MemberAvatar playerId={p.id} name={p.rsn}/></span>
    <div><small>{p.captain ? <><Crown size={12}/> KAPITEIN</> : 'BEMANNING'}</small><strong>{p.rsn}</strong><span>{p.captain ? 'Voert de vloot aan' : 'Klaar om uit te varen'}</span></div>
    <Shield className="sea-card-seal" size={18}/>
  </article>;
  const side = (team: 0 | 1) => {
    const people = placed.filter(p => p.team === team), pending = current?.team === team && !people.some(p => p.id === current.id) ? current : null;
    const empty = placed.length === r.count ? 0 : Math.max(0, Math.ceil(r.count / 2) - people.length - (pending ? 1 : 0));
    return <section className={`sea-loading-side sea-side-${team}`} aria-label={game.teams[team].name}>
      <header><ClanCrest className="sea-team-standard"/><small>{team === 0 ? 'DE EERSTE VLOOT' : 'DE TWEEDE VLOOT'}</small><h3>{game.teams[team].name}</h3><span>{people.length} aan boord</span></header>
      <div className="sea-loading-roster">{people.map(p => personCard(p, false))}{pending && personCard(pending, true)}{Array.from({ length: empty }, (_, i) => <div className="sea-loading-slot" key={`slot-${i}`}><Shield size={19}/><span>Wacht op de onthulling</span></div>)}</div>
      <footer><span style={{ width: `${placed.length === r.count ? 100 : Math.min(100, people.length / Math.ceil(r.count / 2) * 100)}%` }}/></footer>
    </section>;
  };
  const index = r.pool.findIndex(p => p.id === current?.id);
  const stop = index < 0 ? 0 : (360 - (index + .5) * 360 / r.pool.length) % 360;
  const previous = r.revealed[r.index - 1], previousIndex = r.pool.findIndex(p => p.id === previous?.id);
  const previousStop = previousIndex < 0 ? 0 : (360 - (previousIndex + .5) * 360 / r.pool.length) % 360;
  const base = Math.max(0, r.index) * 1440 + previousStop, target = (Math.max(0, r.index) + 1) * 1440 + stop;
  const rotation = reduced ? stop : base + (target - base) * spin;
  const point = (angle: number) => [160 + Math.cos(angle * Math.PI / 180) * 148, 160 + Math.sin(angle * Math.PI / 180) * 148];
  const flying = !reduced && slot >= departure;
  const pop = reduced ? 1 : .87 + .13 * ease((slot - timing.spinMs) / 400);
  const style: CSSProperties = { left: flight.x || '50%', top: flight.y || '50%', opacity: Math.min(1, Math.max(0, (slot - timing.spinMs) / 180)), transform: `translate(-50%, -50%) translate(${flying ? flight.dx * progress : 0}px, ${flying ? flight.dy * progress : 0}px) scale(${flying ? 1 + (flight.scale - 1) * progress : pop})` };
  return <div className="sea-match-reveal"><div className="sea-match-heading"><span className="sea-on-air"><i/> LIVE TEAMONTHULLING</span><span>{placed.length} / {r.count} spelers aan boord</span></div>
    <div className={`sea-loading-arena${spotlight ? ' has-spotlight' : ''}`} ref={arena}>
      {side(0)}
      <div className="sea-match-stage" ref={stage}>
        <div className="sea-versus"><span/><Swords size={22}/><b>VS</b><span/></div>
        <div className={`sea-wheel-wrap sea-match-wheel${spotlight ? ' is-dimmed' : ''}`}><span className="sea-wheel-pointer"/><svg className="sea-draw-wheel sea-live-wheel" viewBox="0 0 320 320" style={{ transform: `rotate(${rotation}deg)` }} role="img" aria-label="Rad voor de live teamonthulling"><circle cx="160" cy="160" r="156" className="sea-wheel-rim"/>{r.pool.map((p, i) => { const a = i * 360 / r.pool.length - 90, b = (i + 1) * 360 / r.pool.length - 90, [x, y] = point(a), [u, v] = point(b); return <g key={p.id}><path className={`${i % 2 ? 'alternate' : ''} ${p.id === current?.id && spin >= 1 ? 'landed' : ''}`} d={`M160 160 L${x} ${y} A148 148 0 ${b - a > 180 ? 1 : 0} 1 ${u} ${v} Z`}/>{r.pool.length <= 24 && <text x="252" y="164" transform={`rotate(${(a + b) / 2},160,160)`}>{p.rsn.slice(0, 12)}</text>}</g>; })}<circle cx="160" cy="160" r="40" className="sea-wheel-hub"/></svg><Anchor className="sea-wheel-anchor" size={32}/></div>
        <div className="sea-match-cue" aria-live="polite"><small>{current ? current.captain ? 'EEN KAPITEIN STAAT OP' : 'DE BEMANNING GROEIT' : 'HIJGEND HERT · ZEESLAG'}</small><h2>{current ? slot < timing.spinMs ? 'Wie vaart er mee?' : current.rsn : r.index < 0 ? 'Twee vloten. Eén strijd.' : 'De teams staan klaar.'}</h2><p>{current && slot >= timing.spinMs ? `${game.teams[current.team].name} krijgt versterking.` : 'Dezelfde loting. Hetzelfde moment. Voor de hele clan.'}</p></div>
      </div>
      {side(1)}
      {spotlight && <div className={`sea-name-spotlight sea-spotlight-${current!.team}${flying ? ' is-flying' : ''}`} key={current!.id} style={style} aria-hidden="true"><span className="sea-spotlight-ornament">{current!.captain ? <Crown size={30}/> : <Anchor size={30}/>}</span><small>{current!.captain ? 'JOUW KAPITEIN' : 'WELKOM AAN BOORD'}</small><strong>{current!.rsn}</strong><span className="sea-spotlight-team">{game.teams[current!.team].name}</span></div>}
    </div>
  </div>;
}
