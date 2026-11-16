# Zeeslag Bingo

`/zeeslag` is boss-dropbingo voor twee teams. Staff opent de pagina via
Clanbeheer → Clanactiviteiten → Zeeslag Bingo beheren. Het bestaande, uitgeschakelde
5×5-bingobord blijft apart; deze variant gebruikt de Discord-login en geen D1.

## Een ronde klaarzetten

1. Maak een privéconcept met een naam, twee teamnamen, eindtijd en boss-droplijst.
   De acht vooraf ingevulde drops zijn bewerkbare startvoorstellen. Iedere entry
   bepaalt welke items gelden, hoeveel schoten één drop oplevert en het maximum
   aantal goedgekeurde drops per team. Er worden geen echte deelnemers of drops
   vooraf ingevuld.
2. Publiceer onder Clanleiding. De Events-pagina toont dan de zeeslagkaart.
   Ingelogde clanleden vragen deelname aan met hun RuneScape-naam. Staff controleert
   naam/identiteit en keurt de teamindeling goed. De eerste speler is kapitein;
   staff kan een andere goedgekeurde speler uit hetzelfde team aanwijzen.
3. Beide kapiteins plaatsen vier schepen (4, 3, 3 en 2 vakken) op een 8×8-kaart
   en zetten hun vloot vast. Schepen mogen raken, maar niet overlappen of over
   een rand lopen. De kapitein kan de indeling vóór de start aanpassen.
4. Staff start de zeeslag na bevestiging. Teams, regels en schepen liggen dan
   vast. De kapitein kan nog worden vervangen binnen hetzelfde team.

## Boss drops en schoten

- Alleen bemanningsleden kunnen drops indienen, met een tijdstip op secondenniveau
  en een HTTPS-bewijslink naar een Discord-bericht, Discord-afbeelding of i.imgur.com.
  De link wordt nooit door de server opgehaald. Staff controleert de speler,
  het item en het moment; er is geen automatische RuneLite- of WOM-dropdetectie.
- Alleen drops tijdens het actieve event tellen. Dezelfde bewijs-URL kan niet
  worden hergebruikt, ook niet met een andere querystring. Eén bewijs per drop.
  Afwijzingen hebben een reden; goedgekeurde beloningen zijn definitief.
- Een goedkeuring levert de ingestelde munitie op. Alleen de teamkapitein vuurt.
  Een schot kost één munitie en een vak kan maar eenmaal beschoten worden. Teams
  hoeven niet op hun beurt te wachten en kunnen schoten bewaren.
- Alle twaalf vijandelijke scheepsvakken raken wint de ronde. Anders geldt bij
  de eindtijd de meeste treffers, met gelijkspel bij dezelfde score. De deadline
  wordt door de server vóór iedere lees-/schrijfactie verwerkt. Wachtende drops
  tellen niet mee. Na afloop kunnen alle bezoekers de volledige vloten zien.
- Een annuleringsactie vereist een reden en sluit de ronde definitief. Het
  oorspronkelijke event en beheerlog blijven bewaard. Staff kan events op elk
  moment privé zetten; alleen staff kan ze dan lezen of wijzigen.

## Gegevens en rechten

`WARSHIPS` bindt aan SQLite Durable Object `ClanWarships`, migratie
`clan-warships-v1`, objectnaam `clan:7059`. Eén lopende ronde voorkomt onduidelijke
team-/droptoewijzing; maximaal 50 rondes blijven bewaard en de laatste 10 staan
in het overzicht. Per ronde: maximaal 100 leden, 100 aanvragen, 25 doelen,
500 claims en 2.000 gewone beheeracties. Spelers hebben maximaal 10 open claims.

Alle mutaties controleren de Discord-toegang en actor op de server, vereisen een
same-origin POST, strikt gevalideerde invoer, revisie en uniek request-ID.
Opslag van game en idempotentiesleutel is één SQLite-transactie zonder externe
IO. Gelijktijdige edits krijgen 409. Herlevering van hetzelfde verzoek kost nooit
extra munitie. Bij onbekende uitkomst biedt de browser hetzelfde verzoek opnieuw
aan. De server accepteert geen team, status, rol of beloning uit clientclaims.

`warshipView()` maakt een expliciete gegevensselectie: geen vijandelijke posities
in HTML, JSON of clientcode. Alleen het eigen team ziet de eigen vloot tijdens het
event; ook staff heeft geen extra inzage. Gezonken schepen worden zichtbaar.
Bewijslinks zijn uitsluitend zichtbaar voor het eigen team en staff. Publieke
bezoekers ontvangen geen Discord-ID's, bewijslinks, aanvragen of beheerlog.
Alle pagina-/API-antwoorden zijn private/no-store.

De zichtbare pagina ververst elke vijf seconden; overzicht/Events-kaart minder
vaak. Verborgen tabbladen stoppen, verzoeken overlappen niet en Retry-After wordt
gerespecteerd. Authenticated reads delen de bestaande vijfminutencontrole;
mutaties controleren rollen opnieuw. Fouten wissen geen opgeslagen speldata.

## Validatie

`node --test tests/warships.worker.test.mjs` draait de echte lokale Workers/SQLite
met gesimuleerde Discord-accounts. Controleert privacy, rollen, CSRF, geometrie,
dropmomenten en limieten, bewijs-URLs, idempotentie, munitie, concurrente acties,
zinken, winnen, de deadline en persistentie na herstart. Geen productie-event of
Discord-bericht wordt tijdens deze tests aangemaakt.

Bossiconen gebruiken de bestaande lokale OSRS-assets. De voorgestelde itemnamen
zijn gebaseerd op de OSRS Wiki: [Zulrah](https://oldschool.runescape.wiki/w/Zulrah),
[Vorkath](https://oldschool.runescape.wiki/w/Vorkath),
[God Wars Dungeon](https://oldschool.runescape.wiki/w/God_Wars_Dungeon),
[Cerberus](https://oldschool.runescape.wiki/w/Cerberus),
[Dagannoth Rex](https://oldschool.runescape.wiki/w/Dagannoth_Rex) en
[Alchemical Hydra](https://oldschool.runescape.wiki/w/Alchemical_Hydra).
