import { DurableObject } from 'cloudflare:workers';
import { entriesText, hashText, seedText, winningTicket } from '../lib/raffle-proof';
import { raffleCancellationSchema, raffleEntriesSchema, raffleRemovalSchema, raffleScheduleSchema } from '../lib/raffle-validation';
import type { RaffleEntriesUpdate, RaffleRound, RaffleSchedule, RaffleState, RaffleSummary } from '../lib/raffle-types';

type StoredRound = RaffleRound & { seed: string; createdBy: string; requestId: string; inputHash: string };
type Row = { id: string; status: string; draw_at: number; data: string };
export type RaffleOperation = { ok: true; round: RaffleRound } | { ok: false; status: number; error: string };
const failure = (status: number, error: string) => ({ ok: false as const, status, error });
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
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS raffle_discord_outbox (id TEXT PRIMARY KEY, data TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0)');
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS raffle_removed (id TEXT PRIMARY KEY, removed_at INTEGER NOT NULL, removed_by TEXT NOT NULL)');
  }
  #removed(id: string) { return this.ctx.storage.sql.exec('SELECT 1 FROM raffle_removed WHERE id = ?', id).toArray().length > 0; }
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
      if (this.#removed(stored.id)) return failure(409, 'Deze trekking is verwijderd. Maak een nieuwe ronde aan.');
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
      if (this.#removed(stored.id)) return failure(409, 'Deze trekking is verwijderd. Maak een nieuwe ronde aan.');
      return stored.inputHash === inputHash && stored.createdBy === actor ? { ok: true, round: visible(stored) } : failure(409, 'Dit verzoek is al gebruikt.');
    }
    if (this.#active()) return failure(409, 'Er staat al een trekking gepland.');
    if (Date.now() >= round.drawAt) return failure(400, 'Kies een toekomstige datum binnen zes maanden.');
    // No await between the row write and scheduling the alarm: storage commits
    // them together before allowing the successful response to leave the object.
    this.ctx.storage.sql.exec('INSERT INTO raffle_rounds (id, request_id, status, draw_at, created_at, data) VALUES (?, ?, ?, ?, ?, ?)', round.id, value.requestId, round.status, round.drawAt, round.createdAt, JSON.stringify(round));
    await this.ctx.storage.setAlarm(round.drawAt);
    return { ok: true, round: visible(round) };
  }
  async updateEntries(input: RaffleEntriesUpdate): Promise<RaffleOperation> {
    const parsed = raffleEntriesSchema.safeParse(input);
    if (!parsed.success) return failure(400, parsed.error.issues[0]?.message || 'Controleer de namen en loten.');
    const value = parsed.data;
    const initial = this.#active();
    if (!initial || initial.id !== value.id || Date.now() >= initial.drawAt) return failure(409, 'De deelnemerslijst is gesloten. De trekking is begonnen of afgerond.');
    let totalTickets = 0;
    const entries = value.entries.map(entry => { const first = totalTickets + 1; totalTickets += entry.tickets; return { ...entry, first, last: totalTickets }; });
    const entriesHash = await hashText(entriesText(entries));
    // Hashing yields: re-read both the deadline and list before committing. All
    // remaining checks and the SQL write are synchronous, so edits cannot race.
    const current = this.#active();
    const now = Date.now();
    if (!current || current.id !== value.id || now >= current.drawAt) return failure(409, 'De deelnemerslijst is gesloten. De trekking is begonnen of afgerond.');
    // A response may have been lost after saving. Accept the same contents only
    // while the list is still open, without rewriting its update timestamp.
    if (current.entriesHash === entriesHash) return { ok: true, round: visible(current) };
    if (current.entriesHash !== value.expectedEntriesHash) return failure(409, 'De deelnemerslijst is ondertussen gewijzigd. Ververs de lijst voordat je opnieuw opslaat.');
    const updated: StoredRound = { ...current, entries, totalTickets, entriesHash, entriesUpdatedAt: now };
    this.ctx.storage.sql.exec("UPDATE raffle_rounds SET data = ? WHERE id = ? AND status = 'scheduled'", JSON.stringify(updated), current.id);
    return { ok: true, round: visible(updated) };
  }
  async #completeDue(): Promise<void> {
    while (true) {
      const round = this.#active();
      if (!round || Date.now() < round.drawAt) return;
      if (round.entries.length === 0) {
        const cancelled: StoredRound = { ...round, status: 'cancelled', cancellationReason: 'Geen deelnemers bij de trekking.', cancelledAt: Date.now() };
        this.ctx.storage.sql.exec("UPDATE raffle_rounds SET status = 'cancelled', data = ? WHERE id = ? AND status = 'scheduled'", JSON.stringify(cancelled), round.id);
        return;
      }
      const ticket = await winningTicket(round, round.seed);
      // Never publish a result computed from a stale snapshot after async hash
      // work. A concurrent cancellation or draw must also remain final.
      const current = this.#active();
      if (!current || current.id !== round.id || Date.now() < current.drawAt) return;
      if (current.entriesHash !== round.entriesHash || current.totalTickets !== round.totalTickets) continue;
      const winner = current.entries.find(entry => ticket >= entry.first && ticket <= entry.last);
      if (!winner) throw new Error('Invalid raffle range');
      const drawn: StoredRound = { ...current, status: 'drawn', winningTicket: ticket, winner: winner.name, drawnAt: Date.now() };
      this.ctx.storage.sql.exec("UPDATE raffle_rounds SET status = 'drawn', data = ? WHERE id = ? AND status = 'scheduled'", JSON.stringify(drawn), current.id);
      if (this.env.DISCORD_SYNC) {
        this.ctx.storage.sql.exec('INSERT OR IGNORE INTO raffle_discord_outbox (id, data) VALUES (?, ?)', drawn.id, JSON.stringify({ id: drawn.id, title: drawn.title, prize: drawn.prize, winner: drawn.winner, winningTicket: ticket, totalTickets: drawn.totalTickets, drawnAt: drawn.drawnAt }));
        await this.ctx.storage.setAlarm(Date.now() + 1000);
      }
      return;
    }
  }
  async alarm(): Promise<void> {
    try {
      await this.#completeDue();
      await this.#deliverResults();
      const next = this.#active();
      if (next) await this.ctx.storage.setAlarm(Math.max(next.drawAt, Date.now() + 1000));
    } catch {
      await this.ctx.storage.setAlarm(Date.now() + 30_000);
      throw new Error('Raffle draw will retry');
    }
  }
  async #deliverResults() {
    if (!this.env.DISCORD_SYNC) return;
    const pending = this.ctx.storage.sql.exec<{ id: string; data: string }>('SELECT id, data FROM raffle_discord_outbox WHERE delivered = 0 LIMIT 20').toArray();
    for (const row of pending) {
      await this.env.DISCORD_SYNC.getByName('clan:7059').recordRaffle(JSON.parse(row.data));
      this.ctx.storage.sql.exec('UPDATE raffle_discord_outbox SET delivered = 1 WHERE id = ?', row.id);
    }
    if (this.ctx.storage.sql.exec('SELECT 1 FROM raffle_discord_outbox WHERE delivered = 0 LIMIT 1').toArray().length) await this.ctx.storage.setAlarm(Date.now() + 1000);
  }
  getNotificationRounds() {
    // Announcements never expose participant details, draw seeds or creator IDs.
    return this.ctx.storage.sql.exec<Row>('SELECT * FROM raffle_rounds WHERE id NOT IN (SELECT id FROM raffle_removed) ORDER BY created_at DESC, id DESC LIMIT 20').toArray().map(row => {
      const round = JSON.parse(row.data) as StoredRound;
      return { id: round.id, title: round.title, prize: round.prize, createdAt: round.createdAt, drawAt: round.drawAt, status: round.status };
    });
  }
  async getPublic(id?: string): Promise<RaffleState> {
    // A read also recovers an overdue draw after an alarm/platform interruption.
    await this.#completeDue();
    const row = id
      ? this.ctx.storage.sql.exec<Row>('SELECT * FROM raffle_rounds WHERE id = ? AND id NOT IN (SELECT id FROM raffle_removed)', id).toArray()[0]
      : this.ctx.storage.sql.exec<Row>('SELECT * FROM raffle_rounds WHERE id NOT IN (SELECT id FROM raffle_removed) ORDER BY created_at DESC, id DESC LIMIT 1').toArray()[0];
    const history = this.ctx.storage.sql.exec<Row>("SELECT * FROM raffle_rounds WHERE status != 'scheduled' AND id NOT IN (SELECT id FROM raffle_removed) ORDER BY created_at DESC, id DESC LIMIT 20").toArray().map(row => {
      const round = JSON.parse(row.data) as StoredRound;
      return { id: round.id, title: round.title, drawAt: round.drawAt, status: round.status, winner: round.winner, totalTickets: round.totalTickets } satisfies RaffleSummary;
    });
    return { round: row ? visible(JSON.parse(row.data) as StoredRound) : null, history, serverNow: Date.now() };
  }
  remove(input: { id: string }, actor: string): { ok: true; id: string } | ReturnType<typeof failure> {
    const parsed = raffleRemovalSchema.safeParse(input);
    if (!parsed.success) return failure(400, 'Ongeldige trekking.');
    const row = this.ctx.storage.sql.exec<Row>('SELECT * FROM raffle_rounds WHERE id = ?', parsed.data.id).toArray()[0];
    if (!row) return failure(404, 'Deze trekking is niet gevonden.');
    if (!['drawn', 'cancelled'].includes(row.status)) return failure(409, 'Alleen afgeronde of geannuleerde trekkingen kunnen worden verwijderd.');
    // Keep the immutable proof and original request id, so retries cannot
    // resurrect or reroll a removed draw. All public reads exclude this marker.
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO raffle_removed (id, removed_at, removed_by) VALUES (?, ?, ?)', row.id, Date.now(), actor);
    return { ok: true, id: row.id };
  }
  async cancel(input: { id: string; reason: string }): Promise<RaffleOperation> {
    const parsed = raffleCancellationSchema.safeParse(input);
    if (!parsed.success) return failure(400, 'Geef een reden van minimaal vijf tekens.');
    await this.#completeDue();
    const round = this.#active();
    if (!round || round.id !== parsed.data.id || Date.now() >= round.drawAt) return failure(409, 'Deze trekking kan niet meer worden geannuleerd.');
    const cancelled: StoredRound = { ...round, status: 'cancelled', cancellationReason: parsed.data.reason, cancelledAt: Date.now() };
    this.ctx.storage.sql.exec("UPDATE raffle_rounds SET status = 'cancelled', data = ? WHERE id = ? AND status = 'scheduled'", JSON.stringify(cancelled), round.id);
    if (this.ctx.storage.sql.exec('SELECT 1 FROM raffle_discord_outbox WHERE delivered = 0 LIMIT 1').toArray().length) await this.ctx.storage.setAlarm(Date.now() + 1000);
    else await this.ctx.storage.deleteAlarm();
    return { ok: true, round: visible(cancelled) };
  }
}
