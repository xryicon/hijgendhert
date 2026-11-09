import type { RaffleEntry, RaffleRound } from './raffle-types';

const encoder = new TextEncoder();
export const entriesText = (entries: Pick<RaffleEntry, 'name' | 'tickets'>[]) => JSON.stringify(entries.map(entry => [entry.name, entry.tickets]));
export const seedText = (seed: string) => `hh-raffle-seed-v1\n${seed}`;
export const drawText = (round: Pick<RaffleRound, 'id' | 'drawAt' | 'entriesHash'>, seed: string, counter: number) =>
  `hh-raffle-v1\n${round.id}\n${round.drawAt}\n${round.entriesHash}\n${seed}\n${counter}`;
export async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
// Rejection sampling avoids modulo bias. The published seed and frozen entry
// list reproduce the same draw in a browser without trusting its displayed winner.
export function ticketFromHash(hash: string, total: number): number | null {
  if (!Number.isSafeInteger(total) || total < 1 || total > 1_000_000 || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Ongeldig trekkingsbewijs.');
  const limit = Math.floor(0x100000000 / total) * total;
  for (let index = 0; index < 64; index += 8) {
    const value = Number.parseInt(hash.slice(index, index + 8), 16);
    if (value < limit) return (value % total) + 1;
  }
  return null;
}
export async function winningTicket(round: Pick<RaffleRound, 'id' | 'drawAt' | 'entriesHash' | 'totalTickets'>, seed: string): Promise<number> {
  for (let counter = 0; counter < 100; counter++) {
    const ticket = ticketFromHash(await hashText(drawText(round, seed, counter)), round.totalTickets);
    if (ticket !== null) return ticket;
  }
  throw new Error('De trekking kon niet worden berekend.');
}
export async function verifyRaffle(round: RaffleRound): Promise<boolean> {
  if (round.status !== 'drawn' || !round.seed || !/^[a-f0-9]{64}$/.test(round.seed)) return false;
  let total = 0;
  for (const entry of round.entries) {
    if (!Number.isSafeInteger(entry.tickets) || entry.tickets <= 0 || entry.first !== total + 1) return false;
    total += entry.tickets;
    if (entry.last !== total) return false;
  }
  if (total !== round.totalTickets || await hashText(seedText(round.seed)) !== round.commitment || await hashText(entriesText(round.entries)) !== round.entriesHash) return false;
  const ticket = await winningTicket(round, round.seed);
  const winner = round.entries.find(entry => ticket >= entry.first && ticket <= entry.last);
  return ticket === round.winningTicket && winner?.name === round.winner;
}
