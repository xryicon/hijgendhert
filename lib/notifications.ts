import { localDay } from './community';

export type NotificationKind = 'raffle' | 'event' | 'event_start' | 'calendar' | 'calendar_update';
export type ClanNotification = {
  id: string; kind: NotificationKind; title: string; detail: string; href: string; createdAt: string;
};
export type NotificationSourceName = 'competitions' | 'calendar' | 'raffles';
export type NotificationSourceUpdates = Partial<Record<NotificationSourceName, unknown>>;
export type TrackedNotificationSource = {
  id: string; title: string; detail: string; href: string;
  startsAt: string; endsAt: string; publishedAt: string | null;
  firstSeenAt: string; revision: number; signature: string;
  cancelled: boolean;
};
export type NotificationFeedState = {
  notifications: ClanNotification[];
  sources: Record<NotificationSourceName, TrackedNotificationSource[]>;
};

const DAY = 86_400_000;
export const NOTIFICATION_RETENTION_MS = 30 * DAY;
export const NOTIFICATION_STORE_LIMIT = 100;
export const NOTIFICATION_VISIBLE_LIMIT = 50;
const SOURCE_LIMIT = 200;
const sourceNames: NotificationSourceName[] = ['competitions', 'calendar', 'raffles'];
const prefixOf = (source: NotificationSourceName) => source === 'competitions' ? 'event' : source === 'raffles' ? 'raffle' : 'calendar';
const iso = (value: number) => new Date(value).toISOString();
const stamp = (value: string) => new Date(value).toLocaleString('nl-NL', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam',
});
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function text(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value.trim();
}
function date(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? iso(ms) : null;
}
function numberDate(value: unknown): string | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < 8_640_000_000_000_000 ? iso(value) : null;
}
function stringId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value) ? value : null;
}

function normalize(value: unknown, source: NotificationSourceName, now: number): Omit<TrackedNotificationSource, 'firstSeenAt' | 'revision'> | null {
  if (!record(value)) return null;
  const title = text(value.title, 200);
  if (!title) return null;
  const id = source === 'competitions'
    ? typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0 ? String(value.id) : null
    : stringId(value.id);
  if (!id) return null;
  if (source === 'competitions' && value.groupId !== undefined && value.groupId !== 7059) return null;
  const startsAt = source === 'raffles' ? numberDate(value.drawAt) : date(value.startsAt);
  const endsAt = source === 'raffles' ? startsAt : date(value.endsAt);
  if (!startsAt || !endsAt || (source !== 'raffles' && Date.parse(endsAt) <= Date.parse(startsAt))) return null;
  let publishedAt = source === 'raffles' ? numberDate(value.createdAt) : date(value.createdAt);
  if (publishedAt && Date.parse(publishedAt) > now) publishedAt = null;
  let detail: string, href: string, cancelled = false;
  if (source === 'raffles') {
    if (!['scheduled', 'drawn', 'cancelled'].includes(String(value.status)) || !publishedAt || Date.parse(publishedAt) > Date.parse(startsAt)) return null;
    cancelled = value.status === 'cancelled';
    const prize = text(value.prize, 200);
    detail = `${title}${prize ? ` · ${prize}` : ''} · Trekking ${stamp(startsAt)} (NL/BE)`;
    href = '/events#raffle';
  } else {
    if (source === 'competitions' && !text(value.metric, 80)) return null;
    if (source === 'calendar' && !['raid', 'boss', 'social'].includes(String(value.category))) return null;
    detail = `${title} · ${stamp(startsAt)} (NL/BE)`;
    href = `/events?dag=${localDay(startsAt)}#kalender`;
  }
  // Participant counts and other live scores do not create calendar revisions.
  const signature = JSON.stringify([title, startsAt, endsAt, href,
    source === 'calendar' ? [text(value.description, 1000) || '', text(value.host, 100) || '', value.category] : null]);
  return { id, title, detail, href, startsAt, endsAt, publishedAt, signature, cancelled };
}

function sorted(items: ClanNotification[], now: number) {
  return items.filter(item => Date.parse(item.createdAt) <= now && Date.parse(item.createdAt) >= now - NOTIFICATION_RETENTION_MS)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}

export function visibleNotifications(state: NotificationFeedState, now = Date.now()): ClanNotification[] {
  return sorted(state.notifications, now).slice(0, NOTIFICATION_VISIBLE_LIMIT);
}

/** Successful source snapshots only; omit failed sources to retain their last-known schedule. */
export function updateNotificationFeed(previous: NotificationFeedState | null, updates: NotificationSourceUpdates, now = Date.now()): NotificationFeedState {
  if (!Number.isFinite(now)) throw new Error('Invalid notification time');
  const notes = new Map((previous?.notifications || []).map(item => [item.id, { ...item }]));
  const sources: NotificationFeedState['sources'] = { competitions: [], calendar: [], raffles: [] };
  for (const source of sourceNames) {
    const prefix = prefixOf(source);
    const old = new Map((previous?.sources[source] || []).map(item => [item.id, item]));
    const incoming = updates[source];
    // A malformed envelope is an unavailable source, not an authoritative empty list.
    const supplied = Array.isArray(incoming) && incoming.length <= 5000;
    let current: TrackedNotificationSource[];
    if (supplied) {
      const normalized = new Map<string, Omit<TrackedNotificationSource, 'firstSeenAt' | 'revision'>>();
      let malformed = false;
      for (const raw of incoming) {
        const entry = normalize(raw, source, now);
        if (entry && !normalized.has(entry.id)) normalized.set(entry.id, entry);
        if (!entry) malformed = true;
      }
      // Avoid replacing a valid snapshot with a completely malformed response.
      if (incoming.length && !normalized.size) current = [...old.values()];
      else {
        // A partially malformed snapshot cannot prove that omitted activities
        // were removed. Valid rows still update without discarding other records.
        if (malformed) for (const [id, saved] of old) if (!normalized.has(id)) normalized.set(id, saved);
        current = [...normalized.values()]
          .filter(entry => Date.parse(entry.endsAt) >= now - NOTIFICATION_RETENTION_MS)
          .sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt) || a.id.localeCompare(b.id))
          .slice(0, SOURCE_LIMIT).map(entry => {
          const saved = old.get(entry.id);
          const changed = !!saved && saved.signature !== entry.signature;
          const revision = (saved?.revision || 0) + (changed ? 1 : 0);
          if (changed && source !== 'raffles' && Date.parse(entry.endsAt) > now) {
            notes.set(`${prefix}:${entry.id}:updated:${revision}`, {
              id: `${prefix}:${entry.id}:updated:${revision}`, kind: 'calendar_update', title: 'Agenda gewijzigd',
              detail: entry.detail, href: entry.href, createdAt: iso(now),
            });
          }
          return { ...entry, firstSeenAt: saved?.firstSeenAt || iso(now), revision };
        });
        const currentIds = new Set(current.map(entry => entry.id));
        for (const [id, entry] of old) if (!currentIds.has(id)) {
          // Removed upcoming activities must not later produce a ghost start.
          if (Date.parse(entry.startsAt) > now) for (const key of notes.keys()) if (key.startsWith(`${prefix}:${id}:`)) notes.delete(key);
        }
      }
    } else current = [...old.values()];

    for (const entry of current) {
      const base = `${prefix}:${entry.id}:`;
      const starts = Date.parse(entry.startsAt);
      const ends = Date.parse(entry.endsAt);
      const oldEntry = old.get(entry.id);
      const newId = `${base}new`;
      if (entry.cancelled) {
        for (const key of notes.keys()) if (key.startsWith(base)) notes.delete(key);
        continue;
      }
      if (oldEntry && oldEntry.startsAt !== entry.startsAt) {
        for (const key of notes.keys()) if (key.startsWith(`${base}start:`)) notes.delete(key);
      }
      const published = entry.publishedAt === null ? null : Date.parse(entry.publishedAt);
      // A first observation is useful for upcoming competitions and active calendar
      // activities. Old completed records never become newly announced today.
      const canAnnounce = published !== null || (source === 'calendar' ? ends > now : starts > now);
      const announcementAt = canAnnounce ? (published ?? Date.parse(entry.firstSeenAt)) : null;
      if (announcementAt !== null && announcementAt >= now - NOTIFICATION_RETENTION_MS && announcementAt <= now) {
        const existing = notes.get(newId);
        if (source === 'raffles' || ends > now || existing) notes.set(newId, {
          id: newId, kind: source === 'raffles' ? 'raffle' : source === 'calendar' ? 'calendar' : 'event',
          title: source === 'raffles' ? 'Nieuwe clanloterij' : source === 'calendar' ? 'Nieuw in de clanagenda' : 'Nieuw clanevent',
          detail: entry.detail, href: entry.href, createdAt: existing?.createdAt || iso(announcementAt),
        });
      }
      if (source !== 'raffles' && starts <= now && starts >= now - 7 * DAY) {
        const id = `${base}start:${starts}`;
        notes.set(id, { id, kind: 'event_start', title: 'Een clanevent is begonnen', detail: entry.detail, href: entry.href, createdAt: entry.startsAt });
      }
    }
    sources[source] = current.filter(entry => Date.parse(entry.endsAt) >= now - NOTIFICATION_RETENTION_MS)
      .sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt) || a.id.localeCompare(b.id)).slice(0, SOURCE_LIMIT);
  }
  return { notifications: sorted([...notes.values()], now).slice(0, NOTIFICATION_STORE_LIMIT), sources };
}
