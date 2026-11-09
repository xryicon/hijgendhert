import { DurableObject } from 'cloudflare:workers';
import { DEFAULT_RANK_RULES, EMPTY_PLAYER_PROGRESS, memberRankSchema, rankRulesSchema, type PlayerProgressState, type RankRules } from '../lib/profile-progress';
import type { MemberEvent } from '../lib/member-types';

// Separate object names isolate the clan policy from each player's event record.
export class ClanProgress extends DurableObject<Cloudflare.Env> {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS profile_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS profile_events (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS profile_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, changed_at TEXT NOT NULL, value TEXT NOT NULL)');
    });
  }
  #read<T>(key: string, fallback: T): T {
    const row = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM profile_settings WHERE key = ?', key).toArray()[0];
    return row ? JSON.parse(row.value) as T : fallback;
  }
  #write(key: string, value: unknown, actor: string) {
    this.ctx.storage.sql.exec('INSERT INTO profile_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
    this.ctx.storage.sql.exec('INSERT INTO profile_audit (actor, changed_at, value) VALUES (?, ?, ?)', actor, new Date().toISOString(), JSON.stringify({ key, value }));
  }
  getRules(): RankRules { return this.#read('rules', DEFAULT_RANK_RULES); }
  saveRules(input: unknown, actor: string) {
    const parsed = rankRulesSchema.safeParse(input);
    if (!parsed.success) return { ok: false as const, status: 400, error: parsed.error.issues[0].message };
    if (parsed.data.revision !== this.getRules().revision) return { ok: false as const, status: 409, error: 'Een andere beheerder heeft de rangen aangepast. Laad de instellingen opnieuw.' };
    const rules: RankRules = { steps: parsed.data.steps, revision: parsed.data.revision + 1, configured: true, updatedAt: new Date().toISOString() };
    this.ctx.storage.transactionSync(() => this.#write('rules', rules, actor));
    return { ok: true as const, rules };
  }
  getPlayer(): PlayerProgressState {
    const saved = this.#read('player', EMPTY_PLAYER_PROGRESS);
    const events = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM profile_events ORDER BY id').toArray().map(row => JSON.parse(row.value) as MemberEvent);
    return { ...saved, events };
  }
  recordEvents(events: MemberEvent[]) {
    // Called only with server-validated WOM results, never member-supplied scores.
    this.ctx.storage.transactionSync(() => {
      for (const event of events) if (event.status === 'finished' && event.gained !== null && Number.isFinite(event.gained) && Date.parse(event.endsAt) <= Date.now())
        this.ctx.storage.sql.exec('INSERT INTO profile_events (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value', event.id, JSON.stringify(event));
    });
    return this.getPlayer();
  }
  savePlayer(input: unknown, actor: string) {
    const parsed = memberRankSchema.safeParse(input);
    if (!parsed.success) return { ok: false as const, status: 400, error: 'Controleer de rang, eventcorrectie en reden.' };
    const saved = this.getPlayer();
    if (parsed.data.revision !== saved.revision) return { ok: false as const, status: 409, error: 'Dit lid is inmiddels aangepast. Laad het lid opnieuw.' };
    const { revision, rankOverride, eventAdjustment, reason } = parsed.data;
    const state = { revision: revision + 1, rankOverride, eventAdjustment, reason, updatedAt: new Date().toISOString(), events: [] };
    this.ctx.storage.transactionSync(() => this.#write('player', state, actor));
    return { ok: true as const, state: this.getPlayer() };
  }
}
