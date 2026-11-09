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
      async makeDue(id) {
        const row = this.inspect(id); const round = JSON.parse(row.data);
        round.drawAt = Date.now() - 1000;
        this.ctx.storage.sql.exec('UPDATE raffle_rounds SET draw_at = ?, data = ? WHERE id = ?', round.drawAt, JSON.stringify(round), id);
        await this.ctx.storage.deleteAlarm();
      }
    }
    export default { async fetch(request, env) {
      const url = new URL(request.url);
      const stub = env.RAFFLES.getByName('clan:7059');
      if(url.pathname === '/__test/fast') return Response.json(await stub.schedule({...await request.json(), drawAt: Date.now()+1500}, 'test-staff'));
      if(url.pathname === '/__test/inspect') return Response.json(await stub.inspect(url.searchParams.get('id')));
      if(url.pathname === '/__test/repeat') { await stub.repeatAlarm(); return new Response('ok'); }
      if(url.pathname === '/__test/due') { await stub.makeDue((await request.json()).id); return new Response('ok'); }
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
const edit = (round, entries) => ({ id: round.id, expectedEntriesHash: round.entriesHash, entries });
const getState = async mf => (await mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle`)).json();
const inspect = async (mf, id) => JSON.parse((await (await mf.dispatchFetch(`${env.APP_ORIGIN}/__test/inspect?id=${id}`)).json()).data);

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

test('schedule is idempotent, keeps one active round and hides the seed', async () => {
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
    const session = await login(mf);
    const result = await post(mf, '/__test/fast', schedule()); const { round } = await result.json();
    const updated = await post(mf, '/api/raffle/entries', edit(round, [{ name: 'Nieuwe Hert', tickets: 1 }, { name: 'Hert Twee', tickets: 3 }]), session);
    assert.equal(updated.status, 200);
    const changed = (await updated.json()).round;
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
    assert.equal(drawn.entriesHash, changed.entriesHash);
    assert.equal(await verifyRaffle(drawn), true);
    const hash = createHash('sha256').update(`hh-raffle-v1\n${drawn.id}\n${drawn.drawAt}\n${drawn.entriesHash}\n${drawn.seed}\n0`).digest();
    const candidate = hash.readUInt32BE(0);
    assert.equal(drawn.winningTicket, candidate % 4 + 1, 'Independent implementation matches the public proof');
    assert.equal(drawn.winner, drawn.winningTicket <= 1 ? 'Nieuwe Hert' : 'Hert Twee');
    assert.equal(await verifyRaffle({ ...drawn, winner: 'Someone Else' }), false);
    assert.equal(await verifyRaffle({ ...drawn, entries: [{ ...drawn.entries[0], tickets: 4 }, drawn.entries[1]] }), false);
    await post(mf, '/__test/repeat', {});
    const again = await (await mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle`)).json();
    assert.equal(again.round.winningTicket, drawn.winningTicket); assert.equal(again.round.drawnAt, drawn.drawnAt);
    assert.equal(again.history.length, 1);
    assert.equal((await post(mf, '/api/raffle/cancel', { id: drawn.id, reason: 'Reroll poging' }, session)).status, 409);
    assert.equal((await post(mf, '/api/raffle/entries', edit(changed, [{ name: 'Reroll Hert', tickets: 10 }]), session)).status, 409);
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
    const update = await post(instance.mf, '/api/raffle/entries', edit(round, [{ name: 'Bewaard Hert', tickets: 17 }]), session);
    assert.equal(update.status, 200);
    const changed = (await update.json()).round;
    await instance.mf.dispose(); instance = runtime({ persist });
    const state = await (await instance.mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle`)).json();
    assert.equal(state.round.id, round.id); assert.equal(state.round.commitment, round.commitment);
    assert.equal(state.round.totalTickets, 17); assert.equal(state.round.seed, undefined);
    assert.deepEqual(state.round.entries, changed.entries); assert.equal(state.round.entriesHash, changed.entriesHash);
  } finally {
    await instance.mf.dispose();
    if (!path.resolve(persist).startsWith(path.resolve(tmpdir()) + path.sep + 'hh-raffle-test-')) throw new Error('Unexpected test storage directory');
    await rm(persist, { recursive: true, force: true });
  }
});

test('editing participants rechecks staff access and rejects CSRF before contacting Discord', async () => {
  const options = { roles: ['1197327572720169030'] };
  const { mf, checks } = runtime(options);
  try {
    const session = await login(mf);
    const { round } = await (await post(mf, '/api/raffle/schedule', schedule(), session)).json();
    const input = edit(round, [{ name: 'Nieuwe Hert', tickets: 5 }]);
    assert.equal((await post(mf, '/api/raffle/entries', input)).status, 401);
    assert.equal((await mf.dispatchFetch(`${env.APP_ORIGIN}/api/raffle/entries`)).status, 405);
    const before = checks();
    assert.equal((await post(mf, '/api/raffle/entries', input, session, { Origin: 'https://untrusted.invalid' })).status, 403);
    assert.equal(checks(), before);
    options.roles = ['1326459850837987430'];
    assert.equal((await post(mf, '/api/raffle/entries', input, session)).status, 403);
    options.roles = [];
    assert.equal((await post(mf, '/api/raffle/entries', input, session)).status, 403);
    options.roles = ['1408990525180084265']; options.memberFailure = true;
    assert.equal((await post(mf, '/api/raffle/entries', input, session)).status, 503);
    assert.equal((await getState(mf)).round.entriesHash, round.entriesHash);
    options.memberFailure = false;
    assert.equal((await post(mf, '/api/raffle/entries', input, session)).status, 200);
    assert.ok(checks() >= before + 4);
  } finally { await mf.dispose(); }
});

test('staff can add, remove and change ticket counts without changing the draw or secret', async () => {
  const { mf } = runtime();
  try {
    const session = await login(mf);
    const { round } = await (await post(mf, '/api/raffle/schedule', schedule(), session)).json();
    const original = await inspect(mf, round.id);
    const update = await post(mf, '/api/raffle/entries', edit(round, [{ name: 'Hert Twee', tickets: 5 }, { name: 'Nieuw Hert', tickets: 9 }]), session);
    assert.equal(update.status, 200);
    const changed = (await update.json()).round;
    assert.equal(changed.totalTickets, 14);
    assert.deepEqual(changed.entries, [{ name: 'Hert Twee', tickets: 5, first: 1, last: 5 }, { name: 'Nieuw Hert', tickets: 9, first: 6, last: 14 }]);
    for (const field of ['id', 'drawAt', 'createdAt', 'commitment', 'title', 'prize', 'freeEntry']) assert.equal(changed[field], round[field]);
    assert.equal(changed.seed, undefined); assert.equal(changed.createdBy, undefined);
    assert.notEqual(changed.entriesHash, round.entriesHash);
    assert.equal(changed.entriesHash, createHash('sha256').update(JSON.stringify([['Hert Twee', 5], ['Nieuw Hert', 9]])).digest('hex'));
    assert.equal((await inspect(mf, round.id)).seed, original.seed);
    assert.deepEqual((await getState(mf)).round, changed);
  } finally { await mf.dispose(); }
});

test('edited lists reject invalid names, counts, extra fields and list limits atomically', async () => {
  const { mf } = runtime();
  try {
    const session = await login(mf);
    const { round } = await (await post(mf, '/api/raffle/schedule', schedule(), session)).json();
    const base = edit(round, [{ name: 'Hert', tickets: 1 }]);
    for (const input of [
      { ...base, id: 'bad-id' }, { ...base, expectedEntriesHash: 'bad-hash' }, { ...base, drawAt: Date.now() + 300_000 },
      { ...base, price: 10 }, { ...base, freeEntry: false },
      edit(round, [{ name: '', tickets: 1 }]), edit(round, [{ name: 'Hert\u0000', tickets: 1 }]),
      edit(round, [{ name: 'Hert', tickets: -1 }]), edit(round, [{ name: 'Hert', tickets: 0 }]),
      edit(round, [{ name: 'Hert', tickets: 1.5 }]), edit(round, [{ name: 'Hert', tickets: 10001 }]),
      edit(round, [{ name: 'Hert Een', tickets: 1 }, { name: 'HERT_EEN', tickets: 2 }]),
      edit(round, Array.from({ length: 501 }, (_, i) => ({ name: `Hert ${i}`, tickets: 1 }))),
      edit(round, Array.from({ length: 101 }, (_, i) => ({ name: `Hert ${i}`, tickets: 10000 }))),
    ]) assert.equal((await post(mf, '/api/raffle/entries', input, session)).status, 400);
    assert.equal((await getState(mf)).round.entriesHash, round.entriesHash);
  } finally { await mf.dispose(); }
});

test('concurrent edits cannot overwrite each other and a lost-response retry is idempotent', async () => {
  const { mf } = runtime();
  try {
    const session = await login(mf);
    const { round } = await (await post(mf, '/api/raffle/schedule', schedule(), session)).json();
    const inputs = [edit(round, [{ name: 'Eerste wijziging', tickets: 10 }]), edit(round, [{ name: 'Tweede wijziging', tickets: 20 }])];
    const responses = await Promise.all(inputs.map(input => post(mf, '/api/raffle/entries', input, session)));
    assert.deepEqual(responses.map(result => result.status).sort(), [200, 409]);
    const winnerIndex = responses.findIndex(result => result.status === 200);
    const changed = (await responses[winnerIndex].json()).round;
    const repeated = await post(mf, '/api/raffle/entries', inputs[winnerIndex], session);
    assert.equal(repeated.status, 200); assert.equal((await repeated.json()).round.entriesHash, changed.entriesHash);
    assert.equal((await post(mf, '/api/raffle/entries', inputs[1 - winnerIndex], session)).status, 409);
    const current = (await getState(mf)).round;
    assert.equal(current.entriesHash, changed.entriesHash); assert.equal(current.commitment, round.commitment);
    const copies = await Promise.all([post(mf, '/api/raffle/entries', edit(current, []), session), post(mf, '/api/raffle/entries', edit(current, []), session)]);
    assert.deepEqual(copies.map(result => result.status), [200, 200]);
  } finally { await mf.dispose(); }
});

test('the deadline rejects edits before recovery processes an overdue draw', async () => {
  const { mf } = runtime();
  try {
    const session = await login(mf);
    const { round } = await (await post(mf, '/api/raffle/schedule', schedule(), session)).json();
    await post(mf, '/__test/due', { id: round.id });
    assert.equal((await inspect(mf, round.id)).status, 'scheduled');
    assert.equal((await post(mf, '/api/raffle/entries', edit(round, [{ name: 'Too late', tickets: 999 }]), session)).status, 409);
    const raw = await inspect(mf, round.id);
    assert.equal(raw.entriesHash, round.entriesHash); assert.equal(raw.totalTickets, round.totalTickets);
    const drawn = (await getState(mf)).round;
    assert.equal(drawn.status, 'drawn'); assert.equal(await verifyRaffle(drawn), true);
    assert.equal((await post(mf, '/api/raffle/entries', edit(round, round.entries.map(({ name, tickets }) => ({ name, tickets }))), session)).status, 409);
  } finally { await mf.dispose(); }
});

test('removing everyone is allowed before cutoff and cancels cleanly if the draw remains empty', async () => {
  const { mf } = runtime();
  try {
    const session = await login(mf);
    const { round } = await (await post(mf, '/api/raffle/schedule', schedule(), session)).json();
    const update = await post(mf, '/api/raffle/entries', edit(round, []), session);
    assert.equal(update.status, 200);
    const empty = (await update.json()).round;
    assert.equal(empty.status, 'scheduled'); assert.equal(empty.totalTickets, 0); assert.deepEqual(empty.entries, []); assert.equal(empty.seed, undefined);
    assert.equal(empty.entriesHash, createHash('sha256').update('[]').digest('hex'));
    const restored = await post(mf, '/api/raffle/entries', edit(empty, [{ name: 'Terug Hert', tickets: 1 }]), session);
    assert.equal(restored.status, 200);
    const again = (await restored.json()).round;
    assert.equal((await post(mf, '/api/raffle/entries', edit(again, []), session)).status, 200);
    await post(mf, '/__test/due', { id: round.id });
    const cancelled = (await getState(mf)).round;
    assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.cancellationReason, 'Geen deelnemers bij de trekking.');
    assert.equal(cancelled.winner, undefined); assert.equal(cancelled.winningTicket, undefined);
    assert.equal(createHash('sha256').update(`hh-raffle-seed-v1\n${cancelled.seed}`).digest('hex'), round.commitment);
    await post(mf, '/__test/repeat', {});
    assert.equal((await getState(mf)).round.cancelledAt, cancelled.cancelledAt);
    assert.equal((await post(mf, '/api/raffle/entries', edit(empty, [{ name: 'Too late', tickets: 1 }]), session)).status, 409);
    assert.equal((await post(mf, '/api/raffle/schedule', schedule(), session)).status, 200);
  } finally { await mf.dispose(); }
});

test('ticket selection rejects biased values instead of wrapping them', () => {
  assert.equal(ticketFromHash('ffffffff'.repeat(8), 3), null);
  assert.equal(ticketFromHash('ffffffff00000002' + '00000000'.repeat(6), 3), 3);
  assert.equal(ticketFromHash('00000000'.repeat(8), 1), 1);
});
