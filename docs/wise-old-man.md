# Wise Old Man

De website leest de openbare gegevens van clan 7059 via de officiële v2-API,
standaard **zonder API-sleutel**. Een eerder opgeslagen `WOM_API_KEY` wordt
genegeerd zolang `WOM_AUTH_MODE` niet op `api-key` staat. Er hoeft dus geen
secret verwijderd te worden om de openbare koppeling te gebruiken.

Een API-sleutel is optioneel en geeft hogere verzoeklimieten. Alleen om die
later te gebruiken: zet `WOM_AUTH_MODE` op `api-key` en sla `WOM_API_KEY` op als
versleuteld Cloudflare Worker-secret bij
**hijgendhert → Settings → Variables and Secrets**, als type **Secret**, en deploy.
De sleutel hoort niet in Git, de browser, `VITE_*`, `NEXT_PUBLIC_*` of de chat.
Er is geen nieuwe build nodig wanneer alleen de waarde van deze secret wijzigt.

Alle serverroutes gebruiken dezelfde koppeling: clancijfers, leden, XP-winst,
competities, standen, erelijst en persoonlijke eventgeschiedenis. Bij expliciet
ingeschakelde sleuteltoegang gaat de sleutel uitsluitend als `x-api-key` naar
`https://api.wiseoldman.net/v2`; redirects worden
niet gevolgd. Discord-rollen blijven onafhankelijk gecontroleerd.

Openbare data wordt vijftien minuten hergebruikt. Uitslagen voor de erelijst blijven
een uur vers. Een oudere succesvolle respons blijft maximaal 24 uur beschikbaar
als terugval, met de oorspronkelijke ophaaltijd en `stale: true`. Dit is een
Cloudflare-edgecache, geen permanente database; een nieuwe locatie kan nog koud
zijn. Discord-tokens, ledenrechten en de API-sleutel komen niet in deze cache.

Bij HTTP 429 wordt de volledige `Retry-After` gerespecteerd, ook bij uur- en
daglimieten. Een datumheader wordt eveneens ondersteund. De tijdelijke blokkade
hoort bij de betreffende quota: een nieuw ingestelde sleutel erft niet de
blokkade van anonieme verzoeken. De cache-identificatie bevat alleen een hash van
de sleutel; foutlogs bevatten uitsluitend de HTTP-status en of een sleutel is
ingesteld. Ze bevatten geen headers, tokens of spelersnamen.

Clancijfers en zichtbare eventstanden vernieuwen iedere vijftien minuten. De
eventpagina vraagt geen ongebruikte clanlijst op en bewaart de laatste stand
bij een tijdelijke verbindingsfout. De pagina toont dan dat de stand ouder is.
Terugkeren naar een browsertab start geen nieuwe aanvraag vóór het volgende
verversmoment. Tijdens verversen blijven eerder opgehaalde cijfers zichtbaar.
Een Wise Old Man-aanvraag krijgt twintig seconden om te voltooien. Na een
verbindingsstoring wachten alle routes vijf minuten met nieuwe aanvragen; een
afgewezen sleutel krijgt vijftien minuten rust. Langere `Retry-After`-termijnen
blijven leidend. Deze timers veranderen niets aan Discord-logincontroles.

Foutresponses hebben een veilige diagnosecode zonder sleutel of providerbody.
`WOM_TIMEOUT` is een verlopen aanvraag. `WOM_HTTP_429` is een verzoeklimiet.
`WOM_API_KEY_INVALID` wordt alleen gebruikt als Wise Old Man zelf meldt dat de
sleutel ongeldig is. Vervang dan `WOM_API_KEY` door de sleutel die Wise Old Man
heeft uitgegeven; een Discord-secret, groepsverificatiecode of zelfgemaakte
sleutel is geen Wise Old Man API-key.
Na activering van een eerder afgewezen sleutel kan **Opnieuw proberen** de
oude afwijzing opnieuw controleren. Dit mag hoogstens eenmaal per minuut.
Een geslaagde controle heft alleen die oude sleutelafwijzing op; een 429-limiet
of de door Wise Old Man opgegeven wachttijd kan niet worden overgeslagen.

Controle: `npm run test:discord` test ook de echte Cloudflare-runtime met een
testprovider: alle openbare routes, profieldata, sleutelafscherming, gedeelde
cache, lange afkoeltijden en geweigerde redirects.

Officiële documentatie: https://docs.wiseoldman.net/
