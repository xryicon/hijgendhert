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
2. Kies onder Bemanning de deelnemende Wise Old Man-clanleden. Laat het rad beide
   kapiteins loten, kies zelf twee kapiteins, of deel beide teams handmatig in.
   Controleer de EHB-totalen. Bevestig het voorstel direct, of plan onder
   De grote aankondiging een gezamenlijke onthulling (zie hieronder). De indeling
   kan al gemaakt worden voordat spelers inloggen. Iedere herindeling wist beide vloten.
3. Publiceer onder Clanleiding, of gebruik Plan & publiceer aankondiging.
   De Events-pagina toont de zeeslagkaart en het hoofdmenu krijgt een Zeeslag-tab.
   De server koppelt een unieke volledige Discord-naam automatisch aan de
   ingedeelde WOM-speler. Bij een afwijkende naam of conflict vraagt de speler
   handmatig een koppeling aan en bevestigt staff deze. Een speler kan maar aan één Discordaccount gekoppeld zijn en
   omgekeerd. Ook na de start kan een al ingedeelde speler zijn account koppelen.
4. Beide gekoppelde kapiteins plaatsen vier schepen (4, 3, 3 en 2 vakken) op een 8×8-kaart
   en zetten hun vloot vast. Schepen mogen raken, maar niet overlappen of over
   een rand lopen. De kapitein kan de indeling vóór de start aanpassen.
5. Staff start de zeeslag na bevestiging. Teams, regels en schepen liggen dan
   vast. De kapitein kan nog worden vervangen binnen hetzelfde team.
   Onder Clanleiding kan staff ook Forceer start kiezen als kapiteins nog niet
   klaar zijn. Iedere niet-vastgezette vloot krijgt dan een willekeurige geldige
   opstelling; vastgezette vloten blijven behouden. De bevestiging legt dit uit.
   Beide teams moeten een kapitein hebben en de teamonthulling moet klaar zijn.
   Kapiteins hoeven nog niet aan Discord gekoppeld te zijn: bestaande aanvragen
   blijven behouden en kunnen tijdens het event worden goedgekeurd. De schepen
   liggen vanaf de geforceerde start vast. Ook staff ziet geen vijandelijke vloot.

## Aftelling en gezamenlijke onthulling

- Na het voorbereiden van teams kiest staff onder Bemanning een datum, tijd,
  aankondigingstitel en bericht. Plan & publiceer aankondiging zet de teams vast,
  wist eventuele scheepsopstellingen en publiceert meteen de aftelling.
  De tijd moet minimaal een minuut vooruit liggen, met na de onthulling nog
  minimaal een minuut vóór het ingestelde eventeinde.
- De eigen Zeeslag-tab verschijnt tijdens een gepubliceerd voorbereidend of
  actief event. Bij privé zetten, annuleren of afronden verdwijnt de tab. De
  algemene onderhoudspagina blijft ongewijzigd. De tab gebruikt een openbare
  samenvatting zonder Discord-rolcontrole of privéconcepten.
- Tijdens het aftellen worden unieke naamovereenkomsten automatisch gekoppeld.
  Overige deelnemers kunnen hun WOM-naam kiezen voor controle door staff. De vlakke namenlijst toont geen teams of
  kapiteins. Ook staff ontvangt tijdens de aftelling geen teamindeling uit de API.
  Een nog niet bevestigd voorstel is altijd uitsluitend voor staff zichtbaar.
- De server bewaart één uitslag en één tijdlijn: eerst de door admins ingestelde
  spelregels (8–45 seconden per kaart), daarna iedere ingestelde boss drop
  gedurende acht seconden, vervolgens vijf seconden introductie,
  negen seconden per speler (beide kapiteins eerst), vijf seconden afsluiting.
  Per speler: vier seconden draaien, 2,6 seconden de naam groot in beeld,
  1,1 seconden bewegen naar de teamkaart, daarna 1,3 seconden rust.
  Beide teams staan tegenover elkaar met kapiteinskaarten, lege plaatsen en
  een gezamenlijke VS-presentatie. Bij minder-bewegingvoorkeur vervalt de vlucht.
  Bestaande geplande rondes behouden hun oorspronkelijke tijdlijn; opnieuw
  plannen vóór de onthulling gebruikt het nieuwe tempo. Een admin kan vóór de
  start ook alleen de regels opslaan om een geplande introductie bij te werken;
  de teams, accountkoppelingen en scheepsopstellingen blijven daarbij behouden.
  Alleen de huidige draai en al onthulde namen worden gedeeld. Ingelogde
  bezoekers volgen dezelfde tijdlijn; later aansluiten of verversen trekt niet
  opnieuw. Anonieme bezoekers zien de aankondiging en status, zonder namen.
- Na de onthulling krijgt iedere gekoppelde deelnemer automatisch toegang tot
  de eigen vloot. Tegenstanders en staff krijgen geen verborgen vijandelijke
  scheepsposities. De kapiteins plaatsen hun schepen; staff start daarna het
  daadwerkelijke boss-drop-event. De onthulling start het gevecht dus niet.
- Vóór de onthulling kan staff de planning aanpassen of intrekken. Intrekken
  maakt het event privé en bewaart de gekozen teams en accountkoppelingen.
  Zodra de onthulling begint kan deze niet opnieuw gepland of gerold worden.
- Een persistente Durable Object-alarm verwerkt de eerstvolgende onthulling,
  opening van teamgebieden of eventdeadline. Verwerking is idempotent bij
  herhaling; lezen verwerkt eventueel gemiste overgangen ook. De opgeslagen
  uitslag en planning overleven een herstart. WOM wordt alleen bij het maken
  van teams gebruikt, niet tijdens de geplande onthulling.

## Wise Old Man en de teamloting

- De staff-only `/api/warships/roster` leest de bestaande gedeelde cache van
  `/groups/7059`. [WOM group details](https://docs.wiseoldman.net/api/groups/group-endpoints)
  bevatten de clanleden en EHB. Er zijn geen afzonderlijke refreshes per speler.
  Fetched-at, verouderde cachedata en oude/ontbrekende accountupdatedAt blijven zichtbaar.
- De server valideert speler-ID's en neemt namen/EHB uit de WOM-gegevens over.
  Clientwaarden kunnen ratings niet veranderen. `draw_teams` en `manual_teams`
  slaan een voorstel op; `confirm_teams` of `schedule_reveal` vervangt de bemanning. Er is maximaal
  één huidig voorstel en een log van de laatste twintig indelingen.
- Willekeurige kapiteins worden gelijkwaardig zonder teruglegging gekozen met
  `crypto.getRandomValues` en rejection sampling. De kapiteins staan in aparte teams.
  De overige spelers worden verdeeld met maximaal één speler verschil in teamgrootte,
  inclusief de EHB van de kapiteins. Tot twintig spelers is de zoekactie exact op
  EHB afgerond op twee decimalen. Daarboven gebruiken we 24 startindelingen per
  teamgrootte, met maximaal 24 verbeterende paarruilen per indeling. Dat geeft het
  beste gevonden resultaat, geen garantie op een wereldwijd optimum.
- Het rad onthult het serverresultaat. Opnieuw afspelen trekt niet opnieuw;
  een bewuste nieuwe loting krijgt een nieuw ID en logitem. Herlevering van een
  verzoek geeft dezelfde opgeslagen uitslag, ook als WOM intussen onbereikbaar is.
- Nul EHB is geldig. Ontbrekende/negatieve/ongeldige EHB blokkeert automatisch
  balanceren en blijft expliciet onbekend bij handmatige teams. EHB is een
  ervaringsindicator, geen meting van gear, beschikbare speeltijd of inzet.
- Oude rondes zonder WOM-indeling blijven bruikbaar met hun bestaande
  deelnameaanvragen. Een bevestigde WOM-indeling sluit vrije teamkeuze af.

## Boss drops en schoten

- Alleen bemanningsleden kunnen drops indienen. Discord-screenshots met een dropnaam
  worden via Apps → Zeeslag-drop gekoppeld; zie [zeeslag-bewijs.md](zeeslag-bewijs.md).
  De bestaande bewijslinks blijven bruikbaar, met een tijdstip op secondenniveau
  en een HTTPS-bewijslink naar een Discord-bericht, Discord-afbeelding of i.imgur.com.
  De link wordt nooit door de server opgehaald. Een Admin controleert de speler,
  het item en het moment; er is geen automatische RuneLite- of WOM-dropdetectie.
- Alleen drops tijdens het actieve event tellen. Dezelfde bewijs-URL kan niet
  worden hergebruikt, ook niet met een andere querystring. Eén bewijs per drop.
  Afwijzingen hebben een reden; goedgekeurde beloningen zijn definitief.
- Alleen de Discord-rol Admin mag dropbewijs goedkeuren of afwijzen.
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
Wachtende, afgewezen en nog ongebruikte bewijslinks zijn uitsluitend zichtbaar
voor het eigen team en staff. Goedgekeurd bewijs dat een schot heeft betaald,
kan ook door de andere ingedeelde ploeg worden bekeken via dat beschoten vak. Publieke
bezoekers ontvangen geen Discord-ID's, bewijslinks, aanvragen of beheerlog.
Alle pagina-/API-antwoorden zijn private/no-store.

De zichtbare pagina ververst elke vijf seconden; vlak voor en tijdens de
onthulling iedere seconde. De aftelling en animatie volgen de servertijd.
Overzicht/Events-kaart en menutab verversen minder vaak. Verborgen tabbladen
stoppen, verzoeken overlappen niet en Retry-After wordt
gerespecteerd. Authenticated reads delen de bestaande vijfminutencontrole;
mutaties delen maximaal tien seconden servermatig bevestigde rollen en
controleren daarna opnieuw. Een mislukte nieuwe controle wist het eerdere
rolbewijs. Fouten wissen geen opgeslagen speldata. Bij een onderbroken login
toont Zeeslag de wachttijd en herstelknop en pauzeert het extra leesverzoeken.

## Validatie

`node --test tests/warship-briefing.test.mjs tests/warship-link.test.mjs tests/warship-reveal.test.mjs tests/warship-teams.test.mjs tests/warships.worker.test.mjs` test de
balans tegen een onafhankelijke volledige zoekactie voor kleine groepen, grote
en oneven groepen, kapiteins, ontbrekende EHB en de echte lokale Workers/SQLite
met gesimuleerde Discord-accounts. Controleert privacy, rollen, CSRF, geometrie,
dropmomenten en limieten, bewijs-URLs, idempotentie, munitie, concurrente acties,
zinken, winnen, de deadline, serverratings, WOM-idempotentie, accountkoppeling,
vlootreset bij herindeling, afgeschermde toekomstige onthullingen, tijdlijn,
planning/intrekken, dubbele alarmen en persistentie van planning na herstart.
Ook staff-only force-start, generatie en behoud van vloten, koppelen na start,
herhaling zonder herloting, de vertraagde onthulling en oude planningen worden
gecontroleerd. Ook aangepaste regels, adminrechten, verborgen toekomstige drops,
validatie, conflicten, planning en persistentie worden getest. Geen productie-event of
Discord-bericht wordt tijdens deze tests aangemaakt.

Bossiconen gebruiken de bestaande lokale OSRS-assets. De voorgestelde itemnamen
zijn gebaseerd op de OSRS Wiki: [Zulrah](https://oldschool.runescape.wiki/w/Zulrah),
[Vorkath](https://oldschool.runescape.wiki/w/Vorkath),
[God Wars Dungeon](https://oldschool.runescape.wiki/w/God_Wars_Dungeon),
[Cerberus](https://oldschool.runescape.wiki/w/Cerberus),
[Dagannoth Rex](https://oldschool.runescape.wiki/w/Dagannoth_Rex) en
[Alchemical Hydra](https://oldschool.runescape.wiki/w/Alchemical_Hydra).

## Automatische naamkoppeling en presentatiescherm

Bij het openen van een gepubliceerd event vergelijkt de server de geverifieerde
Discord-clannaam en gebruikersnaam met de bevestigde WOM-deelnemers. Alleen een
unieke volledige overeenkomst wordt gekoppeld. Hoofdletters, spaties, underscores
en koppeltekens worden gelijk behandeld; versieringen en rankprefixen niet.
Verschillende matches tussen clannaam en gebruikersnaam, bestaande koppelingen
en open aanvragen gaan naar de bestaande handmatige staffcontrole. Er zijn geen
extra providerverzoeken nodig. Dit is een clanconventie op basis van Discord-namen,
geen bewijs van bezit van het RuneScape-account.

De koppeling wordt duurzaam opgeslagen op Discord-ID en WOM-speler-ID en blijft
behouden bij een naamswijziging. Teams en vlootposities blijven tijdens de
onthulling afgeschermd. Staff kan bij Bemanning een accountkoppeling verwijderen;
de deelnemer, schepen en historie blijven behouden. Het verwijderde of afgewezen
account kan in die ronde uitsluitend via staff opnieuw gekoppeld worden.

De live selectie opent als een schermvullend podium met twee tegenoverliggende
vloten, rad en naamonthulling. De beschikbare schermhoogte bepaalt hoeveel
spelerskaarten op één pagina passen. Grote teams gebruiken paginaknoppen en
volgen automatisch de laatst onthulde speler; het podium heeft geen scrolllijst.
Op mobiel staat het rad boven beide teams. Escape of Terug naar event verlaat
het podium zonder de gezamenlijke loting te stoppen. Achtergrondfocus en scroll
worden tijdelijk geblokkeerd en daarna hersteld. Reduced-motion blijft ondersteund.

De tests controleren naamconflicten, bescherming van bestaande claims, afwijzing
en ontkoppeling, privacy vóór de onthulling, rolcontrole, herstart en paginacapaciteit.
Visuele browsercontrole is niet uitgevoerd; de controle is via broncode, types,
build en geautomatiseerde tests uitgevoerd.

De stille introductie en het beheer van regels en boss-onthullingen staan
beschreven in [zeeslag-intro.md](zeeslag-intro.md).
