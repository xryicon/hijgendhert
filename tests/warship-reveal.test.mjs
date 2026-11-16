import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { build } = createRequire(import.meta.resolve('wrangler/package.json'))('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ stdin: { contents: `export * from './lib/warship-reveal'; export {generateFleet} from './lib/warship-fleet'; export {validFleet} from './lib/warships';`, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { revealDuration, revealView, generateFleet, validFleet } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const at = Date.parse('2026-11-17T12:00:00Z');
const players = [{ id: 1, rsn: 'Kapitein A', team: 0, captain: true }, { id: 2, rsn: 'Kapitein B', team: 1, captain: true }, { id: 3, rsn: 'Hert A', team: 0, captain: false }];
const game = pace => ({ status: 'setup', teamAssignment: { mode: 'random', players }, reveal: { drawId: 'test', at: new Date(at).toISOString(), opensAt: new Date(at + (pace === 2 ? revealDuration(3) : 13800)).toISOString(), headline: 'Test', message: 'Test', pace } });
test('cinematic timing gives each name a spotlight and a flight before arrival, including late joins', () => {
  const g = game(2);
  assert.equal(revealDuration(3), 37000);
  assert.equal(revealView(g, true, at - 1).current, null);
  assert.equal(revealView(g, true, at + 5000).current.id, 1);
  for (const elapsed of [8999, 9000, 11599, 11600, 12699]) assert.deepEqual(revealView(g, true, at + elapsed).revealed, []);
  assert.deepEqual(revealView(g, true, at + 12700).revealed.map(p => p.id), [1]);
  const late = revealView(g, true, at + 22000);
  assert.equal(late.current.id, 2); assert.deepEqual(late.revealed.map(p => p.id), [1, 2]);
  assert.equal(revealView(g, true, at + 36999).phase, 'drawing');
  assert.equal(revealView(g, true, at + 37000).phase, 'open');
  assert.deepEqual(revealView(g, false, at + 22000).revealed, []);
});
test('already scheduled reveals retain their original duration across deployment', () => {
  const g = game(undefined);
  assert.equal(revealView(g, true, at + 4100).current.id, 1);
  assert.deepEqual(revealView(g, true, at + 5800).revealed.map(p => p.id), [1]);
  assert.equal(revealView(g, true, at + 13800).phase, 'open');
});
test('automatic fleets always contain twelve distinct legal cells and vary their positions', () => {
  const fleets = Array.from({ length: 200 }, () => generateFleet());
  assert.ok(fleets.every(validFleet));
  assert.ok(new Set(fleets.map(f => JSON.stringify(f))).size > 1);
});
