import { FLEET, shipCells, type Placement } from './warships';

// Uniform choice among the remaining legal placements for each ship. No seed or
// positions are sent to staff; the result is saved once with the start action.
function choose(length: number) {
  const limit = Math.floor(0x100000000 / length) * length;
  let value: number;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= limit);
  return value % length;
}
export function generateFleet(): Placement[] {
  const placements: Placement[] = [], used = new Set<number>();
  for (let ship = 0; ship < FLEET.length; ship++) {
    const options: Placement[] = [];
    for (let cell = 0; cell < 64; cell++) for (const vertical of [false, true]) {
      const candidate = { ship, cell, vertical }, cells = shipCells(candidate);
      if (cells.length === FLEET[ship].length && cells.every(c => !used.has(c))) options.push(candidate);
    }
    if (!options.length) throw new Error('Geen geldige vlootindeling beschikbaar.');
    const selected = options[choose(options.length)];
    placements.push(selected); shipCells(selected).forEach(c => used.add(c));
  }
  return placements;
}
