import { DurableObject } from 'cloudflare:workers';
import { entriesText, hashText, seedText, winningTicket } from '../lib/raffle-proof';
import { raffleCancellationSchema, raffleScheduleSchema } from '../lib/raffle-validation';
import type { RaffleRound, RaffleSchedule, RaffleState, RaffleSummary } from '../lib/raffle-types';

type StoredRound = RaffleRound & { seed: string; createdBy: string; requestId: string; inputHash: string };
type Row = { id: string; status: string; draw_at: number; data: string };
export type RaffleOperation = { ok: true; round: RaffleRound } | { ok: false; status: number; error: string };
const failure = (status: number, error: string): RaffleOperation => ({ ok: false, status, error });
function visible(round: StoredRound): RaffleRound {
  const { createdBy: _createdBy, requestId: _requestId, inputHash: _inputHash, seed, ...data } = round;
  return round.status === 'scheduled' ? data : { ...data, seed };
}

// One coordinator per clan. SQLite stores both the sealed future draw and its
// immutable result; no browser or process-local state decides the winner.
export class ClanRaffle extends DurableObject<Cloudflare.Env> {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS raffle_rounds (id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, status TEXT NOT NULL, draw_at INTEGER NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL)');
    this.ctx.storage.sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS raffle_one_scheduled ON raffle_rounds (status) WHERE status = 'scheduled'");
  }
  #active(): StoredRound | null {
    const row = this.ctx.storage.sql.exec<Row>("SELECT * FROM raffle_rounds WHERE status = 'scheduled' LIMIT 1").toArray()[0];
    return row ? JSON.parse(row.data) as StoredRound : null;
  }
  async schedule(input: RaffleSchedule, actor: string): Promise<RaffleOperation> {
    const parsed = raffleScheduleSchema.safeParse(input);
    if (!parsed.success) return failure(400, parsed.error.issues[0]?.message || 'Controleer de namen en gratis loten.');
    const value = parsed.data;
    const inputHash = await hashText(JSON.stringify(value));
    const previous = this.ctx.storage.sql.exec<Row>('SELECT * FROM raffle_rounds WHERE request_id = ?', value.requestId).toArray()[0];
    if (previous) {
      const stored = JSON.parse(previous.data) as StoredRound;
      return stored.inputHash === inputHash && stored.createdBy === actor ? { ok: true, round: visible(stored) } : failure(409, 'Dit verzoek is al gebruikt. Ververs de pagina.');
    }
    const now = Date.now();
    if (value.drawAt <= now || value.drawAt > now + 180 * 86_400_000) return failure(400, 'Kies een toekomstige datum binnen zes maanden.');
    if (this.#active()) return failure(409, 'Er staat al een trekking gepland.');
    let totalTickets = 0;
    const entries = value.entries.map(entry => { const first = totalTickets + 1; totalTickets += entry.tickets; return { ...entry, first, last: totalTickets }; });
    const seed = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
    const commitment = await hashText(seedText(seed));
    const entriesHash = await hashText(entriesText(entries));
    const round: StoredRound = {
      id: crypto.randomUUID(), title: value.title, prize: value.prize, freeEntry: true,
      createdAt: now, drawAt: value.drawAt, status: 'scheduled', entries, totalTickets,
      commitment, entriesHash, seed, createdBy: actor, requestId: value.requestId, inputHash,
    };
    // Recheck after hashing; another schedule request may have finished meanwhile.
    const raced = this.ctx.storage.sql.exec<Row>('SELECT * FROM raffle_rounds WHERE request_id = ?', value.requestId).toArray()[0];
    if (raced) {
      const stored = JSON.parse(raced.data) as StoredRound;
      return stored.inputHash === inputHash && stored.createdBy === actor ? { ok: true, round: visible(stored) } : failure(409, 'Dit verzoek is al gebruikt.');
    }
    if (this.#active()) return failure(409, 'Er staat al een trekking gepland.');
    // No await between the row write and scheduling the alarm: storage commits
    // them together before allowing the successful response to leave the object.
    this.ctx.storage.sql.exec('INSERT INTO raffle_rounds (id, request_id, status, draw_at, created_at, data) VALUES (?, ?, ?, ?, ?, ?)', round.id, value.requestId, round.status, round.drawAt, round.createdAt, JSON.stringify(round));
    await this.ctx.storage.setAlarm(round.drawAt);
    return { ok: true, round: visible(round) };
  }
  async #completeDue(): Promise<void> {
    const round = this.#active();
    if (!round || Date.now() < round.drawAt) return;
    const ticket = await winningTicket(round, round.seed);
    const winner = round.entries.find(entry => ticket >= entry.first && ticket <= entry.last);
    if (!winner) throw new Error('Invalid raffle range');
    const drawn: StoredRound = { ...round, status: 'drawn', winningTicket: ticket, winner: winner.name, drawnAt: Date.now() };
    // Idempotent across alarm retries, simultaneous viewers and cancellations.
    this.ctx.storage.sql.exec("UPDATE raffle_rounds SET status = 'drawn', data = ? WHERE id = ? AND status = 'scheduled'", JSON.stringify(drawn), round.id);
  }
  async alarm(): Promise<void> {
    try {
      await this.#completeDue();
      const next = this.#active();
      if (next) await this.ctx.storage.setAlarm(Math.max(next.drawAt, Date.now() + 1000));
    } catch {
      await this.ctx.storage.setAlarm(Date.now() + 30_000);
      throw new Error('Raffle draw will retry');
    }
  }
  async getPublic(id?: string): Promise<RaffleState> {
    // A read also recovers an overdue draw after an alarm/platform interruption.
    await this.#completeDue();
    const row = id
      ? this.ctx.storage.sql.exec<Row>('SELECT * FROM raffle_rounds WHERE id = ?', id).toArray()[0]
      : this.ctx.storage.sql.exec<Row>('SELECT * FROM raffle_rounds ORDER BY created_at DESC, id DESC LIMIT 1').toArray()[0];
    const history = this.ctx.storage.sql.exec<Row>("SELECT * FROM raffle_rounds WHERE status != 'scheduled' ORDER BY created_at DESC, id DESC LIMIT 20").toArray().map(row => {
      const round = JSON.parse(row.data) as StoredRound;
      return { id: round.id, title: round.title, drawAt: round.drawAt, status: round.status, winner: round.winner, totalTickets: round.totalTickets } satisfies RaffleSummary;
    });
    return { round: row ? visible(JSON.parse(row.data) as StoredRound) : null, history, serverNow: Date.now() };
  }
  async cancel(input: { id: string; reason: string }): Promise<RaffleOperation> {
    const parsed = raffleCancellationSchema.safeParse(input);
    if (!parsed.success) return failure(400, 'Geef een reden van minimaal vijf tekens.');
    await this.#completeDue();
    const round = this.#active();
    if (!round || round.id !== parsed.data.id || Date.now() >= round.drawAt) return failure(409, 'Deze trekking kan niet meer worden geannuleerd.');
    const cancelled: StoredRound = { ...round, status: 'cancelled', cancellationReason: parsed.data.reason, cancelledAt: Date.now() };
    this.ctx.storage.sql.exec("UPDATE raffle_rounds SET status = 'cancelled', data = ? WHERE id = ? AND status = 'scheduled'", JSON.stringify(cancelled), round.id);
    await this.ctx.storage.deleteAlarm();
    return { ok: true, round: visible(cancelled) };
  }
}
