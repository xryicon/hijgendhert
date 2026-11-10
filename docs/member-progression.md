# Profielen, bosskills en clanrangen

`/profiel` toont de boss met de hoogste positieve killcount in de laatste
Wise Old Man-snapshot, plus de top drie. Ontbrekende of niet gerangschikte kills
worden niet als nul getoond. Bij gelijke killcounts bepaalt de metricnaam de
vaste volgorde. Alleen de bossgegevens worden gebruikt, geen activities.

De huidige clanrang komt uitsluitend uit de membership-rol van WOM-groep 7059,
gekoppeld aan het gekozen RuneScape-player-ID. Naam en icoon gebruiken dezelfde
rolcode, bijvoorbeeld `red_topaz` → Red Topaz. Dit volgt de
[WOM-membershipdefinitie](https://docs.wiseoldman.net/api/groups/group-type-definitions).
Oude profieloverrides en aangepaste rangdoelnamen veranderen de huidige rang niet.
De Discord-toegangsrol blijft daarvan gescheiden. Deze functie schrijft geen
Discord- of OSRS-rollen.

`clanRank` staat los van eventvoortgang: bij uitval van events of voortgangsopslag
blijft de opgehaalde WOM-rang zichtbaar. Een opgeslagen profiel gebruikt de laatst
opgehaalde WOM-rol met de bestaande melding voor verouderde gegevens. Zonder rol
wordt geen rang verzonnen. Het standaardrangpad wordt niet als clanbeleid getoond;
alleen een ingesteld pad dat de huidige rang bevat is zichtbaar.

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
2. Kies een clanlid. De huidige rang wordt altijd in Wise Old Man beheerd.
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

## Leden en openbare profielen

De navigatie heet Leden en gaat naar /leden. /clan verwijst door. De zoekfunctie filtert alleen de leden van WOM-groep 7059; een naam opent /leden/[username]. De externe WOM-pagina is een secundaire link.

GET /api/clan/member controleert eerst de groepslijst en geeft alleen openbare spelerdata, clanrang, eventvoortgang en bosskills terug. Discord-identiteit, accountkeuzes, beheernotities en wijzigingsrevisies worden niet gepubliceerd. Bestaande beheeracties vereisen nog steeds een actuele Admin- of Staff-rol.

De activiteitenlijst gebruikt GET /api/clan/member/activity met maximaal 20 WOM-snapshots uit de afgelopen maand, plus bevestigde opgeslagen eventresultaten. Maximaal 10 items, nieuwste eerst. Levelstijgingen en positieve KC-verschillen worden gemeten tussen snapshots: de datum is het meetmoment, niet een exacte in-game timestamp. Onbekende (-1), ontbrekende of dalende waarden tellen niet. Quests en individuele drops zijn niet beschikbaar via deze WOM-gegevens. Snapshots delen de bestaande cache en aanvraaglimieten.

Validatie: member-activity.test.mjs, profile-progress.worker.test.mjs en wom-cache.worker.test.mjs controleren sortering, filtering, onbekende spelers, afscherming en gedeelde caching.

## Eigen account bewaren

Na een geldige Discord-login wordt de gekozen of eenduidig herkende RuneScape-speler in een eigen accountobject opgeslagen, afgeleid van het geautoriseerde Discord-id. De keuze geldt ook op andere apparaten en wint van oude browsercookies. Wijzigen kan alleen na een actuele Discord-rolcheck, dezelfde-origincontrole en bevestiging in de clanlijst. Een succesvolle clanlijst die de speler niet meer bevat, wist de keuze en momentopname.

Het accountobject bewaart uitsluitend een complete laatste spelmomentopname (speler, WOM-rol, events, bosses en meetdatum), zonder Discord-tokens of beheernotities. Bij WOM-uitval wordt die als verouderd getoond, na een nieuwe Discord-toegangscontrole. Rangdoelen en correcties worden opnieuw uit het actuele clanbeheer gelezen. Accountwisselingen wissen de vorige momentopname; revisies en speler-id voorkomen dat trage oude aanvragen die terugschrijven. Activiteiten worden per speler bewaard en blijven bij uitval zichtbaar in Mijn profiel.

De bestaande sessie blijft maximaal 30 dagen geldig en vernieuwt korte Discord-tokens automatisch binnen die termijn. Opgeslagen profielgegevens herstellen nooit zelf een login; uitloggen en ingetrokken rollen blijven van kracht.
