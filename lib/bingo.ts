export type BingoTile = { title: string; description: string; target: number; points: number; category: 'boss' | 'drop' | 'skill' | 'other' };
export type BingoConfig = { title: string; description: string; rules: string; startsAt: string; endsAt: string; teams: [string, string]; tiles: BingoTile[] };
export type BingoProgress = { count: number; note: string; evidence: string; updatedAt: string };
export type BingoLog = { id: string; team: number; tile: number; from: number; to: number; note: string; evidence: string; at: string };
export type BingoState = BingoConfig & { progress: BingoProgress[][]; log: BingoLog[] };
export type BingoEvent = BingoState & { id: string; status: 'draft' | 'active' | 'finished'; visibility: 'private' | 'public'; version: number; createdAt: string; updatedAt: string };
export type BingoSummary = Pick<BingoEvent, 'id' | 'title' | 'status' | 'visibility' | 'startsAt' | 'endsAt' | 'updatedAt'>;
export type BingoResponse = { events: BingoSummary[]; event: BingoEvent | null; canManage: boolean; signedIn: boolean; fetchedAt: string };
export const emptyProgress = (): BingoProgress[][] => [0, 1].map(() => Array.from({ length: 25 }, () => ({ count: 0, note: '', evidence: '', updatedAt: '' })));
export function scoreTeam(event: Pick<BingoState, 'tiles' | 'progress'>, team: number) {
  const completed = event.tiles.map((tile, i) => (event.progress[team]?.[i]?.count || 0) >= tile.target);
  const lines: number[][] = [];
  for (let i = 0; i < 5; i++) { lines.push(Array.from({ length: 5 }, (_, j) => i * 5 + j)); lines.push(Array.from({ length: 5 }, (_, j) => j * 5 + i)); }
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return { points: event.tiles.reduce((sum, tile, i) => sum + (completed[i] ? tile.points : 0), 0), completed: completed.filter(Boolean).length, lines: lines.filter(line => line.every(i => completed[i])).length, full: completed.length === 25 && completed.every(Boolean) };
}
export function eventPhase(event: Pick<BingoEvent, 'status' | 'startsAt' | 'endsAt'>, now = Date.now()) {
  if (event.status === 'draft') return 'draft';
  if (event.status === 'finished') return 'finished';
  if (now < Date.parse(event.startsAt)) return 'planned';
  if (now >= Date.parse(event.endsAt)) return 'review';
  return 'running';
}
export function visibleToVisitors(event: Pick<BingoEvent, 'visibility' | 'status' | 'startsAt' | 'endsAt'>, now = Date.now()) { return event.visibility === 'public' && event.status === 'active' && now >= Date.parse(event.startsAt) && now < Date.parse(event.endsAt); }
export function applyProgress(event: BingoEvent, team: number, tile: number, count: number, note: string, evidence: string, at: string, id: string): BingoState {
  const progress = event.progress.map(row => row.map(p => ({ ...p })));
  const from = progress[team][tile].count;
  progress[team][tile] = { count, note, evidence, updatedAt: at };
  const { title, description, rules, startsAt, endsAt, teams, tiles } = event;
  return { title, description, rules, startsAt, endsAt, teams, tiles, progress, log: [{ id, team, tile, from, to: count, note, evidence, at }, ...event.log].slice(0, 60) };
}
export const starterTiles: BingoTile[] = [
  ['Vijf Barrows-runs', 'Voltooi samen vijf Barrows-runs.', 5, 'boss'],
  ['Een unieke Barrows-drop', 'Verkrijg één uniek Barrows-item.', 1, 'drop'],
  ['Tien Scurrius-kills', 'Versla Scurrius tien keer.', 10, 'boss'],
  ['Een easy clue', 'Voltooi een easy clue scroll.', 1, 'other'],
  ['100.000 Woodcutting XP', 'Behaal samen 100.000 Woodcutting XP tijdens het event.', 100000, 'skill'],
  ['Vijf Sarachnis-kills', 'Versla Sarachnis vijf keer.', 5, 'boss'],
  ['Een medium clue', 'Voltooi een medium clue scroll.', 1, 'other'],
  ['100.000 Fishing XP', 'Behaal samen 100.000 Fishing XP tijdens het event.', 100000, 'skill'],
  ['Tien Wintertodt-kills', 'Voltooi tien Wintertodt-rondes.', 10, 'boss'],
  ['Een clue-unique', 'Verkrijg een uniek item uit een clue casket.', 1, 'drop'],
  ['Vijf Zulrah-kills', 'Versla Zulrah vijf keer.', 5, 'boss'],
  ['100.000 Mining XP', 'Behaal samen 100.000 Mining XP tijdens het event.', 100000, 'skill'],
  ['Een raid voltooien', 'Voltooi samen een raid naar keuze.', 1, 'boss'],
  ['Een hard clue', 'Voltooi een hard clue scroll.', 1, 'other'],
  ['Tien Tempoross-kills', 'Voltooi tien Tempoross-rondes.', 10, 'boss'],
  ['100.000 Slayer XP', 'Behaal samen 100.000 Slayer XP tijdens het event.', 100000, 'skill'],
  ['Vijf Vorkath-kills', 'Versla Vorkath vijf keer.', 5, 'boss'],
  ['Een rune item als drop', 'Ontvang een rune item van een monster.', 1, 'drop'],
  ['Vijf Guardians of the Rift', 'Voltooi vijf rondes Guardians of the Rift.', 5, 'other'],
  ['100.000 Cooking XP', 'Behaal samen 100.000 Cooking XP tijdens het event.', 100000, 'skill'],
  ['Tien King Black Dragon-kills', 'Versla King Black Dragon tien keer.', 10, 'boss'],
  ['Een elite clue', 'Voltooi een elite clue scroll.', 1, 'other'],
  ['100.000 Agility XP', 'Behaal samen 100.000 Agility XP tijdens het event.', 100000, 'skill'],
  ['Een gezamenlijke boss-trip', 'Ga met minimaal twee teamleden samen bossen.', 1, 'other'],
  ['Een pet', 'Ontvang een nieuwe pet tijdens het event.', 1, 'drop'],
].map(([title, description, target, category]) => ({ title: String(title), description: String(description), target: Number(target), points: 1, category: category as BingoTile['category'] }));
