# Member presentation

Names in `/leden/[username]` are decoded once at the page boundary. The installed Vinext canonicalizes page parameters as URL-encoded strings; the decoded name must reach the client before it constructs an API query. Invalid escaping, slashes and repeated encoding fail closed. API input validation remains unchanged.

Discord pictures use the existing `identify` and `guilds.members.read` response. A server-specific image takes precedence over the global image. No extra OAuth scope or Discord request is added. Missing or failed images retain the clan artwork or account-type icon.

The session endpoint saves only a display directory in `clan:7059:avatars`: Discord id, normalized display names, public picture URL and refresh time. This is never an ownership claim or access-control source. It is not part of a private game-account snapshot or audit log. Selecting a RuneScape account cannot attach a picture to that public profile. A picture is matched only when both directions are unambiguous against the current WOM roster. Duplicate names, departed players and identities not refreshed for 30 days have no public association. `/api/clan/avatars` returns only WOM player ids and whitelisted CDN URLs. Existing members need to visit while signed in before their picture can be discovered.

The event leaderboard is separate from clan rank and event adjustments. It covers all finished classic Hijgend Hert competitions returned by WOM's unpaginated group catalogue. Only positive progress in the scored metric counts as participation. A multi-metric event uses the `total` metric. Scores are ordered before filtering the current clan roster, so departed members do not change historical finishing places. Equal scores share competition places (1, 1, 3).

The mean is the sum of a member's finishing places divided by their counted events. Lower means sort first, then more events; equal mean and event count share leaderboard positions. Members without results remain visible and unranked. Search and account-type filters change visibility without recalculating clan positions.

Final per-event summaries persist in `clan:7059:event-leaderboard`. Four missing or revised events are collected per shared batch, using the existing WOM cache and rate limits. A stored lease prevents simultaneous browsers from multiplying that work. The UI reports processed/total events; it withholds leaderboard positions until the full result set is available. Ongoing, foreign, team and pre-finish snapshots cannot become final results. Revised event metadata invalidates the corresponding summary. No personal Discord data is included in the leaderboard.

References: [Discord CDN formats](https://docs.discord.com/developers/reference#image-formatting), [WOM group catalogue implementation](https://github.com/wise-old-man/wise-old-man/blob/master/server/src/api/modules/competitions/services/FindGroupCompetitionsService.ts).

Validation: `tests/member-presentation.test.mjs` covers name decoding, image matching and ranking math. `tests/member-account.worker.test.mjs` exercises public profiles with spaces, directory persistence and current-roster filtering, plus leaderboard persistence without refetching finalized results.
