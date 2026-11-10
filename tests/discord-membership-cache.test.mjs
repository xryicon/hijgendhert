import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const requireWrangler = createRequire(import.meta.resolve('wrangler/package.json'));
const { build } = requireWrangler('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ stdin: { contents: `export { DiscordMembershipCache, DISCORD_MEMBERSHIP_FRESH_MS } from './lib/discord-membership-cache'; export { DiscordAccessError } from './lib/discord-auth';`, resolveDir: root, loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { DiscordMembershipCache, DISCORD_MEMBERSHIP_FRESH_MS, DiscordAccessError } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const member = { user: { id: '234567890123456789', username: 'Hert' }, roles: ['1326459850837987430'] };
function setup() {
  let now = 100_000, pause = null;
  const recreate = () => new DiscordMembershipCache(() => pause, value => { pause = value; }, () => now);
  return { cache: recreate(), recreate, advance: ms => { now += ms; }, pause: () => pause };
}
test('one page burst shares one request; successful role evidence expires after 15 seconds', async () => {
  const state = setup(); let calls = 0, finish;
  const load = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const requests = Array.from({ length: 12 }, () => state.cache.check('token-a', false, load));
  assert.equal(calls, 1);
  finish({ member, cooldownSeconds: 0 });
  assert.ok((await Promise.all(requests)).every(result => result.ok));
  state.advance(DISCORD_MEMBERSHIP_FRESH_MS - 1);
  assert.equal((await state.cache.check('token-a', false, load)).ok, true);
  assert.equal(calls, 1);
  state.advance(1);
  const next = state.cache.check('token-a', false, load);
  assert.equal(calls, 2); finish({ member, cooldownSeconds: 0 }); await next;
});
test('fresh checks replace old roles and never fall back to a previous success after a failure', async () => {
  const { cache } = setup();
  await cache.check('token-a', false, async () => ({ member, cooldownSeconds: 0 }));
  const revoked = { ...member, roles: [] };
  const fresh = await cache.check('token-a', true, async () => ({ member: revoked, cooldownSeconds: 0 }));
  assert.deepEqual(fresh.member.roles, []);
  const fail = () => { throw new DiscordAccessError('unavailable', 'HTTP429', 120); };
  assert.equal((await cache.check('token-a', true, fail)).ok, false);
  assert.deepEqual(await cache.check('token-a', false, () => { throw Error('Must not retry'); }), { ok: false, code: 'unavailable', detail: 'HTTP429', retryAfter: 120 });
});
test('Discord cooldown survives eviction and blocks forced attempts until Retry-After expires', async () => {
  const state = setup(); let calls = 0;
  await state.cache.check('token-a', true, async () => { calls++; throw new DiscordAccessError('unavailable', 'HTTP429', 65); });
  const restarted = state.recreate();
  state.advance(64_000);
  assert.equal((await restarted.check('token-a', true, async () => { calls++; return { member, cooldownSeconds: 0 }; })).retryAfter, 1);
  assert.equal(calls, 1);
  state.advance(1000);
  assert.equal((await restarted.check('token-a', false, async () => { calls++; return { member, cooldownSeconds: 0 }; })).ok, true);
  assert.equal(calls, 2);
  assert.equal(state.pause(), null);
});
test('exhausted successful quota serves only recent evidence and defers new checks', async () => {
  const state = setup(); const load = async () => ({ member, cooldownSeconds: 60 });
  await state.cache.check('token-a', false, load);
  const forbidden = () => { throw Error('Provider bucket is exhausted'); };
  assert.equal((await state.cache.check('token-a', false, forbidden)).ok, true);
  assert.equal((await state.cache.check('token-a', true, forbidden)).retryAfter, 60);
  state.advance(DISCORD_MEMBERSHIP_FRESH_MS);
  assert.equal((await state.cache.check('token-a', false, forbidden)).retryAfter, 45);
});
test('different credential fingerprints cannot share membership or a provider pause', async () => {
  const { cache } = setup();
  await cache.check('token-a', false, async () => ({ member, cooldownSeconds: 60 }));
  const other = { ...member, user: { ...member.user, id: '345678901234567890' }, roles: [] };
  assert.deepEqual((await cache.check('token-b', false, async () => ({ member: other, cooldownSeconds: 0 }))).member, other);
});
test('logout clears evidence and a late in-flight result cannot restore it', async () => {
  const { cache } = setup(); let finish;
  const pending = cache.check('token-a', false, () => new Promise(resolve => { finish = resolve; }));
  cache.clear(); finish({ member, cooldownSeconds: 0 });
  assert.deepEqual(await pending, { ok: false, code: 'expired' });
  assert.deepEqual(await cache.check('token-a', false, async () => { throw new DiscordAccessError('expired'); }), { ok: false, code: 'expired', detail: undefined, retryAfter: undefined });
});
