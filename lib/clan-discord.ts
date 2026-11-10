import { z } from 'zod';
import { localDay } from './community';

export const discordId = z.string().regex(/^\d{17,20}$/);
const channel = z.union([z.literal(''), discordId]);
export const syncSettingsSchema = z.object({
  revision: z.number().int().nonnegative(),
  loginChannel: channel, eventsChannel: channel, raffleChannel: channel,
  loginEnabled: z.boolean(), eventsEnabled: z.boolean(), raffleEnabled: z.boolean(),
}).strict().refine(s => (!s.loginEnabled || s.loginChannel) && (!s.eventsEnabled || s.eventsChannel) && (!s.raffleEnabled || s.raffleChannel), 'Vul een kanaal-ID in voordat je meldingen aanzet.');
export type SyncSettings = z.infer<typeof syncSettingsSchema>;
export const EMPTY_SYNC_SETTINGS: SyncSettings = { revision: 0, loginChannel: '', eventsChannel: '', raffleChannel: '', loginEnabled: false, eventsEnabled: false, raffleEnabled: false };
export const eventInputSchema = z.object({
  id: z.string().uuid(), revision: z.number().int().nonnegative(),
  title: z.string().trim().min(3).max(100), description: z.string().trim().min(3).max(1200),
  category: z.enum(['raid', 'boss', 'social']),
  startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }),
  status: z.enum(['scheduled', 'cancelled']),
}).strict().refine(e => Date.parse(e.endsAt) > Date.parse(e.startsAt), 'De eindtijd moet na de begintijd liggen.');
export type ClanEventInput = z.infer<typeof eventInputSchema>;
export type ClanEvent = ClanEventInput & { host: string; createdAt: string; updatedAt: string };
export type EventParticipant = { userId: string; name: string; joinedAt: string };
export type EventView = ClanEvent & { participantCount: number; joined: boolean; participants?: EventParticipant[] };
export type SyncKind = 'login' | 'events' | 'raffle';
export type LoginNotice = { id: string; userId: string; name: string; at: string };
export type RaffleNotice = { id: string; title: string; prize: string; winner: string; winningTicket: number; totalTickets: number; drawnAt: number };
export type DiscordMessage = { content?: string; embeds?: object[]; components?: object[]; allowed_mentions: { parse: string[] } };
export const isStaff = (role: string) => role === 'Admin' || role === 'Staff team';
export const SYNC_NAME = 'clan:7059';
export const cleanDiscordText = (text: string) => text.replace(/[\\`*_~|>\[\]()]/g, '\\$&').replace(/@/g, '@\u200b');
const time = (value: string | number) => `<t:${Math.floor(new Date(value).getTime() / 1000)}:F>`;
const embed = (title: string, description: string, url?: string) => ({ title, description, color: 0xb99142, ...(url ? { url } : {}), footer: { text: 'Hijgend Hert' } });
export function eventDiscordMessage(event: EventView, origin: string): DiscordMessage {
  const closed = event.status === 'cancelled' || Date.parse(event.startsAt) <= Date.now();
  const allNames = (event.participants || []).slice(0, 30).map(p => cleanDiscordText(p.name)).join(', ');
  const names = allNames.slice(0, 1000);
  return { allowed_mentions: { parse: [] }, embeds: [embed(event.title,
    `${event.status === 'cancelled' ? '**Geannuleerd**\n' : ''}${cleanDiscordText(event.description)}\n\n${time(event.startsAt)}\n**${event.participantCount} deelnemers**${names ? `\n${names}${event.participantCount > 30 || names.length < allNames.length ? '\nBekijk alle deelnemers op de website.' : ''}` : '\nWie gaat er mee?'}\n${closed ? 'Inschrijving gesloten.' : 'Meld je hieronder aan.'}`,
    `${origin}/events?dag=${localDay(event.startsAt)}#kalender`)], components: [{ type: 1, components: [
      { type: 2, style: 3, label: 'Aanmelden', custom_id: `hh:event:join:${event.id}`, disabled: closed },
      { type: 2, style: 2, label: 'Afmelden', custom_id: `hh:event:leave:${event.id}`, disabled: closed },
      { type: 2, style: 5, label: 'Bekijk event', url: `${origin}/events?dag=${localDay(event.startsAt)}#kalender` },
    ] }] };
}
export function noticeDiscordMessage(kind: 'login' | 'raffle', data: LoginNotice | RaffleNotice, origin: string): DiscordMessage {
  if (kind === 'login') {
    const login = data as LoginNotice;
    return { allowed_mentions: { parse: [] }, embeds: [embed('Ingelogd bij Hijgend Hert', `**${cleanDiscordText(login.name)}** heeft ingelogd.\n${time(login.at)}\nDiscord-ID: ${login.userId}`)] };
  }
  const raffle = data as RaffleNotice;
  return { allowed_mentions: { parse: [] }, embeds: [embed(`Uitslag · ${raffle.title}`, `**${cleanDiscordText(raffle.winner)}** wint!\n\nPrijs: ${cleanDiscordText(raffle.prize)}\nWinnend lot: **${raffle.winningTicket}** van ${raffle.totalTickets}\n${time(raffle.drawnAt)}\n\nBekijk de trekking en het controlebewijs op de website.`, `${origin}/events?id=${raffle.id}#raffle`)] };
}
