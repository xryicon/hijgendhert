# Bingo — tijdelijk uitgeschakeld

Op verzoek verwijderd uit de website op 9 november 2026.

De pagina en API staan hier buiten de actieve `app/`-routes, zodat `/bingo` en `/api/bingo` niet bereikbaar zijn. De navigatielink, de kaart op de clanpagina en de automatische API-controle zijn verwijderd. De componenten, bibliotheken, tests en SQL-migraties blijven bewaard voor later.

`.openai/hosting.json` heeft `d1: null`. Daardoor bevat de productiebuild geen D1-binding en wordt de lokale placeholderdatabase niet naar Cloudflare gestuurd. Er is geen database of bestaande evenementdata verwijderd.

Voor herintroductie:

1. Richt een echte D1-database in, verbind `DB` en pas de bewaarde migraties uit `drizzle/` toe.
2. Controleer de beheerdersaanmelding voor de gekozen host. De bestaande Sites-aanmelding vereist de vertrouwde Sites-proxy; vertrouw die identiteitsheaders niet rechtstreeks op een publieke Cloudflare Worker.
3. Herstel `page.tsx` en `bingo.css` naar `app/bingo/` en `api.ts` naar `app/api/bingo/route.ts`.
4. Herstel de optionele navigatie en clankaart uit de vorige versie en controleer privé/openbaar-toegang en scorewijzigingen opnieuw.

Zet geen database-ID of beheerder in de broncode zonder de configuratie en toegangscontrole te verifiëren.
