'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Anchor, ChevronLeft, ChevronRight, Crown, Shield, Swords } from 'lucide-react';
import type { WarshipView } from '@/lib/warships';
import ClanCrest from './clan-crest';
import MemberAvatar from './member-avatar';
import { seaRosterLayout } from '@/lib/warship-layout';

type RevealedPlayer = NonNullable<WarshipView['reveal']>['revealed'][number];
const ease = (value: number) => 1 - (1 - Math.max(0, Math.min(1, value))) ** 3;

function RevealSide({ game, team, placed, current }: { game: WarshipView; team: 0 | 1; placed: RevealedPlayer[]; current: RevealedPlayer | null }) {
  const r = game.reveal!, people = placed.filter(p => p.team === team);
  const pending = current?.team === team && !people.some(p => p.id === current.id) ? current : null;
  const total = placed.length === r.count ? people.length : Math.max(Math.ceil(r.count / 2), people.length + Number(!!pending));
  const cards = [...people, ...(pending ? [pending] : [])];
  const grid = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 300, height: 300 });
  const [browse, setBrowse] = useState({ player: 0, page: 0 });
  useLayoutEffect(() => {
    if (!grid.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(grid.current); return () => observer.disconnect();
  }, []);
  const layout = seaRosterLayout(size.width, size.height, total);
  const selected = current?.team === team ? current.id : people.at(-1)?.id || 0;
  const selectedIndex = cards.findIndex(p => p.id === selected);
  const autoPage = Math.floor(Math.max(0, selectedIndex) / layout.capacity);
  const page = Math.min(layout.pages - 1, browse.player === selected ? browse.page : autoPage);
  return <section className={`sea-loading-side sea-side-${team}`} aria-label={game.teams[team].name}>
    <header><ClanCrest className="sea-team-standard"/><div><small>{team === 0 ? 'VLOOT I' : 'VLOOT II'}</small><h3>{game.teams[team].name}</h3><span>{people.length} aan boord</span></div></header>
    <div ref={grid} className="sea-loading-roster" style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0,1fr))`, gridTemplateRows: `repeat(${layout.rows}, minmax(0,1fr))` }}>
      {Array.from({ length: Math.min(layout.capacity, total - page * layout.capacity) }, (_, i) => {
        const p = cards[page * layout.capacity + i];
        return p ? <article key={p.id} data-sea-player={p.id} className={`sea-loading-card${p.captain ? ' is-captain' : ''}${p.id === pending?.id ? ' is-pending' : ''}`} aria-hidden={p.id === pending?.id || undefined}>
          <span className="sea-loading-portrait"><MemberAvatar playerId={p.id} name={p.rsn}/></span>
          <div><small>{p.captain ? <><Crown size={10}/> KAPITEIN</> : 'BEMANNING'}</small><strong>{p.rsn}</strong></div><Shield className="sea-card-seal" size={18}/>
        </article> : <div className="sea-loading-slot" key={`slot-${i}`}><Shield size={16}/><span>Nog te onthullen</span></div>;
      })}
    </div>
    <div className="sea-roster-pagination"><div className="sea-roster-progress"><span style={{ width: `${total ? Math.min(100, people.length / total * 100) : 100}%` }}/></div>{layout.pages > 1 && <nav aria-label={`Spelerspagina van ${game.teams[team].name}`}><button aria-label="Vorige spelers" disabled={page === 0} onClick={() => setBrowse({ player: selected, page: page - 1 })}><ChevronLeft size={14}/></button><span>{page + 1} / {layout.pages}</span><button aria-label="Volgende spelers" disabled={page + 1 === layout.pages} onClick={() => setBrowse({ player: selected, page: page + 1 })}><ChevronRight size={14}/></button></nav>}</div>
  </section>;
}

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
    const measure = () => {
      const target = root.querySelector<HTMLElement>(`[data-sea-player="${current.id}"]`);
      const a = root.getBoundingClientRect(), s = focus.getBoundingClientRect(), t = target?.getBoundingClientRect() || s;
      const x = s.left + s.width / 2 - a.left, y = s.top + s.height / 2 - a.top;
      setFlight({ x, y, dx: t.left + t.width / 2 - a.left - x, dy: t.top + t.height / 2 - a.top - y, scale: Math.min(.65, t.width / Math.min(510, a.width - 24), t.height / 210) });
    };
    measure(); const resize = new ResizeObserver(measure); resize.observe(root); resize.observe(focus);
    const changes = new MutationObserver(measure); changes.observe(root, { childList: true, subtree: true });
    return () => { resize.disconnect(); changes.disconnect(); };
  }, [current?.id]);

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
      <RevealSide game={game} team={0} placed={placed} current={current}/>
      <div className="sea-match-stage" ref={stage}>
        <div className="sea-versus"><span/><Swords size={22}/><b>VS</b><span/></div>
        <div className={`sea-wheel-wrap sea-match-wheel${spotlight ? ' is-dimmed' : ''}`}><span className="sea-wheel-pointer"/><svg className="sea-draw-wheel sea-live-wheel" viewBox="0 0 320 320" style={{ transform: `rotate(${rotation}deg)` }} role="img" aria-label="Rad voor de live teamonthulling"><circle cx="160" cy="160" r="156" className="sea-wheel-rim"/>{r.pool.map((p, i) => { const a = i * 360 / r.pool.length - 90, b = (i + 1) * 360 / r.pool.length - 90, [x, y] = point(a), [u, v] = point(b); return <g key={p.id}><path className={`${i % 2 ? 'alternate' : ''} ${p.id === current?.id && spin >= 1 ? 'landed' : ''}`} d={`M160 160 L${x} ${y} A148 148 0 ${b - a > 180 ? 1 : 0} 1 ${u} ${v} Z`}/>{r.pool.length <= 24 && <text x="252" y="164" transform={`rotate(${(a + b) / 2},160,160)`}>{p.rsn.slice(0, 12)}</text>}</g>; })}<circle cx="160" cy="160" r="40" className="sea-wheel-hub"/></svg><Anchor className="sea-wheel-anchor" size={32}/></div>
        <div className="sea-match-cue" aria-live="polite"><small>{current ? current.captain ? 'EEN KAPITEIN STAAT OP' : 'DE BEMANNING GROEIT' : 'HIJGEND HERT · ZEESLAG'}</small><h2>{current ? slot < timing.spinMs ? 'Wie vaart er mee?' : current.rsn : r.index < 0 ? 'Twee vloten. Eén strijd.' : 'De teams staan klaar.'}</h2><p>{current && slot >= timing.spinMs ? `${game.teams[current.team].name} krijgt versterking.` : 'Samen jagen. Samen varen.'}</p></div>
      </div>
      <RevealSide game={game} team={1} placed={placed} current={current}/>
      {spotlight && <div className={`sea-name-spotlight sea-spotlight-${current!.team}${flying ? ' is-flying' : ''}`} key={current!.id} style={style} aria-hidden="true"><span className="sea-spotlight-ornament">{current!.captain ? <Crown size={30}/> : <Anchor size={30}/>}</span><small>{current!.captain ? 'JOUW KAPITEIN' : 'WELKOM AAN BOORD'}</small><strong>{current!.rsn}</strong><span className="sea-spotlight-team">{game.teams[current!.team].name}</span></div>}
    </div>
  </div>;
}
