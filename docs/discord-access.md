# Discord-toegang voor Hijgend Hert

Homepage, clangegevens, agenda en eventstanden blijven openbaar. `/ledenomgeving`
controleert de Discord-identiteit en actuele clanrol op de server. Deze koppeling
regelt toegang tot de ledenomgeving. De inlogpagina staat op `/login`.

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
- Access token in een versleutelde AES-GCM-cookie met `__Host-`, HttpOnly, Secure,
  SameSite=Lax en maximaal 8 uur geldigheid. Geen refresh token, localStorage,
  wachtwoorddatabase of D1-binding nodig. Sleutelrotatie beëindigt alle sessies.
- Iedere beschermde serverpagina/API leest de actuele Discord-rollen. Een
  ontbrekende rol, vertrokken lid of nog niet afgeronde toelating weigert toegang.
  Bij een Discord-storing wordt geen toegang op basis van oude rollen verleend.
  De geopende ledenpagina controleert ook elke minuut en bij terugkeer naar de tab.
- Nieuwe besloten serverpagina's/actions moeten `requireDiscordMember()` gebruiken.
  Nieuwe API-routes moeten `authorizeMember()` gebruiken vóór zij iets lezen of
  wijzigen; de navigatie of clientcomponent is nooit een autorisatiegrens.
  Beschermde routes krijgen `private, no-store` en mogen niet in een CDN-cache komen.
- Uitloggen is een same-origin POST, wist de browsercookie en trekt het Discord
  access token in. Bij een Discord-storing wordt de cookie alsnog verwijderd en
  krijgt het lid uitleg hoe de koppeling handmatig ingetrokken kan worden.
- Discord-interacties vereisen een geldige Ed25519-handtekening over de originele
  bytes, een timestamp binnen vijf minuten, de juiste app en server. Maximaal
  32 KiB verzoekbody. Antwoorden zijn ephemeral en kunnen niemand pingen.
- `/website` heeft geen mutaties; een geldig herhaald verzoek veroorzaakt alleen
  hetzelfde privéantwoord. Voeg voor toekomstige opdrachten met mutaties een
  duurzame deduplicatie op interaction ID toe.
- Geen logging van OAuth codes, cookies, tokens of Discord response bodies.

## Controle

`npm run test:discord` test onder meer een volledige OAuth-flow met een nagebootste
Discord API, ongeldige state/issuer, verkeerde rollen, ingetrokken toegang,
storingen, cookievervalsing, logout-CSRF en handtekeningen op botverzoeken.
Typecontrole: `node node_modules/typescript/bin/tsc --noEmit`.

Controleer na de echte koppeling ook met een Member en een account zonder Member:
login, `/website`, uitloggen, verwijderen van de rol terwijl de pagina openstaat,
en dat homepage/events zonder login bereikbaar blijven.

Referenties: [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2),
[PKCE metadata](https://discord.com/.well-known/oauth-authorization-server),
[Interactions en handtekeningen](https://docs.discord.com/developers/interactions/overview),
[Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/).
