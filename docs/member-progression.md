# Profielen, bosskills en clanrangen

`/profiel` toont de boss met de hoogste positieve killcount in de laatste
Wise Old Man-snapshot, plus de top drie. Ontbrekende of niet gerangschikte kills
worden niet als nul getoond. Bij gelijke killcounts bepaalt de metricnaam de
vaste volgorde. Alleen de bossgegevens worden gebruikt, geen activities.

De huidige clanrang komt uit de membership-rol van WOM-groep 7059, tenzij
Admin of Staff team een profielrang heeft ingesteld. De Discord-toegangsrol
blijft daarvan gescheiden. Deze functie schrijft geen Discord- of OSRS-rollen.

## Eventdeelname

- Eén afgeronde clancompetitie met een positieve gain telt als één deelname.
  Inschrijvingen, lopende events, nulresultaten en andere clans tellen niet mee.
- Het profiel controleert maximaal drie onbekende, afgelopen resultaten per
  bezoek. `Controleer volgende events` ververst het profiel voor de volgende
  batch. Alle bezoekers delen de bestaande openbare WOM-eventcache en de
  providerlimieten blijven gelden. De onbetrouwbare gecombineerde
  competition-standingsfeed wordt niet aangeroepen.
- Gecontroleerde eindresultaten worden per WOM-player-ID duurzaam opgeslagen,
  inclusief nulresultaten. Onbekende resultaten blijven zichtbaar als pending.
- De prijzenkast telt podiumplaatsen uitsluitend bij positieve, afgeronde
  resultaten. Een lege of onvolledige geschiedenis wordt niet als volledig
  geverifieerde deelname gepresenteerd.
- Het rangdoel is een totaal aantal events. De voortgangsbalk meet de afstand
  tussen het doel van de huidige en de volgende rang. Bij het behalen van het
  doel staat er `Klaar voor promotie`; de clanleiding bevestigt de rangwijziging.

## Clanbeheer op het profiel

Admin en Staff team zien `Clanbeheer → Rangen & eventdeelname`.

1. Wijzig namen en oplopende eventdoelen, of voeg rangen toe. De eerste rang
   begint bij nul. De startdoelen zijn 0, 5, 10, 20, 35 en 50; het profiel noemt
   deze expliciet startdoelen totdat een beheerder ze heeft opgeslagen.
2. Kies een clanlid. Volg de WOM-rol of stel een profielrang in.
3. Voeg zo nodig een positieve of negatieve eventcorrectie met reden toe,
   bijvoorbeeld voor clanraids buiten WOM. De reden is zichtbaar op het profiel.
4. Sla op. Gelijktijdige wijzigingen worden met een revisiecontrole geweigerd
   zodat beheerders elkaar niet stilzwijgend overschrijven.

## Opslag en controle

`PROGRESS` bindt de SQLite Durable Object `ClanProgress` via de aanvullende
migratie `profile-progress-v1`. De bestaande `raffle-v1`-migratie blijft intact.
De clanregels en iedere speler krijgen afzonderlijke objectnamen. SQL-writes
en wijzigingslog worden atomair opgeslagen; de wijzigingslog bevat de actor,
datum en gewijzigde instelling, nooit Discord-tokens of cookies.

Alle profiel- en beheer-API's controleren de actuele Discord-sessie op de
server en gebruiken private/no-store. Beheermutaties vereisen een geldige
beheerrol, dezelfde origin, een beperkte JSON-body en gevalideerde velden.
Het selecteren van een RuneScape-account blijft alleen een weergavevoorkeur.

Controle: `npm run test:profile`, `npm run test:discord`, `npm run test:raffle`,
TypeScript-controle en productiebuild. De profieltests gebruiken de bestaande
Miniflare/workerd-runtime met nagebootste providers en testen ook opslag na
herstart, geïsoleerde spelers, ingetrokken beheerrechten, CSRF, revisieconflicten,
rankgrenzen en ontbrekende gegevens.

Bronnen: https://docs.wiseoldman.net/api/players/player-endpoints en
https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/.
