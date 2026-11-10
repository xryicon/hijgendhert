import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const requireWrangler = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare } = requireWrangler('miniflare');
const { build } = requireWrangler('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ stdin: { contents: `
  export { ClanProgress } from './worker/clan-progress.ts';
  import { discordAuthRoute } from './lib/discord-auth.ts';
  import { memberProfileRoute } from './lib/member-profile.ts';
  import { clanMemberRoute } from './lib/clan-member-route.ts';
  import { eventLeaderboardRoute } from './lib/event-leaderboard-route.ts';
  export default { async fetch(request, env) {
    // Test-only RPC access exercises the durable race guard; absent from production.
    if (new URL(request.url).pathname === '/__test/account') {
      const store = env.PROGRESS.getByName('test:account-races');
      if (request.method === 'GET') return Response.json(await store.getAccount());
      const body = await request.json();
      const result = body.op === 'select'
        ? await store.selectAccount(body.playerId, body.revision)
        : await store.saveAccountSnapshot(body.snapshot, body.revision);
      return Response.json({ result, state: await store.getAccount() });
    }
    return await eventLeaderboardRoute(request, env) || await clanMemberRoute(request, env) || await discordAuthRoute(request, env) || await memberProfileRoute(request, env) || new Response('Not found', {status:404});
  }};`, resolveDir: root, loader: 'ts', sourcefile: 'member-account-test-worker.ts' }, bundle: true, write: false, platform: 'neutral', format: 'esm', target: 'es2022', external: ['cloudflare:workers', 'node:crypto'] });
const env = { APP_ORIGIN: 'https://clan.example', DISCORD_CLIENT_ID: '123456789012345678', DISCORD_CLIENT_SECRET: 'account-tests-only', DISCORD_GUILD_ID: '1073630238115897455', DISCORD_MEMBER_ROLE_IDS: '1326459850837987430,1197327572720169030,1408990525180084265', DISCORD_SESSION_SECRET: randomBytes(32).toString('base64url') };
const users = {
  a: { id: '234567890123456789', username: 'discord-user-a' },
  b: { id: '334567890123456789', username: 'discord-user-b' },
};
const players = [
  { id: 701, username: 'hert', displayName: 'Hert', type: 'regular', exp: 200000000, ehp: 100, ehb: 200 },
  { id: 702, username: 'ander hert', displayName: 'Ander Hert', type: 'ironman', exp: 300000000, ehp: 200, ehb: 300 },
];
const event = { id: 41, groupId: 7059, title: 'Clan bossweek', startsAt: '2025-01-01T00:00:00Z', endsAt: '2025-01-08T00:00:00Z', metric: 'vorkath', participantCount: 2 };
function runtime(options = {}) {
  const calls = [];
  const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], bindings: env,
    durableObjects: { PROGRESS: { className: 'ClanProgress', useSQLite: true } }, ...(options.persist ? { durableObjectsPersist: options.persist } : {}),
    outboundService: async request => {
      const url = new URL(request.url); calls.push(url.pathname);
      if (url.origin === 'https://discord.com') {
        if (url.pathname.endsWith('/token')) {
          const body = new URLSearchParams(await request.text());
          const code = body.get('code');
          assert.ok(code === 'a' || code === 'b');
          return Response.json({ access_token: `account-test-access-${code}`, refresh_token: `account-test-refresh-${code}`, token_type: 'Bearer', expires_in: 604800, scope: 'identify guilds.members.read' });
        }
        const key = request.headers.get('Authorization')?.endsWith('-b') ? 'b' : 'a';
        const user = { ...users[key], ...(options.avatar ? { avatar: 'a'.repeat(32) } : {}) };
        if (url.pathname.endsWith('/users/@me')) return Response.json(user);
        if (url.pathname.endsWith('/member')) return options.discordOffline ? Response.json({}, { status: 503 }) : Response.json({ user, nick: options.nick || `Discord ${key.toUpperCase()}`, roles: options.roles || ['1326459850837987430'], joined_at: null });
      }
      assert.equal(url.origin, 'https://api.wiseoldman.net');
      if (options.womOffline) return Response.json({}, { status: 503 });
      if (url.pathname === '/v2/groups/7059') return Response.json({ id: 7059, memberships: players.filter(p => p.id !== options.excludePlayer).map(player => ({ role: 'recruit', player })) });
      if (url.pathname === '/v2/groups/7059/competitions') return Response.json(options.competitions || [{ ...event, type: 'classic' }]);
      if (options.competitions && url.pathname.startsWith('/v2/competitions/')) {
        const detail = options.competitions.find(event => event.id === Number(url.pathname.split('/').at(-1)));
        assert.ok(detail); return Response.json(detail);
      }
      if (url.pathname === '/v2/competitions/41') return Response.json({ ...event, type: 'classic', participations: players.map((player, i) => ({ player, deltas: [{ metric: 'vorkath', values: { gained: i ? 50 : 100 } }] })) });
      const player = players.find(p => ['', '/competitions', '/snapshots'].some(suffix => decodeURIComponent(url.pathname) === `/v2/players/${p.username}${suffix}`));
      assert.ok(player, `Unexpected upstream path ${url.pathname}`);
      if (url.pathname.endsWith('/snapshots')) return Response.json([
        { playerId: player.id, createdAt: '2026-11-01T00:00:00Z', data: { skills: { attack: { level: 85 } }, bosses: { vorkath: { kills: 100 } } } },
        { playerId: player.id, createdAt: '2026-11-02T00:00:00Z', data: { skills: { attack: { level: 86 } }, bosses: { vorkath: { kills: 111 } } } },
      ]);
      if (url.pathname.endsWith('/competitions')) return options.partialFailure === 'events' ? Response.json({}, { status: 503 }) : Response.json([{ playerId: player.id, rank: 1, progress: { gained: 100 }, competition: event }]);
      if (options.partialFailure === 'bosses') return Response.json({}, { status: 503 });
      return Response.json({ id: player.id, latestSnapshot: { createdAt: '2026-11-01T00:00:00Z', data: { bosses: { vorkath: { kills: player.id === 701 ? 111 : 222, rank: 400 } } } } });
    },
  });
  return { mf, calls };
}
const cookie = (response, name) => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0];
async function login(mf, user = 'a') {
  const start = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/discord`, { redirect: 'manual' });
  const authUrl = new URL(start.headers.get('Location'));
  const finish = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/discord/callback?${new URLSearchParams({ code: user, state: authUrl.searchParams.get('state'), iss: 'https://discord.com' })}`, { redirect: 'manual', headers: { Cookie: cookie(start, '__Host-hh-discord-state') } });
  assert.equal(finish.status, 303);
  const session = cookie(finish, '__Host-hh-member');
  assert.ok(session);
  return session;
}
const profile = (mf, session) => mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/profile`, { headers: { Cookie: session } });
const select = (mf, session, playerId) => mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/profile`, { method: 'POST', headers: { Cookie: session, Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId }) });
async function withPersistentRuntime(run) {
  const persist = await mkdtemp(path.join(tmpdir(), 'hh-member-account-'));
  let mf = null;
  const start = async options => {
    if (mf) { await mf.dispose(); mf = null; }
    const runtimeState = runtime({ ...options, persist }); mf = runtimeState.mf;
    return runtimeState;
  };
  try { await run(start); }
  finally { if (mf) await mf.dispose(); await rm(persist, { recursive: true, force: true }); }
}

test('chosen account survives a new browser login and durable storage restart', async () => {
  await withPersistentRuntime(async start => {
    let { mf } = await start();
    const session = await login(mf);
    assert.equal((await select(mf, session, 702)).status, 200);
    assert.equal((await (await profile(mf, session)).json()).player.id, 702);
    ({ mf } = await start());
    const newBrowserSession = await login(mf); // Deliberately no __Host-hh-profile cookie.
    const response = await profile(mf, newBrowserSession);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.player.id, 702); assert.equal(body.selection, 'account');
    assert.equal(body.bosses.favourite.kills, 222);
  });
});

test('server choice wins over a stale cookie and is isolated by verified Discord id', async () => {
  const { mf } = runtime();
  try {
    const sessionA = await login(mf, 'a');
    const first = await select(mf, sessionA, 701); assert.equal(first.status, 200);
    const oldCookie = cookie(first, '__Host-hh-profile');
    assert.ok(oldCookie, 'Keep the legacy preference cookie compatible during migration');
    assert.equal((await select(mf, sessionA, 702)).status, 200);
    const staleBrowser = await (await profile(mf, `${sessionA}; ${oldCookie}`)).json();
    assert.equal(staleBrowser.player.id, 702); assert.equal(staleBrowser.selection, 'account');
    const sessionB = await login(mf, 'b');
    const other = await (await profile(mf, `${sessionB}; ${oldCookie}`)).json();
    assert.equal(other.player, null, 'Neither the account record nor another user’s legacy cookie may leak a choice');
    assert.equal((await select(mf, sessionB, 701)).status, 200);
    assert.equal((await (await profile(mf, sessionA)).json()).player.id, 702);
    assert.equal((await (await profile(mf, sessionB)).json()).player.id, 701);
  } finally { await mf.dispose(); }
});

test('WOM outage returns the saved game profile only after a valid Discord check', async () => {
  await withPersistentRuntime(async start => {
    let { mf } = await start();
    const session = await login(mf);
    assert.equal((await select(mf, session, 701)).status, 200);
    const good = await (await profile(mf, session)).json();
    assert.equal(good.bosses.favourite.kills, 111);
    const activityResponse = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/clan/member/activity?username=hert`);
    assert.equal(activityResponse.status, 200);
    const activity = await activityResponse.json();
    assert.ok(activity.activities.some(item => item.title === 'Attack level 86'));
    ({ mf } = await start({ womOffline: true }));
    const response = await profile(mf, session);
    assert.equal(response.status, 200); assert.match(response.headers.get('Cache-Control'), /no-store/);
    const body = await response.json();
    assert.equal(body.stale, true); assert.equal(body.selection, 'account');
    assert.equal(body.player.id, 701); assert.equal(body.bosses.favourite.kills, 111);
    assert.equal(body.fetchedAt, good.fetchedAt); assert.equal(body.events[0].id, 41);
    assert.equal(body.progression.confirmedEvents, 1);
    assert.deepEqual(body.clanRank, { id: 'recruit', name: 'Recruit' });
    assert.deepEqual(body.activitySnapshot.activities, activity.activities);
    assert.equal(body.activitySnapshot.fetchedAt, activity.fetchedAt);
    assert.equal(JSON.stringify(body).includes('account-test-access'), false);
    const sessionB = await login(mf, 'b');
    assert.equal((await profile(mf, sessionB)).status, 503, 'A different member cannot borrow the saved profile');
    assert.equal((await profile(mf, '')).status, 401, 'Saved profile is never authentication');
    ({ mf } = await start({ womOffline: true, roles: [] }));
    assert.equal((await profile(mf, session)).status, 401, 'Revoked Discord access cannot use cached data');
    ({ mf } = await start({ womOffline: true, discordOffline: true }));
    const unverified = await profile(mf, session);
    assert.equal(unverified.status, 503); assert.equal((await unverified.json()).player, undefined, 'Unavailable Discord must not be mistaken for a WOM-only outage');
  });
});

test('new account selection cannot show the previous player snapshot during an outage', async () => {
  await withPersistentRuntime(async start => {
    let { mf } = await start();
    const session = await login(mf);
    await select(mf, session, 701); await profile(mf, session);
    assert.equal((await select(mf, session, 702)).status, 200);
    // No successful GET for 702 yet: the old 701 snapshot must not be reused.
    ({ mf } = await start({ womOffline: true }));
    const response = await profile(mf, session);
    assert.equal(response.status, 503);
    const body = await response.json(); assert.equal(body.player, undefined);
  });
});

test('a fresh roster removal does not resurrect the previously saved player', async () => {
  await withPersistentRuntime(async start => {
    let { mf } = await start(); const session = await login(mf);
    await select(mf, session, 701); await profile(mf, session);
    ({ mf } = await start({ excludePlayer: 701 }));
    const response = await profile(mf, session); assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.player, null); assert.equal(body.stale, false);
    ({ mf } = await start({ womOffline: true }));
    assert.equal((await profile(mf, session)).status, 503, 'Removed account snapshot stays cleared after the next outage');
  });
});

test('partial WOM failures preserve the previously saved boss and event data', async () => {
  await withPersistentRuntime(async start => {
    let { mf } = await start(); const session = await login(mf);
    await select(mf, session, 701);
    const good = await (await profile(mf, session)).json();
    for (const partialFailure of ['bosses', 'events']) {
      ({ mf } = await start({ partialFailure }));
      const response = await profile(mf, session); assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.stale, true); assert.equal(body.bosses.favourite.kills, 111);
      assert.equal(body.events[0].id, 41); assert.equal(body.events[0].gained, 100);
    }
    ({ mf } = await start({ womOffline: true }));
    const restored = await (await profile(mf, session)).json();
    assert.equal(restored.fetchedAt, good.fetchedAt); assert.equal(restored.bosses.favourite.kills, 111);
    assert.equal(restored.events[0].gained, 100);
  });
});

test('a late snapshot cannot overwrite an account switch or bypass its revision', async () => {
  const { mf } = runtime();
  const call = body => mf.dispatchFetch(`${env.APP_ORIGIN}/__test/account`, { method: 'POST', body: JSON.stringify(body) });
  try {
    const initial = await (await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/account`)).json();
    const first = await (await call({ op: 'select', playerId: 701, revision: initial.revision })).json();
    assert.equal(first.state.playerId, 701);
    const snapshot = { player: players[0], role: 'recruit', events: [], bosses: null, fetchedAt: new Date().toISOString(), accessToken: 'must-not-be-saved', adjustmentReason: 'must-not-be-saved' };
    const recorded = await (await call({ op: 'snapshot', snapshot, revision: first.state.revision })).json();
    assert.equal(recorded.result, true); assert.equal(recorded.state.snapshot.player.id, 701);
    assert.equal(JSON.stringify(recorded.state).includes('must-not-be-saved'), false);
    const older = await (await call({ op: 'snapshot', snapshot: { ...snapshot, fetchedAt: '2020-01-01T00:00:00Z' }, revision: first.state.revision })).json();
    assert.equal(older.state.snapshot.fetchedAt, snapshot.fetchedAt, 'A late older measurement cannot replace newer saved data');
    const switched = await (await call({ op: 'select', playerId: 702, revision: first.state.revision })).json();
    assert.equal(switched.state.playerId, 702); assert.equal(switched.state.snapshot, null);
    const late = await (await call({ op: 'snapshot', snapshot, revision: first.state.revision })).json();
    assert.equal(late.state.playerId, 702); assert.equal(late.state.snapshot, null);
    const mismatched = await (await call({ op: 'snapshot', snapshot, revision: switched.state.revision })).json();
    assert.equal(mismatched.state.playerId, 702); assert.equal(mismatched.state.snapshot, null);
  } finally { await mf.dispose(); }
});


test('public avatars persist without exposing Discord identities and only match current clan names', async () => {
  await withPersistentRuntime(async start => {
    let { mf } = await start({ avatar: true, nick: 'Ander Hert' });
    const session = await login(mf);
    const check = await mf.dispatchFetch(env.APP_ORIGIN + '/api/auth/session', { headers: { Cookie: session } });
    assert.equal(check.status, 200);
    assert.match((await check.json()).member.avatarUrl, /cdn.discordapp.com/);
    ({ mf } = await start());
    const response = await mf.dispatchFetch(env.APP_ORIGIN + '/api/clan/avatars');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ['avatars']); assert.deepEqual(Object.keys(body.avatars), ['702']);
    assert.equal(JSON.stringify(body).includes('discord-user-a'), false);
    assert.equal((await mf.dispatchFetch(env.APP_ORIGIN + '/api/clan/avatars', { method: 'POST', body: '{}' })).status, 405);
    ({ mf } = await start({ excludePlayer: 702 }));
    assert.deepEqual((await (await mf.dispatchFetch(env.APP_ORIGIN + '/api/clan/avatars')).json()).avatars, {});
  });
});

test('space-containing names resolve through the public profile and activity APIs', async () => {
  const { mf } = runtime();
  try {
    const profile = await mf.dispatchFetch(env.APP_ORIGIN + '/api/clan/member?username=ander%20hert');
    assert.equal(profile.status, 200); assert.equal((await profile.json()).player.id, 702);
    const activity = await mf.dispatchFetch(env.APP_ORIGIN + '/api/clan/member/activity?username=ander%20hert');
    assert.equal(activity.status, 200); assert.ok((await activity.json()).activities.length);
  } finally { await mf.dispose(); }
});

test('event leaderboard persists final results, avoids refetching and filters departed members', async () => {
  await withPersistentRuntime(async start => {
    let { mf, calls } = await start();
    const first = await mf.dispatchFetch(env.APP_ORIGIN + '/api/clan/leaderboard');
    assert.equal(first.status, 200); const board = await first.json();
    assert.equal(board.complete, true); assert.equal(board.loadedEvents, 1);
    assert.equal(board.minimumEvents, 5);
    assert.deepEqual(board.rows.map(r => [r.playerId, r.events, r.averagePlace, r.position]), [[701, 1, 1, null], [702, 1, 2, null]]);
    assert.equal(calls.filter(p => p === '/v2/competitions/41').length, 1);
    ({ mf, calls } = await start({ excludePlayer: 701 }));
    const next = await (await mf.dispatchFetch(env.APP_ORIGIN + '/api/clan/leaderboard')).json();
    assert.equal(next.minimumEvents, 5);
    assert.deepEqual(next.rows.map(r => [r.playerId, r.averagePlace, r.position]), [[702, 2, null]]);
    assert.equal(calls.includes('/v2/competitions/41'), false);
    assert.equal((await mf.dispatchFetch(env.APP_ORIGIN + '/api/clan/leaderboard', { method: 'POST' })).status, 405);
  });
});

test('leaderboard route counts a multi-boss week once and includes a separate team event', async () => {
  const make = (id, metric, gains, extra = {}) => ({ ...event, id, metric, type: 'classic', ...extra, participations: players.map((player, i) => ({ player, teamName: 'Herten', deltas: [{ metric, values: { gained: gains[i] } }] })) });
  const competitions = [make(41, 'vorkath', [100,50]), make(42, 'zulrah', [50,100]), make(43, 'vorkath', [100,50]), make(44, 'ehp', [100,0], { type: 'team' })];
  const { mf, calls } = runtime({ competitions });
  try {
    const response = await mf.dispatchFetch(env.APP_ORIGIN + '/api/clan/leaderboard');
    assert.equal(response.status, 200);
    const board = await response.json();
    assert.equal(board.totalEvents, 2); assert.equal(board.loadedEvents, 2);
    assert.equal(board.totalCompetitions, 3); assert.equal(board.complete, true);
    assert.equal(board.minimumEvents, 5);
    assert.deepEqual(board.rows.map(r => [r.playerId, r.events, r.averagePlace, r.position]), [[701,2,1.25,null],[702,1,1.5,null]]);
    assert.equal(calls.includes('/v2/competitions/43'), false, 'Duplicate trackers are not requested');
  } finally { await mf.dispose(); }
});
