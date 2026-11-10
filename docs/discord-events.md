# Discord-meldingen en clanactiviteiten

Beheer: `/beheer/discord`, bereikbaar via **Account → Clanbeheer**. Alleen de
bestaande Admin- en Staff team-rollen mogen beheren. De drie meldingssoorten
staan standaard uit. De eigenaar heeft nog geen kanalen gekozen; er zijn geen
berichten naar een echte Discord-server verstuurd tijdens de ontwikkeling.

## Later activeren

1. Gebruik de bestaande Hijgend Hert-app (1569436253043167305) en server
   (1073630238115897455). Voeg het bot-token in Cloudflare toe als encrypted secret
   `DISCORD_BOT_TOKEN`. Het bot-token is niet de OAuth client secret. Stop geen
   token in dit scherm, Git, browseropslag of chat.
2. Installeer de bot met `bot` en `applications.commands`. Geef per gekozen kanaal
   View Channel, Send Messages, Embed Links en Read Message History. Administrator,
   Message Content en Gateway Member intents zijn voor deze functies niet nodig.
3. Behoud het Interactions Endpoint:
   `https://hijgendhert.xryicon.workers.dev/api/discord/interactions`.
4. Maak een privé-inlogkanaal. Weiger View Channel voor @everyone en geef toegang
   alleen aan Admin, Staff team en de bot. De instelling controleert het server-ID,
   kanaaltype en expliciete toegangsrechten voordat inlogmeldingen aangaan.
   Discord-serveradministrators kunnen zoals gebruikelijk alle kanalen bekijken.
5. Vul de kanaal-ID’s in bij Clanbeheer en activeer elk gewenst onderdeel apart.
   Events en loterijuitslagen kunnen hetzelfde kanaal gebruiken.

Kanalen bewaren terwijl alles uit staat vereist geen token of Discord-verzoek.
Bij activeren van events worden toekomstige/op dat moment lopende website-events
geplaatst. Oude inlogmeldingen en loterijuitslagen worden niet achteraf ingehaald.
Het uitschakelen van een categorie stopt en annuleert nog wachtende meldingen.

## Gedrag

- Eventtypes: Skill, Boss, Raid, Bingo, Clanavond en Ander event. Bingo is hier
  een activiteit met inschrijvingen en ruimte voor teamregels, geen speelbaar bord.
- Staff kan per event een minimum verdiende XP (skill/totale XP) of KC
  (boss/alle bosses samen) instellen. Dit is een doel tijdens het event en blokkeert
  aanmelden vooraf niet. Bestaande events zonder dit veld behouden geen minimum.
- Vanaf de start liggen de eventregels vast. Admin en Staff team leggen behaalde
  aantallen vast onder Deelnemers & resultaten. Alleen aantallen binnen de begin-
  en eindtijd horen hier; deze handmatige controle haalt geen WOM-data op en
  verandert de WOM-ranglijst niet. De server berekent of het minimum is gehaald.
  Deelnemers kunnen hun eigen resultaat niet aanpassen. Leeg resultaat betekent
  onbekend; nul betekent gecontroleerd maar niets behaald. Correcties gebruiken
  een revisiecontrole en een auditlog met de staffidentiteit.
- Agenda, profiel en Discord-eventbericht tonen het minimum en afzonderlijk het
  aantal aanmeldingen en aantal leden dat het minimum heeft behaald. Persoonlijke
  resultaten blijven binnen de ledenweergave; de openbare agenda toont totalen.

- Alleen een geslaagde nieuwe OAuth-login maakt een inlogmelding. De melding
  bevat Discord-naam, ID en tijd. Geen IP, cookies, tokens of andere logininhoud.
  Het vernieuwen van een sessie of openen van een pagina maakt geen melding.
- Staff kan clanactiviteiten aanmaken, wijzigen en annuleren. Ze verschijnen in
  de bestaande agenda naast WOM-competities. Events bevatten geen verzonnen
  deelnemers. Aanmelden/afmelden kan tot de begintijd; annuleren sluit meteen.
- Website en botknoppen gebruiken dezelfde tabel met `(event_id, discord_id)`
  als unieke sleutel. Inschrijven via Discord vereist een geldige ondertekende
  interaction, de juiste server, een toegestane rol en het actuele eventbericht.
  De reactie op een knop is privé. Herleverde interactions zijn idempotent.
- De openbare agenda toont aantallen; deelnemersnamen staan alleen in de
  ledenweergave en het door staff gekozen Discord-eventkanaal. De eigen
  inschrijvingen staan ook op het profiel. De agenda haalt wijzigingen iedere
  minuut op zolang de pagina zichtbaar is, en direct na een eigen actie.
- Deze inschrijvingen betreffen website-clanactiviteiten. Ze schrijven spelers
  niet automatisch in bij WOM en veranderen geen OSRS-clanrang. Het is geen
  synchronisatie met Discords native Interested-knop of vrije chatberichten.
- Na een definitief opgeslagen gratis raffle-resultaat maakt de raffle-object
  een duurzame overdracht naar de Discord-wachtrij. Het bericht bevat winnaar,
  prijs, winnend lot, aantal loten en een link naar de exacte ronde/het bewijs.
  Geen toekomstige seed of interne gegevens worden meegestuurd.

## Betrouwbaarheid

`DISCORD_SYNC` is de nieuwe SQLite Durable Object-binding voor `ClanDiscord`,
migratie `clan-discord-v1`. Eén object per clan bewaart events, inschrijvingen,
instellingen en uitgaande berichten. Website-inschrijvingen blijven beschikbaar
zonder bot-token. Alarms verwerken berichten ook zonder open website.

Uitgaande eventwijzigingen worden samengevoegd en passen hetzelfde Discordbericht
aan. Een persistent bericht-ID en stabiele nonce beperken dubbele posts. Discords
nonce-deduplicatie geldt slechts voor enkele minuten; absolute exactly-once
aflevering kan de externe API bij een langdurige onzekere netwerkfout niet beloven.
429 en provider-wachttijden worden gerespecteerd; 5xx/netwerkfouten krijgen een
oplopende wachttijd. Een 4xx-configuratiefout pauzeert die melding en verschijnt
in Clanbeheer. Corrigeer rechten/kanaal en sla instellingen opnieuw op.

De login blijft slagen als de meldingsopslag zelf onverhoopt onbereikbaar is;
dat uitzonderlijke geval kan een inlogmelding missen. Event- en raffle-resultaten
zijn opgeslagen voordat hun Discordbericht wordt verstuurd. Inlogmetadata in de
afgeleverde wachtrij wordt na 30 dagen bij de volgende verwerking opgeruimd;
reeds verstuurde Discordberichten volgen de bewaarkeuzes van de server.

## Controle

`node --test tests/clan-discord.worker.test.mjs` test met echte lokale Workers/
SQLite-objecten en nagebootste Discord-antwoorden: uitgeschakelde integratie,
toegangsrechten, kanaalprivacy, CSRF, alleen nieuwe logins, tweerichtingsinschrijving,
herhaalde klikken, één bewerkt eventbericht, rate-limit-wachttijd, annulering,
raffle-winnaar/bewijslink en persistentie na een herstart. Geen echte Discordposts.

Een echte kanaaltest volgt nadat de eigenaar de bot en kanalen heeft ingesteld.
