import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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
  export { ClanRaffle } from './worker/clan-raffle.ts';
  import { discordAuthRoute } from './lib/discord-auth.ts';
  import { notificationRoute } from './lib/notification-route.ts';
  export default { async fetch(request, env) {
    // Test-only RPC fixture; these endpoints are absent from the production Worker.
    if (new URL(request.url).pathname === '/__test/notification-source') {
      const store = env.PROGRESS.getByName('clan:7059:notifications');
      const body = request.method === 'POST' ? await request.json() : {};
      return Response.json(await store.syncNotifications(body.updates, body.checkedAt));
    }
    if (new URL(request.url).pathname === '/__test/raffle') {
      const store = env.RAFFLES.getByName('clan:7059');
      if (request.method === 'GET') return Response.json(await store.getNotificationRounds());
      const body = await request.json();
      return Response.json(body.op === 'cancel'
        ? await store.cancel(body.input)
        : await store.schedule(body.input, 'private-creator-fixture'));
    }
    return await discordAuthRoute(request, env) || await notificationRoute(request, env) || new Response('Not found', { status: 404 });
  }};`, resolveDir: root, loader: 'ts', sourcefile: 'notifications-test-worker.ts' }, bundle: true, write: false, platform: 'neutral', format: 'esm', target: 'es2022', external: ['cloudflare:workers', 'node:crypto'] });
const env = {
  APP_ORIGIN: 'https://clan.example', DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_CLIENT_SECRET: 'notification-tests-only', DISCORD_GUILD_ID: '1073630238115897455',
  DISCORD_MEMBER_ROLE_IDS: '1326459850837987430', DISCORD_SESSION_SECRET: randomBytes(32).toString('base64url'),
  WOM_AUTH_MODE: 'public',
};
const users = {
  a: { id: '234567890123456789', username: 'discord-user-a' },
  b: { id: '334567890123456789', username: 'discord-user-b' },
};
const now = Date.now();
const competitions = [41, 42].map(id => ({
  id, groupId: 7059, title: `Clan notification test ${id}`, metric: 'vorkath', participantCount: 2,
  createdAt: new Date(now - 60_000).toISOString(),
  startsAt: new Date(now + 3_600_000).toISOString(), endsAt: new Date(now + 7_200_000).toISOString(),
}));
function runtime(options = {}) {
  const calls = [];
  const mf = new Miniflare({
    modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], bindings: env,
    durableObjects: { PROGRESS: { className: 'ClanProgress', useSQLite: true }, RAFFLES: { className: 'ClanRaffle', useSQLite: true } },
    ...(options.persist ? { durableObjectsPersist: options.persist } : {}),
    outboundService: async request => {
      const url = new URL(request.url); calls.push(url.href);
      if (url.origin === 'https://discord.com') {
        if (url.pathname.endsWith('/token')) {
          const code = new URLSearchParams(await request.text()).get('code');
          assert.ok(code === 'a' || code === 'b');
          return Response.json({ access_token: `notification-access-${code}`, refresh_token: `notification-refresh-${code}`, token_type: 'Bearer', expires_in: 604800, scope: 'identify guilds.members.read' });
        }
        const key = request.headers.get('Authorization')?.endsWith('-b') ? 'b' : 'a';
        const user = users[key];
        if (url.pathname.endsWith('/users/@me')) return Response.json(user);
        if (url.pathname.endsWith('/member')) return options.discordOffline ? Response.json({}, { status: 503 })
          : Response.json({ user, roles: options.roles ?? [env.DISCORD_MEMBER_ROLE_IDS], pending: false });
      }
      assert.equal(url.origin, 'https://api.wiseoldman.net');
      assert.equal(url.pathname, '/v2/groups/7059/competitions');
      return options.womOffline ? Response.json({}, { status: 503 }) : Response.json([...competitions, competitions[0]]);
    },
  });
  return { mf, calls };
}
const cookie = (response, name) => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0];
async function login(mf, user = 'a') {
  const start = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/discord`, { redirect: 'manual' });
  const authUrl = new URL(start.headers.get('Location'));
  const finish = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/discord/callback?${new URLSearchParams({ code: user, state: authUrl.searchParams.get('state'), iss: 'https://discord.com' })}`, {
    redirect: 'manual', headers: { Cookie: cookie(start, '__Host-hh-discord-state') },
  });
  assert.equal(finish.status, 303);
  const session = cookie(finish, '__Host-hh-member');
  assert.ok(session && session !== '__Host-hh-member=');
  return session;
}
const notifications = (mf, session, query = '') => mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/notifications${query}`, { headers: session ? { Cookie: session } : {} });
const markRead = (mf, session, ids, options = {}) => mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/notifications${options.query || ''}`, {
  method: 'POST', headers: { Cookie: session, Origin: env.APP_ORIGIN, 'Content-Type': 'application/json', ...options.headers }, body: JSON.stringify({ ids, ...options.body }),
});
async function feed(mf, session, query = '') {
  const response = await notifications(mf, session, query);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /private.*no-store/);
  return response.json();
}
const womCalls = calls => calls.filter(url => url.startsWith('https://api.wiseoldman.net/'));
async function withPersistentRuntime(run) {
  const persist = await mkdtemp(path.join(tmpdir(), 'hh-notifications-'));
  let mf = null;
  const start = async options => {
    if (mf) { await mf.dispose(); mf = null; }
    const state = runtime({ ...options, persist }); mf = state.mf;
    return state;
  };
  try { await run(start); }
  finally {
    if (mf) await mf.dispose();
    assert.equal(path.dirname(path.resolve(persist)), path.resolve(tmpdir()));
    assert.ok(path.basename(persist).startsWith('hh-notifications-'));
    await rm(persist, { recursive: true, force: true });
  }
}
async function schedule(mf, title = 'Fresh raffle notification') {
  const response = await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/raffle`, {
    method: 'POST', body: JSON.stringify({ input: { requestId: randomUUID(), title, prize: 'Clan prize', freeEntry: true,
      drawAt: Date.now() + 3_600_000, entries: [{ name: 'Private entry fixture', tickets: 5 }] } }),
  });
  const result = await response.json(); assert.equal(result.ok, true);
  return result.round;
}

test('anonymous and cross-site notification requests never fetch clan sources', async () => {
  const { mf, calls } = runtime();
  try {
    assert.equal((await notifications(mf)).status, 401);
    assert.equal((await mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/notifications`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await mf.dispatchFetch('https://elsewhere.example/api/members/notifications')).status, 403);
    assert.equal(calls.length, 0);
  } finally { await mf.dispose(); }
});

test('revoked Discord roles and provider outages cannot expose a saved notification feed', async () => {
  const options = {};
  const { mf, calls } = runtime(options);
  try {
    const session = await login(mf);
    assert.ok((await feed(mf, session)).notifications.length > 0);
    const count = womCalls(calls).length;
    options.roles = [];
    assert.equal((await notifications(mf, session)).status, 401);
    assert.equal((await markRead(mf, session, ['arbitrary-id'])).status, 401);
    options.roles = [env.DISCORD_MEMBER_ROLE_IDS]; options.discordOffline = true;
    const unavailable = await notifications(mf, session);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get('Retry-After'), '60');
    assert.equal(unavailable.headers.get('Set-Cookie'), null);
    assert.equal(womCalls(calls).length, count);
  } finally { await mf.dispose(); }
});

test('read updates require same-origin POST and use authenticated identity, never supplied user ids', async () => {
  const { mf } = runtime();
  try {
    const a = await login(mf); const b = await login(mf, 'b');
    const id = (await feed(mf, a)).notifications[0].id;
    for (const headers of [{ Origin: 'https://evil.example' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }])
      assert.equal((await markRead(mf, a, [id], { headers })).status, 403);
    assert.equal((await markRead(mf, a, [id], { body: { userId: users.b.id } })).status, 400);
    const marked = await markRead(mf, a, [id, 'unknown-notification'], { query: `?userId=${users.b.id}` });
    assert.equal(marked.status, 200);
    assert.deepEqual((await marked.json()).readIds, [id]);
    assert.equal((await feed(mf, a)).notifications.find(item => item.id === id).read, true);
    assert.equal((await feed(mf, b, `?userId=${users.a.id}`)).notifications.find(item => item.id === id).read, false);
  } finally { await mf.dispose(); }
});

test('concurrent read updates form a durable union isolated by Discord account after restart', async () => {
  await withPersistentRuntime(async start => {
    let { mf } = await start();
    const a = await login(mf); const b = await login(mf, 'b');
    const initial = await feed(mf, a);
    const ids = competitions.map(event => `event:${event.id}:new`);
    for (const id of ids) assert.ok(initial.notifications.some(item => item.id === id));
    const writes = await Promise.all(ids.map(id => markRead(mf, a, [id])));
    for (const response of writes) assert.equal(response.status, 200);
    ({ mf } = await start({ womOffline: true }));
    const restored = await feed(mf, a); const other = await feed(mf, b);
    for (const id of ids) {
      assert.equal(restored.notifications.find(item => item.id === id)?.read, true);
      assert.equal(other.notifications.find(item => item.id === id)?.read, false);
    }
    assert.equal(restored.unreadCount, restored.notifications.filter(item => !item.read).length);
    assert.equal(other.unreadCount, other.notifications.length);
  });
});

test('duplicate source rows and repeated polls keep notification ids stable without new unread items', async () => {
  const { mf } = runtime();
  try {
    const session = await login(mf);
    const first = await feed(mf, session);
    const ids = first.notifications.map(item => item.id);
    assert.ok(ids.length >= 2); assert.equal(new Set(ids).size, ids.length);
    for (const event of competitions) assert.ok(ids.includes(`event:${event.id}:new`));
    assert.equal((await markRead(mf, session, ids)).status, 200);
    const again = await feed(mf, session);
    assert.deepEqual(again.notifications.map(item => item.id), ids);
    assert.equal(again.unreadCount, 0);
    assert.ok(again.notifications.every(item => item.read));
  } finally { await mf.dispose(); }
});

test('a WOM outage preserves stored events while an independent raffle source adds a fresh announcement', async () => {
  await withPersistentRuntime(async start => {
    let { mf } = await start();
    const session = await login(mf);
    const previous = await feed(mf, session);
    const ids = previous.notifications.map(item => item.id);
    assert.ok(ids.includes('event:41:new'));
    ({ mf } = await start({ womOffline: true }));
    await schedule(mf);
    const duringOutage = await feed(mf, session);
    assert.equal(duringOutage.stale, true);
    assert.ok(duringOutage.unavailableSources.includes('events'));
    assert.ok(!duringOutage.unavailableSources.includes('loterijen'));
    for (const id of ids) assert.ok(duringOutage.notifications.some(item => item.id === id));
    assert.ok(duringOutage.notifications.some(item => JSON.stringify(item).includes('Fresh raffle notification')));
    assert.ok(duringOutage.notifications.length > previous.notifications.length);
  });
});

test('actual raffle announcement RPC whitelists fields for scheduled and completed records', async () => {
  const { mf } = runtime();
  try {
    const scheduled = await schedule(mf, 'Scheduled notification fixture');
    assert.equal(scheduled.entries[0].name, 'Private entry fixture');
    const cancelled = await (await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/raffle`, { method: 'POST', body: JSON.stringify({ op: 'cancel', input: { id: scheduled.id, reason: 'Test cancellation' } }) })).json();
    assert.equal(cancelled.ok, true); assert.match(cancelled.round.seed, /^[a-f0-9]{64}$/);
    await schedule(mf, 'Second scheduled fixture');
    const rows = await (await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/raffle`)).json();
    assert.equal(rows.length, 2);
    assert.deepEqual(new Set(rows.map(row => row.status)), new Set(['scheduled', 'cancelled']));
    for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'drawAt', 'id', 'prize', 'status', 'title']);
    const serialized = JSON.stringify(rows);
    for (const secret of [cancelled.round.seed, 'private-creator-fixture', 'Private entry fixture', 'entriesHash', 'commitment', 'requestId', 'inputHash']) assert.ok(!serialized.includes(secret));
  } finally { await mf.dispose(); }
});

test('a late older source snapshot cannot restore an obsolete start while an independent raffle update succeeds', async () => {
  await withPersistentRuntime(async start => {
    let { mf } = await start();
    const checkedAt = Date.now();
    const current = { ...competitions[0], title: 'Current postponed event',
      startsAt: new Date(checkedAt + 86_400_000).toISOString(), endsAt: new Date(checkedAt + 90_000_000).toISOString() };
    const synchronize = async (updates, timestamps) => {
      const response = await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/notification-source`, {
        method: 'POST', body: JSON.stringify({ updates, checkedAt: timestamps }),
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    const initial = await synchronize({ competitions: [current] }, { competitions: checkedAt });
    assert.deepEqual(initial.map(item => item.id), ['event:41:new']);
    // Restart also proves the accepted source version is durable, not an isolate-only guard.
    ({ mf } = await start());
    const obsolete = { ...current, title: 'Obsolete event schedule',
      startsAt: new Date(checkedAt - 60_000).toISOString(), endsAt: new Date(checkedAt + 3_600_000).toISOString() };
    const freshRaffle = { id: 'fresh-independent-round', title: 'Fresh independent raffle', prize: 'Clan prize', status: 'scheduled',
      createdAt: checkedAt, drawAt: checkedAt + 3_600_000 };
    const result = await synchronize({ competitions: [obsolete], raffles: [freshRaffle] },
      { competitions: checkedAt - 10_000, raffles: Date.now() });
    assert.deepEqual(new Set(result.map(item => item.id)), new Set(['event:41:new', 'raffle:fresh-independent-round:new']));
    const event = result.find(item => item.id === 'event:41:new');
    assert.equal(event.href, initial[0].href);
    assert.equal(event.detail, initial[0].detail);
    assert.ok(!result.some(item => item.kind === 'event_start' || item.kind === 'calendar_update'));
    assert.ok(result.some(item => item.detail.includes('Fresh independent raffle')));
    // A source-free read derives start notifications from the retained schedule.
    const derived = await (await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/notification-source`)).json();
    assert.deepEqual(derived, result);
  });
});
