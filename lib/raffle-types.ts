export type RaffleEntry = { name: string; tickets: number; first: number; last: number };
export type RaffleRound = {
  id: string; title: string; prize: string; freeEntry: true;
  createdAt: number; drawAt: number; status: 'scheduled' | 'drawn' | 'cancelled';
  entries: RaffleEntry[]; totalTickets: number; commitment: string; entriesHash: string; entriesUpdatedAt?: number;
  seed?: string; winningTicket?: number; winner?: string; drawnAt?: number;
  cancelledAt?: number; cancellationReason?: string;
};
export type RaffleSummary = Pick<RaffleRound, 'id' | 'title' | 'drawAt' | 'status' | 'winner' | 'totalTickets'>;
export type RaffleState = { round: RaffleRound | null; history: RaffleSummary[]; serverNow: number };
export type RaffleSchedule = {
  requestId: string; title: string; prize: string; drawAt: number; freeEntry: true;
  entries: { name: string; tickets: number }[];
};
export type RaffleEntriesUpdate = {
  id: string; expectedEntriesHash: string;
  entries: { name: string; tickets: number }[];
};
export const ticketCode = (id: string, ticket: number) => `HH-${id.slice(0, 8).toUpperCase()}-${String(ticket).padStart(6, '0')}`;
export const raffleNameKey = (name: string) => name.normalize('NFKC').trim().toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ');
