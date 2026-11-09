import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Exercise the same workerd runtime and bundler shipped with our pinned Wrangler.
// A mocked Node fetch alone cannot catch unsupported Worker Request options.
const requireWrangler = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare } = requireWrangler('miniflare');
const { build } = requireWrangler('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: {
    contents: `import { discordAuthRoute } from './lib/discord-auth.ts';
      import { memberProfileRoute } from './lib/member-profile.ts';
      import { readWiseOldMan } from './lib/wise-old-man.ts';
      import { GET as clanData } from './app/api/clan/route.ts';
      import { GET as eventData } from './app/api/event/route.ts';
      import { GET as hallData } from './app/api/hall-of-fame/route.ts';
      export default { async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/api/clan') return clanData(request);
        if (url.pathname === '/api/event') return eventData(request);
        if (url.pathname === '/api/hall-of-fame') return hallData(request);
        if (url.pathname === '/__test/public-wom') {
          try { return Response.json(await readWiseOldMan('/groups/7059', url.origin, { apiKey: url.searchParams.has('anonymous') ? undefined : env.WOM_API_KEY, freshFor: url.searchParams.has('short-cache') ? 300000 : undefined, now: Date.now() + Number(url.searchParams.get('age') || 0) })); }
          catch (error) { return Response.json({ unavailable: true, retryAfter: error.retryAfter, code: error.code }, { status: 503 }); }
        }
        return await discordAuthRoute(request, env) || await memberProfileRoute(request, env) || new Response('Public page');
      } };`,
    resolveDir: root,
    sourcefile: 'discord-auth-test-worker.ts',
    loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'neutral',
  target: 'es2022', external: ['node:crypto', 'cloudflare:workers'],
});
const env = {
  APP_ORIGIN: 'https://clan.example',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_CLIENT_SECRET: 'worker-test-client-secret-only',
  DISCORD_GUILD_ID: '1073630238115897455',
  DISCORD_MEMBER_ROLE_IDS: '1326459850837987430',
  DISCORD_SESSION_SECRET: randomBytes(32).toString('base64url'),
  WOM_API_KEY: 'worker-test-wom-api-key-only',
};
const user = { id: '234567890123456789', username: 'Clanmaat', global_name: 'Hert' };
const token = 'worker-test-access-token-only';
const testPlayer = { id: 701, username: 'hert', displayName: 'Hert', type: 'regular', exp: 200000000, ehp: 100, ehb: 200 };
const secondPlayer = { ...testPlayer, id: 702, username: 'ander hert', displayName: 'Ander Hert' };
const competition = { id: 123, groupId: 7059, title: 'Skill of the Week Hunter', metric: 'hunter', type: 'classic', startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-08T00:00:00Z', participantCount: 2 };
const cookie = (response, name) => response.headers.getSetCookie()
  .find(value => value.startsWith(`${name}=`))?.split(';')[0];

function runtime(options = {}) {
  const calls = [];
  const mf = new Miniflare({
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
    bindings: env,
    // Every outbound request is intercepted; no real accounts or network access.
    outboundService: async request => {
      const url = new URL(request.url);
      calls.push({ url: request.url, body: await request.text(), hasWomKey: request.headers.has('x-api-key') });
      if (url.origin === 'https://api.wiseoldman.net') {
        assert.equal(request.headers.has('Authorization'), false, 'Never send Discord tokens to WOM');
        if (request.headers.has('x-api-key')) assert.equal(request.headers.get('x-api-key'), env.WOM_API_KEY);
        if (options.womDelay) await new Promise(resolve => setTimeout(resolve, options.womDelay));
        if (options.womInvalidKey) return Response.json({ message: 'Invalid API Key. Please check https://docs.wiseoldman.net/api#rate-limits--api-keys' }, { status: 403 });
        if (options.requireWomKey && !request.headers.has('x-api-key')) return Response.json({}, { status: 403 });
        if (options.womRedirect) return new Response(null, { status: 302, headers: { Location: 'https://untrusted.invalid/capture' } });
        if (options.womOffline) return Response.json({}, { status: options.womStatus || 503, headers: { 'Retry-After': options.womRetryAfter || '60' } });
        if (url.pathname === '/v2/groups/7059') return Response.json({ id: 7059, memberCount: 2, homeworld: 489, memberships: [testPlayer, secondPlayer].map(player => ({ player })) });
        if (url.pathname === '/v2/groups/7059/competitions') return Response.json([competition]);
        if (url.pathname === '/v2/groups/7059/gained') return Response.json([{ player: testPlayer, data: { gained: 12345 } }]);
        if (url.pathname.endsWith('/competitions')) {
          const playerId = decodeURIComponent(url.pathname).includes('ander hert') ? 702 : 701;
          return Response.json([
            { playerId, competition },
            { playerId, competition: { ...competition, id: 124, groupId: 9999 } },
            { playerId: 999, competition: { ...competition, id: 125 } },
          ]);
        }
        if (url.pathname === '/v2/competitions/123') return Response.json({ ...competition, participations: [
          { playerId: 702, player: secondPlayer, progress: { gained: 2000 }, deltas: [{ metric: 'hunter', values: { gained: 2000 } }] },
          { playerId: 701, player: testPlayer, progress: { gained: 1000 }, deltas: [{ metric: 'hunter', values: { gained: 1000 } }] },
        ] });
        if (url.pathname === '/v2/competitions/124') return Response.json({ ...competition, id: 124, groupId: 9999, participations: [] });
        throw new Error('Unexpected WOM test request');
      }
      assert.equal(url.origin, 'https://discord.com', 'Never follow a provider redirect');
      assert.equal(request.headers.has('x-api-key'), false, 'Never send the WOM key to Discord');
      if (options.redirectAt && url.pathname.endsWith(options.redirectAt)) {
        return new Response(null, { status: options.redirectStatus, headers: { Location: 'https://untrusted.invalid/capture' } });
      }
      if (url.pathname.endsWith('/token/revoke')) return Response.json({});
      if (url.pathname.endsWith('/token')) return Response.json({
        access_token: token, refresh_token: 'worker-test-refresh-token-only', token_type: 'Bearer', expires_in: options.shortToken && new URLSearchParams(calls.at(-1).body).get('grant_type') === 'authorization_code' ? 1 : 604800,
        scope: 'identify guilds.members.read',
      });
      if (url.pathname.endsWith('/member')) {
        if (options.memberStatus) return Response.json({}, { status: options.memberStatus });
        return Response.json({ user, roles: options.roles ?? [env.DISCORD_MEMBER_ROLE_IDS], nick: 'Hert', joined_at: options.nullJoinDate ? null : '2025-01-01T00:00:00Z' });
      }
      if (url.pathname.endsWith('/users/@me')) return Response.json(user);
      throw new Error(`Unexpected test endpoint: ${url.pathname}`);
    },
  });
  return { mf, calls };
}

async function login(mf) {
  const start = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/discord`, { redirect: 'manual' });
  const authUrl = new URL(start.headers.get('Location'));
  const callback = new URL('/api/auth/discord/callback', env.APP_ORIGIN);
  callback.search = new URLSearchParams({
    code: 'worker-test-single-use-code', state: authUrl.searchParams.get('state'), iss: 'https://discord.com',
  }).toString();
  const finish = await mf.dispatchFetch(callback.toString(), {
    redirect: 'manual', headers: { Cookie: cookie(start, '__Host-hh-discord-state') },
  });
  return { authUrl, finish };
}

test('Cloudflare runtime completes Discord login, checks membership, and logs out', async () => {
  const { mf, calls } = runtime();
  try {
    const { authUrl, finish } = await login(mf);
    assert.equal(finish.headers.get('Location'), '/ledenomgeving');
    assert.equal(calls.length, 3);
    const form = new URLSearchParams(calls[0].body);
    assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'), authUrl.searchParams.get('code_challenge'));
    const sessionCookie = cookie(finish, '__Host-hh-member');
    assert.ok(sessionCookie && !sessionCookie.includes(token));
    const session = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/session`, { headers: { Cookie: sessionCookie } });
    assert.equal(session.status, 200);
    const body = await session.json();
    assert.equal(body.authenticated, true);
    assert.equal(body.member.id, user.id);
    assert.equal(body.member.displayName, 'Hert');
    assert.ok(body.member.expiresAt > Date.now());
    assert.ok(body.member.expiresAt > Date.now() + 29 * 24 * 60 * 60 * 1000);
    assert.ok(body.member.expiresAt <= Date.now() + 30 * 24 * 60 * 60 * 1000);
    assert.equal(body.member.accessToken, undefined);
    assert.equal(calls.length, 4, 'Recheck Discord roles for the member session');
    const logout = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/logout`, {
      method: 'POST', redirect: 'manual', headers: { Origin: env.APP_ORIGIN, Cookie: sessionCookie },
    });
    assert.equal(logout.headers.get('Location'), '/login?loggedOut=1');
    assert.ok(calls.at(-1).url.endsWith('/token/revoke'));
    assert.equal(cookie(logout, '__Host-hh-member'), '__Host-hh-member=');
  } finally { await mf.dispose(); }
});

test('public WOM data is reused across pages and remains available during rate limiting', async () => {
  const options = {};
  const { mf, calls } = runtime(options);
  try {
    const first = await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom`);
    assert.equal(first.status, 200);
    const initial = await first.json();
    const second = await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom`);
    assert.equal((await second.json()).stale, false);
    assert.equal(calls.filter(c => c.url.includes('api.wiseoldman.net')).length, 1);
    options.womOffline = true; options.womStatus = 429;
    const stale = await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom?age=600000&short-cache=1`);
    const data = await stale.json();
    assert.equal(stale.status, 200);
    assert.equal(data.stale, true);
    assert.equal(data.fetchedAt, initial.fetchedAt);
    assert.equal(data.data.id, 7059);
    await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom?age=600000&short-cache=1`);
    assert.equal(calls.filter(c => c.url.includes('api.wiseoldman.net')).length, 2, 'Cooldown prevents repeated rate-limited calls');
    assert.equal((await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom?age=90000000`)).status, 503, 'Old data expires after one day');
  } finally { await mf.dispose(); }
});

test('all website statistics routes use the WOM secret without exposing it', async () => {
  const { mf, calls } = runtime({ requireWomKey: true });
  try {
    for (const path of ['/api/clan?resource=group', '/api/clan?resource=gained', '/api/clan?resource=competitions', '/api/event?id=123&category=skill', '/api/hall-of-fame?month=2026-01']) {
      const result = await mf.dispatchFetch(env.APP_ORIGIN + path);
      const body = await result.json();
      assert.equal(result.status, 200, path);
      assert.equal(body.stale, false, path);
      assert.ok(!JSON.stringify(body).includes(env.WOM_API_KEY));
      assert.ok(!JSON.stringify([...result.headers]).includes(env.WOM_API_KEY));
      if (path.startsWith('/api/event')) assert.equal(body.data.competition.participants[0].gained, 2000);
      if (path.startsWith('/api/hall-of-fame')) assert.equal(body.data.awards[0].winners[0].gained, 2000);
    }
    const { finish } = await login(mf);
    const profile = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/profile`, { headers: { Cookie: cookie(finish, '__Host-hh-member') } });
    assert.equal(profile.status, 200);
    assert.ok(!JSON.stringify(await profile.json()).includes(env.WOM_API_KEY));
    assert.ok(calls.filter(c => c.url.includes('api.wiseoldman.net')).every(c => c.hasWomKey));
    assert.equal(calls.filter(c => c.url.includes('/v2/groups/7059/competitions')).length, 1, 'Events, calendar and hall share the same upstream listing');
  } finally { await mf.dispose(); }
});

test('WOM hourly cooldown is respected and a new API key has an independent quota', async () => {
  const options = { womOffline: true, womStatus: 429, womRetryAfter: '3600' };
  const { mf, calls } = runtime(options);
  try {
    const first = await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom?anonymous=1`);
    assert.equal(first.status, 503);
    assert.equal((await first.json()).retryAfter, 3600);
    const later = await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom?anonymous=1&age=600000`);
    const cooling = await later.json();
    assert.equal(later.status, 503);
    assert.ok(cooling.retryAfter > 2900, 'Do not shorten an hourly rate limit to five minutes');
    assert.equal(calls.length, 1);
    options.womOffline = false;
    const authenticated = await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom`);
    assert.equal(authenticated.status, 200, 'The newly added key must not inherit the anonymous quota');
    assert.equal((await authenticated.json()).stale, false);
    assert.equal(calls.length, 2);
  } finally { await mf.dispose(); }
});

test('WOM data refreshes after fifteen minutes and failures pause upstream retries', async () => {
  const options = {};
  const { mf, calls } = runtime(options);
  try {
    const first = await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom`);
    const initial = await first.json();
    options.womOffline = true;
    const stillFresh = await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom?age=600000`);
    assert.equal((await stillFresh.json()).stale, false);
    assert.equal(calls.length, 1, 'No upstream refresh at the former five-minute interval');
    const failedRefresh = await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom?age=960000`);
    const saved = await failedRefresh.json();
    assert.equal(saved.stale, true);
    assert.equal(saved.fetchedAt, initial.fetchedAt);
    assert.equal(calls.length, 2);
    await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom?age=1020000`);
    assert.equal(calls.length, 2, 'A timeout or outage must not trigger a burst of retries');
    options.womOffline = false;
    const recovered = await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom?age=1320000`);
    assert.equal((await recovered.json()).stale, false);
    assert.equal(calls.length, 3);
  } finally { await mf.dispose(); }
});

test('slow successful WOM responses have time to finish', async () => {
  const { mf } = runtime({ womDelay: 9000 });
  try {
    const result = await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom`);
    assert.equal(result.status, 200, 'A valid nine-second response must survive the former eight-second timeout');
    assert.equal((await result.json()).data.memberCount, 2);
  } finally { await mf.dispose(); }
});

test('an invalid WOM key is identified safely and retried less often', async () => {
  const { mf, calls } = runtime({ womInvalidKey: true });
  try {
    const result = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/clan?resource=group`);
    const body = await result.json();
    assert.equal(result.status, 503);
    assert.equal(body.code, 'WOM_API_KEY_INVALID');
    assert.equal(result.headers.get('Retry-After'), '900');
    assert.ok(!JSON.stringify(body).includes(env.WOM_API_KEY));
    const cooling = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/event?category=skill`);
    assert.equal(cooling.status, 503);
    assert.equal((await cooling.json()).code, 'WOM_API_KEY_INVALID');
    assert.equal(calls.length, 1, 'A rejected key must not be retried on every page load');
  } finally { await mf.dispose(); }
});

test('WOM redirects are refused without sending the API key elsewhere', async () => {
  const { mf, calls } = runtime({ womRedirect: true });
  try {
    assert.equal((await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/public-wom`)).status, 503);
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).origin, 'https://api.wiseoldman.net');
  } finally { await mf.dispose(); }
});

test('Cloudflare renews short-lived Discord tokens without another login', async () => {
  const { mf, calls } = runtime({ shortToken: true });
  try {
    const { finish } = await login(mf);
    assert.ok(finish.headers.getSetCookie().some(c => c.includes('Max-Age=2592000')));
    const session = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/session`, { headers: { Cookie: cookie(finish, '__Host-hh-member') } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).member.id, user.id);
    assert.ok(cookie(session, '__Host-hh-member'));
    const refresh = calls.find(c => new URLSearchParams(c.body).get('grant_type') === 'refresh_token');
    assert.ok(refresh);
    assert.equal(new URLSearchParams(refresh.body).get('refresh_token'), 'worker-test-refresh-token-only');
  } finally { await mf.dispose(); }
});

test('Cloudflare retains a renewed session while membership checks recover', async () => {
  const options = { shortToken: true };
  const { mf, calls } = runtime(options);
  try {
    const { finish } = await login(mf);
    options.memberStatus = 503;
    const outage = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/session`, { headers: { Cookie: cookie(finish, '__Host-hh-member') } });
    assert.equal(outage.status, 503);
    assert.deepEqual(await outage.json(), { authenticated: false, reason: 'unavailable' });
    const renewed = cookie(outage, '__Host-hh-member');
    assert.ok(renewed && renewed !== '__Host-hh-member=');
    assert.match(outage.headers.getSetCookie()[0], /HttpOnly; Secure; SameSite=Lax/);
    assert.equal((await mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/profile`, { headers: { Cookie: renewed } })).status, 503);
    options.memberStatus = undefined;
    const recovered = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/session`, { headers: { Cookie: renewed } });
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).member.id, user.id);
    assert.equal(calls.filter(c => new URLSearchParams(c.body).get('grant_type') === 'refresh_token').length, 1);
  } finally { await mf.dispose(); }
});

test('Discord members can sign in when the optional join date is null', async () => {
  const { mf } = runtime({ nullJoinDate: true });
  try {
    const { finish } = await login(mf);
    assert.equal(finish.headers.get('Location'), '/ledenomgeving');
    const session = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/session`, { headers: { Cookie: cookie(finish, '__Host-hh-member') } });
    assert.equal(session.status, 200);
    const body = await session.json();
    assert.equal(body.member.id, user.id);
    assert.equal(body.member.joinedAt, null);
  } finally { await mf.dispose(); }
});

test('member profiles retain the signed-in identity and show only that player’s clan events', async () => {
  const options = {};
  const { mf } = runtime(options);
  try {
    const { finish } = await login(mf);
    const sessionCookie = cookie(finish, '__Host-hh-member');
    const headers = { Cookie: sessionCookie };
    for (let i = 0; i < 3; i++) {
      const session = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/session`, { headers });
      const data = await session.json();
      assert.equal(data.member.displayName, 'Hert');
      assert.equal(data.member.username, 'Clanmaat');
      assert.equal(data.member.clanRole, 'Member');
      assert.equal(data.member.joinedAt, '2025-01-01T00:00:00Z');
    }
    const profileResponse = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/profile`, { headers });
    assert.ok(profileResponse.headers.get('Cache-Control').includes('no-store'));
    const profile = await profileResponse.json();
    assert.equal(profile.player.id, 701);
    assert.equal(profile.selection, 'discord');
    assert.deepEqual(profile.events.map(e => e.id), [123]);
    assert.equal(profile.events[0].gained, null, 'Never invent results from registration alone');
    const result = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/event?id=123`, { headers });
    const { event } = await result.json();
    assert.equal(event.gained, 1000);
    assert.equal(event.rank, 2);
    assert.equal(event.unit, 'XP');
    assert.equal((await mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/event?id=124`, { headers })).status, 404);
    options.roles = [];
    assert.equal((await mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/profile`, { headers })).status, 401, 'A cached public roster never bypasses the Discord role check');
  } finally { await mf.dispose(); }
});

test('profile account selection requires a live session, same-origin POST, and a clan account', async () => {
  const { mf, calls } = runtime();
  try {
    assert.equal((await mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/profile`)).status, 401);
    assert.equal(calls.length, 0);
    const { finish } = await login(mf);
    const sessionCookie = cookie(finish, '__Host-hh-member');
    const post = (body, origin = env.APP_ORIGIN) => mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/profile`, { method: 'POST', headers: { Cookie: sessionCookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ playerId: 702 }, 'https://evil.example')).status, 403);
    assert.equal((await post({ playerId: 999 })).status, 400);
    assert.equal((await post({ playerId: 702, extra: 'x'.repeat(2200) })).status, 400);
    const saved = await post({ playerId: 702 });
    assert.equal(saved.status, 200);
    const choice = cookie(saved, '__Host-hh-profile');
    assert.match(choice, /^__Host-hh-profile=v1\./);
    const selected = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/profile`, { headers: { Cookie: `${sessionCookie}; ${choice}` } });
    assert.equal((await selected.json()).player.id, 702);
    assert.equal((await mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/profile`, { headers: { Cookie: choice } })).status, 401, 'A profile preference is never a login credential');
    const tampered = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/profile`, { headers: { Cookie: `${sessionCookie}; ${choice}tampered` } });
    assert.equal((await tampered.json()).player.id, 701);
  } finally { await mf.dispose(); }
});

test('a Wise Old Man outage does not clear or invalidate a Discord session', async () => {
  const { mf } = runtime({ womOffline: true });
  try {
    const { finish } = await login(mf);
    const headers = { Cookie: cookie(finish, '__Host-hh-member') };
    const profile = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/members/profile`, { headers });
    assert.equal(profile.status, 503);
    assert.equal(profile.headers.getSetCookie().length, 0);
    const session = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/session`, { headers });
    assert.equal((await session.json()).authenticated, true);
  } finally { await mf.dispose(); }
});

test('Cloudflare runtime refuses provider redirects without forwarding credentials', async () => {
  for (const redirectAt of ['/token', '/member']) {
    for (const redirectStatus of [301, 302, 303, 307, 308]) {
      const { mf, calls } = runtime({ redirectAt, redirectStatus });
      try {
        const { finish } = await login(mf);
        const errorUrl = new URL(finish.headers.get('Location'), env.APP_ORIGIN);
        assert.equal(errorUrl.pathname, '/login');
        assert.equal(errorUrl.searchParams.get('error'), 'unavailable');
        assert.equal(errorUrl.searchParams.get('ref'), `HH-${redirectAt === '/token' ? 'TOKEN' : 'MEMBER'}-REDIRECT${redirectStatus}`);
        assert.equal(cookie(finish, '__Host-hh-member'), '__Host-hh-member=');
        assert.equal(calls.length, redirectAt === '/token' ? 1 : 3);
        assert.ok(calls.every(call => new URL(call.url).origin === 'https://discord.com'));
        if (redirectAt === '/member') assert.ok(calls.at(-1).url.endsWith('/token/revoke'));
      } finally { await mf.dispose(); }
    }
  }
});
