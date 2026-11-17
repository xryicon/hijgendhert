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
const source = `import {warshipRoute} from './lib/warship-route'; import {seal,discordConfig} from './lib/discord-auth'; import {ClanWarships as BaseWarships} from './worker/clan-warships';
export class ClanWarships extends BaseWarships {
  async shiftReveal(id, elapsed) { const row=this.ctx.storage.sql.exec('SELECT data FROM sea_games WHERE id = ?',id).toArray()[0]; const g=JSON.parse(row.data); const duration=Date.parse(g.reveal.opensAt)-Date.parse(g.reveal.at); g.reveal.at=new Date(Date.now()-elapsed).toISOString();g.reveal.opensAt=new Date(Date.parse(g.reveal.at)+duration).toISOString();this.ctx.storage.sql.exec('UPDATE sea_games SET data = ? WHERE id = ?',JSON.stringify(g),id);await this.ctx.storage.deleteAlarm(); }
  async inspectReveal(id) { const row=this.ctx.storage.sql.exec('SELECT data FROM sea_games WHERE id = ?',id).toArray()[0]; const g=JSON.parse(row.data);return {alarm:await this.ctx.storage.getAlarm(),reveal:g.reveal,revision:g.revision,audit:g.audit,briefingRules:g.briefingRules,teamAssignment:g.teamAssignment,crew:g.crew,fleets:g.fleets}; }
  repeatAlarm() {return this.alarm();}
}
export default { async fetch(request,env) { const url=new URL(request.url); const stub=env.WARSHIPS.getByName('clan:7059'); if(url.pathname==='/__fixture') {const id=url.searchParams.get('id'); return new Response(await seal(discordConfig(env),'session',{accessToken:'test-access-'+id,userId:id,expiresAt:Date.now()+3600000}));} if(url.pathname==='/__reveal-time'){const b=await request.json();await stub.shiftReveal(b.id,b.elapsed);await stub.repeatAlarm();return new Response('ok');} if(url.pathname==='/__reveal-inspect')return Response.json(await stub.inspectReveal(url.searchParams.get('id')));if(url.pathname==='/__reveal-alarm'){await stub.repeatAlarm();return new Response('ok');} return await warshipRoute(request,env) || new Response('Not found',{status:404}); } };`;
const bundle = await build({ stdin: { contents: source, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', external: ['node:crypto', 'cloudflare:workers'] });
const pure = await build({ entryPoints: [path.join(root, 'lib/warships.ts')], bundle: true, write: false, format: 'esm', platform: 'node' });
const { validFleet, shipCells, warshipView, finishAtDeadline, starterDrops, warshipActionSchema } = await import(`data:text/javascript;base64,${Buffer.from(pure.outputFiles[0].text).toString('base64')}`);
const origin = 'https://clan.example';
const ids = { staff: '1197327572720169001', a: '1197327572720169002', b: '1197327572720169003', spectator: '1197327572720169004', admin: '1197327572720169005' };
const env = { APP_ORIGIN: origin, DISCORD_CLIENT_ID: '1569436253043167305', DISCORD_CLIENT_SECRET: 'test-only-client-secret', DISCORD_SESSION_SECRET: randomBytes(32).toString('base64url'), DISCORD_GUILD_ID: '1073630238115897455', DISCORD_MEMBER_ROLE_IDS: '1326459850837987430,1408990525180084265,1197327572720169030' };
const fleet = [{ ship: 0, cell: 0, vertical: false }, { ship: 1, cell: 16, vertical: false }, { ship: 2, cell: 32, vertical: false }, { ship: 3, cell: 48, vertical: false }];
const womPlayers = [900, 100, 700, 300, null].map((ehb, i) => ({ id: 101 + i, username: `hert ${i + 1}`, displayName: `Hert ${i + 1}`, ehb, updatedAt: '2026-11-16T12:00:00Z' }));
function runtime(options = {}) {
  const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], bindings: env, durableObjects: { WARSHIPS: { className: 'ClanWarships', useSQLite: true } }, ...(options.persist ? { durableObjectsPersist: options.persist } : {}), outboundService: async request => {
    if (new URL(request.url).origin === 'https://api.wiseoldman.net') {
      assert.equal(new URL(request.url).pathname, '/v2/groups/7059');
      options.womRequests = (options.womRequests || 0) + 1;
      return options.womUnavailable ? new Response('Unavailable', { status: 503 }) : Response.json({ id: 7059, memberships: womPlayers.map(player => ({ player })) });
    }
    assert.equal(new URL(request.url).origin, 'https://discord.com');
    const id = request.headers.get('Authorization').replace('Bearer test-access-', '');
    return Response.json({ nick: options.members?.[id]?.nick, user: { id, username: options.members?.[id]?.username || (id === ids.staff ? 'Havenmeester' : `Hert${id.slice(-1)}`) }, roles: options.revoked ? [] : [id === ids.admin ? '1197327572720169030' : id === ids.staff ? '1408990525180084265' : '1326459850837987430'] });
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
  const refresh = async () => { game = (await request('staff', `/api/warships?id=${game.id}`)).data.game; return game; };
  return { cookies, request, action, create, start, claim, approve, refresh, get game() { return game; } };
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

test('Wise Old Man roster and draw are staff-only, server-rated and replay safely without another provider read', async () => {
  const options = {}, mf = runtime(options);
  try {
    const f = await fixture(mf); await f.create();
    assert.equal((await f.request(null, '/api/warships/roster')).status, 401);
    assert.equal((await f.request('a', '/api/warships/roster')).status, 403);
    const roster = await f.request('staff', '/api/warships/roster'); assert.equal(roster.status, 200); assert.equal(roster.data.players[0].ehb, 900);
    const proposal = await f.action('staff', 'draw_teams', { playerIds: [101, 102, 103, 104], captainIds: [101, 102] });
    const d = f.game.teamDraft; assert.equal(d.players.length, 4); assert.equal(d.players.find(p => p.id === 101).ehb, 900);
    assert.equal(f.game.crew.length, 0); assert.equal(f.game.drawLog.length, 1);
    const count = options.womRequests; options.womUnavailable = true;
    const replay = await f.request('staff', '/api/warships/action', proposal.body);
    assert.deepEqual(replay.data.game.teamDraft, d); assert.equal(options.womRequests, count);
    await f.action('staff', 'draw_teams', { playerIds: [101, 9999], captainIds: null }, 400);
    await f.action('staff', 'draw_teams', { playerIds: [101, 105], captainIds: null }, 400);
    await f.action('staff', 'draw_teams', { playerIds: [101, 102], captainIds: null, ehb: 0 }, 400);
    await f.action('staff', 'publish', { published: true });
    await f.action('a', 'draw_teams', { playerIds: [101, 102], captainIds: null }, 403);
    assert.equal((await f.request(null, `/api/warships?id=${f.game.id}`)).data.game.teamDraft, null);
    await f.action('staff', 'confirm_teams', { drawId: d.id }); assert.equal(f.game.crew.length, 4); assert.ok(f.game.crew.every(p => !p.linked));
  } finally { await mf.dispose(); }
});

test('confirmed WOM teams require approved Discord links and re-drafts reset previously visible fleets', async () => {
  const mf = runtime();
  try {
    const f = await fixture(mf); await f.create();
    await f.action('staff', 'draw_teams', { playerIds: [101, 102, 103, 104], captainIds: [101, 102] });
    await f.action('staff', 'confirm_teams', { drawId: f.game.teamDraft.id });
    await f.action('staff', 'publish', { published: true });
    for (const [actor, playerId] of [['a', 101], ['b', 102]]) {
      await f.action(actor, 'link_player', { playerId }); assert.equal(f.game.myTeam, null);
      await f.action(actor, 'fleet', { placements: fleet, locked: true }, 403);
      await f.action('staff', 'enrol', { userId: ids[actor], accept: true });
      await f.action(actor, 'fleet', { placements: fleet, locked: true });
    }
    await f.action('spectator', 'link_player', { playerId: 101 }, 409);
    await f.action('staff', 'manual_teams', { teams: [[102, 103], [101, 104]], captainIds: [102, 101] });
    await f.action('staff', 'start', {}, 409);
    await f.action('staff', 'confirm_teams', { drawId: f.game.teamDraft.id });
    assert.ok(f.game.teams.every(t => !t.ready));
    const own = (await f.request('a', `/api/warships?id=${f.game.id}`)).data.game;
    assert.equal(own.myTeam, 1); assert.ok(own.teams.every(t => t.fleet.length === 0));
    for (const actor of ['a', 'b']) await f.action(actor, 'fleet', { placements: fleet, locked: true });
    await f.action('staff', 'start');
    await f.action('staff', 'draw_teams', { playerIds: [101, 102], captainIds: null }, 409);
    await f.action('spectator', 'link_player', { playerId: 103 });
    await f.action('staff', 'enrol', { userId: ids.spectator, accept: true });
    const late = (await f.request('spectator', `/api/warships?id=${f.game.id}`)).data.game;
    assert.equal(late.myTeam, 0); assert.equal(late.canCaptain, false); assert.equal(late.teams[1].fleet.length, 0);
  } finally { await mf.dispose(); }
});

test('manual assignment keeps unknown EHB explicit and rejects duplicated players or wrong captains', async () => {
  const mf = runtime();
  try {
    const f = await fixture(mf); await f.create();
    await f.action('staff', 'manual_teams', { teams: [[101], [101]], captainIds: [101, 101] }, 400);
    await f.action('staff', 'manual_teams', { teams: [[101], [102]], captainIds: [102, 101] }, 400);
    await f.action('staff', 'manual_teams', { teams: [[101], [105]], captainIds: [101, 105] });
    await f.action('staff', 'confirm_teams', { drawId: f.game.teamDraft.id });
    assert.equal(f.game.balance.missing, 1); assert.equal(f.game.crew.find(p => p.playerId === 105).ehb, null);
  } finally { await mf.dispose(); }
});

const revealFields = (f, delay = 120000) => ({ drawId: (f.game.teamDraft || f.game.teamAssignment)?.id || f.game.reveal.drawId, at: new Date(Date.now() + delay).toISOString(), headline: 'Hijgend Hert vaart uit', message: 'Testaankondiging, geen echt event.' });

test('only staff can force-start; locked fleets survive and unfinished fleets are generated privately once', async () => {
  const mf = runtime();
  try {
    const f = await fixture(mf); await f.create();
    await f.action('staff', 'force_start', {}, 409);
    await f.action('staff', 'publish', { published: true });
    await f.action('staff', 'force_start', {}, 409);
    for (const [who, team] of [['a', 0], ['b', 1]]) {
      await f.action(who, 'join', { team, rsn: `Hert ${who}` });
      await f.action('staff', 'enrol', { userId: ids[who], accept: true });
    }
    await f.action('a', 'fleet', { placements: fleet, locked: true });
    await f.action('b', 'fleet', { placements: fleet, locked: false });
    await f.action('staff', 'start', {}, 409);
    await f.action('a', 'force_start', {}, 403);
    const started = await f.action('staff', 'force_start');
    assert.equal(f.game.status, 'active'); assert.ok(f.game.startedAt);
    assert.ok(f.game.teams.every(t => t.ready && t.fleet.length === 0), 'Staff cannot inspect either fleet');
    assert.equal(f.game.audit.filter(a => a.action === 'auto_fleet_0').length, 0);
    assert.equal(f.game.audit.filter(a => a.action === 'auto_fleet_1').length, 1);
    const ownA = (await f.request('a', `/api/warships?id=${f.game.id}`)).data.game;
    const ownB = (await f.request('b', `/api/warships?id=${f.game.id}`)).data.game;
    assert.deepEqual(ownA.teams[0].fleet, fleet); assert.equal(validFleet(ownB.teams[1].fleet), true);
    assert.equal(ownA.teams[1].fleet.length, 0); assert.equal(ownB.teams[0].fleet.length, 0);
    const replay = await f.request('staff', '/api/warships/action', started.body);
    assert.equal(replay.data.game.revision, f.game.revision);
    assert.deepEqual((await f.request('b', `/api/warships?id=${f.game.id}`)).data.game.teams[1].fleet, ownB.teams[1].fleet);
    await f.action('staff', 'force_start', {}, 409);
    await f.action('b', 'fleet', { placements: fleet, locked: true }, 409);
    await f.claim('a'); await f.approve();
  } finally { await mf.dispose(); }
});

test('force-start permits unlinked captains, retains pending name links and persists generated ships', async () => {
  const persist = await mkdtemp(path.join(tmpdir(), 'hh-warships-')); let mf = runtime({ persist });
  try {
    const f = await fixture(mf); await f.create();
    await f.action('staff', 'manual_teams', { teams: [[101], [102]], captainIds: [101, 102] });
    await f.action('staff', 'publish', { published: true });
    await f.action('staff', 'force_start', {}, 409);
    await f.action('staff', 'confirm_teams', { drawId: f.game.teamDraft.id });
    await f.action('a', 'link_player', { playerId: 101 });
    await f.action('staff', 'force_start');
    assert.equal(f.game.requests.length, 1);
    await f.action('staff', 'enrol', { userId: ids.a, accept: true });
    const id = f.game.id, own = (await f.request('a', `/api/warships?id=${id}`)).data.game;
    assert.equal(own.canCaptain, true); assert.equal(validFleet(own.teams[0].fleet), true);
    assert.equal(own.teams[1].fleet.length, 0);
    await mf.dispose(); mf = runtime({ persist });
    const next = await fixture(mf), restored = (await next.request('a', `/api/warships?id=${id}`)).data.game;
    assert.equal(restored.status, 'active'); assert.deepEqual(restored.teams[0].fleet, own.teams[0].fleet);
    assert.equal(restored.teams[1].fleet.length, 0);
  } finally { await mf.dispose(); assert.ok(path.resolve(persist).startsWith(path.resolve(tmpdir()) + path.sep + 'hh-warships-')); await rm(persist, { recursive: true, force: true }); }
});
async function setRevealTime(mf, f, elapsed) { const r = await mf.dispatchFetch(origin + '/__reveal-time', { method: 'POST', body: JSON.stringify({ id: f.game.id, elapsed }) }); assert.equal(r.status, 200); await f.refresh(); }
async function inspectReveal(mf, f) { return (await mf.dispatchFetch(origin + '/__reveal-inspect?id=' + f.game.id)).json(); }
async function prepareReveal(f) { await f.create(); await f.action('staff', 'draw_teams', { playerIds: [101, 102, 103, 104], captainIds: [101, 102] }); return f.action('staff', 'schedule_reveal', revealFields(f)); }

test('scheduled announcement hides every future team and locks fleets, while approved accounts can link before the draw', async () => {
  const options = {}, mf = runtime(options);
  try {
    const f = await fixture(mf); await f.create();
    assert.equal((await f.request(null, '/api/warships/navigation')).data.event, null);
    await f.action('staff', 'draw_teams', { playerIds: [101, 102, 103, 104], captainIds: [101, 102] });
    await f.action('staff', 'schedule_reveal', revealFields(f, 1000), 400);
    const scheduled = await f.action('staff', 'schedule_reveal', revealFields(f));
    assert.equal(f.game.published, true); assert.equal(f.game.reveal.phase, 'countdown');
    const saved = await inspectReveal(mf, f); assert.equal(saved.alarm, Date.parse(f.game.reveal.at));
    const replay = await f.request('staff', '/api/warships/action', scheduled.body); assert.equal(replay.data.game.revision, f.game.revision);
    for (const [actor, playerId] of [['a', 101], ['b', 102]]) {
      await f.action(actor, 'link_player', { playerId }); assert.equal(f.game.requests[0].team, null);
      await f.action('staff', 'enrol', { userId: ids[actor], accept: true });
      await f.action(actor, 'fleet', { placements: fleet, locked: true }, 409);
    }
    for (const viewer of [null, 'staff', 'a', 'b', 'spectator']) {
      const g = (await f.request(viewer, `/api/warships?id=${f.game.id}`)).data.game;
      assert.deepEqual(g.crew, []); assert.equal(g.teamAssignment, null); assert.equal(g.teamDraft, null); assert.deepEqual(g.drawLog, []);
      assert.equal(g.myTeam, null); assert.equal(g.canCaptain, false); assert.equal(g.reveal.current, null); assert.deepEqual(g.reveal.revealed, []);
      assert.ok(g.teams.every(t => t.members === 0 && !t.fleet.length));
      assert.ok(g.lobbyPlayers.every(p => !('team' in p) && !('captain' in p)));
    }
    await f.refresh(); await f.action('staff', 'start', {}, 409);
    await f.action('a', 'cancel_reveal', {}, 403);
    const nav = await f.request(null, '/api/warships/navigation', undefined, { headers: { Cookie: '__Host-hh-member=invalid' } });
    assert.equal(nav.status, 200); assert.equal(nav.data.event.revealAt, f.game.reveal.at);
  } finally { await mf.dispose(); }
});

test('server alarm reveals progressively, survives duplicate delivery and opens only each linked players own fleet', async () => {
  const options = {}, mf = runtime(options);
  try {
    const f = await fixture(mf); await prepareReveal(f);
    for (const [actor, playerId] of [['a', 101], ['b', 102]]) { await f.action(actor, 'link_player', { playerId }); await f.action('staff', 'enrol', { userId: ids[actor], accept: true }); }
    const womCount = options.womRequests; options.womUnavailable = true;
    assert.equal(f.game.reveal.briefing.durationMs, 79000);
    await setRevealTime(mf, f, 35000);
    assert.equal(f.game.reveal.current, null); assert.deepEqual(f.game.reveal.revealed, []);
    assert.equal(f.game.myTeam, null); assert.ok(f.game.fleetAccessLocked);
    await f.action('staff', 'force_start', {}, 409);
    await setRevealTime(mf, f, 84100);
    assert.equal(f.game.reveal.phase, 'drawing'); assert.equal(f.game.reveal.current.id, 101); assert.deepEqual(f.game.reveal.revealed, []);
    assert.equal(f.game.teamAssignment, null); assert.ok(f.game.fleetAccessLocked);
    assert.equal(f.game.reveal.timing.stepMs, 9000);
    await setRevealTime(mf, f, 88500);
    assert.deepEqual(f.game.reveal.revealed, [], 'The name has a spotlight before joining a team');
    await setRevealTime(mf, f, 92000);
    assert.deepEqual(f.game.reveal.revealed.map(p => p.id), [101]);
    await f.action('staff', 'cancel_reveal', {}, 409); await f.action('staff', 'start', {}, 409);
    await f.action('staff', 'force_start', {}, 409);
    await setRevealTime(mf, f, 130000);
    assert.equal(f.game.reveal.phase, 'open'); assert.equal(f.game.fleetAccessLocked, false);
    assert.equal(options.womRequests, womCount);
    const before = await inspectReveal(mf, f);
    await mf.dispatchFetch(origin + '/__reveal-alarm'); const after = await inspectReveal(mf, f);
    assert.equal(after.revision, before.revision); assert.equal(after.audit.filter(a => a.action === 'reveal_started').length, 1); assert.equal(after.audit.filter(a => a.action === 'reveal_completed').length, 1);
    for (const [actor, team] of [['a', 0], ['b', 1]]) {
      const g = (await f.request(actor, `/api/warships?id=${f.game.id}`)).data.game; assert.equal(g.myTeam, team); assert.equal(g.canCaptain, true);
      await f.action(actor, 'fleet', { placements: fleet, locked: true });
    }
    for (const [actor, team] of [['a', 0], ['b', 1]]) { const g = (await f.request(actor, `/api/warships?id=${f.game.id}`)).data.game; assert.equal(g.teams[team].fleet.length, 4); assert.equal(g.teams[1-team].fleet.length, 0); }
    for (const actor of [null, 'staff', 'spectator']) { const g = (await f.request(actor, `/api/warships?id=${f.game.id}`)).data.game; assert.ok(g.teams.every(t => t.fleet.length === 0)); }
    await f.action('staff', 'start'); assert.equal(f.game.status, 'active');
  } finally { await mf.dispose(); }
});

test('staff can reschedule before the countdown ends; withdrawal hides the menu tab and cancels the alarm', async () => {
  const mf = runtime();
  try {
    const f = await fixture(mf); await prepareReveal(f);
    await f.action('a', 'link_player', { playerId: 101 }); await f.action('staff', 'enrol', { userId: ids.a, accept: true });
    const updated = revealFields(f, 240000); await f.action('staff', 'schedule_reveal', updated);
    assert.equal((await inspectReveal(mf, f)).alarm, Date.parse(updated.at));
    await f.action('staff', 'cancel_reveal'); assert.equal(f.game.published, false);
    assert.equal((await inspectReveal(mf, f)).alarm, null);
    assert.equal((await f.request(null, '/api/warships/navigation')).data.event, null);
    assert.equal((await f.request('a', `/api/warships?id=${f.game.id}`)).status, 404);
    await f.action('staff', 'schedule_reveal', revealFields(f));
    const g = (await f.request('a', `/api/warships?id=${f.game.id}`)).data.game;
    assert.equal(g.linkedPlayer.playerId, 101); assert.equal(g.myTeam, null);
    await f.action('staff', 'cancel', { reason: 'Test afgerond' }); assert.equal((await inspectReveal(mf, f)).alarm, null);
    assert.equal((await f.request(null, '/api/warships/navigation')).data.event, null);
  } finally { await mf.dispose(); }
});

test('scheduled reveal and alarm survive a runtime restart without needing an open browser', async () => {
  const persist = await mkdtemp(path.join(tmpdir(), 'hh-warships-')); let mf = runtime({ persist });
  try {
    const f = await fixture(mf); await prepareReveal(f); const id=f.game.id, at=f.game.reveal.at;
    await mf.dispose(); mf=runtime({persist}); const next=await fixture(mf);
    const g=(await next.request('a', `/api/warships?id=${id}`)).data.game;
    assert.equal(g.reveal.at,at); assert.equal(g.fleetAccessLocked,true); assert.equal(g.teamAssignment,null);
    const saved=await (await mf.dispatchFetch(origin+'/__reveal-inspect?id='+id)).json();assert.equal(saved.alarm,Date.parse(at));
  } finally { await mf.dispose(); assert.ok(path.resolve(persist).startsWith(path.resolve(tmpdir()) + path.sep + 'hh-warships-')); await rm(persist, { recursive: true, force: true }); }
});

test('verified Discord names link once, keep teams private until reveal and survive nickname changes', async () => {
  const options = { members: { [ids.a]: { nick: 'HERT_1', username: 'unrelated' } } }, mf = runtime(options);
  try {
    const f = await fixture(mf); await prepareReveal(f);
    const g = (await f.request('a', `/api/warships?id=${f.game.id}`)).data.game;
    assert.equal(g.linkedPlayer.playerId, 101); assert.equal(g.linkedPlayer.automatic, true);
    assert.equal(g.myTeam, null); assert.equal(g.canCaptain, false); assert.ok(g.teams.every(t => t.fleet.length === 0));
    const revision = g.revision;
    assert.equal((await f.request('a', `/api/warships?id=${g.id}`)).data.game.revision, revision);
    options.members[ids.a].nick = 'Hert 2';
    assert.equal((await f.request('a', `/api/warships?id=${g.id}`)).data.game.linkedPlayer.playerId, 101);
    options.members[ids.spectator] = { nick: 'Hert 1' };
    assert.equal((await f.request('spectator', `/api/warships?id=${g.id}`)).data.game.linkedPlayer, null);
    await f.refresh(); assert.equal(f.game.audit.filter(a => a.action === 'auto_link_player').length, 1);
    await setRevealTime(mf, f, 130000);
    const open = (await f.request('a', `/api/warships?id=${g.id}`)).data.game;
    assert.equal(open.myTeam, 0); assert.equal(open.canCaptain, true);
    await f.action('a', 'fleet', { placements: fleet, locked: true });
    assert.equal((await f.request('a', `/api/warships?id=${g.id}`)).data.game.teams[0].fleet.length, 4);
    assert.equal((await f.request('spectator', `/api/warships?id=${g.id}`)).data.game.teams[0].fleet.length, 0);
  } finally { await mf.dispose(); }
});

test('automatic linking does not bypass conflicting names, pending claims, staff rejection or authentication', async () => {
  const options = { members: {} }, mf = runtime(options);
  try {
    const f = await fixture(mf); await prepareReveal(f);
    options.members[ids.a] = { nick: 'Hert 1', username: 'Hert 2' };
    assert.equal((await f.request('a', `/api/warships?id=${f.game.id}`)).data.game.linkedPlayer, null);
    await f.action('b', 'link_player', { playerId: 101 });
    options.members[ids.a] = { nick: 'Hert 1', username: 'unrelated' };
    assert.equal((await f.request('a', `/api/warships?id=${f.game.id}`)).data.game.linkedPlayer, null);
    options.members[ids.b] = { nick: 'Hert 1' };
    await f.action('staff', 'enrol', { userId: ids.b, accept: false });
    assert.equal((await f.request('b', `/api/warships?id=${f.game.id}`)).data.game.linkedPlayer, null);
    options.revoked = true;
    assert.equal((await f.request('a', `/api/warships?id=${f.game.id}`)).status, 403);
    assert.equal((await f.request(null, `/api/warships?id=${f.game.id}`, undefined, { headers: { 'X-Discord-Name': 'Hert 1' } })).data.game.linkedPlayer, null);
    options.revoked = false;
    assert.equal((await f.request('a', `/api/warships?id=${f.game.id}`)).data.game.linkedPlayer.playerId, 101);
    await f.refresh(); assert.equal(f.game.requests.length, 0);
  } finally { await mf.dispose(); }
});

test('staff can remove an automatic account link without losing the player, ships or game history', async () => {
  const options = { members: { [ids.a]: { nick: 'Hert 1' } } }, mf = runtime(options);
  try {
    const f = await fixture(mf); await prepareReveal(f);
    await f.request('a', `/api/warships?id=${f.game.id}`); await f.refresh();
    await setRevealTime(mf, f, 130000);
    await f.action('a', 'fleet', { placements: fleet, locked: true });
    await f.action('staff', 'force_start');
    await f.action('a', 'unlink_player', { playerId: 101 }, 403);
    const removal = await f.action('staff', 'unlink_player', { playerId: 101 });
    const g = (await f.request('a', `/api/warships?id=${f.game.id}`)).data.game;
    assert.equal(g.linkedPlayer, null); assert.equal(g.canCaptain, false); assert.equal(g.myTeam, null);
    assert.ok(g.teams.every(t => t.fleet.length === 0)); assert.equal(g.crew.length, 4);
    assert.equal((await f.request('staff', '/api/warships/action', removal.body)).data.game.revision, f.game.revision);
    await f.action('a', 'link_player', { playerId: 101 });
    await f.action('staff', 'enrol', { userId: ids.a, accept: true });
    const restored = (await f.request('a', `/api/warships?id=${f.game.id}`)).data.game;
    assert.equal(restored.linkedPlayer.automatic, false); assert.deepEqual(restored.teams[0].fleet, fleet);
  } finally { await mf.dispose(); }
});

test('automatic account ownership persists across a runtime restart', async () => {
  const persist = await mkdtemp(path.join(tmpdir(), 'hh-warships-')); let mf = runtime({ persist, members: { [ids.a]: { nick: 'Hert 1' } } });
  try {
    const f = await fixture(mf); await prepareReveal(f); const id = f.game.id;
    const linked = (await f.request('a', `/api/warships?id=${id}`)).data.game;
    assert.equal(linked.linkedPlayer.playerId, 101);
    await mf.dispose(); mf = runtime({ persist });
    const next = await fixture(mf), restored = (await next.request('a', `/api/warships?id=${id}`)).data.game;
    assert.deepEqual(restored.linkedPlayer, linked.linkedPlayer); assert.equal(restored.revision, linked.revision);
  } finally { await mf.dispose(); assert.ok(path.resolve(persist).startsWith(path.resolve(tmpdir()) + path.sep + 'hh-warships-')); await rm(persist, { recursive: true, force: true }); }
});


const customRules = [{id:'clan',title:'Samen uitvaren',text:'We spelen voor de clan.',seconds:12},{id:'proof',title:'Bewijs je drop',text:'Stuur een screenshot met spelernaam en tijdstip.',seconds:16}];
test('only verified admins edit briefing rules, with validation, conflicts and idempotency enforced', async () => {
  const mf=runtime();
  try {
    const f=await fixture(mf); await f.create(); await f.action('staff','publish',{published:true});
    assert.equal(f.game.canEditRules,false);
    await f.action('staff','set_briefing',{rules:customRules},403);
    await f.action('a','set_briefing',{rules:customRules},403);
    await f.action('a','set_briefing',{rules:customRules,admin:true},400);
    await f.action('admin','set_briefing',{rules:[]},400);
    const previous=f.game.revision;
    const saved=await f.action('admin','set_briefing',{rules:customRules});
    assert.equal(f.game.canEditRules,true); assert.deepEqual(f.game.briefingRules,customRules);
    assert.equal((await f.request('admin','/api/warships/action',saved.body)).data.game.revision,f.game.revision);
    await f.action('admin','set_briefing',{rules:customRules,revision:previous},409);
  } finally {await mf.dispose();}
});
test('updating a planned briefing preserves teams and account links and recalculates its opening', async () => {
  const mf=runtime();
  try {
    const f=await fixture(mf); await prepareReveal(f);
    await f.action('a','link_player',{playerId:101}); await f.action('staff','enrol',{userId:ids.a,accept:true});
    const before=await inspectReveal(mf,f);
    await f.action('admin','set_briefing',{rules:customRules});
    const after=await inspectReveal(mf,f);
    assert.deepEqual(after.teamAssignment,before.teamAssignment); assert.deepEqual(after.crew,before.crew); assert.deepEqual(after.fleets,before.fleets);
    assert.equal(after.reveal.at,before.reveal.at); assert.equal(after.alarm,before.alarm);
    assert.equal(after.reveal.pace,4); assert.equal(Date.parse(after.reveal.opensAt)-Date.parse(after.reveal.at),82000);
    assert.deepEqual(after.reveal.slides.map(s=>s.kind),['rule','rule','drop']);
    await setRevealTime(mf,f,15000);
    await f.action('admin','set_briefing',{rules:customRules},409);
    await f.action('staff','force_start',{},409);
    assert.equal((await inspectReveal(mf,f)).alarm,Date.parse(f.game.reveal.opensAt));
    await setRevealTime(mf,f,28500);
    const publicGame=(await f.request(null,'/api/warships?id='+f.game.id)).data.game;
    assert.equal(publicGame.config.objectives[0].item,'Tanzanite fang'); assert.equal(publicGame.reveal.current,null);
    await f.action('staff','force_start',{},409);
    await setRevealTime(mf,f,83000); await f.action('staff','force_start');
    await f.action('admin','set_briefing',{rules:customRules},409);
  } finally {await mf.dispose();}
});
test('the public API reveals bosses only at their scheduled step and never leaks future items through config', async () => {
  const mf=runtime();
  try {
    const f=await fixture(mf); await f.create();
    const objectives=[...f.game.config.objectives,{id:crypto.randomUUID(),boss:'vorkath',item:'Dragonbone necklace',shots:3,limit:2}];
    await f.action('staff','edit',{config:{...f.game.config,objectives}});
    await f.action('admin','set_briefing',{rules:customRules});
    await f.action('staff','draw_teams',{playerIds:[101,102],captainIds:[101,102]});
    await f.action('staff','schedule_reveal',revealFields(f));
    for(const viewer of [null,'a']) {
      const g=(await f.request(viewer,'/api/warships?id='+f.game.id)).data.game;
      assert.deepEqual(g.config.objectives,[]); assert.ok(!JSON.stringify(g).includes('Tanzanite fang')); assert.ok(!JSON.stringify(g).includes('Dragonbone necklace'));
    }
    assert.equal(f.game.config.objectives.length,2);
    await setRevealTime(mf,f,28500);
    const first=(await f.request('a','/api/warships?id='+f.game.id)).data.game;
    assert.equal(first.config.objectives.length,1); assert.ok(!JSON.stringify(first).includes('Dragonbone necklace'));
    assert.equal(first.reveal.current,null);
    await setRevealTime(mf,f,36500);
    const second=(await f.request('a','/api/warships?id='+f.game.id)).data.game;
    assert.equal(second.config.objectives.length,2); assert.equal(second.reveal.current,null);
  } finally {await mf.dispose();}
});
test('an overlong briefing is rejected atomically and custom rules survive a restart', async () => {
  const persist=await mkdtemp(path.join(tmpdir(),'hh-warships-')); let mf=runtime({persist});
  try {
    const f=await fixture(mf); await f.create();
    await f.action('staff','edit',{config:{...f.game.config,endsAt:new Date(Date.now()+300000).toISOString()}});
    await f.action('admin','set_briefing',{rules:customRules});
    await f.action('staff','draw_teams',{playerIds:[101,102],captainIds:[101,102]});
    await f.action('staff','schedule_reveal',revealFields(f));
    const before=await inspectReveal(mf,f), id=f.game.id;
    await f.action('admin','set_briefing',{rules:Array.from({length:12},(_,i)=>({...customRules[0],id:'rule-'+i,seconds:45}))},400);
    assert.deepEqual(await inspectReveal(mf,f),before);
    await mf.dispose(); mf=runtime({persist}); const next=await fixture(mf);
    const g=(await next.request('admin','/api/warships?id='+id)).data.game;
    assert.deepEqual(g.briefingRules,customRules); assert.deepEqual(g.reveal.briefing.slides,before.reveal.slides);
  } finally {await mf.dispose(); assert.ok(path.resolve(persist).startsWith(path.resolve(tmpdir())+path.sep+'hh-warships-'));await rm(persist,{recursive:true,force:true});}
});
