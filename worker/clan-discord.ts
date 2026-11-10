import { DurableObject } from 'cloudflare:workers';
import { EMPTY_SYNC_SETTINGS, discordId, eventInputSchema, syncSettingsSchema, eventDiscordMessage, noticeDiscordMessage, type ClanEvent, type ClanEventInput, type EventParticipant, type EventView, type LoginNotice, type RaffleNotice, type SyncKind, type SyncSettings } from '../lib/clan-discord';
import { DeliveryError, discordBotRequest, validateDiscordChannels } from '../lib/discord-delivery';
import { eventResultSchema, progressFor, type EventResultInput } from '../lib/clan-event-rules';
import { DEFAULT_SITE_APPEARANCE, siteAppearanceInput, type SiteAppearance } from '../lib/site-appearance';
import { DEFAULT_WELCOME, welcomeInput, type WelcomeContent } from '../lib/welcome';

type Job = { key: string; kind: SyncKind; data: string; version: number; delivered: number; next_at: number; attempts: number; channel_id: string; message_id: string; error: string; created_at: number };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
// One small clan owns its event list and outgoing messages. Membership checks
// remain separate; a Discord delivery outage never rolls back a registration.
export class ClanDiscord extends DurableObject<Cloudflare.Env> {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS sync_settings (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS site_appearance (id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS site_welcome (id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS clan_events (id TEXT PRIMARY KEY, starts_at INTEGER NOT NULL, data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS event_signups (event_id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, joined_at TEXT NOT NULL, PRIMARY KEY(event_id, user_id))');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS event_results (event_id TEXT NOT NULL, user_id TEXT NOT NULL, revision INTEGER NOT NULL, gained INTEGER, updated_at TEXT NOT NULL, PRIMARY KEY(event_id, user_id))');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS event_result_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, user_id TEXT NOT NULL, actor TEXT NOT NULL, recorded_at TEXT NOT NULL, data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS discord_jobs (key TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, delivered INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, channel_id TEXT NOT NULL DEFAULT \'\', message_id TEXT NOT NULL DEFAULT \'\', error TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS discord_interactions (id TEXT PRIMARY KEY, result TEXT NOT NULL, created_at INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS discord_state (key TEXT PRIMARY KEY, value INTEGER NOT NULL)');
  }
  #settings(): SyncSettings {
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM sync_settings WHERE id = 1').toArray()[0];
    return row ? JSON.parse(row.data) : EMPTY_SYNC_SETTINGS;
  }
  getAppearance(): SiteAppearance {
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM site_appearance WHERE id = 1').toArray()[0];
    return row ? JSON.parse(row.data) : DEFAULT_SITE_APPEARANCE;
  }
  saveAppearance(input: unknown, actor: string) {
    const parsed = siteAppearanceInput.safeParse(input);
    if (!parsed.success) return fail(400, 'Controleer de thema-instelling.');
    const current = this.getAppearance();
    if (parsed.data.revision !== current.revision) return fail(409, 'Een andere beheerder heeft het thema gewijzigd. Wacht even tot de actuele instelling geladen is en probeer opnieuw.');
    const appearance = { christmasEnabled: parsed.data.christmasEnabled, revision: current.revision + 1 };
    this.ctx.storage.sql.exec('INSERT INTO site_appearance VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at', JSON.stringify(appearance), actor, Date.now());
    return { ok: true as const, appearance };
  }
  getWelcome(): WelcomeContent {
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM site_welcome WHERE id = 1').toArray()[0];
    return row ? JSON.parse(row.data) : DEFAULT_WELCOME;
  }
  saveWelcome(input: unknown, actor: string) {
    const parsed = welcomeInput.safeParse(input);
    if (!parsed.success) return fail(400, parsed.error.issues[0].message);
    if (parsed.data.revision !== this.getWelcome().revision) return fail(409, 'De welkomstpagina is door een andere beheerder gewijzigd. Laad de actuele inhoud voordat je opslaat.');
    const welcome = { ...parsed.data, revision: parsed.data.revision + 1 };
    this.ctx.storage.sql.exec('INSERT INTO site_welcome VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at', JSON.stringify(welcome), actor, Date.now());
    return { ok: true as const, welcome };
  }
  #ready(kind: SyncKind, settings = this.#settings()) { return Boolean(settings[`${kind}Enabled`] && settings[`${kind}Channel`] && this.env.DISCORD_BOT_TOKEN && this.env.APP_ORIGIN); }
  getSettings() {
    return { settings: this.#settings(), botConfigured: Boolean(this.env.DISCORD_BOT_TOKEN),
      deliveries: this.ctx.storage.sql.exec<{ kind: string; waiting: number; failed: number }>("SELECT kind, SUM(CASE WHEN version > delivered AND error = '' THEN 1 ELSE 0 END) AS waiting, SUM(CASE WHEN error != '' THEN 1 ELSE 0 END) AS failed FROM discord_jobs GROUP BY kind").toArray(),
      recent: this.ctx.storage.sql.exec<{ kind: string; error: string; next_at: number }>("SELECT kind, error, next_at FROM discord_jobs WHERE error != '' ORDER BY created_at DESC LIMIT 5").toArray() };
  }
  async saveSettings(input: unknown) {
    const parsed = syncSettingsSchema.safeParse(input);
    if (!parsed.success) return fail(400, parsed.error.issues[0].message);
    const value = parsed.data;
    if (value.revision !== this.#settings().revision) return fail(409, 'Instellingen zijn gewijzigd. Laad opnieuw.');
    if (value.loginEnabled || value.eventsEnabled || value.raffleEnabled) {
      if (!this.env.DISCORD_BOT_TOKEN) return fail(400, 'Voeg eerst DISCORD_BOT_TOKEN als geheim toe in Cloudflare.');
      try { await validateDiscordChannels(this.env.DISCORD_BOT_TOKEN, this.env.DISCORD_GUILD_ID || '', this.env.DISCORD_CLIENT_ID || '', value); }
      catch (error) { return fail(400, error instanceof DeliveryError ? `Discord kon de kanalen niet controleren (HTTP ${error.status}). Controleer de botrechten of probeer later opnieuw.` : error instanceof Error ? error.message : 'Controleer de kanalen.'); }
    }
    if (value.revision !== this.#settings().revision) return fail(409, 'Instellingen zijn gewijzigd. Laad opnieuw.');
    const previous = this.#settings();
    const settings = { ...value, revision: value.revision + 1 };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT INTO sync_settings VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', JSON.stringify(settings));
      for (const kind of ['login', 'events', 'raffle'] as const) {
        // Disabling discards pending notices. Turning it on later never replays
        // old logins or results captured while the feature was switched off.
        if (!settings[`${kind}Enabled`]) this.ctx.storage.sql.exec('UPDATE discord_jobs SET delivered = version, error = \'\' WHERE kind = ?', kind);
        else this.ctx.storage.sql.exec('UPDATE discord_jobs SET error = \'\', next_at = ?, attempts = 0 WHERE kind = ? AND version > delivered', Date.now(), kind);
      }
      if (this.#ready('events', settings) && (!previous.eventsEnabled || previous.eventsChannel !== settings.eventsChannel)) {
        for (const event of this.listEvents()) if (this.#job(`event:${event.id}`) || (event.status === 'scheduled' && Date.parse(event.endsAt) > Date.now())) this.#queueEvent(event.id);
      }
    });
    await this.#schedule();
    return { ok: true as const, ...this.getSettings() };
  }
  #event(id: string): ClanEvent | null {
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM clan_events WHERE id = ?', id).toArray()[0];
    return row ? { minimum: null, beginnerFriendly: false, experience: '', gear: '', ...JSON.parse(row.data) } : null;
  }
  #view(event: ClanEvent, userId?: string, privateView = false): EventView {
    const rows = this.ctx.storage.sql.exec<{ user_id: string; name: string; joined_at: string }>('SELECT user_id, name, joined_at FROM event_signups WHERE event_id = ? ORDER BY joined_at, user_id', event.id).toArray();
    const results = this.ctx.storage.sql.exec<{ user_id: string; revision: number; gained: number | null; updated_at: string }>('SELECT user_id, revision, gained, updated_at FROM event_results WHERE event_id = ?', event.id).toArray();
    const resultsByUser = new Map(results.map(result => [result.user_id, result]));
    const participants = rows.map(row => {
      const result = resultsByUser.get(row.user_id);
      return { userId: row.user_id, name: row.name, joinedAt: row.joined_at, progress: progressFor(event.minimum, result ? { revision: result.revision, gained: result.gained, updatedAt: result.updated_at } : undefined) };
    });
    return { ...event, beginnerFriendly: event.beginnerFriendly ?? false, experience: event.experience || '', gear: event.gear || '', minimum: event.minimum || null, participantCount: rows.length, qualifiedCount: participants.filter(p => p.progress.qualified === true).length, joined: rows.some(row => row.user_id === userId), myProgress: participants.find(p => p.userId === userId)?.progress || null, ...(privateView ? { participants } : {}) };
  }
  listEvents(userId?: string, privateView = false): EventView[] {
    return this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM clan_events ORDER BY starts_at DESC LIMIT 200').toArray().map(row => this.#view(JSON.parse(row.data), userId, privateView));
  }
  async saveEvent(input: ClanEventInput, host: string) {
    const parsed = eventInputSchema.safeParse(input);
    if (!parsed.success) return fail(400, parsed.error.issues[0].message);
    const value = parsed.data; const previous = this.#event(value.id);
    if ((previous?.revision || 0) !== value.revision) return fail(409, 'Dit event is gewijzigd. Laad opnieuw.');
    if (!previous && (value.status !== 'scheduled' || Date.parse(value.startsAt) < Date.now() + 60000)) return fail(400, 'Plan een nieuw event minimaal één minuut vooruit.');
    if (previous && Date.parse(previous.startsAt) <= Date.now()) return fail(409, 'Dit event is al begonnen; de inschrijvingen zijn gesloten.');
    if (value.status === 'scheduled' && Date.parse(value.startsAt) < Date.now() + 60000) return fail(400, 'Kies een toekomstige begintijd.');
    const count = this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM clan_events').one().n;
    if (!previous && count >= 200) return fail(400, 'Het maximum van 200 events is bereikt.');
    const now = new Date().toISOString();
    const event: ClanEvent = { ...value, revision: value.revision + 1, host: previous?.host || host.slice(0, 100), createdAt: previous?.createdAt || now, updatedAt: now };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT INTO clan_events VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET starts_at = excluded.starts_at, data = excluded.data', event.id, Date.parse(event.startsAt), JSON.stringify(event));
      this.#queueEvent(event.id);
    });
    await this.#schedule();
    return { ok: true as const, event: this.#view(event, undefined, true) };
  }
  async register(id: string, userId: string, name: string, action: 'join' | 'leave', interaction?: { id: string; channelId: string; messageId: string }) {
    if (!discordId.safeParse(userId).success || !['join', 'leave'].includes(action)) return fail(400, 'Ongeldige inschrijving.');
    if (interaction) {
      const previous = this.ctx.storage.sql.exec<{ result: string }>('SELECT result FROM discord_interactions WHERE id = ?', interaction.id).toArray()[0];
      if (previous) return JSON.parse(previous.result) as { ok: boolean; error?: string };
      const job = this.#job(`event:${id}`); const settings = this.#settings();
      if (!this.#ready('events') || settings.eventsChannel !== interaction.channelId || job?.channel_id !== interaction.channelId || job.message_id !== interaction.messageId) return fail(403, 'Deze eventknoppen zijn niet meer actief. Open het event op de website.');
    }
    const event = this.#event(id);
    if (!event) return fail(404, 'Dit event bestaat niet.');
    if (event.status !== 'scheduled' || Date.parse(event.startsAt) <= Date.now()) return fail(409, 'De inschrijving is gesloten.');
    const exists = this.ctx.storage.sql.exec('SELECT 1 FROM event_signups WHERE event_id = ? AND user_id = ?', id, userId).toArray().length > 0;
    if (action === 'join' && !exists && this.#view(event).participantCount >= 2000) return fail(409, 'Dit event is vol.');
    const result = { ok: true as const, joined: action === 'join' };
    this.ctx.storage.transactionSync(() => {
      if (action === 'join') this.ctx.storage.sql.exec('INSERT INTO event_signups VALUES (?, ?, ?, ?) ON CONFLICT(event_id, user_id) DO UPDATE SET name = excluded.name', id, userId, name.slice(0, 100), new Date().toISOString());
      else this.ctx.storage.sql.exec('DELETE FROM event_signups WHERE event_id = ? AND user_id = ?', id, userId);
      if (exists !== (action === 'join')) this.#queueEvent(id);
      if (interaction) this.ctx.storage.sql.exec('INSERT INTO discord_interactions VALUES (?, ?, ?)', interaction.id, JSON.stringify(result), Date.now());
    });
    await this.#schedule();
    return result;
  }
  async recordResult(input: EventResultInput, actor: string) {
    const parsed = eventResultSchema.safeParse(input);
    if (!parsed.success || !discordId.safeParse(actor).success) return fail(400, 'Controleer het lid en de behaalde XP of KC.');
    const value = parsed.data; const event = this.#event(value.eventId);
    if (!event || event.status !== 'scheduled' || !event.minimum) return fail(409, 'Dit event heeft geen actief deelname-minimum.');
    if (Date.parse(event.startsAt) > Date.now()) return fail(409, 'Resultaten kunnen pas vanaf het begin van het event worden vastgelegd.');
    if (event.minimum.unit === 'kc' && value.gained !== null && value.gained > 10_000_000) return fail(400, 'Dit KC-aantal is te hoog.');
    if (!this.ctx.storage.sql.exec('SELECT 1 FROM event_signups WHERE event_id = ? AND user_id = ?', value.eventId, value.userId).toArray().length) return fail(404, 'Dit lid is niet aangemeld voor het event.');
    const previous = this.ctx.storage.sql.exec<{ revision: number; gained: number | null }>('SELECT revision, gained FROM event_results WHERE event_id = ? AND user_id = ?', value.eventId, value.userId).toArray()[0];
    if ((previous?.revision || 0) !== value.revision) return fail(409, 'Het resultaat is gewijzigd. Laad de deelnemers opnieuw.');
    const now = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT INTO event_results VALUES (?, ?, ?, ?, ?) ON CONFLICT(event_id, user_id) DO UPDATE SET revision = excluded.revision, gained = excluded.gained, updated_at = excluded.updated_at', value.eventId, value.userId, value.revision + 1, value.gained, now);
      this.ctx.storage.sql.exec('INSERT INTO event_result_audit (event_id, user_id, actor, recorded_at, data) VALUES (?, ?, ?, ?, ?)', value.eventId, value.userId, actor, now, JSON.stringify({ before: previous?.gained ?? null, after: value.gained, minimum: event.minimum }));
      this.#queueEvent(event.id);
    });
    await this.#schedule();
    return { ok: true as const, event: this.#view(event, actor, true) };
  }
  #job(key: string) { return this.ctx.storage.sql.exec<Job>('SELECT * FROM discord_jobs WHERE key = ?', key).toArray()[0]; }
  #queueEvent(id: string) {
    if (!this.#ready('events')) return;
    this.ctx.storage.sql.exec("INSERT INTO discord_jobs (key,kind,data,next_at,created_at) VALUES (?, 'events', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET version = version + 1, next_at = excluded.next_at, error = ''", `event:${id}`, JSON.stringify({ id }), Date.now() + 1000, Date.now());
  }
  async recordLogin(notice: LoginNotice) {
    if (!this.#ready('login')) return;
    await this.#notice('login', `login:${notice.id}`, notice);
  }
  async recordRaffle(notice: RaffleNotice) {
    if (!this.#ready('raffle')) return;
    await this.#notice('raffle', `raffle:${notice.id}`, notice);
  }
  async #notice(kind: 'login' | 'raffle', key: string, notice: LoginNotice | RaffleNotice) {
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO discord_jobs (key,kind,data,next_at,created_at) VALUES (?, ?, ?, ?, ?)', key, kind, JSON.stringify(notice), Date.now() + 1000, Date.now());
    await this.#schedule();
  }
  #pause() { return this.ctx.storage.sql.exec<{ value: number }>("SELECT value FROM discord_state WHERE key = 'pause'").toArray()[0]?.value || 0; }
  async #schedule() {
    const row = this.ctx.storage.sql.exec<{ next: number | null }>("SELECT MIN(next_at) AS next FROM discord_jobs WHERE version > delivered AND error = ''").one();
    const starts = this.ctx.storage.sql.exec<{ starts_at: number }>('SELECT starts_at FROM clan_events WHERE starts_at > ? ORDER BY starts_at LIMIT 1', Date.now()).toArray()[0]?.starts_at;
    const next = Math.min(row.next === null ? Infinity : Math.max(row.next, this.#pause()), this.#ready('events') ? starts || Infinity : Infinity);
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, next));
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    // Close Discord buttons once an event starts, without requiring page visits.
    for (const row of this.ctx.storage.sql.exec<{ id: string }>('SELECT id FROM clan_events WHERE starts_at <= ?', Date.now()).toArray()) {
      const job = this.#job(`event:${row.id}`);
      if (job && !JSON.parse(job.data).closed) {
        this.ctx.storage.sql.exec("UPDATE discord_jobs SET data = ?, version = version + 1, next_at = ? WHERE key = ?", JSON.stringify({ id: row.id, closed: true }), Date.now(), job.key);
      }
    }
    try {
      for (let i = 0; i < 5 && this.#pause() <= Date.now(); i++) {
        const job = this.ctx.storage.sql.exec<Job>("SELECT * FROM discord_jobs WHERE version > delivered AND error = '' AND next_at <= ? ORDER BY next_at, key LIMIT 1", Date.now()).toArray()[0];
        if (!job) break;
        if (!this.#ready(job.kind)) { this.ctx.storage.sql.exec('UPDATE discord_jobs SET delivered = version WHERE key = ?', job.key); continue; }
        const channel = this.#settings()[`${job.kind}Channel`];
        const sameMessage = job.channel_id === channel && Boolean(job.message_id);
        const data = JSON.parse(job.data);
        const event = job.kind === 'events' ? this.#event(data.id) : null;
        if (job.kind === 'events' && !event) { this.ctx.storage.sql.exec('DELETE FROM discord_jobs WHERE key = ?', job.key); continue; }
        const message = event ? eventDiscordMessage(this.#view(event, undefined, true), this.env.APP_ORIGIN!) : noticeDiscordMessage(job.kind as 'login' | 'raffle', data, this.env.APP_ORIGIN!);
        try {
          const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${job.key}:${channel}`));
          const nonce = Buffer.from(hash).toString('hex').slice(0, 24);
          const { body, cooldown } = await discordBotRequest(this.env.DISCORD_BOT_TOKEN!, `/channels/${channel}/messages${sameMessage ? `/${job.message_id}` : ''}`, { method: sameMessage ? 'PATCH' : 'POST', body: JSON.stringify({ ...message, ...(!sameMessage ? { nonce, enforce_nonce: true } : {}) }) });
          if (!discordId.safeParse(body.id).success) throw new DeliveryError(502);
          this.ctx.storage.sql.exec("UPDATE discord_jobs SET delivered = ?, channel_id = ?, message_id = ?, attempts = 0, error = '' WHERE key = ?", job.version, channel, body.id as string, job.key);
          if (cooldown) this.ctx.storage.sql.exec("INSERT INTO discord_state VALUES ('pause', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", Date.now() + cooldown * 1000);
        } catch (error) {
          const status = error instanceof DeliveryError ? error.status : 503;
          if (status === 404 && sameMessage) {
            this.ctx.storage.sql.exec("UPDATE discord_jobs SET message_id = '', next_at = ? WHERE key = ?", Date.now() + 60000, job.key);
          } else if (status === 429 || status >= 500) {
            const delay = status === 429 && error instanceof DeliveryError ? error.retrySeconds * 1000 : Math.min(3600000, 60000 * 2 ** Math.min(job.attempts, 6));
            this.ctx.storage.sql.exec('UPDATE discord_jobs SET attempts = attempts + 1, next_at = ? WHERE key = ?', Date.now() + delay, job.key);
            // Global pause also conservatively covers shared Discord buckets.
            this.ctx.storage.sql.exec("INSERT INTO discord_state VALUES ('pause', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", Date.now() + delay);
          } else this.ctx.storage.sql.exec('UPDATE discord_jobs SET error = ? WHERE key = ?', `HTTP ${status}: controleer botrechten en kanaal. Sla de instellingen opnieuw op om te hervatten.`, job.key);
        }
      }
      this.ctx.storage.sql.exec('DELETE FROM discord_interactions WHERE created_at < ?', Date.now() - 86400000);
      this.ctx.storage.sql.exec("DELETE FROM discord_jobs WHERE kind = 'login' AND created_at < ? AND version = delivered", Date.now() - 30 * 86400000);
    } finally { await this.#schedule(); }
  }
}
