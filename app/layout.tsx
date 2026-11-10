import type { Metadata } from "next";
import SessionProvider from '@/components/session-provider';
import NotificationProvider from '@/components/notification-center';
import { MemberAvatarProvider } from '@/components/member-avatar';
import "./globals.css";
import "./professional.css";
import "./community.css";
import "./woodland.css";
import "./clan-stats.css";
import "./clan-navigation.css";
import "./clan-events.css";
import "./hijgend-hert.css";
import "./live-event-background.css";
import "./home-refinements.css";
import "./events-overview.css";
import "./brass-controls.css";
import "./clan-calendar.css";
import './clan-raffle.css';
import './notifications.css';
import './osrs-metrics.css';
import './account-access.css';
import './member-avatars.css';
import './member-leaderboard.css';
import './clan-admin.css';
import './clan-admin-woodland.css';
import './pk.css';

export const metadata: Metadata = {
  title: "Hijgend Hert — Samen op avontuur in Gielinor",
  description: "De Nederlandstalige Old School RuneScape-clan voor PvM, PvP en raids. Ontdek onze leden, competities en voortgang via Wise Old Man.",
  metadataBase: new URL("https://hijgend-hert-clan.xryicon.chatgpt.site"),
  openGraph: { title: "Hijgend Hert | Old School RuneScape", description: "Gedreven door community & grind. Met de actuele Wise Old Man-eventranglijst.", images: ["/clan-logo.png"], locale: "nl_NL", type: "website" },
  icons: {
    icon: "/clan-logo.png",
    shortcut: "/clan-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body className="antialiased"><SessionProvider><MemberAvatarProvider><NotificationProvider>{children}</NotificationProvider></MemberAvatarProvider></SessionProvider></body>
    </html>
  );
}
