export type DiscordMember = {
  id: string;
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
  selection: 'saved' | 'discord' | null;
  players: Pick<ClanPlayer, 'id' | 'username' | 'displayName'>[];
  events: MemberEvent[];
  eventsError: string | null;
  fetchedAt: string;
  stale?: boolean;
  bosses: import('./profile-progress').BossProfile | null;
  bossesError: string | null;
  progression: import('./profile-progress').RankProgress | null;
  progressionError: string | null;
};
