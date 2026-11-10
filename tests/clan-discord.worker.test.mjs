import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, generateKeyPairSync, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const requireWrangler = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare } = requireWrangler('miniflare');
const { build } = requireWrangler('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const pair = generateKeyPairSync('ed25519');
const publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
const env = { APP_ORIGIN: 'https://clan.example', DISCORD_CLIENT_ID: '123456789012345678', DISCORD_CLIENT_SECRET: 'fake-test-only-secret', DISCORD_GUILD_ID: '1073630238115897455', DISCORD_MEMBER_ROLE_IDS: '1326459850837987430,1197327572720169030,1408990525180084265', DISCORD_SESSION_SECRET: randomBytes(32).toString('base64url'), DISCORD_BOT_TOKEN: 'fake-bot-test-only', DISCORD_PUBLIC_KEY: publicKey };
const ADMIN = '1197327572720169030', MEMBER = '1326459850837987430';
const A = '234567890123456789', B = '334567890123456789';
const LOGIN = '444444444444444444', EVENTS = '555555555555555555', RAFFLE = '666666666666666666';
const bundle = await build({ stdin: { contents: `
  import { ClanDiscord } from './worker/clan-discord.ts';
  import { ClanRaffle } from './worker/clan-raffle.ts';
  import { clanDiscordRoute } from './lib/clan-discord-route.ts';
  import { discordAuthRoute } from './lib/discord-auth.ts';
  export class TestSync extends ClanDiscord {
    startEvent(id, ended = false) { const row = this.ctx.storage.sql.exec('SELECT data FROM clan_events WHERE id = ?', id).one(); const event = JSON.parse(row.data); event.startsAt = new Date(Date.now() - 60000).toISOString(); event.endsAt = new Date(Date.now() + (ended ? -1000 : 60000)).toISOString(); this.ctx.storage.sql.exec('UPDATE clan_events SET starts_at = ?, data = ? WHERE id = ?', Date.parse(event.startsAt), JSON.stringify(event), id); }
    inspect() { return { jobs: this.ctx.storage.sql.exec('SELECT * FROM discord_jobs').toArray(), pause: this.ctx.storage.sql.exec('SELECT * FROM discord_state').toArray() }; }
    async flush() { this.ctx.storage.sql.exec("UPDATE discord_jobs SET next_at = 0 WHERE error = ''"); await this.ctx.storage.deleteAlarm(); await this.alarm(); return this.inspect(); }
  }
  export class TestRaffle extends ClanRaffle {
    async due(id) { const row = this.ctx.storage.sql.exec('SELECT data FROM raffle_rounds WHERE id = ?', id).one(); const round = JSON.parse(row.data); round.drawAt = Date.now() - 1000; this.ctx.storage.sql.exec('UPDATE raffle_rounds SET draw_at = ?, data = ? WHERE id = ?', round.drawAt, JSON.stringify(round), id); await this.ctx.storage.deleteAlarm(); await this.alarm(); }
  }
  export default { async fetch(request, env) {
    const url = new URL(request.url); const sync = env.DISCORD_SYNC.getByName('clan:7059');
    if (url.pathname === '/__test/flush') return Response.json(await sync.flush());
    if (url.pathname === '/__test/inspect') return Response.json(await sync.inspect());
    if (url.pathname === '/__test/start') { await sync.startEvent(url.searchParams.get('id'), url.searchParams.has('ended')); return new Response('ok'); }
    if (url.pathname === '/__test/raffle') return Response.json(await env.RAFFLES.getByName('clan:7059').schedule(await request.json(), 'test'));
    if (url.pathname === '/__test/due') { await env.RAFFLES.getByName('clan:7059').due(url.searchParams.get('id')); return new Response('ok'); }
    if (url.pathname === '/__test/result') return Response.json(await env.RAFFLES.getByName('clan:7059').getPublic());
    return await clanDiscordRoute(request, env) || await discordAuthRoute(request, env) || new Response('Not found', {status:404});
  }};`, resolveDir: root, loader: 'ts', sourcefile: 'clan-sync-test.ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', external: ['node:crypto', 'cloudflare:workers'] });
function runtime(options = {}) {
  const deliveries = []; let message = 700000000000000000n;
  const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], bindings: { ...env, ...(options.noBot ? { DISCORD_BOT_TOKEN: '' } : {}) }, durableObjects: { DISCORD_SYNC: { className: 'TestSync', useSQLite: true }, RAFFLES: { className: 'TestRaffle', useSQLite: true } }, ...(options.persist ? { durableObjectsPersist: options.persist } : {}),
    outboundService: async request => {
      const url = new URL(request.url); assert.equal(url.origin, 'https://discord.com');
      if (url.pathname.endsWith('/token')) { const code = new URLSearchParams(await request.text()).get('code'); return Response.json({ access_token: `test-access-${code}`, token_type: 'Bearer', expires_in: 604800, scope: 'identify guilds.members.read' }); }
      const isB = request.headers.get('Authorization')?.endsWith('-b');
      const user = { id: isB ? B : A, username: isB ? 'Tweede Hert' : 'Eerste Hert' };
      if (url.pathname.endsWith('/users/@me')) return Response.json(user);
      if (url.pathname.endsWith('/member')) return Response.json({ user, roles: options.roles || [isB ? MEMBER : ADMIN] });
      if (/\/channels\/\d+$/.test(url.pathname)) {
        const id = url.pathname.split('/').at(-1);
        return Response.json({ id, type: 0, guild_id: options.foreignChannel ? '999999999999999999' : env.DISCORD_GUILD_ID, permission_overwrites: [{ id: env.DISCORD_GUILD_ID, type: 0, deny: options.publicLogin ? '0' : '1024', allow: '0' }, { id: ADMIN, type: 0, deny: '0', allow: '1024' }] });
      }
      if (url.pathname.includes('/messages')) {
        assert.equal(request.headers.get('Authorization'), `Bot ${env.DISCORD_BOT_TOKEN}`);
        const body = await request.json(); deliveries.push({ path: url.pathname, method: request.method, body });
        if (options.deliveryStatus) return Response.json({ retry_after: 120 }, { status: options.deliveryStatus, headers: { 'Retry-After': '120' } });
        return Response.json({ id: request.method === 'PATCH' ? url.pathname.split('/').at(-1) : String(++message) });
      }
      throw new Error(`Unexpected endpoint ${url.pathname}`);
    } });
  return { mf, deliveries };
}
const cookie = (response, name) => response.headers.getSetCookie().find(v => v.startsWith(name + '='))?.split(';')[0];

test('site appearance is public to read but only current staff may change it, independently of Discord notices', async () => {
  const options = { noBot: true }; const { mf, deliveries } = runtime(options);
  try {
    const initial = { christmasEnabled: true, revision: 0 };
    const read = await get(mf, '/api/site/appearance');
    assert.match(read.headers.get('Cache-Control'), /no-store/);
    assert.deepEqual(await read.json(), { appearance: initial });
    assert.equal((await post(mf, '/api/site/appearance', initial)).status, 405);
    assert.equal((await post(mf, '/api/admin/appearance', initial)).status, 401);
    const admin = await login(mf); const member = await login(mf, 'b');
    const settingsBefore = await (await get(mf, '/api/admin/discord', admin)).json();
    assert.equal((await get(mf, '/api/admin/appearance', member)).status, 403);
    assert.equal((await post(mf, '/api/admin/appearance', initial, member)).status, 403);
    assert.equal((await post(mf, '/api/admin/appearance', initial, admin, { Origin: 'https://evil.example' })).status, 403);
    for (const body of [{ christmasEnabled: 'yes', revision: 0 }, { ...initial, extra: true }, { christmasEnabled: false, revision: -1 }]) assert.equal((await post(mf, '/api/admin/appearance', body, admin)).status, 400);
    const saved = await post(mf, '/api/admin/appearance', { ...initial, christmasEnabled: false }, admin);
    assert.equal(saved.status, 200); assert.deepEqual((await saved.json()).appearance, { christmasEnabled: false, revision: 1 });
    assert.equal((await post(mf, '/api/admin/appearance', initial, admin)).status, 409);
    options.roles = [MEMBER];
    assert.equal((await post(mf, '/api/admin/appearance', { christmasEnabled: true, revision: 1 }, admin)).status, 403, 'revoked staff cannot reuse a session to update the theme');
    options.roles = ['1408990525180084265'];
    assert.equal((await post(mf, '/api/admin/appearance', { christmasEnabled: true, revision: 1 }, admin)).status, 200, 'Staff team can manage the theme');
    assert.deepEqual(await (await get(mf, '/api/admin/discord', admin)).json(), settingsBefore);
    assert.deepEqual((await flush(mf)).jobs, []); assert.deepEqual(deliveries, []);
  } finally { await mf.dispose(); }
});

test('site appearance rejects competing stale writes and persists across object restarts', async () => {
  const persist = await mkdtemp(path.join(tmpdir(), 'hh-appearance-'));
  let instance = runtime({ noBot: true, persist });
  try {
    let session = await login(instance.mf);
    const results = await Promise.all([false, false].map(christmasEnabled => post(instance.mf, '/api/admin/appearance', { christmasEnabled, revision: 0 }, session)));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    await instance.mf.dispose(); instance = runtime({ noBot: true, persist });
    assert.deepEqual(await (await get(instance.mf, '/api/site/appearance')).json(), { appearance: { christmasEnabled: false, revision: 1 } });
    session = await login(instance.mf);
    assert.equal((await post(instance.mf, '/api/admin/appearance', { christmasEnabled: true, revision: 1 }, session)).status, 200);
    await instance.mf.dispose(); instance = runtime({ noBot: true, persist });
    assert.deepEqual(await (await get(instance.mf, '/api/site/appearance')).json(), { appearance: { christmasEnabled: true, revision: 2 } });
  } finally { await instance.mf.dispose(); await rm(persist, { recursive: true, force: true }); }
});
async function login(mf, who = 'a') {
  const start = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/discord`, { redirect: 'manual' });
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const response = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/discord/callback?code=${who}&state=${state}`, { redirect: 'manual', headers: { Cookie: cookie(start, '__Host-hh-discord-state') } });
  assert.equal(response.headers.get('Location'), '/ledenomgeving'); return cookie(response, '__Host-hh-member');
}
const get = (mf, path, session) => mf.dispatchFetch(env.APP_ORIGIN + path, { headers: session ? { Cookie: session } : {} });
const post = (mf, path, body, session, extra = {}) => mf.dispatchFetch(env.APP_ORIGIN + path, { method: 'POST', headers: { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json', ...(session ? { Cookie: session } : {}), ...extra }, body: JSON.stringify(body) });
const settings = (extra = {}) => ({ revision: 0, loginChannel: LOGIN, eventsChannel: EVENTS, raffleChannel: RAFFLE, loginEnabled: true, eventsEnabled: true, raffleEnabled: true, ...extra });
const eventInput = () => ({ id: randomUUID(), revision: 0, title: 'Zulrah clanavond', description: 'Samen op pad met de clan.', category: 'boss', startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString(), status: 'scheduled' });
async function create(mf, session, changes = {}) { const response = await post(mf, '/api/admin/clan-events', { ...eventInput(), ...changes }, session); assert.equal(response.status, 200, await response.clone().text()); return (await response.json()).event; }
async function enable(mf, session, changes = {}) { const r = await post(mf, '/api/admin/discord', settings(changes), session); assert.equal(r.status, 200, await r.clone().text()); return r.json(); }
async function flush(mf) { return (await get(mf, '/__test/flush')).json(); }
async function interaction(mf, event, messageId, action = 'join', extra = {}) {
  const value = { id: String(800000000000000000n + BigInt(Math.floor(Math.random() * 10000000))), type: 3, application_id: env.DISCORD_CLIENT_ID, guild_id: env.DISCORD_GUILD_ID, channel_id: EVENTS, message: { id: messageId }, member: { roles: [MEMBER], user: { id: B, username: 'Tweede Hert' } }, data: { custom_id: `hh:event:${action}:${event.id}` }, ...extra };
  const body = JSON.stringify(value); const timestamp = String(Math.floor(Date.now() / 1000)); const signature = sign(null, Buffer.from(timestamp + body), pair.privateKey).toString('hex');
  return mf.dispatchFetch(`${env.APP_ORIGIN}/api/discord/interactions`, { method: 'POST', headers: { 'X-Signature-Timestamp': timestamp, 'X-Signature-Ed25519': signature }, body });
}

test('unconfigured system saves website events, sends nothing and hides participant identities from public reads', async () => {
  const { mf, deliveries } = runtime({ noBot: true });
  try {
    const session = await login(mf); const event = await create(mf, session);
    assert.equal((await post(mf, '/api/members/clan-events/register', { id: event.id, action: 'join' }, session)).status, 200);
    const publicData = await (await get(mf, '/api/clan-events')).json();
    assert.equal(publicData.events[0].participantCount, 1); assert.equal(publicData.events[0].participants, undefined); assert.equal(publicData.events[0].joined, false);
    await flush(mf); assert.equal(deliveries.length, 0);
    assert.equal((await post(mf, '/api/admin/discord', settings(), session)).status, 400);
  } finally { await mf.dispose(); }
});

test('admin endpoints enforce roles, CSRF, private login destination, guild and revision checks', async () => {
  const options = {}; const { mf } = runtime(options);
  try {
    assert.equal((await get(mf, '/api/admin/discord')).status, 401);
    const admin = await login(mf); const member = await login(mf, 'b');
    assert.equal((await get(mf, '/api/admin/discord', member)).status, 403);
    assert.equal((await post(mf, '/api/admin/clan-events', eventInput(), member)).status, 403);
    assert.equal((await post(mf, '/api/admin/discord', settings(), admin, { Origin: 'https://evil.example' })).status, 403);
    options.publicLogin = true; assert.equal((await post(mf, '/api/admin/discord', settings(), admin)).status, 400);
    options.publicLogin = false; options.foreignChannel = true; assert.equal((await post(mf, '/api/admin/discord', settings(), admin)).status, 400);
    options.foreignChannel = false; await enable(mf, admin);
    assert.equal((await post(mf, '/api/admin/discord', settings(), admin)).status, 409);
  } finally { await mf.dispose(); }
});

test('only successful new logins queue a private notice; session reads and disabled history do not', async () => {
  const { mf, deliveries } = runtime();
  try {
    const admin = await login(mf); await enable(mf, admin); await flush(mf); assert.equal(deliveries.length, 0);
    const member = await login(mf, 'b'); await get(mf, '/api/auth/session', member); await get(mf, '/api/auth/session', member);
    await flush(mf); assert.equal(deliveries.length, 1); assert.ok(deliveries[0].path.includes(LOGIN));
    const content = JSON.stringify(deliveries[0].body); assert.match(content, /Tweede Hert/); assert.doesNotMatch(content, /test-access|secret|refresh_token/);
    assert.deepEqual(deliveries[0].body.allowed_mentions, { parse: [] }); await flush(mf); assert.equal(deliveries.length, 1);
  } finally { await mf.dispose(); }
});

test('website and signed Discord buttons share registrations, update one message and resist replay', async () => {
  const { mf, deliveries } = runtime();
  try {
    const admin = await login(mf); await enable(mf, admin, { loginEnabled: false });
    const event = await create(mf, admin); const state = await flush(mf); const messageId = state.jobs.find(j => j.kind === 'events').message_id;
    const member = await login(mf, 'b');
    const payload = { id: event.id, action: 'join' };
    await post(mf, '/api/members/clan-events/register', payload, member); await post(mf, '/api/members/clan-events/register', payload, member);
    const clickId = '811111111111111111';
    const join = await (await interaction(mf, event, messageId, 'join', { id: clickId })).json(); assert.match(join.data.content, /aangemeld/);
    const list = await (await get(mf, '/api/members/clan-events', member)).json(); assert.equal(list.events[0].participantCount, 1); assert.equal(list.events[0].joined, true);
    await flush(mf); assert.equal(deliveries.filter(d => d.method === 'POST').length, 1); assert.ok(deliveries.some(d => d.method === 'PATCH'));
    await interaction(mf, event, messageId, 'leave'); await interaction(mf, event, messageId, 'join', { id: clickId });
    assert.equal((await (await get(mf, '/api/clan-events')).json()).events[0].participantCount, 0);
    const forbidden = await (await interaction(mf, event, messageId, 'join', { member: { roles: [], user: { id: B, username: 'No role' } } })).json(); assert.match(forbidden.data.content, /rol/);
    const wrongChannel = await (await interaction(mf, event, messageId, 'join', { channel_id: LOGIN })).json(); assert.match(wrongChannel.data.content, /niet meer actief/);
    assert.equal((await post(mf, '/api/members/clan-events/register', { ...payload, userId: A }, member)).status, 400);
  } finally { await mf.dispose(); }
});

test('Discord 429 preserves signups, pauses delivery and never retries before the provider deadline', async () => {
  const options = { deliveryStatus: 429 }; const { mf, deliveries } = runtime(options);
  try {
    const admin = await login(mf); await enable(mf, admin, { loginEnabled: false }); const event = await create(mf, admin);
    await post(mf, '/api/members/clan-events/register', { id: event.id, action: 'join' }, admin);
    const state = await flush(mf); assert.equal(deliveries.length, 1); assert.ok(state.pause[0].value >= Date.now() + 118000);
    await flush(mf); assert.equal(deliveries.length, 1); assert.equal((await (await get(mf, '/api/clan-events')).json()).events[0].participantCount, 1);
  } finally { await mf.dispose(); }
});

test('cancelled events reject signups and Discord updates disable both buttons', async () => {
  const { mf, deliveries } = runtime();
  try {
    const admin = await login(mf); await enable(mf, admin, { loginEnabled: false }); const event = await create(mf, admin); await flush(mf);
    const { id, revision, title, description, category, startsAt, endsAt } = event;
    const cancel = { id, revision, title, description, category, startsAt, endsAt, status: 'cancelled' };
    assert.equal((await post(mf, '/api/admin/clan-events', cancel, admin)).status, 200);
    assert.equal((await post(mf, '/api/admin/clan-events', cancel, admin)).status, 409);
    assert.equal((await post(mf, '/api/members/clan-events/register', { id, action: 'join' }, admin)).status, 409);
    await flush(mf); const buttons = deliveries.at(-1).body.components[0].components; assert.equal(buttons[0].disabled, true); assert.equal(buttons[1].disabled, true);
  } finally { await mf.dispose(); }
});

test('draw completion delivers the committed lottery winner once with a link to the exact proof', async () => {
  const { mf, deliveries } = runtime();
  try {
    const admin = await login(mf); await enable(mf, admin, { loginEnabled: false });
    const scheduled = await (await post(mf, '/__test/raffle', { requestId: randomUUID(), title: 'Clanloterij', prize: 'Clanprijs', freeEntry: true, drawAt: Date.now() + 60000, entries: [{ name: 'Hert Een', tickets: 3 }, { name: 'Hert Twee', tickets: 1 }] })).json();
    assert.equal(scheduled.ok, true); await flush(mf); assert.equal(deliveries.length, 0);
    await get(mf, `/__test/due?id=${scheduled.round.id}`); await flush(mf);
    const actual = (await (await get(mf, '/__test/result')).json()).round;
    assert.equal(actual.status, 'drawn'); assert.equal(deliveries.length, 1); assert.ok(deliveries[0].path.includes(RAFFLE));
    const msg = deliveries[0].body; assert.ok(msg.embeds[0].description.includes(actual.winner)); assert.ok(msg.embeds[0].url.endsWith(`?id=${actual.id}#raffle`));
    assert.equal(JSON.stringify(msg).includes(actual.seed), false);
    await get(mf, `/__test/due?id=${scheduled.round.id}`); await flush(mf); assert.equal(deliveries.length, 1);
  } finally { await mf.dispose(); }
});

test('events, registrations and disabled settings survive a Worker restart', async () => {
  const persist = await mkdtemp(path.join(tmpdir(), 'hh-discord-sync-')); let first, second;
  try {
    first = runtime({ persist }); const session = await login(first.mf); const event = await create(first.mf, session, { category: 'skill', minimum: { unit: 'xp', metric: 'hunter', amount: 5000 } });
    await post(first.mf, '/api/members/clan-events/register', { id: event.id, action: 'join' }, session);
    await get(first.mf, `/__test/start?id=${event.id}&ended=1`);
    assert.equal((await post(first.mf, '/api/admin/clan-events/result', { eventId: event.id, userId: A, revision: 0, gained: 6000 }, session)).status, 200);
    await first.mf.dispose(); first = null; second = runtime({ persist });
    const data = await (await get(second.mf, '/api/clan-events')).json(); assert.equal(data.events[0].id, event.id); assert.equal(data.events[0].participantCount, 1);
    assert.equal(data.events[0].qualifiedCount, 1); assert.deepEqual(data.events[0].minimum, { unit: 'xp', metric: 'hunter', amount: 5000 });
    const admin = await login(second.mf); const state = await (await get(second.mf, '/api/admin/discord', admin)).json(); assert.equal(state.settings.eventsEnabled, false);
    const own = (await (await get(second.mf, '/api/members/clan-events', admin)).json()).events[0]; assert.equal(own.myProgress.gained, 6000); assert.equal(own.myProgress.revision, 1);
  } finally { await first?.mf.dispose(); await second?.mf.dispose(); assert.ok(path.basename(persist).startsWith('hh-discord-sync-')); await rm(persist, { recursive: true, force: true }); }
});

test('all event categories accept a valid period minimum, legacy inputs default to none and invalid requirements fail', async () => {
  const { mf } = runtime();
  try {
    const admin = await login(mf);
    for (const category of ['skill', 'boss', 'raid', 'bingo', 'social', 'other']) {
      const event = await create(mf, admin, { category }); assert.equal(event.category, category); assert.equal(event.minimum, null);
    }
    for (const minimum of [{ unit: 'xp', metric: 'hunter', amount: 5000 }, { unit: 'xp', metric: 'overall', amount: 1000000 }, { unit: 'kc', metric: 'vorkath', amount: 100 }, { unit: 'kc', metric: 'all_bosses', amount: 200 }]) {
      assert.deepEqual((await create(mf, admin, { minimum })).minimum, minimum);
    }
    for (const minimum of [{ unit: 'xp', metric: 'vorkath', amount: 1 }, { unit: 'kc', metric: 'hunter', amount: 1 }, { unit: 'kc', metric: 'last_man_standing', amount: 1 }, { unit: 'xp', metric: 'fake_skill', amount: 1 }, ...[0, -1, 1.5, 10000000001].map(amount => ({ unit: 'xp', metric: 'hunter', amount })), { unit: 'kc', metric: 'vorkath', amount: 10000001 }]) {
      assert.equal((await post(mf, '/api/admin/clan-events', { ...eventInput(), minimum }, admin)).status, 400);
    }
  } finally { await mf.dispose(); }
});

test('only staff record results after start, count exact thresholds, correct or clear results and preserve public privacy', async () => {
  const { mf, deliveries } = runtime();
  try {
    const admin = await login(mf), member = await login(mf, 'b'); await enable(mf, admin, { loginEnabled: false });
    const event = await create(mf, admin, { category: 'skill', minimum: { unit: 'xp', metric: 'hunter', amount: 1000 } });
    assert.equal((await post(mf, '/api/members/clan-events/register', { id: event.id, action: 'join' }, member)).status, 200);
    const result = { eventId: event.id, userId: B, revision: 0, gained: 1000 };
    const route = '/api/admin/clan-events/result';
    assert.equal((await post(mf, route, result)).status, 401);
    assert.equal((await post(mf, route, result, member)).status, 403);
    assert.equal((await post(mf, route, result, admin, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post(mf, route, result, admin)).status, 409);
    const before = (await (await get(mf, '/api/members/clan-events', member)).json()).events[0]; assert.equal(before.joined, true); assert.equal(before.qualifiedCount, 0); assert.equal(before.myProgress.qualified, null);
    await get(mf, `/__test/start?id=${event.id}`);
    const edit = { ...eventInput(), id: event.id, revision: event.revision, minimum: null };
    assert.equal((await post(mf, '/api/admin/clan-events', edit, admin)).status, 409);
    assert.equal((await post(mf, route, { ...result, userId: A }, admin)).status, 404);
    assert.equal((await post(mf, route, { ...result, qualified: true }, admin)).status, 400);
    for (const gained of [-1, 0.5, 10000000001, '1000']) assert.equal((await post(mf, route, { ...result, gained }, admin)).status, 400);
    for (const [revision, gained, qualified] of [[0, 999, false], [1, 1000, true], [2, 0, false], [3, null, null], [4, 2000, true]]) {
      const saved = await post(mf, route, { ...result, revision, gained }, admin); assert.equal(saved.status, 200, await saved.clone().text());
      const updated = (await saved.json()).event; assert.equal(updated.qualifiedCount, qualified === true ? 1 : 0);
      assert.equal(updated.participants[0].progress.gained, gained); assert.equal(updated.participants[0].progress.qualified, qualified);
    }
    assert.equal((await post(mf, route, result, admin)).status, 409);
    const own = (await (await get(mf, '/api/members/clan-events', member)).json()).events[0]; assert.equal(own.myProgress.gained, 2000); assert.equal(own.myProgress.qualified, true);
    const pub = (await (await get(mf, '/api/clan-events')).json()).events[0]; assert.equal(pub.qualifiedCount, 1); assert.equal(pub.participantCount, 1); assert.equal(pub.myProgress, null); assert.equal(pub.participants, undefined); assert.equal(pub.joined, false); assert.equal(JSON.stringify(pub).includes(B), false);
    await flush(mf); const content = JSON.stringify(deliveries.at(-1).body); assert.match(content, /Minimum tijdens het event/); assert.match(content, /Hunter/); assert.match(content, /1 hebben het minimum behaald/);
  } finally { await mf.dispose(); }
});

test('Staff team can manage KC results and cancelled or unrestricted events reject results', async () => {
  const { mf } = runtime({ roles: ['1408990525180084265'] });
  try {
    const staff = await login(mf); const route = '/api/admin/clan-events/result';
    const event = await create(mf, staff, { minimum: { unit: 'kc', metric: 'vorkath', amount: 10 } });
    await post(mf, '/api/members/clan-events/register', { id: event.id, action: 'join' }, staff); await get(mf, `/__test/start?id=${event.id}&ended=1`);
    const result = { eventId: event.id, userId: A, revision: 0, gained: 10 };
    assert.equal((await post(mf, route, { ...result, gained: 10000001 }, staff)).status, 400);
    const saved = await post(mf, route, result, staff); assert.equal(saved.status, 200); assert.equal((await saved.json()).event.myProgress.qualified, true);
    const unrestricted = await create(mf, staff); await get(mf, `/__test/start?id=${unrestricted.id}`);
    assert.equal((await post(mf, route, { ...result, eventId: unrestricted.id }, staff)).status, 409);
    const input = { ...eventInput(), minimum: { unit: 'kc', metric: 'vorkath', amount: 10 } }; const planned = await create(mf, staff, input);
    assert.equal((await post(mf, '/api/admin/clan-events', { ...input, revision: planned.revision, status: 'cancelled' }, staff)).status, 200);
    await get(mf, `/__test/start?id=${planned.id}`);
    assert.equal((await post(mf, route, { ...result, eventId: planned.id }, staff)).status, 409);
  } finally { await mf.dispose(); }
});
