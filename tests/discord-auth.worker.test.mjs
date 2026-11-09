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
      export default { fetch: (request, env) => discordAuthRoute(request, env) };`,
    resolveDir: root,
    sourcefile: 'discord-auth-test-worker.ts',
    loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'neutral',
  target: 'es2022', external: ['node:crypto'],
});
const env = {
  APP_ORIGIN: 'https://clan.example',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_CLIENT_SECRET: 'worker-test-client-secret-only',
  DISCORD_GUILD_ID: '1073630238115897455',
  DISCORD_MEMBER_ROLE_IDS: '1326459850837987430',
  DISCORD_SESSION_SECRET: randomBytes(32).toString('base64url'),
};
const user = { id: '234567890123456789', username: 'Clanmaat', global_name: 'Hert' };
const token = 'worker-test-access-token-only';
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
      calls.push({ url: request.url, body: await request.text() });
      assert.equal(url.origin, 'https://discord.com', 'Never follow a provider redirect');
      if (options.redirectAt && url.pathname.endsWith(options.redirectAt)) {
        return new Response(null, { status: options.redirectStatus, headers: { Location: 'https://untrusted.invalid/capture' } });
      }
      if (url.pathname.endsWith('/token/revoke')) return Response.json({});
      if (url.pathname.endsWith('/token')) return Response.json({
        access_token: token, token_type: 'Bearer', expires_in: 604800,
        scope: 'identify guilds.members.read',
      });
      if (url.pathname.endsWith('/member')) return Response.json({ user, roles: [env.DISCORD_MEMBER_ROLE_IDS], nick: 'Hert' });
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
    assert.ok(body.member.expiresAt <= Date.now() + 8 * 60 * 60 * 1000);
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

test('Cloudflare runtime refuses provider redirects without forwarding credentials', async () => {
  for (const redirectAt of ['/token', '/member']) {
    for (const redirectStatus of [301, 302, 303, 307, 308]) {
      const { mf, calls } = runtime({ redirectAt, redirectStatus });
      try {
        const { finish } = await login(mf);
        assert.equal(finish.headers.get('Location'), '/login?error=unavailable');
        assert.equal(cookie(finish, '__Host-hh-member'), '__Host-hh-member=');
        assert.equal(calls.length, redirectAt === '/token' ? 1 : 3);
        assert.ok(calls.every(call => new URL(call.url).origin === 'https://discord.com'));
        if (redirectAt === '/member') assert.ok(calls.at(-1).url.endsWith('/token/revoke'));
      } finally { await mf.dispose(); }
    }
  }
});
