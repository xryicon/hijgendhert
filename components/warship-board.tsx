'use client';
import { Anchor, Crosshair, Flame, Waves } from 'lucide-react';
import { seaCoordinate, shipCells, type Placement, type SeaShot } from '@/lib/warships';
export default function WarshipBoard({ title, subtitle, fleet = [], shots = [], revealed = [], selected = null, onSelect, disabled = false }: {
  title: string; subtitle: string; fleet?: Placement[]; shots?: SeaShot[]; revealed?: number[]; selected?: number | null; onSelect?: (cell: number) => void; disabled?: boolean;
}) {
  const ships = new Set(fleet.flatMap(shipCells));
  return <section className="sea-chart"><div className="sea-chart-heading"><Anchor size={19}/><div><h2>{title}</h2><p>{subtitle}</p></div><span>08 × 08</span></div><div className="sea-grid" role="group" aria-label={title}>
    <span className="sea-axis">⌖</span>{'ABCDEFGH'.split('').map(letter => <span className="sea-axis" key={letter}>{letter}</span>)}
    {Array.from({ length: 8 }, (_, row) => <div className="sea-grid-row" key={row}><span className="sea-axis">{row + 1}</span>{Array.from({ length: 8 }, (_, column) => {
      const cell = row * 8 + column, shot = shots.find(s => s.cell === cell);
      const sunk = revealed.includes(cell), hit = shot && shot.result !== 'miss';
      const state = sunk ? 'gezonken schip' : hit ? 'raak' : shot ? 'mis' : ships.has(cell) ? 'eigen schip' : 'onbekend';
      const content = selected === cell ? <Crosshair size={21}/> : hit || sunk ? <Flame size={17}/> : shot ? <span className="sea-miss-dot"/> : ships.has(cell) ? <span className="sea-hull"/> : <span className="sea-water-dot"/>;
      const className = `sea-cell${ships.has(cell) ? ' has-ship' : ''}${shot ? hit ? ' is-hit' : ' is-miss' : ''}${sunk ? ' is-sunk' : ''}${selected === cell ? ' is-selected' : ''}`;
      return onSelect ? <button type="button" key={cell} className={className} disabled={disabled || !!shot} aria-label={`${seaCoordinate(cell)}: ${state}`} aria-pressed={selected === cell} onClick={() => onSelect(cell)}>{content}</button> : <span key={cell} className={className} aria-label={`${seaCoordinate(cell)}: ${state}`}>{content}</span>;
    })}</div>)}
  </div><div className="sea-map-key"><span><span className="sea-miss-dot"/> Mis</span><span><Flame size={12}/> Raak</span><span><Waves size={13}/> Onverkend</span></div></section>;
}
