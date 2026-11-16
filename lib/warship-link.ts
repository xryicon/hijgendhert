import type { WarshipActor, WarshipGame } from './warships';

// Match whole RuneScape names only: never strip rank prefixes, emoji or accents.
export function seaName(value: string) {
  const name = value.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^[a-z0-9 ]{1,12}$/.test(name) ? name : null;
}

export function automaticSeaPlayer(game: WarshipGame, actor: WarshipActor) {
  if (!game.published || !game.teamAssignment || !['setup', 'active'].includes(game.status)
    || game.crew.some(p => p.userId === actor.id) || game.manualLinkUsers?.includes(actor.id)
    || game.requests.some(r => r.userId === actor.id) || game.audit.length >= 2000) return null;
  const names = new Set([actor.name, actor.username || ''].map(seaName).filter(Boolean));
  const matches = game.crew.filter(p => p.playerId && names.has(seaName(p.rsn)));
  if (matches.length !== 1) return null;
  const player = matches[0];
  return !player.userId && !game.requests.some(r => r.playerId === player.playerId) ? player : null;
}
