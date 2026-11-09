import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const requireWrangler = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare } = requireWrangler('miniflare');
const { build } = requireWrangler('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: { contents: `
    import { ClanRaffle } from './worker/clan-raffle.ts';
    import { raffleRoute } from './lib/raffle-route.ts';
    import { discordAuthRoute } from './lib/discord-auth.ts';
    export class TestRaffle extends ClanRaffle {
      inspect(id) { return this.ctx.storage.sql.exec('SELECT status, data FROM raffle_rounds WHERE id = ?', id).toArray()[0]; }
      repeatAlarm() { return this.alarm(); }
    }
    export default { async fetch(request, env) {
      const url = new URL(request.url);
      const stub = env.RAFFLES.getByName('clan:7059');
      if(url.pathname === '/__test/fast') return Response.json(await stub.schedule({...await request.json(), drawAt: Date.now()+1500}, 'test-staff'));
      if(url.pathname === '/__test/inspect') return Response.json(await stub.inspect(url.searchParams.get('id')));
      if(url.pathname === '/__test/repeat') { await stub.repeatAlarm(); return new Response('ok'); }
      return await raffleRoute(request,env) || await discordAuthRoute(request,env) || new Response('Not found',{status:404});
    } };`, resolveDir: root, sourcefile: 'raffle-test-worker.ts', loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', external: ['node:crypto', 'cloudflare:workers'],
});
const proofBundle = await build({ entryPoints: [path.join(root, 'lib/raffle-proof.ts')], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022' });
const { verifyRaffle, ticketFromHash } = await import(`data:text/javascript;base64,${Buffer.from(proofBundle.outputFiles[0].text).toString('base64')}`);
const env = {
  APP_ORIGIN: 'https://clan.example', DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_CLIENT_SECRET: 'worker-test-client-secret-only', DISCORD_GUILD_ID: '1073630238115897455',
  DISCORD_MEMBER_ROLE_IDS: '1326459850837987430,1197327572720169030,1408990525180084265',
  DISCORD_SESSION_SECRET: randomBytes(32).toString('base64url'),
};
function runtime(options = {}) {
  let membershipChecks = 0;
  const mf = new Miniflare({
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
    bindings: env, durableObjects: { RAFFLES: { className: 'TestRaffle', useSQLite: true } },
    ...(options.persist ? { durableObjectsPersist: options.persist } : {}),
    outboundService: async request => {
      const url = new URL(request.url);
      assert.equal(url.origin, 'https://discord.com');
      if (url.pathname.endsWith('/token')) return Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'Bearer', expires_in: 604800, scope: 'identify guilds.members.read' });
      if (url.pathname.endsWith('/users/@me')) return Response.json({ id: '234567890123456789', username: 'Clanmaat' });
      if (url.pathname.endsWith('/member')) {
        membershipChecks++;
        if (options.memberFailure) return Response.json({}, { status: 503 });
        return Response.json({ user: { id: '234567890123456789', username: 'Clanmaat' }, roles: options.roles || ['1197327572720169030'], joined_at: null });
      }
      throw new Error('Unexpected outbound request');
    },
  });
  return { mf, checks: () => membershipChecks };
}
const cookie = (response, name) => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0];
async function login(mf) {
  const response = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/discord`, { redirect: 'manual' });
  const state = new URL(response.headers.get('Location')).searchParams.get('state');
  const callback = await mf.dispatchFetch(`${env.APP_ORIGIN}/api/auth/discord/callback?code=test-code&state=${state}&iss=https%3A%2F%2Fdiscord.com`, { redirect: 'manual', headers: { Cookie: cookie(response, '__Host-hh-discord-state') } });
  return cookie(callback, '__Host-hh-member');
}
const schedule = () => ({ requestId: randomUUID(), title: 'Gratis clandraw', prize: 'Een verrassing van de clan', freeEntry: true, drawAt: Date.now() + 600_000, entries: [{ name: 'Hert Een', tickets: 3 }, { name: 'Hert Twee', tickets: 1 }] });
const post = (mf, endpoint, data, session, extraHeaders = {}) => mf.dispatchFetch(env.APP_ORIGIN + endpoint, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: env.APP_ORIGIN, ...(session ? { Cookie: session } : {}), ...extraHeaders }, body: JSON.stringify(data),
});

test('free raffle requires a current staff role and same-origin requests', async () => {
  const options = { roles: ['1326459850837987430'] };
  const { mf, checks } = runtime(options);
  try {
    assert.equal((await mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle`)).status, 200);
    assert.equal((await post(mf, '/api/raffle/schedule', schedule())).status, 401);
    const session = await login(mf);
    assert.equal((await post(mf, '/api/raffle/schedule', schedule(), session)).status, 403);
    options.roles = ['1408990525180084265'];
    const before = checks();
    assert.equal((await post(mf, '/api/raffle/schedule', schedule(), session, { Origin: 'https://untrusted.invalid' })).status, 403);
    assert.equal(checks(), before, 'Reject CSRF before contacting Discord');
    assert.equal((await post(mf, '/api/raffle/schedule', schedule(), session)).status, 200);
    options.roles = ['1326459850837987430'];
    const data = await (await mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle`)).json();
    assert.equal((await post(mf, '/api/raffle/cancel', { id: data.round.id, reason: 'Een correctie nodig' }, session)).status, 403);
    options.memberFailure = true;
    assert.equal((await post(mf, '/api/raffle/cancel', { id: data.round.id, reason: 'Een correctie nodig' }, session)).status, 503);
    assert.equal((await (await mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle`)).json()).round.status, 'scheduled');
  } finally { await mf.dispose(); }
});

test('schedule validates free entries, amounts, duplicate names and draw time', async () => {
  const { mf } = runtime();
  try {
    const session = await login(mf);
    for (const invalid of [
      { ...schedule(), freeEntry: false }, { ...schedule(), price: 10 },
      { ...schedule(), entries: [{ name: 'One', tickets: 0 }] },
      { ...schedule(), entries: [{ name: 'One', tickets: 1.5 }] },
      { ...schedule(), entries: [{ name: 'One', tickets: 10001 }] },
      { ...schedule(), entries: [{ name: 'Hert Een', tickets: 1 }, { name: 'HERT_EEN', tickets: 1 }] },
      { ...schedule(), drawAt: Date.now() - 1 }, { ...schedule(), drawAt: Date.now() + 181 * 86400000 },
    ]) assert.equal((await post(mf, '/api/raffle/schedule', invalid, session)).status, 400);
    assert.equal((await (await mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle`)).json()).round, null);
  } finally { await mf.dispose(); }
});

test('schedule is idempotent and locks the published entries and hidden seed', async () => {
  const { mf } = runtime();
  try {
    const session = await login(mf); const input = schedule();
    const results = await Promise.all([post(mf, '/api/raffle/schedule', input, session), post(mf, '/api/raffle/schedule', input, session)]);
    assert.deepEqual(results.map(r => r.status), [200, 200]);
    const [a, b] = await Promise.all(results.map(r => r.json()));
    assert.equal(a.round.id, b.round.id); assert.equal(a.round.totalTickets, 4);
    assert.deepEqual(a.round.entries.map(entry => [entry.first, entry.last]), [[1, 3], [4, 4]]);
    assert.match(a.round.commitment, /^[a-f0-9]{64}$/);
    assert.equal(a.round.seed, undefined); assert.equal(a.round.createdBy, undefined); assert.equal(a.round.inputHash, undefined);
    assert.equal((await post(mf, '/api/raffle/schedule', { ...input, entries: [{ name: 'Altered', tickets: 99 }] }, session)).status, 409);
    assert.equal((await post(mf, '/api/raffle/schedule', schedule(), session)).status, 409);
    assert.equal((await mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle`, { method: 'PUT' })).status, 405);
    const state = await (await mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle`)).json();
    assert.equal(state.round.id, a.round.id); assert.equal(state.round.seed, undefined);
  } finally { await mf.dispose(); }
});

test('a scheduled alarm draws without a viewer and its winner is independently verifiable', async () => {
  const { mf } = runtime();
  try {
    const result = await post(mf, '/__test/fast', schedule()); const { round } = await result.json();
    let stored;
    for (let attempt = 0; attempt < 30; attempt++) {
      // This test-only inspection never runs the normal read-path recovery.
      stored = await (await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/inspect?id=${round.id}`)).json();
      if (stored.status === 'drawn') break;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.equal(stored.status, 'drawn', 'The platform alarm must perform the draw');
    const state = await (await mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle`)).json();
    const drawn = state.round;
    assert.equal(drawn.commitment, round.commitment);
    assert.equal(await verifyRaffle(drawn), true);
    const hash = createHash('sha256').update(`hh-raffle-v1\n${drawn.id}\n${drawn.drawAt}\n${drawn.entriesHash}\n${drawn.seed}\n0`).digest();
    const candidate = hash.readUInt32BE(0);
    assert.equal(drawn.winningTicket, candidate % 4 + 1, 'Independent implementation matches the public proof');
    assert.equal(drawn.winner, drawn.winningTicket <= 3 ? 'Hert Een' : 'Hert Twee');
    assert.equal(await verifyRaffle({ ...drawn, winner: 'Someone Else' }), false);
    assert.equal(await verifyRaffle({ ...drawn, entries: [{ ...drawn.entries[0], tickets: 4 }, drawn.entries[1]] }), false);
    await post(mf, '/__test/repeat', {});
    const again = await (await mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle`)).json();
    assert.equal(again.round.winningTicket, drawn.winningTicket); assert.equal(again.round.drawnAt, drawn.drawnAt);
    assert.equal(again.history.length, 1);
    const session = await login(mf);
    assert.equal((await post(mf, '/api/raffle/cancel', { id: drawn.id, reason: 'Reroll poging' }, session)).status, 409);
  } finally { await mf.dispose(); }
});

test('cancellation keeps its public history and releases the commitment', async () => {
  const { mf } = runtime();
  try {
    const session = await login(mf);
    const { round } = await (await post(mf, '/api/raffle/schedule', schedule(), session)).json();
    assert.equal((await post(mf, '/api/raffle/cancel', { id: round.id, reason: 'Verkeerde datum gekozen' }, session)).status, 200);
    const state = await (await mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle`)).json();
    assert.equal(state.round.status, 'cancelled'); assert.equal(state.round.cancellationReason, 'Verkeerde datum gekozen');
    assert.equal(createHash('sha256').update(`hh-raffle-seed-v1\n${state.round.seed}`).digest('hex'), round.commitment);
    assert.equal(state.history.length, 1);
    assert.equal((await post(mf, '/api/raffle/schedule', schedule(), session)).status, 200);
    assert.equal((await (await mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle?id=${round.id}`)).json()).round.status, 'cancelled');
  } finally { await mf.dispose(); }
});

test('SQLite retains the planned draw and secret across a worker restart', async () => {
  const persist = await mkdtemp(path.join(tmpdir(), 'hh-raffle-test-'));
  let instance = runtime({ persist });
  try {
    const session = await login(instance.mf);
    const { round } = await (await post(instance.mf, '/api/raffle/schedule', schedule(), session)).json();
    await instance.mf.dispose(); instance = runtime({ persist });
    const state = await (await instance.mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle`)).json();
    assert.equal(state.round.id, round.id); assert.equal(state.round.commitment, round.commitment);
    assert.equal(state.round.totalTickets, 4); assert.equal(state.round.seed, undefined);
  } finally {
    await instance.mf.dispose();
    if (!path.resolve(persist).startsWith(path.resolve(tmpdir()) + path.sep + 'hh-raffle-test-')) throw new Error('Unexpected test storage directory');
    await rm(persist, { recursive: true, force: true });
  }
});

test('ticket selection rejects biased values instead of wrapping them', () => {
  assert.equal(ticketFromHash('ffffffff'.repeat(8), 3), null);
  assert.equal(ticketFromHash('ffffffff00000002' + '00000000'.repeat(6), 3), 3);
  assert.equal(ticketFromHash('00000000'.repeat(8), 1), 1);
});
