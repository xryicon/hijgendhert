# Gratis clanraffle

De raffle staat op `/events#raffle`. Alleen leden met de actuele Discord-rol
Admin of Staff team kunnen hem beheren. Alle bezoekers kunnen de deelnemers,
gratis loten, geplande tijd en uitslag bekijken. Er zijn geen betaalvelden,
inleg, aankoopkoppelingen of automatische toekenningen na betalingen.

Staff vult een titel, optionele prijs, datum/tijd en namen met aantallen gratis
loten in. De invoertijd gebruikt de tijdzone van de browser; het controlescherm
en de publieke pagina tonen de tijd in Nederland/België. Na **Controleer & plan**
wordt de volledige samenvatting getoond. **Bevestig & plan trekking** zet alle
gegevens vast. Een foutieve geplande trekking kan met een openbare reden worden
geannuleerd. Een getrokken winnaar kan niet worden gewijzigd of opnieuw getrokken.
De loten verschijnen op het ledenprofiel wanneer de ingevoerde naam overeenkomt
met de daar gekozen RuneScape-naam; dit is geen bewijs van accounteigendom.

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

## Controleerbare trekking

Bij het plannen wordt een 256-bit willekeurige seed gemaakt met Web Crypto.
De publieke commitment is SHA-256 van `hh-raffle-seed-v1\n` plus de hexseed.
De seed blijft server-side tot de trekking of annulering. De volledige lijst,
lotbereiken, aantal loten, trekkingsdatum en commitment zijn vooraf downloadbaar.

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
Bewaar het vooraf gedownloade bewijs om wijzigingen achteraf zelf te constateren.

## Controle

`npm run test:raffle` gebruikt de bestaande Miniflare/workerd-versie en test
toegang, CSRF, ongeldige loten, dubbele namen, gelijktijdige requests, het echte
alarm zonder kijker, onafhankelijke bewijscontrole, annulering en opslag na een
workerherstart. De testklasse en inspectieroutes bestaan alleen in de testbundle.
