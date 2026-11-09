import type { Metadata } from "next";
import SessionProvider from '@/components/session-provider';
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
      <body className="antialiased"><SessionProvider>{children}</SessionProvider></body>
    </html>
  );
}
