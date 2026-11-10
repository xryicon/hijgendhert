import { DiscordAccessError, type DiscordMembershipOutcome, type DiscordMembershipResult } from './discord-auth';

export const DISCORD_MEMBERSHIP_FRESH_MS = 15_000;
type Pause = { fingerprint: string; retryAt: number; code: 'unavailable'; detail: string };

// Owned by one Durable Object, not module-global Worker state. Credentials are
// only arguments to the pending request; storage contains a retry deadline.
export class DiscordMembershipCache {
  private cached: { fingerprint: string; checkedAt: number; member: DiscordMembershipResult['member'] } | null = null;
  private pending: { fingerprint: string; result: Promise<DiscordMembershipOutcome> } | null = null;
  private generation = 0;

  constructor(private readPause: () => Pause | null, private savePause: (value: Pause | null) => void, private now = Date.now) {}

  clear() {
    this.generation += 1;
    this.cached = null;
    this.pending = null;
    // Logging out does not cancel a provider's rate-limit deadline.
  }

  async check(fingerprint: string, fresh: boolean, load: () => Promise<DiscordMembershipResult>): Promise<DiscordMembershipOutcome> {
    if (this.pending?.fingerprint === fingerprint) return this.pending.result;
    const now = this.now();
    const cached = this.cached;
    if (!fresh && cached?.fingerprint === fingerprint && now >= cached.checkedAt && now - cached.checkedAt < DISCORD_MEMBERSHIP_FRESH_MS) return { ok: true, member: cached.member };
    const pause = this.readPause();
    if (pause?.fingerprint === fingerprint && now < pause.retryAt) return { ok: false, code: pause.code, detail: pause.detail, retryAfter: Math.max(1, Math.ceil((pause.retryAt - now) / 1000)) };
    this.cached = null;
    const generation = this.generation;
    const result = (async (): Promise<DiscordMembershipOutcome> => {
      try {
        const value = await load();
        if (generation !== this.generation) return { ok: false, code: 'expired' };
        const checkedAt = this.now();
        this.savePause(value.cooldownSeconds > 0 ? { fingerprint, code: 'unavailable', detail: 'HTTP429', retryAt: checkedAt + value.cooldownSeconds * 1000 } : null);
        this.cached = { fingerprint, checkedAt, member: value.member };
        return { ok: true, member: value.member };
      } catch (error) {
        if (generation !== this.generation) return { ok: false, code: 'expired' };
        this.cached = null;
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
