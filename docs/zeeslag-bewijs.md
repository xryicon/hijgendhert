# Zeeslag-bewijs via Discord

## Instellen

Clanbeheer → Discord → Zeeslag · screenshotbewijs. Bewaar het kanaal-ID en
schakel de koppeling in zodra de clan klaar is. De standaard is uitgeschakeld;
er worden geen testberichten of bestaande chatberichten opgehaald voor imports.

De bestaande Hijgend Hert-bot moet in de server staan. DISCORD_BOT_TOKEN blijft
een Cloudflare-secret. Geef de bot in het gekozen tekstkanaal Kanaal bekijken,
Berichten verzenden, Links insluiten en Berichtgeschiedenis lezen. De bestaande
ondertekende interactie-URL blijft /api/discord/interactions.

Inschakelen controleert de server en leestoegang en registreert uitsluitend het
berichtcommando Zeeslag-drop met POST (geen bulkvervanging van andere commando's).
Er is geen extra R2-opslag, Gateway-verbinding of Message Content-intent nodig.
Discord levert het gekozen bericht als onderdeel van de ondertekende interactie.

## Een screenshot indienen

1. Een ingedeeld lid plaatst één PNG, JPG of WebP van maximaal 8 MB in het kanaal,
   met de volledige dropnaam in de berichttekst. Bijvoorbeeld: Tanzanite fang.
2. Open het berichtmenu → Apps → Zeeslag-drop. Een lid kan alleen eigen
   screenshots insturen. Een Admin kan een bericht van een deelnemer insturen;
   de oorspronkelijke uploader blijft de eigenaar.
3. De server matcht de naam tegen de ingestelde eventdrops en het Discord-ID
   tegen de bestaande bemanning. Bij eigen inzendingen werkt ook de bestaande
   unieke Discord/WOM-naamkoppeling. Onbekende namen worden geweigerd.
4. De bot toont het gevonden item, boss, speler, team en screenshot met de
   knoppen Goedkeuren en Afwijzen. Alleen de geverifieerde Admin-rol kan beslissen.
   Afwijzen vraagt een reden. De website krijgt de wijziging bij de volgende
   normale verversing (circa vijf seconden).

De dropnaam wordt als volledig woordpatroon gematcht, ongeacht hoofdletters en
leestekens. Varianten gescheiden met / zijn ondersteund. Bestaande verkortingen
zoals Bandos chestplate / tassets / boots en Primordial / Pegasian / Eternal
crystal worden aangevuld tot volledige itemnamen. Bij dezelfde itemnaam voor
meerdere bosses kan de bossnaam onderscheid maken. Er wordt nooit geraden.

Het berichttijdstip wordt als inzendtijd/dropmoment vastgelegd en moet binnen
het actieve event vallen. De admin controleert ook de werkelijke tijd, speler
en drop op het beeld. Er is geen OCR of automatische inhoudsgoedkeuring.
Opnieuw indienen van hetzelfde bericht of attachment levert geen extra claim op.
Dezelfde goedkeuring of afwijzing kan nooit dubbel munitie opleveren.

## Bewijs bij een schot

De server koppelt ieder nieuw schot aan één goedgekeurde claim met resterende
munitie. Een claim met meerdere schoten betaalt meerdere vakken. Reeds opgeslagen
koppelingen veranderen niet bij latere goedkeuringen. Oude schoten van vóór deze
functie behouden hun verbruikte munitie, maar krijgen geen verzonnen bewijs.

Op de zeekaart opent ieder beschoten vak een bewijsvenster. Het toont de
screenshot, RuneScape-naam, team, item, boss, admin, beoordelingstijd en schottijd.
Beide ingedeelde teams en staff kunnen gebruikt, goedgekeurd bewijs lezen.
Bezoekers, losse clanleden zonder team en het andere team vóór gebruik krijgen
geen toegang. Wachtende en afgewezen bewijzen blijven bij eigen team en staff.

De bestaande linkinvoer op de website blijft bestaan. Zo'n bewijs toont de
bronlink in plaats van een ingebedde afbeelding. Alleen Admins mogen ook daar
goedkeuren. Een Discordkaart waarvan de status op de website is gewijzigd,
wordt bij de volgende knopactie bijgewerkt naar de opgeslagen beoordeling.

## Discord als opslag

Bewaar de oorspronkelijke screenshotberichten. De website bewaart bericht- en
attachment-ID's, geen kopie van het beeld. Bij openen leest de bot het oorspronkelijke
bericht om een geldige tijdelijke CDN-link op te halen. Alleen het oorspronkelijke
attachment-ID, de eigenaar, het bestandstype en de grootte worden geaccepteerd.
Wijzigen van de berichttekst vervangt de reeds opgeslagen dropkoppeling niet.

De link wordt maximaal vijf minuten hergebruikt, en nooit voorbij de CDN-vervaltijd.
Afgeschermde routes controleren toegang bij iedere aanvraag. Een verwijderde of
vervangen afbeelding geeft een duidelijke melding; er wordt geen vervangende
bijlage getoond. Discord-rate-limits pauzeren nieuwe beeldverzoeken. Er worden
geen afbeeldingen bij iedere bordverversing opgevraagd.

## Verificatie

Lokale tests gebruiken ondertekende, fictieve Discord-interacties en een
gesimuleerde provider. Ze testen matching, uploader, rechten, afwijzingen,
dubbele inzendingen, schotkoppeling, privébeelden, caching, rate-limits en herstel
na herstart. Productieberichten en echte eventdata worden niet aangepast.
