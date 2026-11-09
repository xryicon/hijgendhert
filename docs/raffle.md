# Clanloterij

De raffle staat op `/events#raffle`. Alleen leden met de actuele Discord-rol
Admin of Staff team kunnen hem beheren. Alle bezoekers kunnen de deelnemers,
gratis loten, geplande tijd en uitslag bekijken. Er zijn geen betaalvelden,
inleg, aankoopkoppelingen of automatische toekenningen na betalingen.

Staff vult een titel, optionele prijs, datum/tijd en namen met aantallen gratis
loten in. De invoertijd gebruikt de tijdzone van de browser; het controlescherm
en de publieke pagina tonen de tijd in Nederland/België. Na **Controleer & plan**
wordt de volledige samenvatting getoond. **Bevestig & plan trekking** zet de
trekkingsdatum en geheime trekkingscode vast. Onder **Loterij beheren →
Deelnemers aanpassen** kunnen Admin en Staff team tot aan de trekking namen
toevoegen, verwijderen en lotenaantallen wijzigen. **Wijzigingen opslaan** werkt
de openbare lijst, lotnummers en kansen bij; de winnaar wordt bepaald met de
definitieve lijst op het trekkingsmoment. Een foutieve geplande trekking kan met een openbare reden worden
geannuleerd. Een getrokken winnaar kan niet worden gewijzigd of opnieuw getrokken.
De loten verschijnen op het ledenprofiel wanneer de ingevoerde naam overeenkomt
met de daar gekozen RuneScape-naam; dit is geen bewijs van accounteigendom.

De beheerder kan zoeken in de clanleden van Wise Old Man. Eén gedeelde aanvraag
laadt de lijst; typen veroorzaakt geen nieuwe API-verzoeken. Een eerder geladen
openbare namenlijst blijft maximaal zeven dagen beschikbaar in de browser, met
een melding wanneer dit een opgeslagen lijst is. Bij een storing kan een naam
handmatig worden ingevoerd. Een providerwachttijd blokkeert te vroeg vernieuwen.
De gekozen naam wordt overgenomen zoals Wise Old Man die weergeeft. Het wijzigen
van deelnemers verandert de lijsthash, maar nooit de geplande tijd, ronde-ID of
vingerafdruk van de trekkingscode. Een lege lijst kan weer worden aangevuld tot
de deadline. Zonder deelnemers annuleert de server de ronde bij de trekking met
de openbare reden 'Geen deelnemers bij de trekking.'.

De pagina gebruikt kortere labels zoals 'loten' en 'loterij'; de kosteloze
deelname blijft zichtbaar onder 'Over deelname'. De server vereist nog steeds
`freeEntry: true` en accepteert geen aankoop- of betaalvelden.

## Bewaarplaats en planning

Cloudflare Durable Object `ClanRaffle`, binding `RAFFLES`, instantie `clan:7059`,
bewaart de rondes in SQLite. De configuratie staat in `vite.config.ts` en de
migratie `raffle-v1` maakt de namespace bij de Cloudflare-deploy aan. Er is geen
D1-database-ID of extra secret nodig. De platformalarmfunctie voert de trekking
uit op het ingestelde moment zonder open browser. Bij een platformonderbreking
wordt opnieuw geprobeerd; een latere leesaanvraag herstelt een verlopen trekking.
Dat kan de zichtbaarheid van de uitslag vertragen, maar verandert de winnaar niet.

Een SQL-constraint laat maar één geplande ronde tegelijk toe. Een verzoek-ID
voorkomt dubbele rondes door dubbelklikken of netwerkherhalingen. Gelijktijdige
alarm- en pagina-aanvragen schrijven alleen wanneer de ronde nog gepland staat.
Annuleringen blijven bewaard. De publieke geschiedenis toont de laatste 20
afgeronde/geannuleerde rondes; oudere rondes blijven via hun ID beschikbaar.

`POST /api/raffle/entries` vereist een actuele Staff/Admin-rol, dezelfde origin,
de ronde-ID, `expectedEntriesHash` en de volledige nieuwe lijst. De server
controleert de deadline nogmaals na het berekenen van de lijsthash. Een
gelijktijdige wijziging levert HTTP 409 op; de beheerder kan de actuele lijst
laden zonder onbedoeld andermans werk te overschrijven. Een identieke herhaling
na een verloren antwoord is veilig zolang de deadline nog niet verstreken is.
Alle schrijfcontroles en de uiteindelijke opslag gebeuren zonder tussentijdse
asynchrone bewerkingen. Het formulier behoudt invoer bij normaal verversen en
mislukte opslag. Op of na het trekkingsmoment zijn wijzigingen geblokkeerd.

## Controleerbare trekking

Bij het plannen wordt een 256-bit willekeurige seed gemaakt met Web Crypto.
De publieke commitment is SHA-256 van `hh-raffle-seed-v1\n` plus de hexseed.
De seed blijft server-side tot de trekking of annulering. De actuele lijst,
lotbereiken, aantal loten, trekkingsdatum en commitment zijn vooraf downloadbaar.
De lijst en lotbereiken kunnen tot de trekking veranderen; voor controle van de
uitslag is de definitieve lijst nodig. De vooraf gepubliceerde commitment blijft
bij elke wijziging hetzelfde.

De lijsthash is SHA-256 van JSON van de geordende `[naam, aantal]`-paren. De
trekkingshash is SHA-256 van de volgende UTF-8-tekst, zonder afsluitende newline:

```
hh-raffle-v1
<ronde-UUID>
<drawAt als Unix milliseconden>
<lijsthash als lowercase hex>
<seed als lowercase hex>
<teller, beginnend bij 0>
```

Lees per hash acht unsigned 32-bit big-endian waarden. Accepteer de eerste
waarde kleiner dan `floor(2^32 / totaal) * totaal`; het lot is `waarde % totaal + 1`.
Als alle waarden afvallen, verhoog de teller en hash opnieuw. Dit voorkomt
modulobias; elk lot heeft dezelfde kans. Aantallen bepalen dus de kans per naam.

`lib/raffle-proof.ts` bevat de browsercontrole. Die controleert de seedcommitment,
lijsthash, lotbereiken en winnaar. Dit bewijst overeenstemming met de gepubliceerde
gegevens, niet de onkreukbaarheid van iemand met volledige server-/databasecontrole.
Bewaar de vooraf gedownloade commitment om de trekkingscode later te vergelijken.

## Controle

`npm run test:raffle` gebruikt de bestaande Miniflare/workerd-versie en test
toegang, CSRF, ongeldige loten, dubbele namen, gelijktijdige requests, het echte
alarm zonder kijker, onafhankelijke bewijscontrole na lijstwijzigingen, toevoegen
en verwijderen, aantallen, conflicten, herhalingen, de deadline, lege lijsten,
annulering en opslag na een workerherstart. De testklasse en inspectieroutes
bestaan alleen in de testbundle.
