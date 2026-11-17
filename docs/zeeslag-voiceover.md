# Nederlandse spelregelintroductie

Nieuwe Zeeslag-planningen gebruiken `pace: 3`: zes spelregels in 70,5 seconden,
dan vijf seconden aanloop naar het rad, vervolgens de bestaande negen seconden
per deelnemer en vijf seconden afsluiting. `opensAt` bevat de volledige duur.
De server geeft vóór de eerste draai geen teamtoewijzingen vrij. Een bestaande
planning met pace 2 of zonder pace houdt haar oorspronkelijke tijden; opnieuw
opslaan vóór de geplande start past de nieuwe introductie toe.

De regels staan in `lib/warship-briefing.ts`, met per regel dezelfde tekst voor
beeld en audio, de gemeten audiolengte en een korte leespauze. De actuele
droplijstgrootte en eindtijd komen uit het event. De gesproken uitleg verwijst
naar de ingestelde droplijst en verzint geen eigen beloningen of limieten.

## Audio

De zes vaste MP3-fragmenten staan onder `/audio/zeeslag/`. Samen circa 685 KiB.
Ze worden door de website zelf aangeboden. Er is geen betaalde dienst, secret,
runtime-spraakgeneratie of Nederlandse steminstallatie bij de bezoeker nodig.
De bestanden zijn lokaal gemaakt met Piper 1.8.0 en de Nederlandse
`nl_NL-ronnie-medium`-stem. Alleen de gemaakte audio wordt gepubliceerd; het
programma en stemmodel worden niet met de website verspreid.

Herkomst:
- [Piper](https://github.com/OHF-Voice/piper1-gpl)
- [Stemmodel en modelkaart](https://huggingface.co/rhasspy/piper-voices/tree/main/nl/nl_NL/ronnie/medium)
- De modelkaart vermeldt CC0 voor de bronopnamen en het Vlaamse basismodel.
- Instellingen: length_scale 1.03, noise_scale 0.5, noise_w_scale 0.333.
- Mono MP3 op 96 kbit/s; iedere tijdslotlengte is audiolengte + minimaal 1,8 s,
  afgerond naar boven op een halve seconde.

Bezoekers klikken op **Geluid aan** om hun browser toestemming te geven.
Web Audio bewaart die toestemming tijdens de aftelling. De vaste fragmenten
worden dan alvast geladen. Per regel speelt maximaal één fragment; later
aansluiten spoelt naar de actuele tijd. Dempen, de scène verlaten en een
verborgen tabblad stoppen het geluid. Terugkeren volgt de huidige regel.
Netwerkfouten tonen een herprobeermelding en stoppen nooit de gezamenlijke klok.
Zonder audiotoegang blijven alle regels leesbaar. Verminderde beweging wordt
gerespecteerd. Er is geen knop waarmee één bezoeker de gedeelde uitleg overslaat.

## Controle

De Zeeslag-suite telt 37 tests, inclusief de nieuwe tijdlijn, oude planningen,
late deelname, afgeschermde teamgegevens, aanwezige audiobestanden, stop- en
dempraces, audiofouten en retry. Audio is gecontroleerd op lengte en een
niet-stil signaal. Typecontrole en productiebuild horen bij de publicatie.
Geen visuele browsercontrole of gehoorcontrole op het apparaat van de gebruiker
is uitgevoerd.
