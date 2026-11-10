import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, generateKeyPairSync, pbkdf2Sync, randomBytes, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const requireWrangler = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare } = requireWrangler('miniflare');
const { build } = requireWrangler('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://clan.example';
const testCode = '654321';
const testSalt = 'a84cef934c817b6d257ab4aa0375d2f1';
let testHash;
const bundle = await build({
  stdin: {
    contents: `
      import worker from './worker/index.ts';
      import { SiteAccessLimits } from './worker/site-access.ts';
      import { discordConfig, seal } from './lib/discord-auth.ts';
      export class TestAccessLimits extends SiteAccessLimits {
        ageWindow() { this.ctx.storage.sql.exec('UPDATE access_window SET started_at = ?', Date.now() - 901000); }
      }
      export default { async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === '/__test/discord-cookie') {
          const config = discordConfig(env);
          return Response.json({cookie: '__Host-hh-member=' + await seal(config, 'session', {
            accessToken: 'test-only-access-token', userId: '234567890123456789',
            accessExpiresAt: Date.now() + 86400000, expiresAt: Date.now() + 86400000,
          })});
        }
        if (url.pathname === '/__test/age-window') {
          // Test-only helper receives the same object name used by the real gate.
          await env.SITE_ACCESS_LIMITS.getByName(url.searchParams.get('name')).ageWindow();
          return new Response('ok');
        }
        return worker.fetch(request, env, ctx);
      } };`,
    resolveDir: root, sourcefile: 'site-access-test-worker.ts', loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
  external: ['node:*', 'cloudflare:workers'], define: { 'import.meta.env.DEV': 'false' },
  plugins: [{
    name: 'isolated-site-access-fixtures',
    setup(bundler) {
      // Replace only the password verifier in this isolated bundle. Production
      // has no configurable password override or test endpoint.
      bundler.onLoad({ filter: /[\\/]lib[\\/]site-access\.ts$/ }, async args => {
        let contents = await readFile(args.path, 'utf8');
        const iterations = Number(contents.match(/const ACCESS_CODE_ITERATIONS\s*=\s*([\d_]+)/)?.[1].replaceAll('_', ''));
        assert.ok(Number.isInteger(iterations) && iterations > 0);
        testHash = pbkdf2Sync(testCode, Buffer.from(testSalt, 'hex'), iterations, 32, 'sha256').toString('hex');
        for (const [name, value] of [['ACCESS_CODE_SALT', testSalt], ['ACCESS_CODE_HASH', testHash]]) {
          const pattern = new RegExp(`const ${name}\\s*=\\s*['\"][a-f0-9]+['\"]`);
          assert.ok(pattern.test(contents), `Expected private ${name} verifier constant`);
          contents = contents.replace(pattern, `const ${name} = '${value}'`);
        }
        return { contents, loader: 'ts', resolveDir: path.dirname(args.path) };
      });
      bundler.onResolve({ filter: /^vinext\/server\/fetch-handler$/ }, () => ({ path: 'framework', namespace: 'test-downstream' }));
      bundler.onResolve({ filter: /(?:^|\/)lib\/(member-profile|raffle-route|profile-progress-route|clan-member-route)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'test-downstream' }));
      bundler.onResolve({ filter: /^\.\/(clan-raffle|clan-progress|wom-cache)$/ }, args => ({ path: args.path, namespace: 'test-downstream' }));
      bundler.onLoad({ filter: /.*/, namespace: 'test-downstream' }, args => {
        if (args.path === 'framework') return { contents: `export default {fetch(request) {return new Response('protected:' + new URL(request.url).pathname, {headers:{'X-Test-Downstream':'framework'}});}};`, loader: 'js' };
        const routes = {
          'member-profile': ['memberProfileRoute', '/api/members/profile'],
          'raffle-route': ['raffleRoute', '/api/raffle'],
          'profile-progress-route': ['profileProgressRoute', '/api/members/progress'],
          'clan-member-route': ['clanMemberRoute', '/api/members'],
        };
        if (routes[args.path]) {
          const [exportName, prefix] = routes[args.path];
          return { contents: `export async function ${exportName}(request) {return new URL(request.url).pathname.startsWith('${prefix}') ? new Response('protected:${exportName}', {headers:{'X-Test-Downstream':'${exportName}'}}) : null;}`, loader: 'js' };
        }
        return { contents: 'export class ClanRaffle {} export class ClanProgress {} export class WomCache {}', loader: 'js' };
      });
    },
  }],
});

const discordKeys = generateKeyPairSync('ed25519');
const env = {
  APP_ORIGIN: origin, SITE_MAINTENANCE_MODE: 'on',
  DISCORD_CLIENT_ID: '123456789012345678', DISCORD_CLIENT_SECRET: 'test-only-client-secret',
  DISCORD_GUILD_ID: '1073630238115897455', DISCORD_MEMBER_ROLE_IDS: '1326459850837987430',
  DISCORD_SESSION_SECRET: randomBytes(32).toString('base64url'),
  DISCORD_PUBLIC_KEY: discordKeys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex'),
};
function runtime(options = {}) {
  const calls = [];
  const assetCalls = [];
  const bindings = { ...env, ...options.bindings };
  const mf = new Miniflare({
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], bindings,
    durableObjects: options.noLimiter ? {} : { SITE_ACCESS_LIMITS: { className: 'TestAccessLimits', useSQLite: true } },
    ...(options.persist ? { durableObjectsPersist: options.persist } : {}),
    serviceBindings: { ASSETS: async request => {
      assetCalls.push(new URL(request.url).pathname);
      return new Response('protected-asset:' + new URL(request.url).pathname, { headers: { 'X-Test-Downstream': 'assets', 'Cache-Control': 'public, max-age=31536000' } });
    } },
    outboundService: async request => {
      calls.push(request.url);
      const url = new URL(request.url);
      assert.equal(url.origin, 'https://discord.com', 'No outbound traffic beyond the mocked Discord provider');
      if (url.pathname.endsWith('/member')) return Response.json({ user: { id: '234567890123456789', username: 'TestHert' }, roles: ['1326459850837987430'], joined_at: null });
      throw new Error('Unexpected test outbound request');
    },
  });
  return { mf, calls, assetCalls, bindings };
}
const cookieName = '__Host-hh-preview';
const cookie = response => response.headers.getSetCookie().find(value => value.startsWith(`${cookieName}=`));
const request = (mf, route, options = {}) => mf.dispatchFetch(origin + route, { redirect: 'manual', ...options });
const form = (mf, values = {}, headers = {}) => request(mf, '/api/site-access', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '192.0.2.10', ...headers },
  body: new URLSearchParams({ code: testCode, next: '/', ...values }).toString(),
});
const location = response => new URL(response.headers.get('Location'), origin);
function assertPrivate(response) {
  assert.match(response.headers.get('Cache-Control') || '', /no-store/i);
  assert.equal(response.headers.get('X-Test-Downstream'), null);
}
function signedCookie(payload, secret = env.DISCORD_SESSION_SECRET, appOrigin = origin, verifier = testHash) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', Buffer.from(secret, 'base64url')).update(`hh-site-access-cookie-v1\n${appOrigin}\n${verifier}\n${encoded}`).digest('base64url');
  return `${cookieName}=v1.${encoded}.${signature}`;
}
const payload = () => { const now = Date.now(); return { v: 1, iat: now, exp: now + 604800000, nonce: randomBytes(16).toString('base64url') }; };

test('maintenance gates direct pages, APIs and application scripts before any downstream handler', async () => {
  const { mf, calls, assetCalls } = runtime();
  try {
    for (const route of ['/', '/events', '/events/agenda?month=11', '/profiel', '/ledenomgeving', '/_next/image?url=%2Fprivate.png']) {
      const response = await request(mf, route);
      assert.equal(response.status, 303, route); assertPrivate(response);
      assert.equal(location(response).pathname, '/binnenkort', route);
      assert.equal(location(response).searchParams.get('next'), route, route);
    }
    for (const route of ['/api/clan', '/api/event', '/api/raffle', '/api/members', '/api/members/profile', '/api/members/progress/admin', '/api/auth/discord', '/api/auth/session', '/api/auth/discord/callback?code=do-not-reflect', '/assets/app.js', '/_next/static/chunks/app.js', '/assets/app.js.map', '/styles.css']) {
      const response = await request(mf, route);
      assert.equal(response.status, 503, route); assertPrivate(response);
      assert.match(response.headers.get('Content-Type') || '', /application\/json/i);
      assert.ok(!(await response.text()).includes('do-not-reflect'));
    }
    assert.equal((await request(mf, '/events', { method: 'POST', body: 'hidden' })).status, 503);
    assert.equal((await request(mf, '/api/raffle', { method: 'POST', body: 'hidden' })).status, 503);
    assert.deepEqual(calls, []); assert.deepEqual(assetCalls, []);
  } finally { await mf.dispose(); }
});

test('the maintenance page is a private native form without client code or embedded credentials', async () => {
  const { mf, calls } = runtime();
  try {
    const next = '/events?label="/><script>alert(1)</script>';
    const response = await request(mf, '/binnenkort?' + new URLSearchParams({ next, error: 'invalid' }));
    assert.equal(response.status, 200); assertPrivate(response);
    assert.match(response.headers.get('Content-Type') || '', /text\/html/);
    assert.match(response.headers.get('Content-Security-Policy') || '', /default-src 'none'/);
    assert.match(response.headers.get('Content-Security-Policy') || '', /form-action 'self'/);
    assert.match(response.headers.get('X-Robots-Tag') || '', /noindex/);
    const html = await response.text();
    assert.match(html, /<html lang="nl">/);
    assert.match(html, /<form method="post" action="\/api\/site-access">/);
    assert.match(html, /name="code" type="password"/);
    assert.match(html, /Deze toegangscode klopt niet/);
    assert.doesNotMatch(html, /<script|type="module"|onerror=/i);
    for (const value of [testCode, testHash, env.DISCORD_SESSION_SECRET, env.DISCORD_CLIENT_SECRET, next]) assert.ok(!html.includes(value));
    const head = await request(mf, '/binnenkort', { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    assert.equal((await request(mf, '/binnenkort', { method: 'POST', body: 'code=anything' })).status, 503);
    assert.deepEqual(calls, []);
  } finally { await mf.dispose(); }
});

test('only the five maintenance image/font assets are public and asset responses cannot be cached', async () => {
  const { mf, assetCalls } = runtime();
  const publicAssets = ['/clan-logo.png', '/hijgend-hert-woodland.webp', '/fonts/cinzel-semibold.ttf', '/fonts/inter-regular.ttf', '/favicon.svg'];
  try {
    for (const route of publicAssets) {
      for (const method of ['GET', 'HEAD']) {
        const response = await request(mf, route, { method });
        assert.equal(response.status, 200); assert.equal(response.headers.get('X-Test-Downstream'), 'assets');
        assert.match(response.headers.get('Cache-Control') || '', /no-store/);
        assert.match(response.headers.get('Vary') || '', /Cookie/);
      }
      assert.equal((await request(mf, route, { method: 'POST', body: 'hidden' })).status, 503);
    }
    assert.deepEqual(assetCalls, publicAssets.flatMap(route => [route, route]));
    const expectedCalls = assetCalls.length;
    for (const route of ['/private.png', '/fonts/private.ttf', '/clan-logo.png/extra', '/clan-logo.png.js', '/fonts/inter-regular.ttf.map']) {
      const response = await request(mf, route);
      assert.ok([303, 503].includes(response.status)); assertPrivate(response);
    }
    assert.equal(assetCalls.length, expectedCalls, 'Similar names and other assets never reach static storage');
  } finally { await mf.dispose(); }
});

test('a correct code creates a private seven-day cookie and resumes the requested local page', async () => {
  const { mf } = runtime();
  try {
    const response = await form(mf, { next: '/events/agenda?month=11' });
    assert.equal(response.status, 303); assertPrivate(response);
    assert.equal(response.headers.get('Location'), '/events/agenda?month=11');
    const header = cookie(response); assert.ok(header);
    for (const attribute of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Lax', 'Max-Age=604800']) assert.ok(header.includes(attribute), attribute);
    assert.ok(!header.includes('Domain=')); assert.ok(!header.includes(testCode));
    const value = header.split(';')[0];
    const issued = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
    assert.equal(issued.v, 1); assert.equal(issued.exp - issued.iat, 604800000);
    assert.ok(Math.abs(Date.now() - issued.iat) < 5000);
    assert.equal(value, signedCookie(issued), 'Node independently verifies the HMAC and purpose/origin binding');
    for (const route of ['/', '/events', '/assets/app.js', '/api/raffle']) {
      const allowed = await request(mf, route, { headers: { Cookie: value } });
      assert.equal(allowed.status, 200); assert.ok(allowed.headers.get('X-Test-Downstream'));
    }
  } finally { await mf.dispose(); }
});

test('wrong or malformed codes grant no access and never echo the supplied code', async () => {
  const { mf } = runtime();
  try {
    for (const invalid of ['999999', '', '65432', '6543217', '<script>alert(1)</script>']) {
      const response = await form(mf, { code: invalid });
      assert.equal(response.status, 303); assert.equal(location(response).searchParams.get('error'), 'invalid');
      assert.equal(cookie(response), undefined); assertPrivate(response);
      if (invalid) assert.ok(!(await response.text()).includes(invalid));
    }
    const response = await request(mf, '/');
    assert.equal(response.status, 303);
  } finally { await mf.dispose(); }
});

test('site access rejects cross-origin form posts and malformed or oversized bodies', async () => {
  const { mf } = runtime();
  try {
    for (const headers of [{ Origin: 'https://untrusted.invalid' }, { Origin: 'null' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
      const response = await form(mf, {}, headers);
      assert.equal(response.status, 403); assert.equal(cookie(response), undefined); assertPrivate(response);
    }
    const foreign = await mf.dispatchFetch('https://other.example/api/site-access', { method: 'POST', redirect: 'manual', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: testCode }).toString() });
    assert.equal(foreign.status, 403); assert.equal(cookie(foreign), undefined);
    const wrongType = await request(mf, '/api/site-access', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: testCode }) });
    assert.equal(wrongType.status, 415);
    const oversized = await form(mf, { next: '/' + 'x'.repeat(10000) });
    assert.equal(oversized.status, 303); assert.equal(location(oversized).searchParams.get('error'), 'invalid'); assert.equal(cookie(oversized), undefined);
    const duplicate = await request(mf, '/api/site-access', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `code=${testCode}&code=other` });
    assert.equal(duplicate.status, 303); assert.equal(location(duplicate).searchParams.get('error'), 'invalid'); assert.equal(cookie(duplicate), undefined);
    assert.ok(cookie(await form(mf)), 'Rejected requests do not prevent a legitimate form submission');
  } finally { await mf.dispose(); }
});

test('access redirects cannot escape the site or reflect unsafe destinations', async () => {
  const { mf } = runtime();
  try {
    for (const [index, next] of ['https://untrusted.invalid', '//untrusted.invalid', '/\\untrusted.invalid', 'javascript:alert(1)', '/%5cuntrusted.invalid', '/api/site-access', '/binnenkort', '/events\r\nLocation:https://untrusted.invalid'].entries()) {
      const response = await form(mf, { next }, { 'CF-Connecting-IP': `192.0.2.${index + 30}` });
      assert.equal(response.status, 303); assert.equal(response.headers.get('Location'), '/', next);
    }
  } finally { await mf.dispose(); }
});

test('tampered, expired, overlong, wrong-purpose and foreign-origin cookies cannot unlock the site', async () => {
  const { mf } = runtime();
  try {
    const good = signedCookie(payload());
    const now = Date.now();
    const invalid = [
      good.slice(0, -4) + 'AAAA', `${cookieName}=v1.bad.bad`, `${cookieName}=` + 'x'.repeat(10000),
      signedCookie({ ...payload(), iat: now - 604801000, exp: now - 1000 }),
      signedCookie({ ...payload(), iat: now + 3600000, exp: now + 604800000 + 3600000 }),
      signedCookie({ ...payload(), exp: now + 1209600000 }),
      signedCookie({ ...payload(), v: 2 }),
      signedCookie(payload(), env.DISCORD_SESSION_SECRET, 'https://other.example'),
      signedCookie(payload(), env.DISCORD_SESSION_SECRET, origin, 'outdated-verifier'),
      signedCookie(payload(), randomBytes(32).toString('base64url')),
    ];
    assert.equal((await request(mf, '/', { headers: { Cookie: good } })).status, 200);
    for (const value of invalid) {
      const response = await request(mf, '/', { headers: { Cookie: value } });
      assert.equal(response.status, 303); assertPrivate(response);
      assert.equal((await request(mf, '/api/raffle', { headers: { Cookie: value } })).status, 503);
    }
  } finally { await mf.dispose(); }
});

test('concurrent attempts share the durable five-attempt limit and independent clients remain independent', async () => {
  const { mf } = runtime();
  try {
    const responses = await Promise.all(Array.from({ length: 8 }, () => form(mf, { code: '999999' })));
    const errors = responses.map(response => location(response).searchParams.get('error'));
    assert.equal(errors.filter(value => value === 'invalid').length, 5);
    assert.equal(errors.filter(value => value === 'rate').length, 3);
    for (const response of responses.filter(value => location(value).searchParams.get('error') === 'rate')) {
      assert.ok(Number(response.headers.get('Retry-After')) > 0); assert.ok(Number(response.headers.get('Retry-After')) <= 900);
      assert.equal(cookie(response), undefined);
    }
    const correctButLimited = await form(mf);
    assert.equal(location(correctButLimited).searchParams.get('error'), 'rate'); assert.equal(cookie(correctButLimited), undefined);
    const otherClient = await form(mf, {}, { 'CF-Connecting-IP': '192.0.2.11' });
    assert.equal(otherClient.headers.get('Location'), '/'); assert.ok(cookie(otherClient));
  } finally { await mf.dispose(); }
});

test('the attempt window survives a runtime restart', async () => {
  const persist = await mkdtemp(path.join(tmpdir(), 'hh-site-access-test-'));
  let instance = runtime({ persist });
  try {
    for (let i = 0; i < 5; i++) assert.equal(location(await form(instance.mf, { code: '999999' })).searchParams.get('error'), 'invalid');
    await instance.mf.dispose(); instance = runtime({ persist });
    const limited = await form(instance.mf);
    assert.equal(location(limited).searchParams.get('error'), 'rate'); assert.equal(cookie(limited), undefined);
    const objectName = createHash('sha256').update('hh-site-access-limit-v1\n192.0.2.10').digest('hex');
    await request(instance.mf, `/__test/age-window?name=${objectName}`);
    const reset = await form(instance.mf);
    assert.equal(reset.headers.get('Location'), '/'); assert.ok(cookie(reset), 'A new fifteen-minute window admits requests after a restart');
  } finally {
    await instance.mf.dispose();
    if (!path.resolve(persist).startsWith(path.resolve(tmpdir()) + path.sep + 'hh-site-access-test-')) throw new Error('Unexpected test storage directory');
    await rm(persist, { recursive: true, force: true });
  }
});

test('maintenance fails closed when signing or durable rate limiting is unavailable', async () => {
  for (const options of [{ bindings: { DISCORD_SESSION_SECRET: '' } }, { bindings: { SITE_ACCESS_SECRET: 'invalid-secret' } }, { noLimiter: true }]) {
    const { mf, calls } = runtime(options);
    try {
      assert.equal((await request(mf, '/events')).status, 303);
      assert.equal((await request(mf, '/api/raffle')).status, 503);
      const response = await form(mf);
      assert.equal(response.status, 503); assert.match(await response.text(), /Inloggen is even niet beschikbaar/);
      assert.equal(cookie(response), undefined); assert.deepEqual(calls, []);
    } finally { await mf.dispose(); }
  }
});

test('explicitly switching maintenance off restores routes without requiring a gate secret', async () => {
  const { mf } = runtime({ bindings: { SITE_MAINTENANCE_MODE: 'off', DISCORD_SESSION_SECRET: '' }, noLimiter: true });
  try {
    for (const route of ['/', '/events', '/assets/app.js', '/api/raffle', '/api/members/profile']) {
      const response = await request(mf, route);
      assert.equal(response.status, 200); assert.ok(response.headers.get('X-Test-Downstream'));
    }
  } finally { await mf.dispose(); }
});

test('an existing valid Discord session cannot bypass the site gate and still works after unlocking', async () => {
  const { mf, calls } = runtime();
  try {
    const { cookie: memberCookie } = await (await request(mf, '/__test/discord-cookie')).json();
    for (const route of ['/ledenomgeving', '/api/auth/session', '/api/raffle']) {
      const response = await request(mf, route, { headers: { Cookie: memberCookie } });
      assert.equal(response.status, route.startsWith('/api/') ? 503 : 303); assertPrivate(response);
    }
    assert.deepEqual(calls, []);
    const access = cookie(await form(mf)).split(';')[0];
    const anonymous = await request(mf, '/api/auth/session', { headers: { Cookie: access } });
    assert.equal(anonymous.status, 401); assert.equal((await anonymous.json()).authenticated, false);
    assert.deepEqual(calls, [], 'A preview code alone does not authenticate a Discord member');
    const verified = await request(mf, '/api/auth/session', { headers: { Cookie: `${access}; ${memberCookie}` } });
    assert.equal(verified.status, 200); assert.equal((await verified.json()).authenticated, true);
    assert.equal(calls.length, 1, 'Unlocking preserves the normal live Discord role check');
  } finally { await mf.dispose(); }
});

test('only signed Discord interaction POSTs can use their maintenance exception', async () => {
  const { mf } = runtime();
  try {
    const endpoint = '/api/discord/interactions';
    assert.equal((await request(mf, endpoint)).status, 503);
    assert.equal((await request(mf, endpoint, { method: 'POST', body: '{}' })).status, 401);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: 1, application_id: env.DISCORD_CLIENT_ID });
    const signature = sign(null, Buffer.from(timestamp + body), discordKeys.privateKey).toString('hex');
    const response = await request(mf, endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Signature-Timestamp': timestamp, 'X-Signature-Ed25519': signature }, body });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { type: 1 });
    assert.equal(cookie(response), undefined);
    assert.equal((await request(mf, endpoint + '/extra', { method: 'POST', body })).status, 503);
  } finally { await mf.dispose(); }
});
