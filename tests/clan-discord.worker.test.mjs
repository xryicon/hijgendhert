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
async function create(mf, session) { const response = await post(mf, '/api/admin/clan-events', eventInput(), session); assert.equal(response.status, 200, await response.clone().text()); return (await response.json()).event; }
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
    first = runtime({ persist }); const session = await login(first.mf); const event = await create(first.mf, session);
    await post(first.mf, '/api/members/clan-events/register', { id: event.id, action: 'join' }, session);
    await first.mf.dispose(); first = null; second = runtime({ persist });
    const data = await (await get(second.mf, '/api/clan-events')).json(); assert.equal(data.events[0].id, event.id); assert.equal(data.events[0].participantCount, 1);
    const admin = await login(second.mf); const state = await (await get(second.mf, '/api/admin/discord', admin)).json(); assert.equal(state.settings.eventsEnabled, false);
  } finally { await first?.mf.dispose(); await second?.mf.dispose(); assert.ok(path.basename(persist).startsWith('hh-discord-sync-')); await rm(persist, { recursive: true, force: true }); }
});
