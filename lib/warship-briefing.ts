// Fixed Dutch narration; durations include a short reading pause.
export const SEA_BRIEFING = [
  {
    "id": "strijd",
    "title": "Twee vloten. Eén strijd.",
    "text": "Welkom bij de Zeeslag van Hijgend Hert. Twee teams jagen op boss drops. Daarmee verdienen jullie schoten op de vijandelijke vloot.",
    "audio": "/audio/zeeslag/strijd-nl-v1.mp3",
    "audioMs": 9869,
    "durationMs": 12000
  },
  {
    "id": "vloot",
    "title": "Bescherm jullie vloot",
    "text": "Jullie kapitein plaatst vier schepen: één van vier vakken, twee van drie en één van twee. Alleen je eigen team ziet de opstelling.",
    "audio": "/audio/zeeslag/vloot-nl-v1.mp3",
    "audioMs": 9010,
    "durationMs": 11000
  },
  {
    "id": "drops",
    "title": "Elke drop telt",
    "text": "Alleen drops uit de eventlijst tellen, behaald nadat de strijd is gestart. Per drop staan het aantal schoten en de teamlimiet vermeld.",
    "audio": "/audio/zeeslag/drops-nl-v1.mp3",
    "audioMs": 9370,
    "durationMs": 11500
  },
  {
    "id": "bewijs",
    "title": "Bewijs aan boord",
    "text": "Meld je drop met bewijs waarop je naam, de buit en het tijdstip staan. Staff controleert het bewijs en kent daarna de schoten toe.",
    "audio": "/audio/zeeslag/bewijs-nl-v1.mp3",
    "audioMs": 8801,
    "durationMs": 11000
  },
  {
    "id": "vuren",
    "title": "Kapitein, kies je doel",
    "text": "Alleen de kapitein vuurt. Ieder schot kost één munitie, ook als je mist. Je kunt schoten bewaren. Wachten op je tegenstander hoeft niet.",
    "audio": "/audio/zeeslag/vuren-nl-v1.mp3",
    "audioMs": 10043,
    "durationMs": 12000
  },
  {
    "id": "winnen",
    "title": "Laat de andere vloot zinken",
    "text": "Raak als eerste alle twaalf scheepsvakken om te winnen. Bij de eindtijd winnen de meeste treffers. Zijn er evenveel treffers, dan is het gelijkspel.",
    "audio": "/audio/zeeslag/winnen-nl-v1.mp3",
    "audioMs": 11042,
    "durationMs": 13000
  }
] as const;
export const SEA_BRIEFING_MS = SEA_BRIEFING.reduce((sum, rule) => sum + rule.durationMs, 0);
export function seaBriefingStep(elapsedMs: number) {
  if (elapsedMs < 0 || elapsedMs >= SEA_BRIEFING_MS) return null;
  let startMs = 0;
  for (let index = 0; index < SEA_BRIEFING.length; index++) {
    const rule = SEA_BRIEFING[index];
    if (elapsedMs < startMs + rule.durationMs) return { rule, index, startMs, elapsedMs: elapsedMs - startMs, remainingMs: startMs + rule.durationMs - elapsedMs };
    startMs += rule.durationMs;
  }
  return null;
}
