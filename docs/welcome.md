# Nieuwe leden verwelkomen

De homepage en `/nieuw-hier` gebruiken dezelfde inhoud. De standaard toelatingseis is 1250 total level. Admin en Staff team kunnen deze eis, het aanspreekpunt, maximaal zes clanscreenshots en zes korte voorstellen aanpassen via **Clanbeheer → Nieuw hier?**. Lege foto- en voorstelblokken verschijnen niet. Afbeeldingen gebruiken bestaande HTTPS-links; deze functie uploadt geen bestanden.

Bij **Clanactiviteiten** kan een beheerder **Beginnersvriendelijk** aanvinken en de benodigde ervaring en gear invullen. Beide velden zijn verplicht wanneer het label aanstaat. De eerstvolgende geplande beginnersactiviteit verschijnt op de homepage en welkomstpagina; de knop opent de juiste kalenderdag. Bij ontbrekende activiteiten verschijnt een uitnodiging om op Discord kennis te maken. De voorbereiding verandert de bestaande XP/KC-deelnameregels niet.

De inhoud staat in de bestaande ClanDiscord Durable Object, tabel `site_welcome`. Opslaan controleert de revisie zodat beheerders elkaars wijzigingen niet ongemerkt overschrijven. De nieuwe velden van bestaande activiteiten hebben veilige lege standaardwaarden. Publieke leesroutes tonen geen deelnemersgegevens; wijzigingen vereisen de bestaande Discord-beheerrechten en origincontroles. Deze wijzigingen sturen geen afzonderlijke Discord-aankondigingen.

Gecontroleerd met `node --test tests/welcome.test.mjs tests/clan-discord.worker.test.mjs` (17 tests), TypeScript en de productiebuild. De browsercontrole omvatte beheeropslag, weergave op de welkomstpagina, de kalenderkoppeling, lege inhoud en mobiele navigatie zonder horizontale overflow.
