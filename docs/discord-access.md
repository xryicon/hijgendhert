# Discord-toegang voor Hijgend Hert

Homepage, clangegevens, agenda en eventstanden blijven openbaar. `/ledenomgeving`
controleert de Discord-identiteit en actuele clanrol op de server. Deze koppeling
regelt toegang tot de ledenomgeving. De inlogpagina staat op `/login` en het eigen
profiel op `/profiel`. De oude route `/ledenomgeving` verwijst naar het profiel.

## Profiel en herkenning

- De header controleert de bestaande sessie en toont de Discord-servernaam met
  Mijn profiel, Mijn events en Uitloggen. `/login` stuurt een al ingelogd lid
  direct naar het profiel. Een verversing of andere pagina beëindigt de sessie niet.
- Een tijdelijke verbindingsstoring verbergt beschermde inhoud, bewaart de
  bestaande cookie en probeert automatisch opnieuw. Werkelijk verlopen toegang
  of een verwijderde rol stuurt het lid terug naar Login.
- Het profiel toont de Discord-naam en toetredingsdatum, indien aanwezig, plus de
  clanrang van het gekozen RuneScape-account via Wise Old Man.
  Een exacte match met een RuneScape-naam uit WOM-groep 7059 wordt voorgesteld.
  Leden kunnen ook zelf een account uit die clanlijst kiezen.
- De accountkeuze is een versleutelde HttpOnly-cookie, gebonden aan het Discord-ID.
  De keuze wordt één jaar in deze browser onthouden, ook na uitloggen. Het is
  een weergavevoorkeur, geen verificatie van RuneScape-accountbezit of extra toegang.
  Op een ander apparaat moet het lid de keuze opnieuw maken.
- De eventlijst komt uit de persoonlijke WOM-deelnames en wordt beperkt tot
  groep 7059. Resultaten worden op verzoek uit het afzonderlijke event gelezen;
  de gecombineerde WOM-standingsfeed gaf tijdens implementatie databasefouten.
  Alleen inschrijven wordt niet gepresenteerd als actieve deelname.
- `/api/members/profile` en `/api/members/event` controleren de Discord-toegang.
  Leesaanvragen delen maximaal vijf minuten een geslaagde
  rolcontrole; profielantwoorden blijven private/no-store. Account wijzigen
  vereist een same-origin POST en een verse Discord-controle.

De toegestane server is `{OSRS} Hijgend Hert` (`1073630238115897455`). De door de
clanleiding opgegeven toegestane rollen zijn:

| Rol | Discord role ID |
| --- | --- |
| Member | `1326459850837987430` |
| Admin | `1197327572720169030` |
| Staff team | `1408990525180084265` |

Eén van deze rollen is voldoende. Rollen worden uitsluitend op ID vergeleken.
Andere Discord-rollen of de Administrator-permissie geven op zichzelf geen toegang.

## Activeren

1. De [Hijgend Hert-app](https://discord.com/developers/applications/1569436253043167305/information)
   is aangemaakt met ID `1569436253043167305`. Gebruik Guild Install met `bot` en
   `applications.commands`; bot permissions: **0**. Geen Administrator, Message
   Content of andere privileged intents nodig.
2. Voeg bij OAuth2 exact deze redirect toe:
   `https://hijgendhert.xryicon.workers.dev/api/auth/discord/callback`.
3. De openbare waarden uit `.env.example` staan in `vite.config.ts`. Configureer
   bij Cloudflare Worker `hijgendhert` → Settings → Variables and Secrets alleen
   `DISCORD_CLIENT_SECRET` en `DISCORD_SESSION_SECRET` als **Secret**.
   Genereer de sessiesleutel met een cryptografische generator: 32 willekeurige
   bytes, base64url. Gebruik nooit een wachtwoord of de Discord client secret als
   sessiesleutel. `APP_ORIGIN` moet de exacte HTTPS-origin zijn, zonder pad.
4. Publiceer de configuratie. Voeg onder General Information als Interactions
   Endpoint URL toe:
   `https://hijgendhert.xryicon.workers.dev/api/discord/interactions`.
   Discord controleert de ondertekening en PING/PONG voordat deze wordt opgeslagen.
5. Installeer de applicatie alleen op de Hijgend Hert-server. Het `/website`
   commando geeft een privéantwoord met de inloglink, uitsluitend aan leden met
   de toegestane rol. Het kent zelf geen rollen toe.
6. Registreer `/website` via `npm run discord:register`. Het script leest client ID
   en client secret uit de genegeerde `.dev.vars` of de procesomgeving. Het gebruikt
   een kortlevend `applications.commands.update`-token; een bot token opslaan is
   niet nodig. Het werkt alleen dit commando bij en laat andere commando's staan.

De Sites-preview blijft onder zijn bestaande eigenaarstoegang. Gebruik de openbare
Cloudflare-origin voor Discord callbacks en webhookvalidatie; wijzig de privacy
van de Sites-preview niet om de bot bereikbaar te maken.

## Beveiliging en gedrag

- OAuth authorization code + PKCE S256, 10 minuten geldige browsergebonden state,
  vaste redirect en issuercontrole. Geen e-mail- of berichtenscope.
- Access- en refresh-token in een versleutelde AES-GCM-cookie met `__Host-`,
  HttpOnly, Secure, SameSite=Lax en maximaal 30 dagen geldigheid vanaf login.
  Alleen `/api/auth/session` vernieuwt bijna verlopen Discord-tokens. De
  oorspronkelijke einddatum schuift niet op. Browser-tabs gebruiken Web Locks
  om gelijktijdige vernieuwing te voorkomen; een geweigerde oude refresh wist
  nooit een mogelijk nieuwere cookie. Geen tokens in localStorage, geen
  wachtwoorddatabase of D1-binding. Sleutelrotatie beëindigt alle sessies.
  Slaagt vernieuwing maar is de aansluitende rolcontrole tijdelijk niet bereikbaar,
  dan bewaart de cookie de vernieuwde tokens voor de volgende poging. De website
  geeft pas weer toegang na een geslaagde, actuele rolcontrole.
- Iedere beschermde serverpagina/API valideert de versleutelde sessie en de
  toegestane Discord-rollen. Login, profielpagina, sessie en bekende lees-API's
  delen een controle per gehashte app/guild/access-token via `PROGRESS`.
  Een geslaagde controle blijft maximaal vijf minuten in de besloten objectopslag;
  rolwijzigingen kunnen voor leesaanvragen dus maximaal vijf minuten later
  zichtbaar worden. Mutaties en beheer-API's gebruiken een verse of nog lopende
  Discord-controle. De OAuth-callback vraagt ook een verse controle. Opgeslagen
  sessierollen worden nooit als bewijs gebruikt. Een ontbrekende rol, vertrokken
  lid of nog niet afgeronde toelating weigert toegang. Zodra een nieuwe controle
  mislukt, vervalt het eerdere resultaat; fouten gebruiken nooit oude toegang.
  De geopende pagina controleert de sessie maximaal elke vijf minuten en bij
  terugkeer zodra die periode verstreken is. Een tijdelijke storing wist de sessie
  niet: de browser wacht minimaal een minuut, oplopend tot vijftien minuten,
  of langer wanneer Discord dat via Retry-After vraagt. Tabbladen delen alleen
  deze wachttijd; geen identiteit, rollen of tokens. HH-PAGE- en HH-SESSION-codes
  maken een storing herkenbaar zonder geheime gegevens te tonen.
- `HH-PAGE-HTTP429` betekent dat Discord de rolcontrole tijdelijk begrenst.
  `Retry-After` en uitgeputte quota worden gerespecteerd. Alleen een gehashte
  identiteit, wachttijd en kort geldige rol-/profielcontrole worden duurzaam
  opgeslagen, nooit OAuth-tokens. Een alarm verwijdert de rol-/profielcontrole
  na vijf minuten. De controle blijft daardoor beschikbaar na een herstart,
  zonder de geldigheid te verlengen. Een redirect naar Login neemt de deadline mee; de inlogpagina en
  browser doen tijdens die pauze geen nieuwe controle en tonen een afteller.
- De knop Account blijft altijd een link naar de inlog-/herstelscreen wanneer
  de sessie nog wordt geladen of Discord tijdelijk niet bereikbaar is. Een
  geslaagde servercontrole vervangt oudere lopende browsercontroles. De time-out
  omvat ook het wachten op een ander tabblad. Mislukte browsercontroles tonen
  hun veilige HH-code bij Details voor clanbeheer.
- Nieuwe besloten serverpagina's/actions moeten `requireDiscordMember()` gebruiken.
  Nieuwe API-routes moeten `authorizeMember()` gebruiken vóór zij iets lezen of
  wijzigen; de navigatie of clientcomponent is nooit een autorisatiegrens.
  Beschermde routes krijgen `private, no-store` en mogen niet in een CDN-cache komen.
- Uitloggen is een same-origin POST, wist de browsercookie en de korte gedeelde
  rolcontrole, en trekt het Discord
  access token in. Bij een Discord-storing wordt de cookie alsnog verwijderd en
  krijgt het lid uitleg hoe de koppeling handmatig ingetrokken kan worden.
- Discord-interacties vereisen een geldige Ed25519-handtekening over de originele
  bytes, een timestamp binnen vijf minuten, de juiste app en server. Maximaal
  32 KiB verzoekbody. Antwoorden zijn ephemeral en kunnen niemand pingen.
- `/website` heeft geen mutaties; een geldig herhaald verzoek veroorzaakt alleen
  hetzelfde privéantwoord. Voeg voor toekomstige opdrachten met mutaties een
  duurzame deduplicatie op interaction ID toe.
- Geen logging van OAuth codes, cookies, tokens of Discord response bodies.
  Foutreferenties bevatten uitsluitend vaste stapnamen en HTTP-statuscodes.
- Openbare Wise Old Man-data deelt één edge-cache tussen clanpagina, events en
  profielen. Bij throttling wordt kort gewacht en kunnen maximaal 24 uur oude
  gegevens met een melding worden getoond. De korte Discord-rolcontrole deelt
  geen cache of termijnen met WOM.

## Controle

`npm run test:discord` test onder meer een volledige OAuth-flow met een nagebootste
Discord API, ongeldige state/issuer, verkeerde rollen, ingetrokken toegang,
storingen, cookievervalsing, logout-CSRF en handtekeningen op botverzoeken.
Dezelfde opdracht test de login ook in de Cloudflare-runtime die met de vaste
Wrangler-versie wordt geleverd. Discord wordt daarin nagebootst; er worden geen
echte accounts of sleutels gebruikt. Deze test controleert ook dat omleidingen
van Discord nooit worden gevolgd en geen inloggegevens kunnen doorsturen.
Typecontrole: `node node_modules/typescript/bin/tsc --noEmit`.

`node --test tests/discord-membership-cache.test.mjs` controleert de bundeling,
exacte vervaltijd, credential-isolatie, persistente wachttijd, mislukte verse checks
en het wissen bij uitloggen. De Worker-tests controleren dit ook via de echte
Durable Object-RPC met nagebootste Discord-antwoorden.

Controleer na de echte koppeling ook met een Member en een account zonder Member:
login, `/website`, uitloggen, verwijderen van de rol terwijl de pagina openstaat,
en dat homepage/events zonder login bereikbaar blijven.

Referenties: [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2),
[PKCE metadata](https://discord.com/.well-known/oauth-authorization-server),
[Interactions en handtekeningen](https://docs.discord.com/developers/interactions/overview),
[Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/).
