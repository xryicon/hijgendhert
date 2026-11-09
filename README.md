# Hijgend Hert

## Actuele status — 9 november 2026
De clanpagina heeft nu een eigen bosheader, compacte clancijfers en navigatie tussen clanleden, ranglijst, Hall of Fame, kalender en clanmomenten. De bestaande hashlinks blijven werken. De ledenlijst is de standaardweergave; zoeken, accountfilters, paginering en Wise Old Man-koppelingen blijven beschikbaar. De homepage heeft weer omlijste zwart-gouden statistiekkaarten, zonder de knoppen Bekijk leden, Bekijk ranglijst en Kopieer wereld.

Bingo is tijdelijk uit de website gehaald. De pagina en API zijn buiten `app/` bewaard in `features/bingo/`, zonder actieve navigatie of automatische bingo-aanvragen. De D1-binding is uitgeschakeld, zodat de Cloudflare-build geen lokale placeholderdatabase meer probeert te verbinden. Er is geen database verwijderd. Zie `features/bingo/README.md` voor herintroductie; onderstaande oudere ontwerpnotities beschrijven de ontwikkelgeschiedenis.

### Cloudflare
De bestaande GitHub-koppeling kan de nieuwste `main`-commit opnieuw bouwen. Gebruik `npm run build` en laat Wrangler de gegenereerde configuratie `dist/server/wrangler.json` deployen. Voor de huidige website zijn geen D1-database of bingo-geheimen nodig. De productiebuild bevat geen `DB`-binding.

Nederlandstalige OSRS-clanwebsite, gebaseerd op de bestaande zwart-gouden vormgeving van https://hijgend-hert.nl/, met het oorspronkelijke clanlogo en de daar vermelde Discord-link.

## Lokaal
Deze repository bevat de broncode van de opgeslagen website, versie 12 (broncommit d5bc4e98878caf75fbd3cd999d4a6020d4ea0b31). De website is nog niet opnieuw gepubliceerd.

Vereist: Node.js 22.13 of nieuwer en npm.

```sh
git clone https://github.com/xryicon/hijgendhert.git
cd hijgendhert
npm run install:ci
npm run dev
```

Open http://127.0.0.1:5173. Bouw de app met `npm run build`. De app gebruikt de meegeleverde Vinext/Sites-integratie.

De homepage en Wise Old Man-standen werken zonder API-sleutel. Bingo gebruikt Cloudflare D1 en de Sites-aanmelding; de bijbehorende runtime-configuratie en lokale database moeten daarvoor apart worden ingericht. Lokale omgevingsbestanden, databases, afhankelijkheden en gegenereerde builds staan niet in deze repository.

## Wise Old Man
Alle integraties zijn alleen-lezen voor groep 7059. Geen API-sleutel of verificatiecode nodig.
- app/api/clan/route.ts: leden, totale XP/EHB, algemene XP- en bossingranglijsten, competities.
- app/api/event/route.ts: selecteert uitsluitend actieve events van groep 7059; leest de officiële participations/deltas, inclusief rang en winst tijdens het event.
- components/current-event.tsx: actuele competitie, afteller, podium en top 10, automatische verversing om de vijf minuten en duidelijke lege/foutstatussen. Kalender en afgelopen events hebben een eigen weergave.
- Eventselectie is dynamisch. Het Hunter-event is niet vastgezet in de code.
- Cache actuele standen: maximaal vijf minuten. Nieuwe spelersupdates op Wise Old Man kunnen standen wijzigen.
- app/page.tsx en app/globals.css: inhoud en responsive vormgeving.

## Bronnen en assets
Clanlogo en clanachtergrondinformatie: https://hijgend-hert.nl/
Discord: https://discord.gg/KFNqA6bnZ4
Clan: https://wiseoldman.net/groups/7059
API-documentatie: https://docs.wiseoldman.net/api
Lettertypen Cinzel en Inter via Google Fonts, lokaal opgeslagen.
public/clan-hero.png is een ongebruikte alternatieve sfeerillustratie uit de eerste ontwerpronde, gemaakt met de ingebouwde imagegen-tool. De actuele website gebruikt het oorspronkelijke clanlogo.
public/hijgend-hert-woodland.webp is de nieuwe decoratieve headerachtergrond, gemaakt met de ingebouwde imagegen-tool: een donker, gestileerd OSRS-bos met kasteel en fakkels. Het losse hert is op verzoek verwijderd; het bestaande clanlogo blijft het centrale beeldmerk. app/woodland.css regelt de uitsnede en donkere tekstoverlay voor desktop en mobiel.

## Hosting
Site-ID staat in .openai/hosting.json. De nieuwe Sites-publicatie is privé. De bestaande website op hijgend-hert.nl is niet gewijzigd.
De broncode staat op https://github.com/xryicon/hijgendhert. Deze eerste upload is een kopie van de opgeslagen Sites-versie 12. Een GitHub-commit publiceert de website niet automatisch.

## Homepageconcept
De header toont het door de gebruiker aangeleverde rijm met één subtiele Discord-knop. Daaronder tonen drie zwart-gouden kaarten het aantal clanleden, de totale clan-XP en de clanwereld uit Wise Old Man. Knoppen openen de ledenlijst of ranglijst, of kopiëren het wereldnummer. Het bovennavigatiemenu gebruikt dezelfde stijl en klapt op kleinere schermen in. Dit concept blijft opgeslagen zonder publicatie, overeenkomstig het verzoek om later verder te bewerken.
De bosachtergrond loopt door achter de bovenbalk; tijdens scrollen krijgt de navigatie een leesbare donkere achtergrond. Zes overlappende CSS-nevels bewegen continu uit de mond van het bestaande hertenlogo. De oorsprong schaalt mee met het logo; de decoratieve animatie staat uit bij prefers-reduced-motion.
Het gehele beeldmerk ademt met een subtiele verticale schaalverandering van maximaal 1,8% in een lus van 4,8 seconden. De nevel beweegt mee met de mond; de animatie verandert de logoafbeelding niet. Afzonderlijke kaak- of borstanimatie is niet toegevoegd. Ook deze ademhalingsbeweging respecteert prefers-reduced-motion.
Op verzoek bestaat de homepage uitsluitend uit de navigatie, de bosheader met rijm en beeldmerk, en de drie statistiekkaarten. Overige inhoud staat op /clan (claninformatie, agenda, Hall of Fame, momenten, ranglijsten en leden) en /events (actuele competitie en competitieoverzicht). /bingo blijft een aparte beveiligde pagina. De homepage haalt geen agenda- of ranglijstgegevens meer op; de statistiekknoppen verwijzen naar de bijbehorende onderdelen op /clan.
De eventpagina heeft drie gecentreerde keuzes: Live event, Kalender en Past events. Live event selecteert automatisch de actuele competitie via de bestaande Wise Old Man-API. Onder de keuzeknoppen staan uitsluitend de resterende tijd, de eventtitel en het podium met plaatsen 4–10 eronder. Categorieknoppen, extra eventdata, toelichtingen en de footer zijn hier verwijderd. Kalender toont de bestaande agenda zonder een tweede lijst met geplande events. Past events toont afgelopen competities, nieuwste eerst, met doorklik naar hun echte uitslag op Wise Old Man en 12 extra resultaten per klik. Oude agendalinks blijven geldig; #kalender en #past-events openen de juiste weergave. De automatische vijfminutenverversing van de live tussenstand blijft behouden.
De uiteindelijke vormgeving volgt het bestaande clanlogo: zwart, warm goud, hoekige panelen en Cinzel voor accenten. app/hijgend-hert.css bevat de gedeelde identiteitslaag. Algemene slogans, herhaalde geweiwatermerken en decoratieve voortgangsbalken in de top 10 zijn verwijderd. Het podium bestaat uit eenvoudige donkere treden met goud, zilver en brons. Het door de gebruiker aangeleverde rijm en de bewegende nevel blijven behouden.

## Clanleven
- Agenda: maandnavigatie, dagselectie en filters voor competities, raids, boss trips en sociale activiteiten. Wise Old Man-competities verschijnen automatisch op alle bijbehorende kalenderdagen; alle datums gebruiken Europe/Amsterdam.
- Hall of Fame: app/api/hall-of-fame/route.ts leest afgeronde individuele (classic) competities van groep 7059. De einddatum bepaalt de maand. Alleen positieve voortgang levert een winnaar op; alle gelijke hoogste scores krijgen krediet. Elke overwinning telt eenmaal per speler. De maandtitel telt alle categorieën en is een tussenstand zolang de maand loopt.
- Er worden maximaal drie uitslagen tegelijk opgehaald. Competitielijst: vijf minuten cache; afgeronde details: één uur; compleet maandresultaat: tien minuten. Onvolledige maandresultaten krijgen geen maandtitel en geen edgecache.
- Bij een bronstoring gebruikt de kalender maximaal 48 uur een gedateerde, geverifieerde kopie van de competitielijst. Voor de twee laatst vastgelegde Hall of Fame-maanden is er ook een gecontroleerde uitslagkopie in content/community-snapshot.json. Deze terugval wordt zichtbaar gemarkeerd met de ophaaldatum en nooit als live gepresenteerd. Niet-vastgelegde maanden tonen een fout met herhaaloptie. Dit verandert de actuele eventranglijst niet.
- Clanmomenten: filters voor drops, pets en mijlpalen, screenshotkaarten en een vergrotingsdialoog. Er zijn bewust nog geen activiteiten of screenshots verzonnen. Discord is een gewone verwijzing; er is geen automatische Discord-import of uploadfunctie.

### Eerste activiteiten en screenshots toevoegen
Bewerk content/clan-life.ts en publiceer een nieuwe versie. activities gebruikt id, title, category (raid/boss/social), startsAt, endsAt, description, discordUrl en optioneel host. Gebruik ISO-tijden met de juiste offset en een echte Discord-eventlink. De kalender toont dan automatisch de activiteit met aanmeldlink.

Bewaar goedgekeurde screenshots in public/moments/. Voeg in moments de velden id, title, category (drop/pet/milestone), player, date (YYYY-MM-DD), description, image (/moments/bestandsnaam.png) en imageAlt toe. De galerij sorteert ze van nieuw naar oud en opent de afbeelding op klik. De inhoud wordt gedeeld via de gepubliceerde site, niet via browseropslag.

### Controle
node --experimental-strip-types --test tests/community.test.mjs controleert gelijke scores, ongeldige/lege resultaten, gecombineerde metrics, maandwinnaars en Nederlandse datumgrenzen. Typecontrole: node node_modules/typescript/bin/tsc --noEmit.

## Clanbingo — opgeslagen concept, 8 november 2026
Op verzoek opgeslagen om later verder te bewerken; deze bingo-versie is nog niet gepubliceerd.

- /bingo: twee teams, een gedeeld bord met 25 opdrachten, eigen voortgang per team en automatisch berekende punten voor volledig afgeronde opdrachten.
- De beheerder maakt een privéconcept en kan het openbaar zetten, weer privé maken of afronden. Openbare toegang geldt alleen binnen de ingestelde evenementperiode en blijft onder de algemene toegangsinstellingen van de website vallen.
- De server controleert beheerrechten via de ingelogde ChatGPT-identiteit en de runtime-instelling BINGO_ADMIN_EMAIL. Zonder die instelling krijgt niemand beheerrechten. Er staan geen beheerdergegevens of geheimen in de broncode.
- D1-binding DB bewaart evenementen, voortgang en wijzigingsgeschiedenis. De twee schema-migraties staan in drizzle/. Ze zijn lokaal toegepast; productie wacht op publicatie.
- Bevestiging van opdrachten gebeurt handmatig door de beheerder; er is nog geen automatische RuneLite/Dink-koppeling. Bezoekers ontvangen standupdates om de 15 seconden.
- Typecontrole, productiebuild en de zeven tests in tests/bingo.test.mjs zijn geslaagd. De lokale privébeheerpagina is visueel bekeken. Volledige controle van aanmaken, openbaar/privé schakelen, scorewijzigingen, gelijktijdige updates en mobiele weergave moet nog gebeuren vóór publicatie.
- De lokale preview gebruikt uitsluitend de meegeleverde testidentiteit en een genegeerd .dev.vars-bestand. De productie-instelling voor de beheerder is al voorbereid en wordt pas actief bij een volgende publicatie. De bestaande gepubliceerde website is ongewijzigd.

Hervatten: npm run dev -- --host 127.0.0.1, open /bingo en gebruik lokaal /signin-with-chatgpt?return_to=%2Fbingo. Testcommando: node --experimental-strip-types --test tests/bingo.test.mjs. Bewaar bingo standaard privé en maak geen verzonnen evenementen aan in productie.


De live-eventweergave gebruikt public/hijgend-hert-event-arena.webp: een met de ingebouwde imagegen-tool gemaakte OSRS-geïnspireerde nachtelijke toernooibinnenplaats met fakkels, bos, stenen poortpilaren en zwarte banieren met gouden randen. Op beide banieren staat een gouden gekroonde hertenkop, afgeleid van het bestaande clanlogo. De afbeelding bevat geen losse dieren, tekst of ingebakken scores. app/live-event-background.css houdt de timer en ranglijst leesbaar, laat de scène onderaan vervagen en kiest een uitsnede met de linker banier op mobiel. De achtergrond loopt bij Live event naadloos door achter de bovenbalk; tijdens scrollen blijft de navigatie donker en leesbaar. De achtergrond staat uitsluitend aan bij Live event; Kalender en Past events behouden hun bestaande achtergrond. De afbeelding is een decoratieve WebP van 1536×1024 pixels.


De vlaggen en vuurkorven bewegen via components/live-event-backdrop.tsx. Een lokale WebGL-vervorming animeert uitsluitend de banierstof en de vlammen in de oorspronkelijke illustratie; de hangrails, stenen, het landschap en de ranglijst blijven vast. De vlaggen hebben een vast ophangpunt en zachte windrimpels. De twee vuren hebben afzonderlijke, vloeiende flikkerpatronen en subtiele lichtvariatie. De weergave is begrensd op 30 beelden per seconde, pauzeert buiten beeld of in een verborgen tab en ruimt resources op bij het verlaten van Live event. Bij beperkte bewegingsvoorkeur, ontbrekende WebGL-ondersteuning of een verloren tekencontext verschijnt de oorspronkelijke stilstaande achtergrond. Er zijn geen nieuwe rasterbeelden gegenereerd. Implementatiereferenties: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL en https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia.
