# Discord-toegang bij openen en aanmaken

De site bewaart Discord-rollen uitsluitend als kort geldig bewijs op de server.
Gewone pagina- en API-reads delen maximaal vijf minuten rolbewijs. Acties en
beheercontroles delen maximaal tien seconden; die termijn schuift niet op door
gebruik. Dit voorkomt dat het openen, aanmaken en direct bewerken van een event
steeds afzonderlijke Discord-verzoeken verbruikt. Na tien seconden moet een
actie opnieuw bij Discord worden gecontroleerd. Configuratie en toegang voor
de specifieke actie worden nog steeds bij ieder verzoek gecontroleerd.

Een nieuwe weigering of storing verwijdert oud rolbewijs; er is geen terugval
op verlopen rollen. Discords Retry-After blijft geldig na herstart. Uitloggen
wist het bewijs en een laat antwoord kan een ingetrokken login niet herstellen.

De interne rolcontrole heeft een grens van tien seconden. Een vastgelopen
controle geeft HH-SESSION-CHECK_TIMEOUT (of HH-PAGE-CHECK_TIMEOUT) en een
hersteltermijn van dertig seconden. De browser beëindigt zijn volledige
sessiecontrole uiterlijk na 25 seconden, inclusief wachten op een ander tabblad
en het lezen van het antwoord. Een laat antwoord verandert die uitslag niet.
Het bijwerken van de optionele avatarlijst gebeurt in de achtergrond en blokkeert
het inloggen niet.

PK bewaart foutcode en Retry-After bij doorverwijzen naar Login, zodat die pagina
niet onmiddellijk dezelfde mislukte controle herhaalt. Zeeslag toont bij een
sessiestoring een herstelknop en wachttijd, pauzeert de periodieke spelverzoeken
en hervat zodra de sessie bevestigd is. Opgeslagen events blijven bewaard.

Gerichte controles: session-provider.test.mjs, discord-membership-cache.test.mjs,
discord-auth.test.mjs, discord-auth.worker.test.mjs, pk.worker.test.mjs en
warships.worker.test.mjs. Alleen lokale testaccounts en gesimuleerde providers;
geen productie-events of echte Discord-meldingen.
