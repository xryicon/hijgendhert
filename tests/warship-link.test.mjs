import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { build } = createRequire(import.meta.resolve('wrangler/package.json'))('esbuild');
const bundle = await build({ stdin: { contents: `export * from './lib/warship-link'; export * from './lib/warship-layout';`, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { seaName, automaticSeaPlayer, seaRosterLayout } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const game = () => ({ published: true, status: 'setup', teamAssignment: {}, crew: [{ playerId: 1, rsn: 'Hert Een', userId: '' }, { playerId: 2, rsn: 'Hert Twee', userId: '' }], requests: [], audit: [] });
const actor = { id: '123', name: 'HERT_EEN', username: 'unrelated', staff: false };
test('whole names normalize case and RuneScape separators; ambiguous aliases never choose a team', () => {
  assert.equal(seaName(' HERT_EEN '), 'hert een');
  for (const name of ['[HH] Hert Een', 'Hert Een 🦌', 'Hért Een', 'hert\u200been', 'much too long name', '']) assert.equal(seaName(name), null);
  assert.equal(automaticSeaPlayer(game(), actor).playerId, 1);
  assert.equal(automaticSeaPlayer(game(), { ...actor, name: '[HH] Other', username: 'hert-twee' }).playerId, 2);
  assert.equal(automaticSeaPlayer(game(), { ...actor, username: 'Hert Twee' }), null);
  const duplicate = game(); duplicate.crew.push({ playerId: 3, rsn: 'hert-een', userId: '' });
  assert.equal(automaticSeaPlayer(duplicate, actor), null);
});
test('automatic matches respect publication, closed games, existing ownership, requests and staff decisions', () => {
  for (const mutate of [g => g.published = false, g => g.status = 'finished', g => g.status = 'cancelled', g => delete g.teamAssignment, g => g.crew[0].userId = 'other', g => g.crew[1].userId = actor.id, g => g.requests.push({ userId: actor.id, playerId: 2 }), g => g.requests.push({ userId: 'other', playerId: 1 }), g => g.manualLinkUsers = [actor.id]]) {
    const g = game(); mutate(g); assert.equal(automaticSeaPlayer(g, actor), null);
  }
});
test('roster pages keep readable row space across phone, laptop and large team stages', () => {
  for (const width of [119, 170, 300, 480, 640]) for (const height of [70, 140, 230, 350, 600]) for (const count of [1, 7, 20, 50]) {
    const layout = seaRosterLayout(width, height, count);
    assert.ok(layout.rows * 54 + (layout.rows - 1) * 8 <= height);
    assert.ok(layout.columns === 1 || width / layout.columns >= 200);
    const pages = Array.from({ length: layout.pages }, (_, p) => Array.from({ length: Math.min(layout.capacity, count - p * layout.capacity) }, (_, i) => p * layout.capacity + i)).flat();
    assert.deepEqual(pages, Array.from({ length: count }, (_, i) => i));
  }
});
