# Wise Old Man

De website leest de openbare gegevens van clan 7059 via de officiële v2-API.
`WOM_API_KEY` is een versleuteld Cloudflare Worker-secret. Sla de sleutel op bij
**hijgendhert → Settings → Variables and Secrets**, als type **Secret**, en deploy.
De sleutel hoort niet in Git, de browser, `VITE_*`, `NEXT_PUBLIC_*` of de chat.
Er is geen nieuwe build nodig wanneer alleen de waarde van deze secret wijzigt.

Alle serverroutes gebruiken dezelfde koppeling: clancijfers, leden, XP-winst,
competities, standen, erelijst en persoonlijke eventgeschiedenis. De sleutel gaat
uitsluitend als `x-api-key` naar `https://api.wiseoldman.net/v2`; redirects worden
niet gevolgd. Discord-rollen blijven onafhankelijk gecontroleerd.

Openbare data wordt vijf minuten hergebruikt. Uitslagen voor de erelijst blijven
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

Clancijfers en zichtbare eventstanden vernieuwen iedere vijf minuten. De
eventpagina vraagt geen ongebruikte clanlijst op en bewaart de laatste stand
bij een tijdelijke verbindingsfout. De pagina toont dan dat de stand ouder is.

Controle: `npm run test:discord` test ook de echte Cloudflare-runtime met een
testprovider: alle openbare routes, profieldata, sleutelafscherming, gedeelde
cache, lange afkoeltijden en geweigerde redirects.

Officiële documentatie: https://docs.wiseoldman.net/
