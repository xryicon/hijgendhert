import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { build } = createRequire(import.meta.resolve('wrangler/package.json'))('esbuild');
// Bundle the same extensionless TypeScript imports used by the Worker.
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../lib/discord-auth.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022' });
const { authorizeMember, checkMembership, discordAuthRoute, discordConfig, discordInteraction, seal, playerPreferenceCookie, readPlayerPreference } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const env = {
  APP_ORIGIN: 'https://clan.example', DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_CLIENT_SECRET: 'a-unit-test-client-secret-only', DISCORD_GUILD_ID: '1073630238115897455',
  DISCORD_MEMBER_ROLE_IDS: '1326459850837987430', DISCORD_SESSION_SECRET: randomBytes(32).toString('base64url'),
};
const config = discordConfig(env);
const user = { id: '234567890123456789', username: 'Clanmaat', global_name: 'Hert' };
const token = 'fake-access-token-for-tests-only';
const refreshToken = 'fake-refresh-token-for-tests-only';
const req = (path, init) => new Request(`${env.APP_ORIGIN}${path}`, init);
const getCookie = (response, name) => response.headers.getSetCookie().find(cookie => cookie.startsWith(`${name}=`))?.split(';')[0];
const response = (body, status = 200) => Response.json(body, { status });

function provider(options = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.redirect, 'manual');
    assert.equal(init.cache, 'no-store');
    if (url.endsWith('/token/revoke')) return response({}, options.revokeStatus || 200);
    if (url.endsWith('/token')) return response({ access_token: token, refresh_token: refreshToken, token_type: 'Bearer', expires_in: 604800, scope: options.scopes || 'identify guilds.members.read' });
    if (url.endsWith(`/guilds/${env.DISCORD_GUILD_ID}/member`)) return response({ user: options.user || user, roles: options.roles ?? [env.DISCORD_MEMBER_ROLE_IDS], pending: options.pending || false, nick: 'Het Hert' }, options.status || 200);
    if (url.endsWith('/users/@me')) return response(user);
    throw Error(`Unexpected endpoint: ${url}`);
  };
  return { calls, fetcher };
}
async function flow(options = {}) {
  const mock = provider(options);
  const start = await discordAuthRoute(req('/api/auth/discord'), env, mock.fetcher);
  const authUrl = new URL(start.headers.get('Location'));
  const stateCookie = getCookie(start, '__Host-hh-discord-state');
  const finish = await discordAuthRoute(req(`/api/auth/discord/callback?code=single-use-code&state=${authUrl.searchParams.get('state')}&iss=https%3A%2F%2Fdiscord.com`, { headers: { Cookie: stateCookie } }), env, mock.fetcher);
  return { ...mock, start, authUrl, stateCookie, finish, sessionCookie: getCookie(finish, '__Host-hh-member') };
}

test('configuration fails closed without exact role IDs, HTTPS and a 256-bit key', () => {
  assert.ok(config);
  for (const patch of [{ DISCORD_MEMBER_ROLE_IDS: '' }, { DISCORD_MEMBER_ROLE_IDS: 'Member' }, { DISCORD_MEMBER_ROLE_IDS: env.DISCORD_GUILD_ID }, { APP_ORIGIN: 'http://clan.example' }, { APP_ORIGIN: 'https://clan.example/evil' }, { DISCORD_SESSION_SECRET: 'weak-password' }, { DISCORD_CLIENT_ID: '' }]) {
    assert.equal(discordConfig({ ...env, ...patch }), null);
  }
});

test('public paths are unaffected and unconfigured login never grants access', async () => {
  assert.equal(await discordAuthRoute(req('/events'), {}), null);
  const status = await discordAuthRoute(req('/api/auth/session'), {});
  assert.equal(status.status, 503);
  assert.equal((await status.json()).authenticated, false);
  assert.equal((await discordAuthRoute(req('/api/auth/discord'), {})).headers.get('Location'), '/login?error=setup');
});

test('profile choices are encrypted, expire, and cannot be reused by a different Discord member', async () => {
  const saved = (await playerPreferenceCookie(config, user.id, 701)).split(';')[0];
  const request = req('/api/members/profile', { headers: { Cookie: saved } });
  assert.equal(await readPlayerPreference(request, config, user.id), 701);
  assert.equal(await readPlayerPreference(request, config, '345678901234567890'), null);
  assert.equal(await readPlayerPreference(request, config, user.id, Date.now() + 366 * 86400000), null);
  const forged = await seal(config, 'session', { userId: user.id, playerId: 701, expiresAt: Date.now() + 10000 });
  assert.equal(await readPlayerPreference(req('/api/members/profile', { headers: { Cookie: `__Host-hh-profile=${forged}` } }), config, user.id), null);
});

test('full login binds PKCE, state, exact origin and current member identity', async () => {
  const flowResult = await flow();
  const { authUrl, calls, finish, sessionCookie } = flowResult;
  assert.equal(authUrl.origin, 'https://discord.com');
  assert.equal(authUrl.searchParams.get('scope'), 'identify guilds.members.read');
  assert.equal(authUrl.searchParams.get('redirect_uri'), `${env.APP_ORIGIN}/api/auth/discord/callback`);
  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
  const tokenBody = calls.find(call => call.url.endsWith('/token')).init.body;
  assert.equal(createHash('sha256').update(tokenBody.get('code_verifier')).digest('base64url'), authUrl.searchParams.get('code_challenge'));
  assert.equal(finish.status, 303);
  assert.equal(finish.headers.get('Location'), '/ledenomgeving');
  const header = finish.headers.getSetCookie().find(value => value.startsWith('__Host-hh-member='));
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000']) assert.ok(header.includes(flag));
  assert.ok(!header.includes('Domain='));
  assert.ok(!sessionCookie.includes(token));
  const member = await authorizeMember(req('/ledenomgeving', { headers: { Cookie: sessionCookie } }), config, provider().fetcher);
  assert.equal(member.id, user.id);
  assert.equal(member.displayName, 'Het Hert');
  assert.ok(!('accessToken' in member));
});

test('missing, altered, expired, duplicate and cross-browser state never calls Discord', async () => {
  const started = await discordAuthRoute(req('/api/auth/discord'), env);
  const nonce = new URL(started.headers.get('Location')).searchParams.get('state');
  const cookie = getCookie(started, '__Host-hh-discord-state');
  const expired = await seal(config, 'state', { nonce, verifier: 'a'.repeat(43), expiresAt: Date.now() - 1000 });
  const noFetch = async () => { throw Error('Must not call Discord'); };
  for (const [state, cookieValue] of [[nonce, ''], ['b'.repeat(43), cookie], [nonce, `${cookie}x`], [nonce, `__Host-hh-discord-state=${expired}`], [`${nonce}&state=${nonce}`, cookie]]) {
    const result = await discordAuthRoute(req(`/api/auth/discord/callback?code=bad&state=${state}`, { headers: { Cookie: cookieValue } }), env, noFetch);
    assert.equal(result.headers.get('Location'), '/login?error=state');
    assert.ok(result.headers.get('Cache-Control').includes('no-store'));
  }
});

test('issuer substitution, cross-origin start and cross-site start are rejected', async () => {
  const started = await discordAuthRoute(req('/api/auth/discord'), env);
  const nonce = new URL(started.headers.get('Location')).searchParams.get('state');
  const result = await discordAuthRoute(req(`/api/auth/discord/callback?code=bad&state=${nonce}&iss=https://evil.example`, { headers: { Cookie: getCookie(started, '__Host-hh-discord-state') } }), env);
  assert.equal(result.headers.get('Location'), '/login?error=state');
  assert.equal((await discordAuthRoute(new Request('https://evil.example/api/auth/discord'), env)).status, 403);
  assert.equal((await discordAuthRoute(req('/api/auth/discord', { headers: { 'Sec-Fetch-Site': 'cross-site' } }), env)).status, 403);
});

test('missing role, incomplete membership and insufficient scopes issue no session and revoke token', async () => {
  for (const [options, expected] of [[{ roles: [] }, 'role'], [{ pending: true }, 'pending'], [{ status: 404 }, 'server'], [{ scopes: 'identify' }, 'role']]) {
    const result = await flow(options);
    assert.equal(result.finish.headers.get('Location'), `/login?error=${expected}`);
    assert.equal(result.sessionCookie, '__Host-hh-member=');
    assert.ok(result.calls.some(call => call.url.endsWith('/token/revoke')));
  }
});

test('roles and identity are checked afresh, never taken from an old session', async () => {
  const { sessionCookie } = await flow();
  const request = req('/ledenomgeving', { headers: { Cookie: sessionCookie } });
  await authorizeMember(request, config, provider().fetcher);
  for (const [options, code] of [[{ roles: [] }, 'role'], [{ status: 404 }, 'server'], [{ pending: true }, 'pending'], [{ status: 401 }, 'expired'], [{ user: { ...user, id: '345678901234567890' } }, 'expired']]) {
    await assert.rejects(authorizeMember(request, config, provider(options).fetcher), error => error.code === code);
  }
});

test('Member, Admin and Staff team each independently grant access; unrelated roles do not', async () => {
  const roles = ['1326459850837987430', '1197327572720169030', '1408990525180084265'];
  const roleConfig = discordConfig({ ...env, DISCORD_MEMBER_ROLE_IDS: roles.join(',') });
  const { sessionCookie } = await flow();
  const request = req('/ledenomgeving', { headers: { Cookie: sessionCookie } });
  for (const role of roles) {
    const member = await authorizeMember(request, roleConfig, provider({ roles: [role] }).fetcher);
    assert.equal(member.id, user.id);
  }
  await assert.rejects(authorizeMember(request, roleConfig, provider({ roles: ['345678901234567890'] }).fetcher), error => error.code === 'role');
});

test('rate limits, malformed responses and outages fail closed without cached role access', async () => {
  for (const status of [429, 500, 503]) await assert.rejects(checkMembership(config, token, provider({ status }).fetcher), error => error.code === 'unavailable');
  await assert.rejects(checkMembership(config, token, async () => { throw Error('Offline'); }), error => error.code === 'unavailable');
  await assert.rejects(checkMembership(config, token, async () => response({ roles: 'Member' })), error => error.code === 'unavailable');
  const { sessionCookie } = await flow();
  const result = await discordAuthRoute(req('/api/auth/session', { headers: { Cookie: sessionCookie } }), env, provider({ status: 429 }).fetcher);
  assert.equal(result.status, 503);
  assert.equal((await result.json()).authenticated, false);
  assert.equal(result.headers.getSetCookie().length, 0); // outage does not destroy a valid cookie
});

test('Discord cooldown reaches the browser without clearing its session or exposing provider data', async () => {
  const { sessionCookie } = await flow();
  for (const [header, body, minimum] of [
    ['3600.25', { message: 'sensitive upstream detail', retry_after: 2 }, 3601],
    [null, { retry_after: 7200.5, message: 'sensitive upstream detail' }, 7201],
    [new Date(Date.now() + 3600_000).toUTCString(), {}, 3598],
    ['invalid', { retry_after: -1 }, 60],
  ]) {
    let calls = 0;
    const limited = await discordAuthRoute(req('/api/auth/session', { headers: { Cookie: sessionCookie } }), env, async () => {
      calls += 1;
      return Response.json(body, { status: 429, headers: header ? { 'Retry-After': header } : {} });
    });
    assert.equal(calls, 1);
    assert.equal(limited.status, 503);
    assert.ok(Number(limited.headers.get('Retry-After')) >= minimum);
    assert.deepEqual(await limited.json(), { authenticated: false, reason: 'unavailable', reference: 'HH-SESSION-HTTP429' });
    assert.equal(limited.headers.getSetCookie().length, 0);
    assert.match(limited.headers.get('Cache-Control'), /no-store/);
  }
});

test('temporary callback failure preserves an existing session cookie while withholding new access', async () => {
  const started = await discordAuthRoute(req('/api/auth/discord'), env);
  const nonce = new URL(started.headers.get('Location')).searchParams.get('state');
  const { sessionCookie } = await flow();
  const result = await discordAuthRoute(req(`/api/auth/discord/callback?code=retry-code&state=${nonce}`, { headers: { Cookie: `${getCookie(started, '__Host-hh-discord-state')}; ${sessionCookie}` } }), env, async () => Response.json({ message: 'provider detail' }, { status: 503 }));
  assert.equal(result.headers.get('Location'), '/login?error=unavailable&ref=HH-TOKEN-HTTP503');
  assert.ok(result.headers.getSetCookie().some(value => value.startsWith('__Host-hh-discord-state=;')));
  assert.ok(!result.headers.getSetCookie().some(value => value.startsWith('__Host-hh-member=')));
});

test('oversized Discord JSON is bounded and reported without granting access', async () => {
  await assert.rejects(checkMembership(config, token, async () => response({ user, roles: [env.DISCORD_MEMBER_ROLE_IDS], oversized: 'x'.repeat(70_000) })), error => error.code === 'unavailable' && error.detail === 'JSON');
});

test('expired, malformed, tampered, wrong-purpose and rotated-key cookies are refused before provider calls', async () => {
  const { sessionCookie, stateCookie } = await flow();
  const expired = await seal(config, 'session', { accessToken: token, userId: user.id, expiresAt: Date.now() - 1 });
  const malformed = await seal(config, 'session', { userId: user.id, roles: [env.DISCORD_MEMBER_ROLE_IDS] });
  const wrongApp = await seal({ ...config, clientId: '345678901234567890' }, 'session', { accessToken: token, userId: user.id, expiresAt: Date.now() + 50000 });
  for (const value of ['__Host-hh-member=abc', `${sessionCookie}tampered`, `__Host-hh-member=${expired}`, `__Host-hh-member=${malformed}`, `__Host-hh-member=${wrongApp}`, stateCookie.replace('__Host-hh-discord-state=', '__Host-hh-member='), `${sessionCookie}; ${sessionCookie}`]) {
    let calls = 0;
    await assert.rejects(authorizeMember(req('/ledenomgeving', { headers: { Cookie: value } }), config, async () => { calls++; return response({}); }), error => error.code === 'expired');
    assert.equal(calls, 0);
  }
  await assert.rejects(authorizeMember(req('/ledenomgeving', { headers: { Cookie: sessionCookie } }), { ...config, sessionSecret: randomBytes(32).toString('base64url') }), error => error.code === 'expired');
});

test('returning members renew expired access tokens within the original 30-day session', async () => {
  const expiresAt = Date.now() + 20 * 86400000;
  const encrypted = await seal(config, 'session', { accessToken: 'expired-test-access-token', refreshToken, accessExpiresAt: Date.now() - 1000, userId: user.id, expiresAt });
  const request = req('/api/auth/session', { headers: { Cookie: `__Host-hh-member=${encrypted}` } });
  const mock = provider();
  const renewed = await discordAuthRoute(request, env, mock.fetcher);
  assert.equal(renewed.status, 200);
  const body = await renewed.json();
  assert.equal(body.member.expiresAt, expiresAt, 'Renewal never extends the absolute sign-in deadline');
  assert.equal(mock.calls[0].init.body.get('grant_type'), 'refresh_token');
  assert.equal(mock.calls[0].init.body.get('refresh_token'), refreshToken);
  assert.equal(mock.calls[1].init.headers.Authorization, `Bearer ${token}`);
  const saved = getCookie(renewed, '__Host-hh-member');
  assert.ok(saved && !saved.includes(token) && !saved.includes(refreshToken));
  assert.ok(!JSON.stringify(body).includes(refreshToken));
  const again = await discordAuthRoute(req('/api/auth/session', { headers: { Cookie: saved } }), env, mock.fetcher);
  assert.equal(again.status, 200);
  assert.equal(mock.calls.filter(c => c.url.endsWith('/token')).length, 1);
  const denied = await discordAuthRoute(request, env, provider({ roles: [] }).fetcher);
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).reason, 'role');
  assert.equal(getCookie(denied, '__Host-hh-member'), '__Host-hh-member=');
  for (const status of [400, 401, 429, 503]) {
    const failed = await discordAuthRoute(request, env, async () => response({}, status));
    assert.equal(failed.status, status < 429 ? 401 : 503);
    assert.equal(failed.headers.get('Set-Cookie'), null, 'Failed or racing refresh must not overwrite a newer cookie');
  }
  const expired = await seal(config, 'session', { accessToken: token, refreshToken, accessExpiresAt: Date.now() - 1000, userId: user.id, expiresAt: Date.now() - 1 });
  let calls = 0;
  const deniedExpired = await discordAuthRoute(req('/api/auth/session', { headers: { Cookie: `__Host-hh-member=${expired}` } }), env, async () => { calls++; return response({}); });
  assert.equal(deniedExpired.status, 401);
  assert.equal(calls, 0);
});

test('rotated credentials survive a temporary membership outage without granting access', async () => {
  for (const failure of [429, 503, 'network', 'invalid-data']) {
    const expiresAt = Date.now() + 20 * 24 * 60 * 60 * 1000;
    const encrypted = await seal(config, 'session', { accessToken: 'expired-test-access-token', refreshToken, accessExpiresAt: Date.now() - 1000, userId: user.id, expiresAt });
    let offline = true;
    let tokenRequests = 0;
    let allowed = true;
    const rotatedAccess = 'rotated-access-token-for-tests-only';
    const rotatedRefresh = 'rotated-refresh-token-for-tests-only';
    const fetcher = async (url, init) => {
      if (url.endsWith('/token')) {
        tokenRequests++;
        // A provider may invalidate the previous refresh token on exchange.
        if (tokenRequests > 1) return response({ error: 'invalid_grant' }, 400);
        return response({ access_token: rotatedAccess, refresh_token: rotatedRefresh, token_type: 'Bearer', expires_in: 604800, scope: 'identify guilds.members.read' });
      }
      assert.ok(url.endsWith('/member'));
      assert.equal(init.headers.Authorization, `Bearer ${rotatedAccess}`);
      if (offline) {
        if (failure === 'network') throw new Error('Temporary test outage');
        return response({}, failure === 'invalid-data' ? 200 : failure);
      }
      return response({ user, roles: allowed ? [env.DISCORD_MEMBER_ROLE_IDS] : [] });
    };
    const unavailable = await discordAuthRoute(req('/api/auth/session', { headers: { Cookie: `__Host-hh-member=${encrypted}` } }), env, fetcher);
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { authenticated: false, reason: 'unavailable', reference: `HH-SESSION-${failure === 'network' ? 'NETWORK' : failure === 'invalid-data' ? 'DATA' : `HTTP${failure}`}` });
    const saved = getCookie(unavailable, '__Host-hh-member');
    assert.ok(saved && saved !== '__Host-hh-member=', 'Keep the successfully rotated credentials for the next role check');
    assert.ok(!saved.includes(rotatedAccess) && !saved.includes(rotatedRefresh));
    assert.equal(unavailable.headers.get('Cache-Control'), 'private, no-store, max-age=0');
    await assert.rejects(authorizeMember(req('/profiel', { headers: { Cookie: saved } }), config, fetcher), error => error.code === 'unavailable');
    offline = false;
    const recovered = await discordAuthRoute(req('/api/auth/session', { headers: { Cookie: saved } }), env, fetcher);
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).member.expiresAt, expiresAt);
    assert.equal(tokenRequests, 1, 'Recovery must use the new access token instead of repeating the consumed refresh token');
    allowed = false;
    const denied = await discordAuthRoute(req('/api/auth/session', { headers: { Cookie: saved } }), env, fetcher);
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).reason, 'role');
    assert.equal(getCookie(denied, '__Host-hh-member'), '__Host-hh-member=');
  }
});

test('logout needs a same-origin POST and clears/revokes access', async () => {
  const { sessionCookie } = await flow();
  const mock = provider();
  assert.equal((await discordAuthRoute(req('/api/auth/logout'), env, mock.fetcher)).status, 405);
  assert.equal((await discordAuthRoute(req('/api/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.example', Cookie: sessionCookie } }), env, mock.fetcher)).status, 403);
  assert.equal(mock.calls.length, 0);
  const result = await discordAuthRoute(req('/api/auth/logout', { method: 'POST', headers: { Origin: env.APP_ORIGIN, Cookie: sessionCookie } }), env, mock.fetcher);
  assert.equal(result.headers.get('Location'), '/login?loggedOut=1');
  assert.equal(getCookie(result, '__Host-hh-member'), '__Host-hh-member=');
  assert.equal(mock.calls[0].init.body.get('token'), token);
  const outage = await discordAuthRoute(req('/api/auth/logout', { method: 'POST', headers: { Origin: env.APP_ORIGIN, Cookie: sessionCookie } }), env, provider({ revokeStatus: 503 }).fetcher);
  assert.equal(getCookie(outage, '__Host-hh-member'), '__Host-hh-member=');
  assert.ok(outage.headers.get('Location').includes('revoke=pending'));
});

const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const botEnv = { ...env, DISCORD_PUBLIC_KEY: Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('hex') };
async function signed(body, timestamp = Math.floor(Date.now() / 1000).toString()) {
  const raw = JSON.stringify(body);
  const signature = Buffer.from(await crypto.subtle.sign('Ed25519', keys.privateKey, Buffer.from(timestamp + raw))).toString('hex');
  return req('/api/discord/interactions', { method: 'POST', body: raw, headers: { 'X-Signature-Timestamp': timestamp, 'X-Signature-Ed25519': signature } });
}
const command = { type: 2, application_id: env.DISCORD_CLIENT_ID, guild_id: env.DISCORD_GUILD_ID, data: { name: 'website' }, member: { user, roles: [env.DISCORD_MEMBER_ROLE_IDS] } };

test('signed Discord ping responds; website command replies privately with canonical URL', async () => {
  assert.deepEqual(await (await discordInteraction(await signed({ type: 1, application_id: env.DISCORD_CLIENT_ID }), botEnv)).json(), { type: 1 });
  const result = await (await discordInteraction(await signed(command), botEnv)).json();
  assert.equal(result.type, 4);
  assert.equal(result.data.flags, 64);
  assert.deepEqual(result.data.allowed_mentions.parse, []);
  assert.equal(result.data.components[0].components[0].url, `${env.APP_ORIGIN}/login`);
});

test('bot refuses missing roles, pending membership, other servers and applications', async () => {
  for (const payload of [{ ...command, member: { roles: [] } }, { ...command, member: { ...command.member, pending: true } }, { ...command, guild_id: '345678901234567890' }]) {
    const result = await (await discordInteraction(await signed(payload), botEnv)).json();
    assert.equal(result.data.flags, 64);
    assert.equal(result.data.components, undefined);
  }
  assert.equal((await discordInteraction(await signed({ ...command, application_id: '345678901234567890' }), botEnv)).status, 400);
});

test('the website command also accepts Admin and Staff team without Member', async () => {
  const roles = ['1326459850837987430', '1197327572720169030', '1408990525180084265'];
  for (const role of roles) {
    const result = await (await discordInteraction(await signed({ ...command, member: { user, roles: [role] } }), { ...botEnv, DISCORD_MEMBER_ROLE_IDS: roles.join(',') })).json();
    assert.equal(result.data.flags, 64);
    assert.equal(result.data.components[0].components[0].url, `${env.APP_ORIGIN}/login`);
  }
});

test('forged, altered, stale, future and oversized interactions are rejected', async () => {
  assert.equal((await discordInteraction(req('/api/discord/interactions', { method: 'POST', body: '{}' }), botEnv)).status, 401);
  const valid = await signed(command);
  assert.equal((await discordInteraction(req('/api/discord/interactions', { method: 'POST', body: '{}', headers: valid.headers }), botEnv)).status, 401);
  for (const seconds of [-301, 301]) assert.equal((await discordInteraction(await signed(command, (Math.floor(Date.now() / 1000) + seconds).toString()), botEnv)).status, 401);
  const large = await signed({ ...command, padding: 'a'.repeat(33000) });
  assert.equal((await discordInteraction(large, botEnv)).status, 413);
});
