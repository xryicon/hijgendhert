# PK-sessies

De aparte pagina `/pk` gebruikt de bestaande Discord-login. Admin en Staff team
stellen onder **Clanbeheer → Discord → Toegang tot PK-sessies** één PK-rol-ID in.
Leeg betekent geen toegang voor gewone leden. De PK-rol is aanvullend op de
bestaande Member/Admin/Staff-clantoegang. Admin en Staff houden toegang en kunnen
een sessieleider helpen. Er is geen bot-token of extra OAuth-scope nodig.

## Gebruik

- Ieder PK-lid kan één actieve sessie leiden. De leider kiest spelers uit de
  bestaande Wise Old Man-clanlijst (groep 7059); namen worden op de server
  gecontroleerd. De geselecteerde spelers starten actief.
- Andere PK-leden kunnen een sessie bekijken en aanvragen om mee te doen onder
  een geselecteerde RuneScape-naam. De leider ziet zowel Discord- als RS-naam en
  accepteert of weigert. Een naamkeuze bewijst geen eigendom van dat RS-account;
  de leider controleert die koppeling voordat hij accepteert. Een aanvrager kan
  zijn eigen openstaande verzoek intrekken. Maximaal één open verzoek per
  Discord-lid of RS-speler in dezelfde sessie.
- De leider en staff beheren de groep, loot en afsluiting. Alleen actieve spelers
  op het moment van **invoeren van een drop** ontvangen een gelijk deel van die
  drop. Later aansluiten, accepteren, hervatten, pauze of vertrek verandert
  eerdere splits niet. Voer drops dus meteen in voordat je de groepsstatus wijzigt.
- Bedragen zijn hele GP. De rest van een deling blijft apart in de restpot.
  `totale loot = alle spelersplits samen + restpot`; er worden geen in-game
  betalingen uitgevoerd of automatisch waargenomen.
- Een verwijderde drop trekt precies zijn oorspronkelijke aandelen en rest af.
  De oorspronkelijke drop, verwijderreden, actor en tijd blijven zichtbaar.
- Na afsluiten staan de gegevens vast. Open verzoeken sluiten mee af. Links
  staan de vijf recentst afgesloten sessies met totaal GP; aanklikken toont de
  spelers, splits, drops en tijdlijn. Oudere opgeslagen sessies worden niet gewist.

## Synchronisatie en opslag

De zichtbare pagina leest een open sessie iedere 5 seconden; het overzicht iedere
10 seconden. Verborgen tabbladen pauzeren. Verbindingsfouten tonen een melding en
bewaren de laatst geladen stand; 401/403 wissen die stand. Retry-After wordt
gerespecteerd. De Wise Old Man-clanlijst gebruikt de bestaande gedeelde cache;
live loot-updates doen geen extra WOM-aanvragen. Discord-readchecks delen de
bestaande korte 15-secondencontrole; schrijfacties controleren rollen opnieuw.

`PK` bindt aan de SQLite Durable Object `ClanPk`, migratie `clan-pk-v1`.
`clan:7059` coördineert de beperkte PK-administratie van deze clan. Elke mutatie
schrijft atomair een nieuwe sessierevisie, geschiedenis en idempotentiesleutel.
Verouderde revisies krijgen 409; onbekende uitkomst kan veilig met hetzelfde
request-ID opnieuw worden verstuurd. PK-rolinstellingen worden ook binnen de
mutatie gecontroleerd. De leider en rollen worden nooit uit clientinvoer vertrouwd.

Grenzen: 20 actieve sessies, 50 spelers, 500 drops, 100 aanmeldverzoeken en 2500
tijdlijnitems per sessie. Afsluiten blijft mogelijk wanneer de tijdlijn vol is.
Alle API-antwoorden en de pagina zijn privé en niet cachebaar.

## Validatie

`node --test tests/pk.worker.test.mjs` gebruikt lokale Workers en SQLite, met
nagebootste Discord- en Wise Old Man-antwoorden. Test rolrechten, CSRF, server-
geverifieerde namen, verdeling, afronding, correcties, aanmeldverzoeken, eigenaar-
goedkeuring, idempotentie, gelijktijdige wijzigingen, de laatste vijf sessies,
afsluiting en opslag na een herstart. Er worden geen echte PK-sessies aangemaakt.
