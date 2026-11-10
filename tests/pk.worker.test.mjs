import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const requireWrangler = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare } = requireWrangler('miniflare'), { build } = requireWrangler('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const ROLE = '777777777777777777', MEMBER = '1326459850837987430', STAFF = '1408990525180084265', ADMIN = '1197327572720169030';
const A = '234567890123456789', B = '334567890123456789', C = '434567890123456789', D = '534567890123456789';
const env = { APP_ORIGIN: 'https://clan.example', DISCORD_CLIENT_ID: '123456789012345678', DISCORD_CLIENT_SECRET: 'fake-test-only-secret', DISCORD_GUILD_ID: '1073630238115897455', DISCORD_MEMBER_ROLE_IDS: `${MEMBER},1197327572720169030,${STAFF}`, DISCORD_SESSION_SECRET: randomBytes(32).toString('base64url') };
const bundle = await build({ stdin: { contents: `import { pkRoute } from './lib/pk-route'; import { discordAuthRoute } from './lib/discord-auth'; export { ClanPk } from './worker/clan-pk'; export default { async fetch(request,env) { return await pkRoute(request,env) || await discordAuthRoute(request,env) || new Response('Not found',{status:404}); } };`, resolveDir: root, sourcefile: 'pk-test.ts', loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', external: ['node:crypto', 'cloudflare:workers'] });
function runtime(options = {}) {
  const calls = [];
  const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], bindings: env, durableObjects: { PK: { className: 'ClanPk', useSQLite: true } }, ...(options.persist ? { durableObjectsPersist: options.persist } : {}), outboundService: async request => {
    const url = new URL(request.url); calls.push(url.pathname);
    if (url.origin === 'https://api.wiseoldman.net') {
      assert.equal(url.pathname, '/v2/groups/7059'); if (options.womDown) return Response.json({}, { status: 503 });
      return Response.json({ id: 7059, memberships: [1, 2, 3, 4, 5].map(id => ({ player: { id, username: `hert ${id}`, displayName: `Hert ${id}` } })) });
    }
    assert.equal(url.origin, 'https://discord.com');
    if (url.pathname.endsWith('/token')) { const code = new URLSearchParams(await request.text()).get('code'); return Response.json({ access_token: `test-access-${code}`, token_type: 'Bearer', expires_in: 604800, scope: 'identify guilds.members.read' }); }
    const who = request.headers.get('Authorization')?.split('-').at(-1) || 'a';
    const user = { id: { a: A, b: B, c: C, d: D, e: '634567890123456789' }[who], username: `Discord ${who}` };
    if (url.pathname.endsWith('/users/@me')) return Response.json(user);
    if (url.pathname.endsWith('/member')) return Response.json({ user, roles: options.roles?.[who] || (who === 'e' ? [ADMIN] : who === 'c' ? [STAFF] : who === 'd' ? [MEMBER] : [MEMBER, ROLE]) });
    throw Error(`Unexpected endpoint ${url.pathname}`);
  } }); return { mf, calls };
}
const cookie = (r, name) => r.headers.getSetCookie().find(v => v.startsWith(name + '='))?.split(';')[0];
async function login(mf, who = 'a') {
  const start = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/discord`, { redirect: 'manual' }); const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const r = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/discord/callback?code=${who}&state=${state}`, { redirect: 'manual', headers: { Cookie: cookie(start, '__Host-hh-discord-state') } });
  assert.equal(r.headers.get('Location'), '/ledenomgeving'); return cookie(r, '__Host-hh-member');
}
const get = (mf, route, session) => mf.dispatchFetch(env.APP_ORIGIN + route, { headers: session ? { Cookie: session } : {} });
const post = (mf, route, value, session, headers = {}) => mf.dispatchFetch(env.APP_ORIGIN + route, { method: 'POST', headers: { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json', ...(session ? { Cookie: session } : {}), ...headers }, body: JSON.stringify(value) });
async function ok(response) { assert.equal(response.status, 200, await response.clone().text()); return response.json(); }
async function setup(mf) { const a = await login(mf), b = await login(mf, 'b'), staff = await login(mf, 'c'); await ok(await post(mf, '/api/admin/pk/settings', { revision: 0, roleId: ROLE }, staff)); return { a, b, staff }; }
async function create(mf, actor, players = [1, 2], extra = {}) { return (await ok(await post(mf, '/api/pk/create', { requestId: randomUUID(), title: 'Revenant trip', playerIds: players, ...extra }, actor))).session; }
const action = (s, fields) => ({ requestId: randomUUID(), sessionId: s.id, revision: s.revision, ...fields });
async function change(mf, actor, s, fields) { return (await ok(await post(mf, '/api/pk/action', action(s, fields), actor))).session; }

test('PK is private, configurable by staff only, CSRF protected and role removals are enforced', async () => {
  const options = {}; const { mf } = runtime(options);
  try {
    assert.equal((await get(mf, '/api/pk')).status, 401);
    const a = await login(mf), staff = await login(mf, 'c'), plain = await login(mf, 'd');
    assert.equal((await get(mf, '/api/pk', a)).status, 403);
    assert.equal((await get(mf, '/api/pk/access', a)).status, 200); assert.equal((await (await get(mf, '/api/pk/access', a)).json()).allowed, false);
    const settings = { revision: 0, roleId: ROLE };
    assert.equal((await post(mf, '/api/admin/pk/settings', settings, a)).status, 403);
    assert.equal((await post(mf, '/api/admin/pk/settings', settings, staff, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post(mf, '/api/admin/pk/settings', { ...settings, roleId: env.DISCORD_GUILD_ID }, staff)).status, 400);
    await ok(await post(mf, '/api/admin/pk/settings', settings, staff));
    assert.equal((await post(mf, '/api/admin/pk/settings', settings, staff)).status, 409);
    assert.equal((await get(mf, '/api/pk', plain)).status, 403);
    assert.equal((await get(mf, '/api/pk', a)).status, 200);
    const s = await create(mf, a); assert.equal((await get(mf, `/api/pk/session?id=${s.id}`, plain)).status, 403);
    assert.match((await get(mf, `/api/pk/session?id=${s.id}`, a)).headers.get('Cache-Control'), /no-store/);
    options.roles = { a: [MEMBER] };
    assert.equal((await get(mf, '/api/pk', a)).status, 403);
    assert.equal((await post(mf, '/api/pk/action', action(s, { type: 'add_drop', label: 'Loot', gp: 10 }), a)).status, 403);
    await ok(await post(mf, '/api/admin/pk/settings', { revision: 1, roleId: '' }, staff));
    assert.equal((await get(mf, '/api/pk', staff)).status, 200);
  } finally { await mf.dispose(); }
});

test('each drop snapshots active players; late joins, pauses, departures and removals preserve exact totals', async () => {
  const { mf } = runtime();
  try {
    const { a, b } = await setup(mf); let s = await create(mf, a);
    s = await change(mf, a, s, { type: 'add_drop', label: 'Eerste loot', gp: 101 }); const firstDrop = s.drops[0];
    assert.equal(s.totals.gp, 101); assert.equal(s.totals.remainder, 1); assert.deepEqual(s.totals.shares, { 1: 50, 2: 50 });
    s = await change(mf, a, s, { type: 'player_status', playerId: 2, status: 'paused' });
    s = await change(mf, a, s, { type: 'add_players', playerIds: [3] });
    s = await change(mf, a, s, { type: 'add_drop', label: 'Tweede loot', gp: 200 });
    assert.deepEqual(s.drops[0].shares, firstDrop.shares); assert.deepEqual(s.totals.shares, { 1: 150, 2: 50, 3: 100 });
    s = await change(mf, a, s, { type: 'player_status', playerId: 1, status: 'left' });
    s = await change(mf, a, s, { type: 'player_status', playerId: 2, status: 'active' });
    s = await change(mf, a, s, { type: 'add_drop', label: 'Derde loot', gp: 50 });
    assert.deepEqual(s.totals.shares, { 1: 150, 2: 75, 3: 125 });
    s = await change(mf, a, s, { type: 'remove_drop', dropId: firstDrop.id, reason: 'Dubbele invoer' });
    assert.equal(s.totals.gp, 250); assert.equal(s.totals.remainder, 0); assert.deepEqual(s.totals.shares, { 1: 100, 2: 25, 3: 125 });
    assert.equal(s.totals.gp, Object.values(s.totals.shares).reduce((a, b) => a + b, 0) + s.totals.remainder);
    assert.ok(s.drops[0].removedAt); assert.equal(s.drops[0].reason, 'Dubbele invoer'); assert.ok(s.timeline.every(t => Number.isFinite(Date.parse(t.at))));
    const viewer = (await ok(await get(mf, `/api/pk/session?id=${s.id}`, b))).session; assert.equal(viewer.canManage, false); assert.deepEqual(viewer.totals, s.totals);
    assert.equal((await post(mf, '/api/pk/action', action(s, { type: 'add_drop', label: 'No rights', gp: 100 }), b)).status, 403);
  } finally { await mf.dispose(); }
});

test('join requests require owner acceptance and cannot claim earlier loot or approve themselves', async () => {
  const { mf } = runtime();
  try {
    const { a, b, staff } = await setup(mf); let s = await create(mf, a, [1]);
    s = await change(mf, a, s, { type: 'add_drop', label: 'Voor aanvraag', gp: 100 });
    s = await change(mf, b, s, { type: 'join_request', playerId: 2 }); const join = s.requests[0];
    assert.equal(s.players.length, 1); assert.equal(join.requesterId, B); assert.equal(join.requesterName, 'Discord b'); assert.equal(join.player.name, 'Hert 2');
    assert.equal((await post(mf, '/api/pk/action', action(s, { type: 'resolve_request', joinId: join.id, decision: 'accepted' }), b)).status, 403);
    assert.equal((await post(mf, '/api/pk/action', action(s, { type: 'cancel_request', joinId: join.id }), a)).status, 403);
    s = await change(mf, a, s, { type: 'add_drop', label: 'Tijdens wachten', gp: 100 });
    s = await change(mf, a, s, { type: 'resolve_request', joinId: join.id, decision: 'accepted' });
    assert.equal(s.players.length, 2); assert.equal(s.totals.shares[2], 0); assert.equal(s.requests[0].status, 'accepted');
    s = await change(mf, a, s, { type: 'add_drop', label: 'Na acceptatie', gp: 100 }); assert.deepEqual(s.totals.shares, { 1: 250, 2: 50 });
    assert.equal((await post(mf, '/api/pk/action', action(s, { type: 'resolve_request', joinId: join.id, decision: 'accepted' }), a)).status, 409);
    s = await change(mf, a, s, { type: 'player_status', playerId: 2, status: 'left' });
    s = await change(mf, b, s, { type: 'join_request', playerId: 2 }); const cancelled = s.requests.at(-1).id;
    s = await change(mf, b, s, { type: 'cancel_request', joinId: cancelled }); assert.equal(s.requests.at(-1).status, 'cancelled');
    s = await change(mf, b, s, { type: 'join_request', playerId: 2 });
    s = await change(mf, staff, s, { type: 'resolve_request', joinId: s.requests.at(-1).id, decision: 'declined' }); assert.equal(s.requests.at(-1).status, 'declined');
    assert.equal(s.players.find(p => p.id === 2).status, 'left');
  } finally { await mf.dispose(); }
});

test('retries are idempotent, concurrent changes conflict, forged players and invalid GP are rejected', async () => {
  const { mf } = runtime();
  try {
    const { a } = await setup(mf); const createInput = { requestId: randomUUID(), title: 'Eigen sessie', playerIds: [1] };
    assert.equal((await post(mf, '/api/pk/create', { ...createInput, ownerId: B }, a)).status, 400);
    assert.equal((await post(mf, '/api/pk/create', { ...createInput, playerIds: [999] }, a)).status, 400);
    let s = (await ok(await post(mf, '/api/pk/create', createInput, a))).session;
    assert.equal((await ok(await post(mf, '/api/pk/create', createInput, a))).session.id, s.id);
    assert.equal((await post(mf, '/api/pk/create', { ...createInput, requestId: randomUUID() }, a)).status, 409);
    for (const gp of [0, -1, 1.2, 100000000001, '100']) assert.equal((await post(mf, '/api/pk/action', action(s, { type: 'add_drop', label: 'Invalid', gp }), a)).status, 400);
    const drop = action(s, { type: 'add_drop', label: 'Retry loot', gp: 100 });
    s = (await ok(await post(mf, '/api/pk/action', drop, a))).session;
    assert.equal((await ok(await post(mf, '/api/pk/action', drop, a))).session.totals.gp, 100);
    assert.equal((await post(mf, '/api/pk/action', { ...drop, gp: 200 }, a)).status, 409);
    const [x, y] = await Promise.all([post(mf, '/api/pk/action', action(s, { type: 'add_drop', label: 'Parallel A', gp: 10 }), a), post(mf, '/api/pk/action', action(s, { type: 'player_status', playerId: 1, status: 'paused' }), a)]);
    assert.deepEqual([x.status, y.status].sort(), [200, 409]);
    s = (await ok(await get(mf, `/api/pk/session?id=${s.id}`, a))).session;
    if (s.players[0].status !== 'paused') s = await change(mf, a, s, { type: 'player_status', playerId: 1, status: 'paused' });
    assert.equal((await post(mf, '/api/pk/action', action(s, { type: 'add_drop', label: 'Nobody', gp: 10 }), a)).status, 409);
  } finally { await mf.dispose(); }
});

test('finished sessions retain players and totals, expose only the last five and reject later writes', async () => {
  const { mf } = runtime();
  try {
    const { a, b } = await setup(mf); const closed = [];
    for (let n = 0; n < 6; n++) {
      let s = await create(mf, a, [1, 2], { title: `Trip ${n}` }); s = await change(mf, a, s, { type: 'add_drop', label: 'Loot', gp: (n + 1) * 100 });
      s = await change(mf, b, s, { type: 'join_request', playerId: 3 });
      s = await change(mf, a, s, { type: 'finish' }); closed.push(s); assert.equal(s.canManage, false); assert.equal(s.requests[0].status, 'cancelled');
    }
    const list = await ok(await get(mf, '/api/pk', b)); assert.equal(list.active.length, 0); assert.equal(list.recent.length, 5); assert.deepEqual(list.recent.map(s => s.title), ['Trip 5', 'Trip 4', 'Trip 3', 'Trip 2', 'Trip 1']);
    const s = (await ok(await get(mf, `/api/pk/session?id=${closed.at(-1).id}`, b))).session; assert.equal(s.players.length, 2); assert.equal(s.totals.gp, 600); assert.equal(s.endedAt, closed.at(-1).endedAt);
    assert.equal((await post(mf, '/api/pk/action', action(s, { type: 'remove_drop', dropId: s.drops[0].id, reason: 'After close' }), a)).status, 409);
  } finally { await mf.dispose(); }
});

test('sessions, role settings, requests, recipient snapshots and deleted-drop audit survive restart', async () => {
  const persist = await mkdtemp(path.join(tmpdir(), 'hh-pk-')); let first, second;
  try {
    first = runtime({ persist }); const { a, b } = await setup(first.mf); let s = await create(first.mf, a, [1]);
    s = await change(first.mf, a, s, { type: 'add_drop', label: 'Persistent', gp: 123 }); s = await change(first.mf, b, s, { type: 'join_request', playerId: 2 });
    s = await change(first.mf, a, s, { type: 'remove_drop', dropId: s.drops[0].id, reason: 'Correctie' });
    await first.mf.dispose(); first = null; second = runtime({ persist });
    const session = await login(second.mf); const loaded = (await ok(await get(second.mf, `/api/pk/session?id=${s.id}`, session))).session;
    assert.deepEqual(loaded, s); assert.equal((await ok(await get(second.mf, '/api/pk', session))).active.length, 1);
  } finally { await first?.mf.dispose(); await second?.mf.dispose(); assert.ok(path.basename(persist).startsWith('hh-pk-')); await rm(persist, { recursive: true, force: true }); }
});

test('player keys need no description, keep collected loot separate from splits and reverse both on removal', async () => {
  const { mf } = runtime();
  try {
    const { a, b } = await setup(mf); let s = await create(mf, a, [1, 2]);
    assert.equal((await post(mf, '/api/pk/action', action(s, { type: 'add_drop', playerId: 999, gp: 100 }), a)).status, 400);
    assert.equal((await post(mf, '/api/pk/action', action(s, { type: 'add_drop', gp: 100 }), a)).status, 400);
    s = await change(mf, a, s, { type: 'add_drop', playerId: 1, gp: 750001 });
    assert.equal(s.drops[0].playerId, 1); assert.equal(s.drops[0].playerName, 'Hert 1'); assert.equal(s.drops[0].label, 'Loot van Hert 1');
    s = await change(mf, a, s, { type: 'add_drop', playerId: 2, gp: 2500000 });
    assert.deepEqual(s.totals.collected, { 1: 750001, 2: 2500000 }); assert.deepEqual(s.totals.keys, { 1: 1, 2: 1 }); assert.deepEqual(s.totals.shares, { 1: 1625000, 2: 1625000 }); assert.equal(s.totals.remainder, 1);
    s = await change(mf, a, s, { type: 'remove_drop', dropId: s.drops[0].id, reason: 'Dubbele key' });
    assert.deepEqual(s.totals.collected, { 1: 0, 2: 2500000 }); assert.deepEqual(s.totals.keys, { 1: 0, 2: 1 }); assert.deepEqual(s.totals.shares, { 1: 1250000, 2: 1250000 }); assert.equal(s.totals.gp, 2500000); assert.equal(s.totals.remainder, 0);
    const viewer = (await ok(await get(mf, `/api/pk/session?id=${s.id}`, b))).session; assert.deepEqual(viewer.totals, s.totals); assert.ok(viewer.drops[0].removedAt);
    s = await change(mf, a, s, { type: 'add_drop', label: 'Oude client', gp: 100 });
    assert.equal(s.totals.unattributed, 100); assert.equal(Object.values(s.totals.collected).reduce((sum, gp) => sum + gp, 0) + s.totals.unattributed, s.totals.gp);
    assert.equal((await post(mf, '/api/pk/action', action(s, { type: 'add_drop', playerId: 2, gp: 1 }), b)).status, 403);
  } finally { await mf.dispose(); }
});

test('only admins remove sessions; CSRF, stale confirmations and replayed writes cannot delete or resurrect them', async () => {
  const options = {}; const { mf } = runtime(options);
  try {
    const { a, b, staff } = await setup(mf), admin = await login(mf, 'e');
    const createInput = { requestId: randomUUID(), title: 'Te verwijderen trip', playerIds: [1] };
    let s = (await ok(await post(mf, '/api/pk/create', createInput, a))).session;
    assert.equal(s.canRemove, false);
    assert.equal((await ok(await get(mf, `/api/pk/session?id=${s.id}`, staff))).session.canRemove, false);
    assert.equal((await ok(await get(mf, `/api/pk/session?id=${s.id}`, admin))).session.canRemove, true);
    const remove = { requestId: randomUUID(), sessionId: s.id, revision: s.revision };
    for (const actor of [a, b, staff]) assert.equal((await post(mf, '/api/admin/pk/remove', remove, actor)).status, 403);
    assert.equal((await post(mf, '/api/admin/pk/remove', remove)).status, 401);
    assert.equal((await get(mf, '/api/admin/pk/remove', admin)).status, 405);
    assert.equal((await post(mf, '/api/admin/pk/remove', remove, admin, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post(mf, '/api/admin/pk/remove', { ...remove, admin: true }, admin)).status, 400);
    const drop = action(s, { type: 'add_drop', playerId: 1, gp: 123 });
    s = (await ok(await post(mf, '/api/pk/action', drop, a))).session;
    assert.equal((await post(mf, '/api/admin/pk/remove', remove, admin)).status, 409);
    const confirmed = { ...remove, revision: s.revision };
    assert.equal((await post(mf, '/api/admin/pk/remove', { ...confirmed, requestId: drop.requestId }, admin)).status, 409);
    assert.equal((await ok(await post(mf, '/api/admin/pk/remove', confirmed, admin))).removedId, s.id);
    assert.equal((await ok(await post(mf, '/api/admin/pk/remove', confirmed, admin))).removedId, s.id);
    assert.equal((await post(mf, '/api/admin/pk/remove', { ...confirmed, revision: 99 }, admin)).status, 409);
    assert.equal((await get(mf, `/api/pk/session?id=${s.id}`, admin)).status, 404);
    assert.equal((await post(mf, '/api/pk/action', drop, a)).status, 404);
    assert.equal((await post(mf, '/api/pk/action', action(s, { type: 'finish' }), a)).status, 404);
    assert.equal((await post(mf, '/api/pk/create', createInput, a)).status, 404);
    assert.deepEqual(await ok(await get(mf, '/api/pk', a)), { active: [], recent: [] });
    const next = await create(mf, a); assert.notEqual(next.id, s.id);
    options.roles = { e: [MEMBER, ROLE] };
    assert.equal((await post(mf, '/api/admin/pk/remove', { requestId: randomUUID(), sessionId: next.id, revision: next.revision }, admin)).status, 403);
  } finally { await mf.dispose(); }
});

test('removing an archived session refills the last five and remains removed after restart', async () => {
  const persist = await mkdtemp(path.join(tmpdir(), 'hh-pk-')); let first, second;
  try {
    first = runtime({ persist }); const { a } = await setup(first.mf), admin = await login(first.mf, 'e');
    const sessions = [];
    for (let n = 0; n < 6; n++) sessions.push(await change(first.mf, a, await create(first.mf, a, [1], { title: `Archive ${n}` }), { type: 'finish' }));
    const s = sessions.at(-1), remove = { requestId: randomUUID(), sessionId: s.id, revision: s.revision };
    await ok(await post(first.mf, '/api/admin/pk/remove', remove, admin));
    assert.deepEqual((await ok(await get(first.mf, '/api/pk', a))).recent.map(s => s.title), ['Archive 4', 'Archive 3', 'Archive 2', 'Archive 1', 'Archive 0']);
    await first.mf.dispose(); first = null; second = runtime({ persist });
    const nextAdmin = await login(second.mf, 'e');
    assert.equal((await get(second.mf, `/api/pk/session?id=${s.id}`, nextAdmin)).status, 404);
    assert.equal((await ok(await get(second.mf, '/api/pk', nextAdmin))).recent.length, 5);
    assert.equal((await ok(await post(second.mf, '/api/admin/pk/remove', remove, nextAdmin))).removedId, s.id);
  } finally { await first?.mf.dispose(); await second?.mf.dispose(); assert.ok(path.basename(persist).startsWith('hh-pk-')); await rm(persist, { recursive: true, force: true }); }
});
