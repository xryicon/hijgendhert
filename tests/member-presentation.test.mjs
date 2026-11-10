import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { build } = createRequire(import.meta.resolve('wrangler/package.json'))('esbuild');
const bundle = await build({ stdin: { contents: "export * from './lib/player-name'; export * from './lib/member-avatars'; export * from './lib/event-leaderboard';", resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { playerNameFromRoute: decode, discordAvatarUrl, rememberAvatar, matchMemberAvatars, AVATAR_MAX_AGE, summarizeLeaderboardEvent: summarize, eventLeaderboardRows: rows, leaderboardRounds: rounds, summarizeLeaderboardRounds: roundSummaries, eventRevision } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const now = Date.parse('2026-11-10T20:00:00Z');
const user = { id: '234567890123456789', username: 'ander_hert', displayName: 'Ander Hert' };
const avatarUrl = discordAvatarUrl({ id: user.id, avatar: 'a'.repeat(32) }, '1073630238115897455');
const players = [{ id: 701, username: 'hert', displayName: 'Hert' }, { id: 702, username: 'ander hert', displayName: 'Ander Hert' }];
test('page params decode spaces once and API queries preserve the actual name', () => {
  for (const raw of ['ander%20hert', 'Ander Hert', 'ander_hert', 'ander-hert', 'two%20%20spaces']) {
    const name = decode(raw); assert.ok(name); assert.equal(new URL(`https://test/api?username=${encodeURIComponent(name)}`).searchParams.get('username'), decodeURIComponent(raw));
  }
  for (const raw of ['%', '%GG', 'ander%2520hert', '..%2Fsecret', '%00', 'a'.repeat(31), '']) assert.equal(decode(raw), null);
});
test('avatars prefer the guild image, reject arbitrary image URLs and remove an old image', () => {
  const guild = discordAvatarUrl({ id: user.id, avatar: 'a'.repeat(32) }, '1073630238115897455', 'b'.repeat(32));
  assert.match(guild, /\/guilds\//); assert.match(avatarUrl, /\/avatars\//);
  assert.equal(discordAvatarUrl({ id: user.id, avatar: '../../evil' }, '1073630238115897455'), null);
  let saved = rememberAvatar([], { ...user, avatarUrl }, now);
  assert.deepEqual(matchMemberAvatars(saved, players, now), { 702: avatarUrl });
  saved = rememberAvatar(saved, { ...user, avatarUrl: null }, now + 1);
  assert.deepEqual(matchMemberAvatars(saved, players, now + 1), {});
});
test('ambiguous identities, ambiguous players, removed clanmates and expired pictures get no association', () => {
  const saved = rememberAvatar([], { ...user, avatarUrl }, now);
  const duplicate = rememberAvatar(saved, { ...user, id: '334567890123456789', avatarUrl: null }, now);
  assert.deepEqual(matchMemberAvatars(duplicate, players, now), {});
  assert.deepEqual(matchMemberAvatars(saved, [...players, { ...players[1], id: 703 }], now), {});
  assert.deepEqual(matchMemberAvatars(saved, [players[0]], now), {});
  assert.deepEqual(matchMemberAvatars(saved, players, now + AVATAR_MAX_AGE), {});
  assert.deepEqual(matchMemberAvatars(rememberAvatar(saved, { ...user, displayName: 'new name', username: 'newname', avatarUrl }, now + 1), players, now + 1), {});
});
const event = (scores, extra = {}) => ({ id: 41, groupId: 7059, type: 'classic', metric: 'vorkath', startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-10-08T00:00:00.000Z', participations: scores.map(([id, gained]) => ({ player: { id }, deltas: [{ metric: 'vorkath', values: { gained } }] })), ...extra });
test('finished event rankings exclude zero/negative gains and correctly share places', () => {
  const result = summarize(event([[1, 50], [2, 100], [3, 100], [4, 0], [5, -1]]), new Date(now).toISOString(), 'v1', now);
  assert.deepEqual(result.results, [{ playerId: 2, place: 1 }, { playerId: 3, place: 1 }, { playerId: 1, place: 3 }]);
});
test('average placement includes only actual participation; roster filtering does not change historical event places', () => {
  const a = summarize(event([[1, 50], [2, 100], [3, 100], [4, 0]]), new Date(now).toISOString(), 'v1', now);
  const b = summarize(event([[1, 100], [2, 50]], { id: 42 }), new Date(now).toISOString(), 'v1', now);
  const board = rows([1, 2, 4], [a, b, a], true);
  assert.deepEqual(board.map(r => [r.playerId, r.events, r.averagePlace, r.position]), [[2, 2, 1.5, null], [1, 2, 2, null], [4, 0, null, null]]);
  assert.ok(rows([1, 2], [a], false).every(r => r.position === null));
});
test('leaderboard positions are consecutive and unique, even with identical averages', () => {
  const events = Array.from({ length: 5 }, (_, id) => ({ id: id + 1, results: [1, 2, 3].map(playerId => ({ playerId, place: 1 })) }));
  const board = rows([1, 2, 3], [...events, { id: 6, results: [{ playerId: 2, place: 1 }, { playerId: 3, place: 1 }] }], true);
  assert.deepEqual(board.map(r => [r.playerId, r.position]), [[2, 1], [3, 2], [1, 3]]);
});

test('five completed event weeks qualify; one-time winners remain visible below ranked members', () => {
  const counts = [0, 1, 4, 5, 6];
  const events = Array.from({ length: 6 }, (_, index) => ({ id: index + 1,
    results: counts.flatMap((count, playerId) => index < count ? [{ playerId, place: playerId + 1 }] : []) }));
  const board = rows([0, 1, 2, 3, 4], events, true);
  assert.deepEqual(board.map(r => [r.playerId, r.events, r.position]), [[3, 5, 1], [4, 6, 2], [1, 1, null], [2, 4, null], [0, 0, null]]);
  assert.ok(rows([0, 1, 2, 3, 4], events, false).every(r => r.position === null));
  assert.deepEqual(rows([0, 1, 2, 3, 4], [...events, events[0]], true), board, 'Duplicate summaries cannot satisfy the threshold');
});
test('foreign, ongoing, invalid-team, duplicate or pre-finish snapshots cannot become final results', () => {
  const fetched = new Date(now).toISOString();
  for (const patch of [{ groupId: 7 }, { type: 'team' }, { endsAt: '2027-01-01T00:00:00.000Z' }]) assert.throws(() => summarize(event([[1, 20]], patch), fetched, 'v1', now));
  assert.throws(() => summarize(event([[1, 20], [1, 30]]), fetched, 'v1', now));
  assert.throws(() => summarize(event([[1, 20]]), '2026-10-07T00:00:00Z', 'v1', now));
});

test('one event week counts once across bosses, exact duplicates and different end times', () => {
  const first = event([[1, 100], [2, 50]]);
  const second = event([[1, 30], [2, 60]], { id: 42, metric: 'zulrah', endsAt: '2026-10-08T02:00:00.000Z' });
  second.participations.forEach(p => { p.deltas[0].metric = 'zulrah'; });
  const duplicate = { ...first, id: 43 };
  const nextWeek = event([[1, 50]], { id: 44, startsAt: '2026-10-15T00:00:00.000Z', endsAt: '2026-10-22T00:00:00.000Z' });
  const catalogue = [duplicate, second, nextWeek, first];
  const grouped = rounds(catalogue, now);
  assert.equal(grouped.length, 2);
  assert.equal(grouped.flat().length, 3, 'The duplicate metric is excluded');
  const saved = new Map(catalogue.map(e => [e.id, summarize(e, new Date(now).toISOString(), eventRevision(e), now)]));
  const board = rows([1, 2, 3], roundSummaries(grouped, saved), true);
  assert.deepEqual(board.map(r => [r.playerId, r.events, r.averagePlace, r.position]), [[1, 2, 1.25, null], [2, 1, 1.5, null], [3, 0, null, null]]);
  saved.delete(42);
  assert.equal(roundSummaries(grouped, saved).length, 1, 'Incomplete multi-part events are not counted yet');
});

test('team results use total team progress and only active members qualify', () => {
  const detail = event([[1, 70], [2, 70], [3, 100], [4, 0]], { type: 'team' });
  detail.participations.forEach((p, i) => { p.teamName = i < 2 ? 'Herten' : 'Bos'; });
  const result = summarize(detail, new Date(now).toISOString(), eventRevision(detail), now);
  assert.deepEqual([...result.results].sort((a,b)=>a.playerId-b.playerId), [{ playerId: 1, place: 1 }, { playerId: 2, place: 1 }, { playerId: 3, place: 2 }]);
  assert.equal(rounds([detail, event([[1, 1]])], now).length, 2, 'A team event and a bossweek remain separate');
});

test('fractional averages determine consecutive positions without rounding collisions', () => {
  const events = Array.from({ length: 5 }, (_, id) => ({ id: id + 1, results: [{playerId: 1, place: 3.75}, {playerId: 2, place: 3.5}, {playerId: 3, place: 1}, {playerId: 4, place: 2}] }));
  const result = rows([1,2,3,4], events, true);
  assert.deepEqual(result.map(r=>[r.playerId,r.position]), [[3,1],[4,2],[2,3],[1,4]]);
});
