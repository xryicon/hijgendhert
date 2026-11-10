import { DiscordAccessError, type DiscordMembershipOutcome, type DiscordMembershipResult } from './discord-auth';

export const DISCORD_MEMBERSHIP_FRESH_MS = 5 * 60_000;
type Pause = { fingerprint: string; retryAt: number; code: 'unavailable'; detail: string };
export type DiscordMembershipEvidence = { fingerprint: string; checkedAt: number; member: DiscordMembershipResult['member'] };
type EvidenceStore = { read: () => DiscordMembershipEvidence | null; save: (value: DiscordMembershipEvidence | null) => void };

// Owned by one Durable Object, not module-global Worker state. Credentials are
// only arguments to the pending request. Short-lived membership evidence survives
// eviction, so opening another page does not spend the provider quota again.
export class DiscordMembershipCache {
  private cached: DiscordMembershipEvidence | null = null;
  private pending: { fingerprint: string; result: Promise<DiscordMembershipOutcome> } | null = null;
  private generation = 0;

  constructor(private readPause: () => Pause | null, private savePause: (value: Pause | null) => void, private now = Date.now, private evidence?: EvidenceStore) {}

  private saveEvidence(value: DiscordMembershipEvidence | null) {
    this.evidence?.save(value);
    this.cached = value;
  }

  clear() {
    this.generation += 1;
    this.saveEvidence(null);
    this.pending = null;
    // Logging out does not cancel a provider's rate-limit deadline.
  }

  async check(fingerprint: string, fresh: boolean, load: () => Promise<DiscordMembershipResult>): Promise<DiscordMembershipOutcome> {
    if (this.pending?.fingerprint === fingerprint) return this.pending.result;
    const now = this.now();
    const cached = this.cached ?? this.evidence?.read();
    if (!fresh && cached?.fingerprint === fingerprint && now >= cached.checkedAt && now - cached.checkedAt < DISCORD_MEMBERSHIP_FRESH_MS) return { ok: true, member: cached.member };
    if (cached && (now < cached.checkedAt || now - cached.checkedAt >= DISCORD_MEMBERSHIP_FRESH_MS)) this.saveEvidence(null);
    const pause = this.readPause();
    if (pause?.fingerprint === fingerprint && now < pause.retryAt) return { ok: false, code: pause.code, detail: pause.detail, retryAfter: Math.max(1, Math.ceil((pause.retryAt - now) / 1000)) };
    this.saveEvidence(null);
    const generation = this.generation;
    const result = (async (): Promise<DiscordMembershipOutcome> => {
      try {
        const value = await load();
        if (generation !== this.generation) return { ok: false, code: 'expired' };
        const checkedAt = this.now();
        this.savePause(value.cooldownSeconds > 0 ? { fingerprint, code: 'unavailable', detail: 'HTTP429', retryAt: checkedAt + value.cooldownSeconds * 1000 } : null);
        this.saveEvidence({ fingerprint, checkedAt, member: value.member });
        return { ok: true, member: value.member };
      } catch (error) {
        if (generation !== this.generation) return { ok: false, code: 'expired' };
        this.saveEvidence(null);
        const failure = error instanceof DiscordAccessError ? error : new DiscordAccessError('unavailable', 'NETWORK');
        if (failure.code === 'unavailable') this.savePause({ fingerprint, code: 'unavailable', detail: failure.detail || 'UNAVAILABLE', retryAt: this.now() + (failure.retryAfter || 15) * 1000 });
        else this.savePause(null);
        return { ok: false, code: failure.code, detail: failure.detail, retryAfter: failure.retryAfter };
      }
    })();
    this.pending = { fingerprint, result };
    try { return await result; }
    finally { if (this.pending?.result === result) this.pending = null; }
  }
}
