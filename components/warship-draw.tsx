'use client';
import { useEffect, useMemo, useState } from 'react';
import { Anchor, Flag, RotateCw, SkipForward } from 'lucide-react';
import { teamBalance, type SeaTeamDraw } from '@/lib/warship-teams';
export const ehbText = (value: number | null) => value === null ? 'EHB onbekend' : `${value.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} EHB`;
export function TeamBalance({ players }: { players: SeaTeamDraw['players'] }) {
  const b = teamBalance(players);
  return <div className={`sea-balance ${b.missing || b.percent > 10 || Math.abs(b.sizes[0] - b.sizes[1]) > 1 ? 'needs-review' : ''}`}><strong>{b.missing ? `${b.missing} ontbrekende EHB-rating${b.missing > 1 ? 's' : ''}` : `${ehbText(b.gap)} verschil`}</strong><span>{b.sizes[0]} tegen {b.sizes[1]} spelers{!b.missing && ` · ${b.percent.toFixed(1).replace('.', ',')}% van het gemiddelde teamtotaal`}</span><p>{b.missing ? 'Het EHB-totaal is onvolledig. Beoordeel deze handmatige indeling zelf.' : b.percent > 10 ? 'Er blijft een duidelijk verschil. Bekijk de selectie en kapiteins voordat je bevestigt.' : 'EHB is een indicatie van bosservaring. Gear, speeltijd en ervaring per boss tellen niet mee.'}</p></div>;
}
export default function WarshipDraw({ draw, teams }: { draw: SeaTeamDraw; teams: [string, string] }) {
  const sequence = useMemo(() => [
    ...(draw.mode === 'random' ? [draw.players.find(p => p.captain && p.team === 0)!, draw.players.find(p => p.captain && p.team === 1)!] : []),
    ...draw.players.filter(p => !p.captain),
  ], [draw]);
  const [step, setStep] = useState(0), [playing, setPlaying] = useState(draw.mode !== 'manual');
  const [landed, setLanded] = useState(false), [rotation, setRotation] = useState(0);
  const chosen = sequence[step];
  const candidates = sequence.filter((_, i) => i >= step);
  useEffect(() => {
    if (!playing || !chosen) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setPlaying(false); return; }
    setLanded(false);
    const index = draw.players.findIndex(p => p.id === chosen.id);
    const stop = (360 - (index + .5) * 360 / draw.players.length) % 360;
    const frame = requestAnimationFrame(() => setRotation(previous => previous + 1440 + ((stop - previous % 360 + 360) % 360)));
    const land = setTimeout(() => setLanded(true), 1800);
    const next = setTimeout(() => { if (step + 1 >= sequence.length) setPlaying(false); else setStep(s => s + 1); }, 2600);
    return () => { cancelAnimationFrame(frame); clearTimeout(land); clearTimeout(next); };
  }, [playing, step, chosen?.id, draw.id, draw.players.length, sequence.length]);
  const point = (angle: number, radius: number) => [160 + Math.cos(angle * Math.PI / 180) * radius, 160 + Math.sin(angle * Math.PI / 180) * radius];
  const fullCircle = draw.players.length === 1;
  return <div className={`sea-draw-result${playing && sequence.length > 0 ? ' is-playing' : ''}`}>
    {draw.mode !== 'manual' && <section className="sea-draw-stage" aria-label="Teamloting"><div className="sea-wheel-wrap"><span className="sea-wheel-pointer"/><svg className="sea-draw-wheel" viewBox="0 0 320 320" role="img" aria-label="Rad dat de opgeslagen loting onthult" style={{ transform: `rotate(${rotation}deg)` }}><circle cx="160" cy="160" r="156" className="sea-wheel-rim"/>{draw.players.map((p, index) => { const start = index * 360 / draw.players.length - 90, end = (index + 1) * 360 / draw.players.length - 90, [x1, y1] = point(start, 148), [x2, y2] = point(end, 148); return <g key={p.id}><path d={fullCircle ? '' : `M160 160 L${x1} ${y1} A148 148 0 ${end - start > 180 ? 1 : 0} 1 ${x2} ${y2} Z`} className={`${index % 2 ? 'alternate' : ''} ${chosen?.id === p.id && landed ? 'landed' : ''}`}/>{draw.players.length <= 24 && <text x="252" y="164" transform={`rotate(${(start + end) / 2},160,160)`}>{p.rsn.slice(0, 12)}</text>}</g>; })}<circle cx="160" cy="160" r="40" className="sea-wheel-hub"/></svg><Anchor className="sea-wheel-anchor" size={34}/></div><div className="sea-draw-copy"><small>{playing && chosen ? chosen.captain ? `KAPITEIN · ${teams[chosen.team]}` : `BEMANNING · ${teams[chosen.team]}` : 'DE LOTING IS BEKEND'}</small><h3 aria-live="polite">{playing ? landed ? chosen?.rsn : 'Het rad draait…' : 'Twee vloten. Klaar voor de jacht.'}</h3><p>{playing ? `${candidates.length} namen nog te onthullen · ${step + 1}/${sequence.length}` : draw.mode === 'random' ? 'Kapiteins willekeurig geloot. De overige spelers zijn verdeeld op teamgrootte en EHB.' : 'Gekozen kapiteins. De overige spelers zijn verdeeld op teamgrootte en EHB.'}</p><div className="sea-buttons">{playing ? <button type="button" className="button outline" onClick={() => setPlaying(false)}><SkipForward size={16}/> Toon hele indeling</button> : <button type="button" className="sea-text-button" onClick={() => { setStep(0); setLanded(false); setPlaying(true); }}><RotateCw size={15}/> Speel dezelfde loting af</button>}</div><small className="sea-draw-explain">Het rad onthult de opgeslagen uitslag. Opnieuw afspelen verandert de teams niet.</small></div></section>}
    <div className="sea-draft-teams">{([0, 1] as const).map(t => { const members = draw.players.filter(p => p.team === t).sort((a, b) => Number(b.captain) - Number(a.captain) || (b.ehb ?? -1) - (a.ehb ?? -1)); return <section key={t} className={`sea-draft-team team-${t}`}><header><small>{teams[t]}</small><strong>{ehbText(members.reduce((sum, p) => sum + (p.ehb ?? 0), 0))}</strong><span>{members.length} spelers{members.some(p => p.ehb === null) ? ' · onvolledig totaal' : ''}</span></header>{members.map(p => <div key={p.id}><span>{p.captain && <Flag size={15}/>}<b>{p.rsn}</b>{p.captain && <small>Kapitein</small>}</span><span>{ehbText(p.ehb)}</span></div>)}</section>; })}</div>
    <TeamBalance players={draw.players}/><p className="sea-note">Wise Old Man-gegevens van {new Date(draw.fetchedAt).toLocaleString('nl-NL')}{draw.stale ? ' · laatst bekende gegevens; de verbinding wordt later opnieuw geprobeerd' : ''}. {draw.players.filter(p => !p.updatedAt || Date.parse(p.updatedAt) < Date.now() - 30 * 86400000).length > 0 && 'Sommige accounts zijn langer dan 30 dagen niet bijgewerkt of hebben geen bijgewerkt-datum.'}</p>
  </div>;
}
