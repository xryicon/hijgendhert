import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const requireWrangler = createRequire(import.meta.resolve('wrangler/package.json'));
const { build } = requireWrangler('esbuild'), { Miniflare } = requireWrangler('miniflare');
const root = fileURLToPath(new URL('../', import.meta.url));
const source = `import {warshipRoute} from './lib/warship-route'; import {seal,discordConfig} from './lib/discord-auth'; export {ClanWarships} from './worker/clan-warships';
export default { async fetch(request,env) { const url=new URL(request.url); if(url.pathname==='/__fixture') {const id=url.searchParams.get('id'); return new Response(await seal(discordConfig(env),'session',{accessToken:'test-access-'+id,userId:id,expiresAt:Date.now()+3600000}));} return await warshipRoute(request,env) || new Response('Not found',{status:404}); } };`;
const bundle = await build({ stdin: { contents: source, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', external: ['node:crypto', 'cloudflare:workers'] });
const pure = await build({ entryPoints: [path.join(root, 'lib/warships.ts')], bundle: true, write: false, format: 'esm', platform: 'node' });
const { validFleet, shipCells, warshipView, finishAtDeadline, starterDrops, warshipActionSchema } = await import(`data:text/javascript;base64,${Buffer.from(pure.outputFiles[0].text).toString('base64')}`);
const origin = 'https://clan.example';
const ids = { staff: '1197327572720169001', a: '1197327572720169002', b: '1197327572720169003', spectator: '1197327572720169004' };
const env = { APP_ORIGIN: origin, DISCORD_CLIENT_ID: '1569436253043167305', DISCORD_CLIENT_SECRET: 'test-only-client-secret', DISCORD_SESSION_SECRET: randomBytes(32).toString('base64url'), DISCORD_GUILD_ID: '1073630238115897455', DISCORD_MEMBER_ROLE_IDS: '1326459850837987430,1408990525180084265' };
const fleet = [{ ship: 0, cell: 0, vertical: false }, { ship: 1, cell: 16, vertical: false }, { ship: 2, cell: 32, vertical: false }, { ship: 3, cell: 48, vertical: false }];
function runtime(options = {}) {
  const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], bindings: env, durableObjects: { WARSHIPS: { className: 'ClanWarships', useSQLite: true } }, ...(options.persist ? { durableObjectsPersist: options.persist } : {}), outboundService: async request => {
    assert.equal(new URL(request.url).origin, 'https://discord.com');
    const id = request.headers.get('Authorization').replace('Bearer test-access-', '');
    return Response.json({ user: { id, username: id === ids.staff ? 'Havenmeester' : `Hert${id.slice(-1)}` }, roles: options.revoked ? [] : [id === ids.staff ? '1408990525180084265' : '1326459850837987430'] });
  } });
  return mf;
}
async function fixture(mf) {
  const cookies = Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([name, id]) => [name, '__Host-hh-member=' + await (await mf.dispatchFetch(`${origin}/__fixture?id=${id}`)).text()])));
  const request = async (actor, route = '/api/warships', body, overrides = {}) => {
    const headers = { ...(actor ? { Cookie: cookies[actor] } : {}), ...(body ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...(overrides.headers || {}) };
    const response = await mf.dispatchFetch(origin + route, { method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}), ...overrides, headers });
    assert.match(response.headers.get('Cache-Control'), /no-store/);
    return { status: response.status, data: await response.json() };
  };
  let game;
  const action = async (actor, type, fields = {}, expected = 200) => {
    const body = { type, requestId: crypto.randomUUID(), ...(game ? { gameId: game.id, revision: game.revision } : {}), ...fields };
    const result = await request(actor, '/api/warships/action', body);
    assert.equal(result.status, expected, JSON.stringify(result.data));
    if (result.data.game) game = result.data.game;
    return { ...result, body };
  };
  const create = async () => {
    await action('staff', 'create', { config: { title: 'Testzeeslag', description: 'Alleen testdata', teams: ['Gewei', 'Hoef'], endsAt: new Date(Date.now() + 86400000).toISOString(), objectives: [{ id: crypto.randomUUID(), boss: 'zulrah', item: 'Tanzanite fang', shots: 5, limit: 20 }] } });
  };
  const start = async () => {
    await create(); await action('staff', 'publish', { published: true });
    for (const [who, team] of [['a', 0], ['b', 1]]) {
      await action(who, 'join', { team, rsn: `Hert ${who}` }); await action('staff', 'enrol', { userId: ids[who], accept: true });
      await action(who, 'fleet', { placements: fleet, locked: true });
    }
    await action('staff', 'start');
  };
  let evidence = 0;
  const claim = async (who = 'a') => action(who, 'claim', { objectiveId: game.config.objectives[0].id, evidence: `https://discord.com/channels/111/222/${++evidence}`, droppedAt: new Date().toISOString() });
  const approve = async () => { const result = await request('staff', `/api/warships?id=${game.id}`); game = result.data.game; return action('staff', 'review', { claimId: game.claims.at(-1).id, approve: true, reason: '' }); };
  return { cookies, request, action, create, start, claim, approve, get game() { return game; } };
}

test('fleet geometry rejects overlaps, wrapping, out-of-board and duplicate ships', () => {
  assert.equal(validFleet(fleet), true); assert.equal(fleet.flatMap(shipCells).length, 12);
  for (const invalid of [[...fleet.slice(0, 3)], [{ ...fleet[0], cell: 6 }, ...fleet.slice(1)], [{ ...fleet[0], cell: 56, vertical: true }, ...fleet.slice(1)], [fleet[0], { ...fleet[1], cell: 0 }, ...fleet.slice(2)], [fleet[0], fleet[0], ...fleet.slice(2)]]) assert.equal(validFleet(invalid), false);
  assert.ok(starterDrops.every(d => d.shots >= 1 && d.limit >= 1));
});

test('private drafts, role checks and same-origin writes protect staff controls', async () => {
  const options = {}, mf = runtime(options);
  try {
    const f = await fixture(mf); await f.create();
    assert.equal((await f.request(null)).data.games.length, 0);
    assert.equal((await f.request('a', `/api/warships?id=${f.game.id}`)).status, 404);
    assert.equal((await f.request(null, `/api/warships?id=${f.game.id}`)).status, 404);
    await f.action('staff', 'publish', { published: true });
    await f.action('a', 'start', {}, 403);
    const body = { type: 'cancel', gameId: f.game.id, revision: f.game.revision, requestId: crypto.randomUUID(), reason: 'test' };
    assert.equal((await f.request('staff', '/api/warships/action', body, { headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await f.request(null, '/api/warships/action', body)).status, 401);
    options.revoked = true;
    assert.equal((await f.request('staff', '/api/warships/action', body)).status, 403);
  } finally { await mf.dispose(); }
});

test('real route keeps enemy ships and private proofs out of every audience projection', async () => {
  const mf = runtime();
  try {
    const f = await fixture(mf); await f.start(); await f.claim();
    for (const viewer of [null, 'staff', 'spectator', 'a', 'b']) {
      const { data } = await f.request(viewer, `/api/warships?id=${f.game.id}`), g = data.game;
      assert.equal(g.teams[0].fleet.length, viewer === 'a' ? 4 : 0);
      assert.equal(g.teams[1].fleet.length, viewer === 'b' ? 4 : 0);
      assert.equal(g.claims.length, ['staff', 'a'].includes(viewer) ? 1 : 0);
      if (!viewer) { assert.deepEqual(g.crew, []); assert.deepEqual(g.requests, []); assert.deepEqual(g.audit, []); assert.equal(JSON.stringify(g).includes(ids.a), false); }
      assert.equal('fleets' in g, false);
    }
    await f.action('a', 'fleet', { placements: fleet, locked: true }, 409);
    await f.action('a', 'review', { claimId: f.game.claims[0].id, approve: true, reason: '' }, 403);
  } finally { await mf.dispose(); }
});

test('proof approval earns ammo; replay, double shots and stale edits cannot spend twice', async () => {
  const mf = runtime();
  try {
    const f = await fixture(mf); await f.start();
    await f.action('a', 'fire', { cell: 63 }, 409);
    const claim = await f.claim(); assert.equal(f.game.teams[0].ammo, 0);
    await f.approve(); assert.equal(f.game.teams[0].ammo, 5);
    const shot = await f.action('a', 'fire', { cell: 63 }); assert.equal(f.game.teams[0].ammo, 4); assert.equal(f.game.shots.at(-1).result, 'miss');
    const replay = await f.request('a', '/api/warships/action', shot.body); assert.equal(replay.status, 200); assert.equal(replay.data.game.teams[0].ammo, 4);
    assert.equal((await f.request('a', '/api/warships/action', { ...shot.body, cell: 62 })).status, 409);
    await f.action('a', 'fire', { cell: 63 }, 409);
    await f.action('b', 'fire', { cell: 0 }, 409);
    await f.action('spectator', 'fire', { cell: 0 }, 403);
    await f.action('a', 'claim', { objectiveId: f.game.config.objectives[0].id, evidence: claim.body.evidence + '?new=1', droppedAt: new Date().toISOString() }, 409);
    const stale = { type: 'fire', gameId: f.game.id, revision: f.game.revision, requestId: crypto.randomUUID(), cell: 0 };
    await f.action('a', 'fire', { cell: 1 });
    assert.equal((await f.request('a', '/api/warships/action', stale)).status, 409);
    assert.equal((await f.request('a', `/api/warships?id=${f.game.id}`)).data.game.teams[0].ammo, 3);
  } finally { await mf.dispose(); }
});

test('all ships can be sunk; final result reveals fleets and locks play', async () => {
  const mf = runtime();
  try {
    const f = await fixture(mf); await f.start();
    for (let i = 0; i < 3; i++) { await f.claim(); await f.approve(); }
    for (const cell of fleet.flatMap(shipCells)) await f.action('a', 'fire', { cell });
    assert.equal(f.game.status, 'finished'); assert.equal(f.game.winner, 0);
    assert.equal(f.game.teams[0].hits, 12); assert.equal(f.game.teams[0].sunk, 4); assert.equal(f.game.teams[0].ammo, 3);
    const final = (await f.request(null, `/api/warships?id=${f.game.id}`)).data.game;
    assert.ok(final.teams.every(t => t.fleet.length === 4));
    await f.action('b', 'fire', { cell: 0 }, 409);
  } finally { await mf.dispose(); }
});

test('simultaneous shots from two tabs commit only one action at the same revision', async () => {
  const mf = runtime();
  try {
    const f = await fixture(mf); await f.start(); await f.claim(); await f.approve();
    const base = { type: 'fire', gameId: f.game.id, revision: f.game.revision };
    const results = await Promise.all([62, 63].map(cell => f.request('a', '/api/warships/action', { ...base, cell, requestId: crypto.randomUUID() })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    const g = (await f.request('a', `/api/warships?id=${f.game.id}`)).data.game;
    assert.equal(g.shots.length, 1); assert.equal(g.teams[0].ammo, 4);
  } finally { await mf.dispose(); }
});

test('drop times, limits, safe proof URLs and duplicate RuneScape names are enforced', async () => {
  const mf = runtime();
  try {
    const f = await fixture(mf); await f.create();
    const config = { ...f.game.config, objectives: f.game.config.objectives.map(o => ({ ...o, limit: 1 })) };
    await f.action('staff', 'edit', { config }); await f.action('staff', 'publish', { published: true });
    await f.action('a', 'join', { team: 0, rsn: 'Hert a' }); await f.action('staff', 'enrol', { userId: ids.a, accept: true });
    await f.action('b', 'join', { team: 1, rsn: 'Hert_a' }); await f.action('staff', 'enrol', { userId: ids.b, accept: true }, 409);
    await f.action('b', 'join', { team: 1, rsn: 'Hert b' }); await f.action('staff', 'enrol', { userId: ids.b, accept: true });
    await f.action('staff', 'start', {}, 409);
    await f.action('a', 'fleet', { placements: fleet, locked: true }); await f.action('b', 'fleet', { placements: fleet, locked: true }); await f.action('staff', 'start');
    const fields = { objectiveId: f.game.config.objectives[0].id, evidence: 'https://discord.com/channels/1/2/3', droppedAt: new Date(Date.now() - 86400000).toISOString() };
    await f.action('a', 'claim', fields, 400);
    await f.action('a', 'claim', { ...fields, droppedAt: new Date(Date.now() + 86400000).toISOString() }, 400);
    for (const evidence of ['http://discord.com/x', 'https://evil.example/x', 'https://discord.com@evil.example/x', 'javascript:alert(1)']) assert.equal(warshipActionSchema.safeParse({ ...fields, evidence, type: 'claim', requestId: crypto.randomUUID(), gameId: f.game.id, revision: 1 }).success, false);
    await f.claim(); await f.action('a', 'claim', { ...fields, evidence: 'https://discord.com/channels/1/2/4', droppedAt: new Date().toISOString() }, 409);
    await f.approve(); await f.action('a', 'claim', { ...fields, evidence: 'https://discord.com/channels/1/2/5', droppedAt: new Date().toISOString() }, 409);
  } finally { await mf.dispose(); }
});

test('persisted battle survives restart without revealing the enemy or losing ammunition', async () => {
  const persist = await mkdtemp(path.join(tmpdir(), 'hh-warships-')); let mf = runtime({ persist });
  try {
    const f = await fixture(mf); await f.start(); await f.claim(); await f.approve(); await f.action('a', 'fire', { cell: 0 }); const id = f.game.id;
    await mf.dispose(); mf = runtime({ persist }); const next = await fixture(mf);
    const g = (await next.request('a', `/api/warships?id=${id}`)).data.game;
    assert.equal(g.teams[0].ammo, 4); assert.equal(g.teams[0].hits, 1); assert.equal(g.teams[1].fleet.length, 0); assert.equal(g.status, 'active');
  } finally { await mf.dispose(); assert.ok(path.resolve(persist).startsWith(path.resolve(tmpdir()) + path.sep + 'hh-warships-')); await rm(persist, { recursive: true, force: true }); }
});

test('deadline finalizes by hits and ties without requiring an open browser', () => {
  const now = Date.now();
  for (const winning of [true, false]) {
    const game = { status: 'active', revision: 1, config: { endsAt: new Date(now).toISOString() }, shots: winning ? [{ team: 0, result: 'hit' }] : [] };
    assert.equal(finishAtDeadline(game, now), true); assert.equal(game.winner, winning ? 0 : null); assert.equal(game.status, 'finished'); assert.equal(finishAtDeadline(game, now), false);
  }
});
