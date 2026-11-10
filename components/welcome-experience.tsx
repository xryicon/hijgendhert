'use client';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, Copy, MessageCircle, ShieldCheck, Sparkles, Sprout, Swords, Trophy, Users } from 'lucide-react';
import Link from './site-link';
import { useClanEvents } from './clan-event-signups';
import { CLAN_DISCORD, nextBeginnerEvent, type WelcomeContent } from '@/lib/welcome';
import { localDay } from '@/lib/community';
import type { EventView } from '@/lib/clan-discord';
function WelcomePortrait({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState('');
  const photo = src && src !== failed;
  return <span className="clan-avatar"><img src={photo ? src : '/clan-logo.png'} alt={photo ? `Profielfoto van ${name}` : ''} loading="lazy" referrerPolicy="no-referrer" width={128} height={128} onError={() => setFailed(src)}/></span>;
}

export function BeginnerEventDetails({ event }: { event: EventView }) {
  if (!event.beginnerFriendly) return null;
  return <div className="beginner-details"><span className="beginner-badge"><Sprout size={14}/> Beginnersvriendelijk</span><dl><div><dt>Ervaring</dt><dd>{event.experience}</dd></div><div><dt>Gear & voorbereiding</dt><dd>{event.gear}</dd></div></dl></div>;
}

function FirstClanEvening() {
  const { events, loading, error, refresh } = useClanEvents();
  const event = nextBeginnerEvent(events, Date.now());
  const stamp = event ? new Date(event.startsAt).toLocaleString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }) : '';
  return <section className="welcome-evening" aria-labelledby="first-clan-evening"><div className="welcome-evening-intro"><span className="welcome-seal"><CalendarDays size={30}/></span><p className="eyebrow">ZET DE EERSTE STAP</p><h2 id="first-clan-evening">Jouw eerste<br/><em>clanavond.</em></h2><p>Een nieuwe boss leren of samen op pad. Hier vind je de volgende activiteit waarbij er ruimte is voor uitleg en vragen.</p><Link href="/events#kalender" className="text-link">Bekijk de hele agenda <ArrowRight size={15}/></Link></div><div className="welcome-evening-card" aria-live="polite">{loading ? <div className="welcome-event-empty"><CalendarDays size={28}/><h3>Even in de agenda kijken…</h3><p>We halen de volgende beginnersvriendelijke activiteit op.</p></div> : error ? <div className="welcome-event-empty"><h3>De agenda is even niet bereikbaar.</h3><p>Vraag in Discord naar de volgende beginnersavond.</p><button className="text-link" onClick={() => void refresh().catch(() => {})}>Opnieuw proberen <ArrowRight size={15}/></button></div> : event ? <><span className="beginner-badge"><Sprout size={14}/> Beginnersvriendelijk</span><p className="welcome-event-date">{stamp} · NL/BE</p><h3>{event.title}</h3><p className="welcome-event-description">{event.description}</p><dl className="welcome-event-needs"><div><dt>ERVARING</dt><dd>{event.experience}</dd></div><div><dt>GEAR & VOORBEREIDING</dt><dd>{event.gear}</dd></div></dl><div className="welcome-event-bottom"><span><Users size={15}/>{event.participantCount} aangemeld</span><Link className="button gold" href={`/events?dag=${localDay(event.startsAt)}#kalender`}>Bekijk de activiteit <ArrowRight size={15}/></Link></div></> : <div className="welcome-event-empty"><Sprout size={32}/><span className="mini-label">HET VOLGENDE AVONTUUR KOMT ERAAN</span><h3>Nieuw in de clan?<br/>Zeg alvast hallo.</h3><p>Er staat nog geen beginnersvriendelijke activiteit gepland. Vertel in Discord wat je graag wilt leren of samen wilt doen.</p><a className="button gold" href={CLAN_DISCORD} target="_blank" rel="noreferrer">Vraag naar de volgende avond <ArrowUpRight size={15}/></a></div>}</div></section>;
}

function ClanGallery({ content }: { content: WelcomeContent }) {
  if (!content.photos.length) return null;
  return <section className="welcome-album" aria-labelledby="welcome-album-title"><div className="welcome-section-heading"><p className="eyebrow">DIT ZIJN WIJ</p><h2 id="welcome-album-title">Momenten met de herten.</h2><p>De avonturen die we samen beleven, vastgelegd door de clan.</p></div><div className="welcome-photo-grid">{content.photos.map((photo, index) => <figure key={photo.imageUrl + index}><img src={photo.imageUrl} alt={photo.caption} loading="lazy" referrerPolicy="no-referrer" width={720} height={450}/><figcaption><span>{String(index + 1).padStart(2, '0')}</span>{photo.caption}</figcaption></figure>)}</div></section>;
}

function MeetMembers({ content }: { content: WelcomeContent }) {
  if (!content.members.length) return null;
  return <section className="welcome-members" aria-labelledby="welcome-members-title"><div className="welcome-section-heading"><p className="eyebrow">ACHTER DE RUNESCAPE-NAAM</p><h2 id="welcome-members-title">Maak kennis met de herten.</h2></div><div className="welcome-member-grid">{content.members.map((member, index) => <article key={member.name + index}><WelcomePortrait name={member.name} src={member.avatarUrl}/><h3>{member.name}</h3><p>{member.introduction}</p>{member.rsName && <Link href={`/leden/${encodeURIComponent(member.rsName)}`} prefetch={false} className="text-link">Bekijk het clanprofiel <ArrowUpRight size={14}/></Link>}</article>)}</div></section>;
}

export function WelcomeSections({ content, mode }: { content: WelcomeContent; mode: 'home' | 'welcome' }) {
  return <div className="welcome-content container">
    {mode === 'home' && <section className="welcome-pillars" aria-labelledby="welcome-pillars-title"><div className="welcome-section-heading"><p className="eyebrow">ÉÉN CLAN. JOUW VOLGENDE HOOFDSTUK.</p><h2 id="welcome-pillars-title">Samen kom je verder.</h2><p>Een nieuwe uitdaging, een vraag of een mooie drop. Deel je avontuur met Hijgend Hert.</p></div><div className="welcome-pillar-grid"><article><span className="welcome-pillar-icon"><Sprout size={30}/></span><small>01 · ONTDEKKEN</small><h3>Leer samen.</h3><p>Vragen over quests, gear of je eerste boss? Vertel waar je mee bezig bent en vraag de clan om tips.</p><Link href="/nieuw-hier#eerste-week">Begin bij de clan <ArrowRight size={15}/></Link></article><article><span className="welcome-pillar-icon"><Swords size={30}/></span><small>02 · MEEDOEN</small><h3>Ga op avontuur.</h3><p>Van boss trips tot skill-events en clanavonden. Zoek in de agenda iets dat past bij jouw volgende doel.</p><Link href="/events#kalender">Ontdek de activiteiten <ArrowRight size={15}/></Link></article><article><span className="welcome-pillar-icon"><Trophy size={30}/></span><small>03 · VIEREN</small><h3>Elke mijlpaal telt.</h3><p>Je eerste fire cape, een nieuw level of die langverwachte drop: laat de andere herten meegenieten.</p><a href={CLAN_DISCORD} target="_blank" rel="noreferrer">Deel je avontuur <ArrowUpRight size={15}/></a></article></div></section>}
    <FirstClanEvening/>
    <ClanGallery content={content}/>
    <MeetMembers content={content}/>
    <section className="welcome-invitation"><span className="welcome-invitation-icon"><MessageCircle size={32}/></span><div><p className="eyebrow">ER IS ALTIJD EEN EERSTE HALLO</p><h2>Klaar om aan te sluiten?</h2><p>Vanaf {content.minimumTotal.toLocaleString('nl-NL')} total level. {content.contact}</p></div><a className="button gold" href={CLAN_DISCORD} target="_blank" rel="noreferrer">Naar onze Discord <ArrowUpRight size={17}/></a></section>
    <footer className="welcome-footer"><span>Hijgend Hert · Old School RuneScape · NL / BE</span><Link href="/nieuw-hier">Nieuw hier?</Link><Link href="/leden">Ontmoet de clan</Link><Link href="/events">Events</Link></footer>
  </div>;
}

export function FirstWeek({ content }: { content: WelcomeContent }) {
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState(false);
  async function copyName() { try { await navigator.clipboard.writeText('Hijgend Hert'); setCopied(true); setCopyError(false); } catch { setCopyError(true); } }
  return <section id="eerste-week" className="welcome-first-week container" aria-labelledby="first-week-title"><div className="welcome-section-heading"><p className="eyebrow">VAN EERSTE HALLO TOT EERSTE AVONTUUR</p><h2 id="first-week-title">Je eerste week bij de herten.</h2><p>Zo vind je jouw plek in de clan.</p></div><ol className="welcome-steps"><li><span>01</span><div><MessageCircle size={22}/><h3>Stel jezelf voor.</h3><p>{content.contact}</p><a href={CLAN_DISCORD} target="_blank" rel="noreferrer" className="text-link">Open Discord <ArrowUpRight size={14}/></a></div></li><li><span>02</span><div><Users size={22}/><h3>Stap de clanchat binnen.</h3><p>Zoek <strong>Hijgend Hert</strong> in het clanmenu van OSRS. Zeg hallo en overleg met de clanleiding over je aanmelding.</p><button className="text-link" onClick={() => void copyName()}>{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Clannaam gekopieerd' : 'Kopieer clannaam'}</button><span className="sr-only" role="status">{copied ? 'Hijgend Hert gekopieerd.' : copyError ? 'Kopiëren lukt niet. De clannaam is Hijgend Hert.' : ''}</span></div></li><li><span>03</span><div><Sparkles size={22}/><h3>Kies je eerste avontuur.</h3><p>Vertel wat je wilt leren. Bekijk de agenda en let op het label <strong>Beginnersvriendelijk</strong> voor activiteiten met ruimte voor uitleg.</p><Link className="text-link" href="/events#kalender">Bekijk de clanagenda <ArrowRight size={14}/></Link></div></li></ol></section>;
}

export function WelcomeFaq({ content }: { content: WelcomeContent }) {
  return <section className="welcome-faq container" aria-labelledby="welcome-faq-title"><div className="welcome-section-heading"><p className="eyebrow">GOED OM TE WETEN</p><h2 id="welcome-faq-title">Voor je aansluit.</h2></div><div><details open><summary>Wat heb ik nodig om lid te worden?</summary><p>Voor Hijgend Hert heb je minimaal <strong>{content.minimumTotal.toLocaleString('nl-NL')} total level</strong> nodig. Meld je vervolgens via Discord bij de clanleiding; zij helpen je met het aansluiten.</p></details><details><summary>Moet ik al ervaring hebben met bosses of raids?</summary><p>Dat verschilt per activiteit. Bij events met het label Beginnersvriendelijk staan de benodigde ervaring, gear en voorbereiding vermeld. Vraag bij twijfel vooraf aan de organisator of de activiteit bij je past.</p></details><details><summary>Ik zit nog onder {content.minimumTotal.toLocaleString('nl-NL')} total. Wat nu?</summary><p>Je kunt de website en activiteiten alvast bekijken. Voor clanlidmaatschap geldt de total-level-eis; bespreek vragen over aansluiten met de clanleiding op Discord.</p></details><details><summary>Hoe schrijf ik me in voor een event?</summary><p>Na je toelating kun je met je Discord-clanaccount inloggen op de website. Open een geplande clanactiviteit in de agenda en kies Aanmelden. Bekijk daar ook de voorbereiding en eventuele deelname-eisen.</p></details></div></section>;
}
