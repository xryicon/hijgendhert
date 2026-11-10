export type DiscordMember = {
  id: string;
  avatarUrl?: string | null;
  displayName: string;
  username: string;
  clanRole: 'Member' | 'Admin' | 'Staff team';
  joinedAt: string | null;
  expiresAt: number;
};
export type ClanPlayer = {
  id: number; username: string; displayName: string; type: string;
  exp: number | null; ehp: number | null; ehb: number | null;
};
export type MemberEvent = {
  id: number; title: string; startsAt: string; endsAt: string; metric: string;
  unit: string; rank: number | null; gained: number | null; participantCount: number;
  status: 'active' | 'finished' | 'upcoming';
};
export type MemberProfile = {
  player: ClanPlayer | null;
  clanRank: import('./osrs-ranks').ClanRank | null;
  selection: 'saved' | 'discord' | 'account' | null;
  players: Pick<ClanPlayer, 'id' | 'username' | 'displayName'>[];
  events: MemberEvent[];
  eventsError: string | null;
  fetchedAt: string;
  stale?: boolean;
  notice?: string;
  activitySnapshot?: import('./member-account').SavedMemberActivity | null;
  bosses: import('./profile-progress').BossProfile | null;
  bossesError: string | null;
  progression: import('./profile-progress').RankProgress | null;
  progressionError: string | null;
};
export type PublicRankProgress = Omit<import('./profile-progress').RankProgress, 'eventAdjustment' | 'stateRevision' | 'rankOverride' | 'adjustmentReason' | 'rules'> & {
  rules: Pick<import('./profile-progress').RankRules, 'steps' | 'configured'>;
};
export type PublicMemberProfile = Omit<MemberProfile, 'selection' | 'players' | 'progression'> & {
  player: ClanPlayer; progression: PublicRankProgress | null;
};
