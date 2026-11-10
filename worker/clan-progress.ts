import { DurableObject } from 'cloudflare:workers';
import { DEFAULT_RANK_RULES, EMPTY_PLAYER_PROGRESS, memberRankSchema, rankRulesSchema, type PlayerProgressState, type RankRules } from '../lib/profile-progress';
import type { MemberEvent } from '../lib/member-types';
import { EMPTY_MEMBER_ACCOUNT, type SavedMemberAccount, type SavedMemberSnapshot, type SavedMemberActivity } from '../lib/member-account';
import { updateNotificationFeed, visibleNotifications, type NotificationFeedState, type NotificationSourceUpdates } from '../lib/notifications';
import { rememberAvatar, matchMemberAvatars, type AvatarIdentity, type AvatarPlayer, type StoredAvatar } from '../lib/member-avatars';
import type { LeaderboardEvent } from '../lib/event-leaderboard';
import { fetchDiscordMembership } from '../lib/discord-auth';
import { DiscordMembershipCache, DISCORD_MEMBERSHIP_FRESH_MS, type DiscordMembershipEvidence } from '../lib/discord-membership-cache';

type NotificationSources = Partial<Record<keyof NotificationSourceUpdates, number>>;
type StoredNotifications = { state: NotificationFeedState | null; checkedAt: NotificationSources };

// Separate object names isolate the clan policy from each player's event record.
export class ClanProgress extends DurableObject<Cloudflare.Env> {
  #discordChecks = new DiscordMembershipCache(
    () => this.#read('discord-check-pause', null), pause => this.#save('discord-check-pause', pause), Date.now,
    { read: () => this.#read<DiscordMembershipEvidence | null>('discord-check-evidence', null), save: value => {
      if (value) this.#save('discord-check-evidence', value);
      else this.ctx.storage.sql.exec('DELETE FROM profile_settings WHERE key = ?', 'discord-check-evidence');
    } },
  );
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
  // Account objects are addressed only with the live-authorized Discord user id.
  // These cache writes intentionally do not duplicate snapshots in the audit log.
  #save(key: string, value: unknown) {
    this.ctx.storage.sql.exec('INSERT INTO profile_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  }
  async checkDiscordMembership(guildId: string, accessToken: string, fresh: boolean) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${guildId}:${accessToken}`));
    const fingerprint = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    const result = await this.#discordChecks.check(fingerprint, fresh, () => fetchDiscordMembership(guildId, accessToken));
    const evidence = this.#read<DiscordMembershipEvidence | null>('discord-check-evidence', null);
    if (evidence) await this.ctx.storage.setAlarm(evidence.checkedAt + DISCORD_MEMBERSHIP_FRESH_MS);
    return result;
  }
  clearDiscordMembership() { this.#discordChecks.clear(); }
  async alarm() {
    const evidence = this.#read<DiscordMembershipEvidence | null>('discord-check-evidence', null);
    if (!evidence) return;
    const expiresAt = evidence.checkedAt + DISCORD_MEMBERSHIP_FRESH_MS;
    if (expiresAt <= Date.now()) this.#discordChecks.clear();
    else await this.ctx.storage.setAlarm(expiresAt);
  }
  getAccount(): SavedMemberAccount { return this.#read('account', EMPTY_MEMBER_ACCOUNT); }
  getLeaderboardEvents(): LeaderboardEvent[] {
    return this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM profile_settings WHERE key LIKE 'leaderboard-event:%' LIMIT 2000").toArray().map(row => JSON.parse(row.value) as LeaderboardEvent);
  }
  saveLeaderboardEvent(event: LeaderboardEvent) {
    const key = `leaderboard-event:${event.id}`;
    const old = this.#read<LeaderboardEvent | null>(key, null);
    if (!old || Date.parse(old.fetchedAt) <= Date.parse(event.fetchedAt)) this.#save(key, event);
  }
  claimLeaderboardRefresh() {
    if (this.#read<number>('leaderboard-retry-at', 0) > Date.now()) return false;
    this.#save('leaderboard-retry-at', Date.now() + 180_000);
    return true;
  }
  releaseLeaderboardRefresh(seconds: number) { this.#save('leaderboard-retry-at', Date.now() + Math.max(10, seconds) * 1000); }
  leaderboardRetryAfter() { return Math.max(10, Math.ceil((this.#read<number>('leaderboard-retry-at', 0) - Date.now()) / 1000)); }
  rememberMemberAvatar(member: AvatarIdentity) {
    this.#save('member-avatars', rememberAvatar(this.#read<StoredAvatar[]>('member-avatars', []), member));
  }
  getMemberAvatars(players: AvatarPlayer[]) {
    return matchMemberAvatars(this.#read<StoredAvatar[]>('member-avatars', []), players.slice(0, 2000));
  }
  selectAccount(playerId: number | null, revision: number) {
    const saved = this.getAccount();
    if (saved.revision !== revision || (playerId !== null && (!Number.isSafeInteger(playerId) || playerId <= 0))) return false;
    this.#save('account', { revision: revision + 1, playerId, snapshot: saved.playerId === playerId ? saved.snapshot : null });
    return true;
  }
  saveAccountSnapshot(snapshot: SavedMemberSnapshot, revision: number) {
    const saved = this.getAccount();
    if (saved.revision !== revision || saved.playerId !== snapshot.player.id || !Number.isFinite(Date.parse(snapshot.fetchedAt))) return false;
    if (saved.snapshot && Date.parse(saved.snapshot.fetchedAt) > Date.parse(snapshot.fetchedAt)) return false;
    // Construct the stored shape explicitly; never store auth or request objects.
    const safe = { player: snapshot.player, role: snapshot.role, events: snapshot.events, bosses: snapshot.bosses, fetchedAt: snapshot.fetchedAt };
    if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > 900_000) return false;
    this.#save('account', { ...saved, snapshot: safe });
    return true;
  }
  getActivities(): SavedMemberActivity | null { return this.#read('activities', null); }
  syncNotifications(updates: NotificationSourceUpdates = {}, checkedAt: NotificationSources = {}) {
    const previous = this.#read<StoredNotifications>('notification-feed', { state: null, checkedAt: {} });
    const accepted: NotificationSourceUpdates = {};
    const times = { ...previous.checkedAt };
    for (const key of ['competitions', 'calendar', 'raffles'] as const) {
      const timestamp = checkedAt[key];
      // A slow request must not restore an older schedule over a newer one.
      if (Array.isArray(updates[key]) && timestamp !== undefined && Number.isFinite(timestamp)
        && timestamp >= (times[key] || 0) && timestamp <= Date.now() + 60_000) {
        accepted[key] = updates[key]; times[key] = timestamp;
      }
    }
    const state = updateNotificationFeed(previous.state, accepted);
    const next = { state, checkedAt: times };
    if (JSON.stringify(next) !== JSON.stringify(previous)) this.#save('notification-feed', next);
    return visibleNotifications(state);
  }
  getNotificationReads(): string[] { return this.#read('notification-reads', []); }
  markNotificationsRead(ids: string[]) {
    const safe = ids.filter(id => typeof id === 'string' && id.length > 0 && id.length <= 200).slice(0, 50);
    const readIds = [...new Set([...this.getNotificationReads(), ...safe])].slice(-500);
    this.#save('notification-reads', readIds);
    return readIds;
  }
  saveActivities(input: SavedMemberActivity) {
    if (!Number.isFinite(Date.parse(input.fetchedAt)) || input.activities.length > 10) return;
    const saved = this.getActivities();
    if (!saved || Date.parse(input.fetchedAt) >= Date.parse(saved.fetchedAt)) this.#save('activities', input);
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
