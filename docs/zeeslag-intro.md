# Zeeslag: regels, bosses en teamonthulling

De introductie is volledig stil. Er zijn geen audiobestanden, geluidsknoppen,
browserstemmen of externe spraakdiensten meer.

## Beheer

Open Zeeslag → Bemanning → Introductieregels. Alleen de geverifieerde Discord-rol
Admin kan deze regels opslaan. Staffteam kan de inhoud bekijken en behoudt de
bestaande rechten om events, teams, drops en de planning te beheren.

Er zijn één tot twaalf regels. Iedere regel heeft een titel (maximaal 80 tekens),
tekst (maximaal 360 tekens) en leestijd van 8 tot 45 hele seconden. Admins kunnen
regels toevoegen, verwijderen en verplaatsen. Een nieuwe ronde start met zes
bewerkbare regels die de bestaande spelmechaniek beschrijven.

Regelteksten veranderen de spelmechaniek niet. Bosses, geldige drops, schoten
en de limiet per team worden onder de eventinstellingen ingesteld. De introductie
toont deze doelen daarna in dezelfde volgorde: bossicoon, bossnaam, droptekst,
schotenbeloning en maximum per team. Iedere dropkaart duurt acht seconden.

## Gezamenlijke tijdlijn

Spelregels → bosses en drops → vijf seconden opbouw → kapiteins en overige teams.
De bestaande negen seconden per speler en vijf seconden afsluiting blijven intact.
Het scherm toont welke fase loopt en wanneer de teamonthulling begint.
Later aansluiten en verversen volgen dezelfde serverklok, zonder nieuwe loting.

Alle introductiekaarten worden bij het plannen opgeslagen. Gewone leden en
bezoekers krijgen een toekomstige boss/drop nog niet via de API; het doel wordt
zichtbaar zodra de bijbehorende kaart begint. Staff kan de volledige configuratie
blijven bekijken. Teamindelingen blijven voor iedereen afgeschermd tot hun eigen
moment in de teamonthulling. De bestaande vlootprivacy blijft behouden.

Vóór de start kan een admin regels opslaan. Een geplande introductie krijgt dan
direct de nieuwe kaarten en de passende openingstijd, zonder teamherloting of
verlies van accountkoppelingen en schepen. De server weigert een introductie
die niet meer vóór de eindtijd past. Zodra de introductie begint, liggen de regels
vast. Ook tijdens een actieve of afgesloten strijd kan niemand ze wijzigen.
Conflicterende edits en herhaalde verzoeken worden gecontroleerd.

Bestaande rondes met een oudere tijdlijn behouden hun planning en worden stil
weergegeven. Een admin kan de regels vóór de introductie opslaan om ook zo'n
planning naar de nieuwe regels/bosses/drops-volgorde om te zetten.

## Presentatie

De Zeeslag-pagina gebruikt de clancrest, donkergroene panelen en messing accenten.
Het event heeft één duidelijke titel. Teamkaarten tonen bemanning, munitie,
treffers, gezonken schepen en voortgang. Het archief heeft aanklikbare eventkaarten.
De schermvullende teamonthulling en voorkeur voor minder beweging blijven behouden.

Validatie gebeurt met lokale Workers-tests, typecontrole en de productiebuild.
Er worden geen productie-events of Discord-berichten aangemaakt voor tests.
