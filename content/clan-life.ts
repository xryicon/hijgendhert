import type { Activity, ClanMoment } from '@/lib/community';

// Add confirmed activities here. Use ISO timestamps with an offset (e.g. +01:00)
// and the specific Discord event URL for signups. The calendar uses Dutch time.
export const activities: Activity[] = [];

// Add real, approved clan screenshots under public/moments and reference their
// /moments/... paths here. Categories: drop, pet, milestone. No demo records.
export const moments: ClanMoment[] = [];
