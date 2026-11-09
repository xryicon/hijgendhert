import type { Metadata } from 'next';
import { env } from 'cloudflare:workers';
import { ArrowRight, ShieldCheck, MessageCircle, ArrowLeft } from 'lucide-react';
import SiteHeader from '@/components/site-header';
import { discordConfig } from '@/lib/discord-auth';
import { currentDiscordMember } from '@/lib/discord-member';
import { redirect } from 'next/navigation';
import LoginSessionRedirect from '@/components/login-session-redirect';
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
  const current = await currentDiscordMember();
  if (current.member) redirect('/profiel');
  const error = typeof params.error === 'string' ? errors[params.error] : undefined;
  const message = !config ? errors.setup : error || (current.reason === 'unavailable' ? errors.unavailable : undefined);
  return <>
    <LoginSessionRedirect/>
    <SiteHeader view="member"/>
    <main id="main" className="member-page">
      <section className="member-gate" aria-labelledby="member-title">
        <a className="member-back" href="/"><ArrowLeft size={15}/> Terug naar de clan</a>
        <img className="member-crest" src="/clan-logo.png" alt=""/>
        <p className="member-eyebrow">HIJGEND HERT · VOOR CLANLEDEN</p>
        <h1 id="member-title">Welkom terug,<br/><em>clanmaat.</em></h1>
        <p className="member-intro">Eén clan. Eén Discord-account.<br/>Log in en stap de ledenomgeving binnen.</p>
        <div className="member-role"><ShieldCheck size={17}/><span>Member · Admin · Staff team</span></div>
        {message && <p className={`member-notice${!config ? ' member-notice-setup' : ''}`} role="status">{message}</p>}
        {params.loggedOut === '1' && <p className="member-notice" role="status">Je bent uitgelogd.{params.revoke === 'pending' && ' Discord kon de koppeling nog niet intrekken. Je kunt deze zelf verwijderen onder Gebruikersinstellingen → Geautoriseerde apps.'}</p>}
        {config ? <a className="member-login" href={`${config.origin}/api/auth/discord`}><MessageCircle size={21}/><span>Inloggen met Discord</span><ArrowRight size={18}/></a> : <button className="member-login" disabled><MessageCircle size={21}/><span>Inloggen met Discord</span><ArrowRight size={18}/></button>}
        <p className="member-help">Nog geen toegang? <a href="https://discord.gg/KFNqA6bnZ4" target="_blank" rel="noreferrer">Kom naar onze Discord</a></p>
        <details className="member-privacy"><summary>Wat koppelen we aan je account?</summary><p>We controleren je Discord-profiel en of je de rol Member, Admin of Staff team hebt op de server van Hijgend Hert. We vragen geen toegang tot je e-mail of berichten.</p><p>Een beveiligde cookie houdt je maximaal 8 uur ingelogd. Je rol wordt opnieuw gecontroleerd wanneer je de ledenomgeving opent en elke minuut zolang die openstaat. Uitloggen verwijdert de cookie en trekt de Discord-toegang in.</p></details>
      </section>
      <p className="member-public-note">De homepage, clangegevens en events zijn voor iedereen te bekijken.</p>
    </main>
  </>;
}
