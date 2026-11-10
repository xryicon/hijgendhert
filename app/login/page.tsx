import Link from '@/components/site-link';
import type { Metadata } from 'next';
import { env } from 'cloudflare:workers';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import SiteHeader from '@/components/site-header';
import { discordConfig } from '@/lib/discord-auth';
import { currentDiscordMember } from '@/lib/discord-member';
import { redirect } from 'next/navigation';
import LoginSessionRedirect from '@/components/login-session-redirect';
import DiscordLoginControls from '@/components/discord-login-controls';
import { discordRetryDeadline } from '@/lib/discord-retry';
import '../member-access.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Login | Hijgend Hert', robots: { index: false, follow: false } };
const errors: Record<string, string> = {
  setup: 'De Discord-koppeling wordt nog ingesteld. Je kunt binnenkort inloggen.',
  expired: 'Log in met Discord om de ledenomgeving te openen.',
  role: 'Je hebt de rol Member, Admin of Staff team nodig in onze Discord. Vraag de clanleiding om je rang te controleren.',
  server: 'Je Discord-account is geen lid van onze server. Kom eerst bij Hijgend Hert.',
  pending: 'Rond eerst de toelating in onze Discord-server af en probeer het opnieuw.',
  unavailable: 'Discord is even niet bereikbaar. Je toegang kon niet worden gecontroleerd. Probeer het straks opnieuw.',
  state: 'Deze inlogpoging is verlopen of ongeldig. Begin opnieuw met de knop hieronder.',
  cancelled: 'Inloggen is geannuleerd. Je kunt het hieronder opnieuw proberen.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const config = discordConfig(env);
  const requestedRetryAt = params.error === 'unavailable' ? discordRetryDeadline(params.retryAt) : 0;
  // A redirect after a limited page check must not immediately check again.
  const current = requestedRetryAt ? { member: null, reason: 'unavailable', reference: null, retryAt: requestedRetryAt } : await currentDiscordMember();
  if (current.member) redirect('/profiel');
  const error = typeof params.error === 'string' ? errors[params.error] : undefined;
  const message = !config ? errors.setup : error || (current.reason === 'unavailable' ? errors.unavailable : undefined);
  const reference = current.reference || (typeof params.ref === 'string' && /^HH-[A-Z]{2,12}-[A-Z0-9_]{2,40}$/.test(params.ref) ? params.ref : null);
  const reconnecting = current.reason === 'unavailable' || params.error === 'unavailable';
  const retryAt = Math.max(requestedRetryAt, current.retryAt);
  return <>
    <LoginSessionRedirect/>
    <SiteHeader view="member"/>
    <main id="main" className="member-page login-page" data-discord-retry-at={retryAt || undefined}>
      <section className="member-gate" aria-labelledby="member-title">
        <Link prefetch={false} className="member-back" href="/"><ArrowLeft size={15}/> Terug naar de clan</Link>
        <img className="member-crest" src="/clan-logo.png" alt=""/>
        <p className="member-eyebrow">HIJGEND HERT</p>
        <h1 id="member-title">Welkom <em>terug.</em></h1>
        <p className="member-intro">Je clan, je avonturen en je voortgang.<br/>Log in met je Discord-account.</p>
        <div className="member-role"><ShieldCheck size={17}/><span>Member · Admin · Staff team</span></div>
        {message && !reconnecting && <p className={`member-notice${!config ? ' member-notice-setup' : ''}`} role="status">{message}</p>}
        {params.loggedOut === '1' && <p className="member-notice" role="status">Je bent uitgelogd.{params.revoke === 'pending' && ' Discord kon de koppeling nog niet intrekken. Je kunt deze zelf verwijderen onder Gebruikersinstellingen → Geautoriseerde apps.'}</p>}
        <DiscordLoginControls enabled={!!config} authUrl={config ? `${config.origin}/api/auth/discord` : undefined} initialRetryAt={retryAt} issue={reconnecting ? reference?.endsWith('HTTP429') ? 'rate-limit' : 'connection' : undefined} reference={reference}/>
        <p className="member-help">Nog geen toegang? <a href="https://discord.gg/KFNqA6bnZ4" target="_blank" rel="noreferrer">Kom naar onze Discord</a></p>
        <details className="member-privacy"><summary>Wat koppelen we aan je account?</summary><p>We controleren je Discord-profiel en of je de rol Member, Admin of Staff team hebt op de server van Hijgend Hert. We vragen geen toegang tot je e-mail of berichten.</p><p>Je gekozen RuneScape-account en laatst opgehaalde spelgegevens worden bij je Discord-account bewaard. Zo hoef je je account niet opnieuw te kiezen en blijft je laatst bekende profiel zichtbaar als Wise Old Man tijdelijk niet bereikbaar is.</p><p>Je blijft in deze browser maximaal 30 dagen ingelogd. We vernieuwen de Discord-verbinding automatisch en blijven je clanrol controleren. Uitloggen verwijdert de beveiligde cookie en trekt de Discord-toegang in.</p></details>
      </section>
      <p className="member-public-note">De homepage, clangegevens en events zijn voor iedereen te bekijken.</p>
    </main>
  </>;
}
