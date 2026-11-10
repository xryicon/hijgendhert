import type { ClanPlayer, MemberEvent } from './member-types';
import type { BossProfile } from './profile-progress';
import type { MemberActivity } from './member-activity';

// Game data only. Authentication credentials, Discord details and admin notes
// are deliberately absent from saved account snapshots.
export type SavedMemberSnapshot = {
  player: ClanPlayer; role: string; events: MemberEvent[]; bosses: BossProfile | null; fetchedAt: string;
};
export type SavedMemberAccount = { revision: number; playerId: number | null; snapshot: SavedMemberSnapshot | null };
export type SavedMemberActivity = { activities: MemberActivity[]; fetchedAt: string };
export const EMPTY_MEMBER_ACCOUNT: SavedMemberAccount = { revision: 0, playerId: null, snapshot: null };

export function currentEventStatuses(events: MemberEvent[], now = Date.now()): MemberEvent[] {
  return events.map(event => {
    const status = Date.parse(event.startsAt) > now ? 'upcoming' : Date.parse(event.endsAt) > now ? 'active' : 'finished';
    // An old live standing is not a confirmed final result or podium place.
    return event.status !== 'finished' && status === 'finished' ? { ...event, status, gained: null, rank: null } : { ...event, status };
  });
}
