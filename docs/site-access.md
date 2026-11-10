# Tijdelijke toegang tot de website

De onderhoudspagina op `/binnenkort` toont de eigen bosachtergrond, het clanlogo
en de melding 'Komt binnenkort. Er wordt druk aan gewerkt.'. De code wordt alleen
aan de server aangeboden via een formulier; de pagina heeft geen JavaScript nodig.
Alle pagina's en website-API's worden vóór de bestaande handlers afgeschermd.
Ook iemand die al met Discord was ingelogd, heeft de toegangscode nodig.

Na een juiste code ontvangt de bezoeker een ondertekende cookie die zeven dagen
geldig is (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `__Host-`-prefix).
De cookie bevat geen toegangscode en is gebonden aan deze website. Hij geeft
alleen toegang tot de website; bestaande Discord- en staffcontroles blijven
gelden voor profielen, ledeninformatie en beheeracties.

De code is uitsluitend als gezouten PBKDF2-verifier in `lib/site-access.ts`
opgenomen, met 100.000 SHA-256-iteraties. De cookie wordt ondertekend met
`SITE_ACCESS_SECRET`, of met de bestaande `DISCORD_SESSION_SECRET` via een apart
ondertekeningsformaat. Beide zijn 32 willekeurige bytes in base64url-formaat.
Er is geen terugval op een publieke sleutel. Zonder bruikbare secret of de
limiterbinding blijft de website gesloten. Sites gebruikt een eigen versleutelde
runtime-secret; Cloudflare gebruikt de aanwezige Discord-secret.

De Durable Object-binding `SITE_ACCESS_LIMITS` bewaart per gehashte client-IP
maximaal vijf codepogingen in een venster van vijftien minuten. De teller blijft
werken bij gelijktijdige verzoeken en een workerherstart; het alarm ruimt verlopen
tellers op. Er worden geen ingevoerde codes of volledige IP-adressen opgeslagen.

`assets.run_worker_first: true` voorkomt dat bestanden vóór de toegangscontrole
worden geserveerd. Alleen het logo, de achtergrond, beide lokale lettertypen en
het favicon zijn zonder cookie bereikbaar. De daadwerkelijke websitebundels
zijn afgeschermd. Toegestane bestanden worden via de `ASSETS`-binding geleverd.
De Discord-interactie-POST blijft bereikbaar voor de bot; die bestaande handler
controleert de Discord-handtekening. Dit verleent geen websitetoegang.

De native form-POST controleert dezelfde origin en accepteert maximaal 2 KiB.
Terugkeerlinks blijven binnen de eigen website; fouten tonen de code nooit in
een URL. Alle antwoorden tijdens onderhoud gebruiken `no-store`.

## Openstellen

Zet `SITE_MAINTENANCE_MODE` in `vite.config.ts` op `off` en publiceer opnieuw om
de tijdelijke toegangspagina uit te schakelen. De gewone Discord-beveiliging
blijft dan actief. Wijzig een secret of de codeverifier om bestaande
toegangscookies ongeldig te maken. Bewaar plaintext codes en secrets niet in Git.

## Controle

`node --test tests/site-access.worker.test.mjs` controleert de daadwerkelijke
worker-ingang met geïsoleerde testgegevens: toegang, cookies, direct benaderde
pagina's en API's, statische bestanden, CSRF, terugkeerlinks, limieten en fouten.
De productiecode bevat geen testcode of bypass voor tests.
