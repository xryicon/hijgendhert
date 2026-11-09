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
const utilityBundle = await build({ entryPoints: [path.join(root, 'lib/profile-progress.ts')], bundle: true, write: false, platform: 'node', format: 'esm' });
const { bossProfile, rankProgress, rankRulesSchema, DEFAULT_RANK_RULES, EMPTY_PLAYER_PROGRESS } = await import(`data:text/javascript;base64,${Buffer.from(utilityBundle.outputFiles[0].text).toString('base64')}`);
const bundle = await build({ stdin: { contents: `
  export { ClanProgress } from './worker/clan-progress.ts';
  export { WomCache } from './worker/wom-cache.ts';
  import { discordAuthRoute } from './lib/discord-auth.ts';
  import { memberProfileRoute } from './lib/member-profile.ts';
  import { profileProgressRoute } from './lib/profile-progress-route.ts';
  export default { async fetch(request, env) {
    return await discordAuthRoute(request, env) || await profileProgressRoute(request, env) || await memberProfileRoute(request, env) || new Response('Not found', {status:404});
  }};`, resolveDir: root, loader: 'ts', sourcefile: 'profile-test-worker.ts' }, bundle: true, write: false, platform: 'neutral', format: 'esm', target: 'es2022', external: ['cloudflare:workers', 'node:crypto'] });
const env = { APP_ORIGIN: 'https://clan.example', DISCORD_CLIENT_ID: '123456789012345678', DISCORD_CLIENT_SECRET: 'profile-tests-only', DISCORD_GUILD_ID: '1073630238115897455', DISCORD_MEMBER_ROLE_IDS: '1326459850837987430,1197327572720169030,1408990525180084265', DISCORD_SESSION_SECRET: randomBytes(32).toString('base64url') };
const player = { id: 701, username: 'hert', displayName: 'Hert', type: 'regular', exp: 200000000, ehp: 100, ehb: 200 };
const event = (id, extra = {}) => ({ id, groupId: 7059, title: `Clan event ${id}`, startsAt: '2025-01-01T00:00:00Z', endsAt: '2025-01-08T00:00:00Z', metric: 'hunter', participantCount: 3, ...extra });
const participation = (id, gained, rank = 2, extra = {}) => ({ playerId: 701, rank, ...(gained === null ? {} : { progress: { gained } }), competition: event(id, extra) });
const bossData = { id: 701, latestSnapshot: { createdAt: '2026-11-01T00:00:00Z', data: { bosses: { vorkath: { kills: 3521, rank: 400 }, zulrah: { kills: 2000, rank: 500 }, nex: { kills: -1, rank: -1 }, scurrius: { kills: 0, rank: -1 } } } } };

function runtime(options = {}) {
  const calls = [];
  const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], bindings: env,
    durableObjects: { PROGRESS: { className: 'ClanProgress', useSQLite: true }, ...(options.coordinator ? { WOM_CACHE: { className: 'WomCache', useSQLite: true } } : {}) }, ...(options.persist ? { durableObjectsPersist: options.persist } : {}),
    outboundService: async request => {
      const url = new URL(request.url); calls.push(url.pathname);
      if (url.origin === 'https://discord.com') {
        if (url.pathname.endsWith('/token')) return Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'Bearer', expires_in: 604800, scope: 'identify guilds.members.read' });
        const user = { id: '234567890123456789', username: 'hert' };
        if (url.pathname.endsWith('/users/@me')) return Response.json(user);
        if (url.pathname.endsWith('/member')) return Response.json({ user, nick: 'Hert', roles: options.roles || ['1197327572720169030'], joined_at: null });
      }
      assert.equal(url.origin, 'https://api.wiseoldman.net');
      if (options.womOffline) return Response.json({}, { status: 503 });
      if (url.pathname === '/v2/groups/7059') return Response.json({ id: 7059, memberships: [{ role: 'recruit', player }, { role: 'sergeant', player: { ...player, id: 702, username: 'ander hert', displayName: 'Ander Hert' } }] });
      if (url.pathname === '/v2/players/hert') return options.bossOffline ? Response.json({}, { status: 404 }) : Response.json(bossData);
      if (url.pathname === '/v2/players/hert/competitions') return Response.json([participation(1, null), participation(2, null), participation(3, null), participation(4, null), participation(5, null, 1, { endsAt: '2099-01-01T00:00:00Z' }), participation(6, 100, 1, { groupId: 999 }), { ...participation(7, 100), playerId: 999 }]);
      assert.equal(url.pathname.endsWith('/competitions/standings'), false, 'Do not call the broken aggregate endpoint');
      if (/^\/v2\/competitions\/[1-4]$/.test(url.pathname)) {
        if (options.eventsOffline) return Response.json({}, { status: 404 });
        const id = Number(url.pathname.split('/').at(-1));
        const preceding = Array.from({ length: id === 3 ? 2 : id === 2 ? 1 : 0 }, (_, i) => ({ playerId: 900 + i, progress: { gained: 2000 } }));
        return Response.json({ ...event(id), participations: [...preceding, { playerId: 701, progress: { gained: id === 2 ? 0 : 100 } }] });
      }
      throw new Error(`Unexpected test request ${url.pathname}`);
    },
  });
  return { mf, calls };
}
const cookie = (response, name) => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0];
async function login(mf) {
  const start = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/discord`, { redirect: 'manual' });
  const authUrl = new URL(start.headers.get('Location'));
  const finish = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/discord/callback?${new URLSearchParams({ code: 'test-code', state: authUrl.searchParams.get('state'), iss: 'https://discord.com' })}`, { redirect: 'manual', headers: { Cookie: cookie(start, '__Host-hh-discord-state') } });
  return cookie(finish, '__Host-hh-member');
}
const post = (mf, session, route, body, extraHeaders = {}) => mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/progress/${route}`, { method: 'POST', headers: { Cookie: session, Origin: env.APP_ORIGIN, 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) });
const read = (mf, session, route = '/api/members/profile') => mf.dispatchFetch(`${env.APP_ORIGIN}${route}`, { headers: { Cookie: session } });

test('highest positive boss KC wins, missing and unranked kills do not count, ties are stable', () => {
  assert.equal(bossProfile(bossData, 701).favourite.metric, 'vorkath');
  assert.equal(bossProfile(bossData, 701).trackedBosses, 2);
  assert.equal(bossProfile({ id: 701, latestSnapshot: null }, 701).favourite, null);
  assert.throws(() => bossProfile(bossData, 702));
  const ties = structuredClone(bossData); ties.latestSnapshot.data.bosses.zulrah.kills = 3521;
  assert.equal(bossProfile(ties, 701).favourite.metric, 'vorkath');
});
test('rank progress counts only unique completed positive events and clamps corrections', () => {
  const eventData = { id: 1, status: 'finished', gained: 100 };
  const events = [eventData, eventData, { ...eventData, id: 2, gained: 0 }, { ...eventData, id: 3, status: 'active' }, { ...eventData, id: 4, gained: null }];
  const progress = rankProgress('recruit', events, EMPTY_PLAYER_PROGRESS, DEFAULT_RANK_RULES);
  assert.equal(progress.confirmedEvents, 1); assert.equal(progress.remaining, 4); assert.equal(progress.pendingEvents, 1); assert.equal(progress.percent, 20);
  assert.equal(rankProgress('recruit', events, { ...EMPTY_PLAYER_PROGRESS, eventAdjustment: -50 }, DEFAULT_RANK_RULES).totalEvents, 0);
  assert.equal(rankProgress('recruit', events, { ...EMPTY_PLAYER_PROGRESS, eventAdjustment: 4 }, DEFAULT_RANK_RULES).ready, true);
  assert.equal(rankProgress('owner', events, EMPTY_PLAYER_PROGRESS, DEFAULT_RANK_RULES).next, null);
  assert.equal(rankProgress('custom_role', events, EMPTY_PLAYER_PROGRESS, DEFAULT_RANK_RULES).percent, null);
});
test('rank rules reject duplicates, nonzero first step, and nonincreasing thresholds', () => {
  for (const steps of [[{ id: 'a', name: 'A', events: 1 }, { id: 'b', name: 'B', events: 5 }], [{ id: 'a', name: 'A', events: 0 }, { id: 'a', name: 'B', events: 5 }], [{ id: 'a', name: 'A', events: 0 }, { id: 'b', name: 'B', events: 0 }]]) assert.equal(rankRulesSchema.safeParse({ revision: 0, steps }).success, false);
});
test('profile combines boss data, WOM rank and confirmed event participation; registrations give no credit', async () => {
  const { mf } = runtime({ coordinator: true });
  try {
    const session = await login(mf); const response = await read(mf, session); const body = await response.json();
    assert.equal(response.status, 200); assert.match(response.headers.get('Cache-Control'), /no-store/);
    assert.equal(body.bosses.favourite.kills, 3521); assert.equal(body.progression.current.id, 'recruit');
    assert.equal(body.progression.confirmedEvents, 2); assert.equal(body.progression.pendingEvents, 1); assert.equal(body.progression.remaining, 3);
    assert.equal(body.events.length, 5); assert.equal(body.events.filter(e => e.rank === 1 && e.gained > 0).length, 1);
    assert.equal(JSON.stringify(body).includes('test-access'), false);
  } finally { await mf.dispose(); }
});
test('regular members cannot edit rules or overrides; admin mutations require same-origin and validated input', async () => {
  for (const roles of [['1326459850837987430'], ['1197327572720169030']]) {
    const { mf } = runtime({ roles });
    try {
      const session = await login(mf);
      const response = await post(mf, session, 'rules', { revision: 0, steps: DEFAULT_RANK_RULES.steps });
      assert.equal(response.status, roles[0] === '1326459850837987430' ? 403 : 200);
      if (roles[0] === '1326459850837987430') assert.equal((await read(mf, session, '/api/members/progress/admin?playerId=701')).status, 403);
      assert.equal((await post(mf, session, 'rules', {}, { Origin: 'https://evil.invalid' })).status, 403);
      assert.equal((await post(mf, session, 'member', { playerId: 701, revision: 0, rankOverride: 'owner', eventAdjustment: 50, reason: 'Test events' })).status, roles[0] === '1326459850837987430' ? 403 : 200);
      assert.equal((await read(mf, '', '/api/members/progress/admin')).status, 401);
    } finally { await mf.dispose(); }
  }
});
test('admin edits persist, revisions reject stale writes, and profile ranks grant no Discord permissions', async () => {
  const { mf } = runtime();
  try {
    const session = await login(mf);
    const rules = { revision: 0, steps: [{ id: 'recruit', name: 'Nieuw hert', events: 0 }, { id: 'corporal', name: 'Clanhert', events: 3 }] };
    assert.equal((await post(mf, session, 'rules', rules)).status, 200);
    assert.equal((await post(mf, session, 'rules', rules)).status, 409);
    const change = { playerId: 701, revision: 0, rankOverride: 'recruit', eventAdjustment: 1, reason: 'Extra clan raid' };
    assert.equal((await post(mf, session, 'member', change)).status, 200);
    assert.equal((await post(mf, session, 'member', change)).status, 409);
    const profile = await (await read(mf, session)).json();
    assert.equal(profile.progression.current.name, 'Nieuw hert'); assert.equal(profile.progression.source, 'admin');
    assert.equal(profile.progression.totalEvents, 3); assert.equal(profile.progression.ready, true); assert.equal(profile.progression.percent, 100);
    const other = await (await read(mf, session, '/api/members/progress/admin?playerId=702')).json(); assert.equal(other.state.eventAdjustment, 0);
    assert.equal((await post(mf, session, 'member', { ...change, revision: 1, playerId: 999 })).status, 400);
    assert.equal((await post(mf, session, 'member', { ...change, revision: 1, rankOverride: 'made_up' })).status, 400);
    assert.equal((await post(mf, session, 'member', { ...change, revision: 1, eventAdjustment: 1.5 })).status, 400);
  } finally { await mf.dispose(); }
});
test('event checks use bounded batches and saved zero-gain results never award participation', async () => {
  const { mf, calls } = runtime();
  try {
    const session = await login(mf); const first = await (await read(mf, session)).json();
    assert.equal(first.progression.confirmedEvents, 2); assert.equal(first.progression.pendingEvents, 1);
    assert.equal(calls.filter(p => /^\/v2\/competitions\//.test(p)).length, 3);
    const second = await (await read(mf, session)).json(); assert.equal(second.progression.confirmedEvents, 3); assert.equal(second.progression.pendingEvents, 0);
    assert.equal(calls.filter(p => /^\/v2\/competitions\//.test(p)).length, 4);
    await read(mf, session); assert.equal(calls.filter(p => /^\/v2\/competitions\//.test(p)).length, 4, 'Known results are not requested again');
  } finally { await mf.dispose(); }
});
test('missing boss and event data remain unavailable/pending rather than fabricated zero totals', async () => {
  const { mf } = runtime({ eventsOffline: true, bossOffline: true });
  try {
    const session = await login(mf); const body = await (await read(mf, session)).json();
    assert.equal(body.bosses, null); assert.ok(body.bossesError); assert.equal(body.progression.pendingEvents, 4); assert.equal(body.progression.confirmedEvents, 0);
  } finally { await mf.dispose(); }
});
test('durable rules and admin corrections survive a runtime restart', async () => {
  const persist = await mkdtemp(path.join(tmpdir(), 'hh-profile-test-'));
  let mf;
  try {
    ({ mf } = runtime({ persist })); const session = await login(mf);
    await post(mf, session, 'rules', { revision: 0, steps: DEFAULT_RANK_RULES.steps });
    await post(mf, session, 'member', { playerId: 701, revision: 0, rankOverride: 'sergeant', eventAdjustment: 7, reason: 'Recorded raid nights' });
    await read(mf, session); await mf.dispose(); mf = null;
    ({ mf } = runtime({ persist })); const state = await (await read(mf, session, '/api/members/progress/admin?playerId=701')).json();
    assert.equal(state.rules.revision, 1); assert.equal(state.state.eventAdjustment, 7); assert.equal(state.state.rankOverride, 'sergeant'); assert.equal(state.state.events.length, 3);
  } finally { if (mf) await mf.dispose(); await rm(persist, { recursive: true, force: true }); }
});
