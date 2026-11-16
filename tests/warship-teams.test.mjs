import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { build } = createRequire(import.meta.resolve('wrangler/package.json'))('esbuild');
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../lib/warship-teams.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' });
const { balancedTeams, manualTeams, teamBalance } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const players = values => values.map((ehb, i) => ({ id: i + 1, rsn: `Hert ${i + 1}`, username: `hert ${i + 1}`, ehb, updatedAt: null }));
const seeded = seed => max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
function optimum(values, captains) {
  let best = Infinity;
  for (let mask = 0; mask < 2 ** values.length; mask++) {
    if (!(mask & (1 << (captains[0] - 1))) || mask & (1 << (captains[1] - 1))) continue;
    const sides = values.map((ehb, i) => ({ ehb, team: (mask & (1 << i)) ? 0 : 1 }));
    const b = teamBalance(sides);
    if (Math.abs(b.sizes[0] - b.sizes[1]) <= 1) best = Math.min(best, b.gap);
  }
  return best;
}
test('small pools reach the best possible EHB split with fixed opposite captains', () => {
  for (const values of [[900, 100, 700, 300], [300, 2, 180, 40, 5], [800, 3, 0, 12, 150, 60, 90, 5], [8.22, 9.94, 0.01, 3.16, 7.52, 4.14]]) {
    const result = balancedTeams(players(values), [1, 2], seeded(7));
    const balance = teamBalance(result);
    assert.equal(balance.gap, optimum(values, [1, 2]));
    assert.equal(result.find(p => p.id === 1).team, 0); assert.equal(result.find(p => p.id === 2).team, 1);
    assert.equal(new Set(result.map(p => p.id)).size, values.length); assert.equal(result.filter(p => p.captain).length, 2);
    assert.ok(Math.abs(balance.sizes[0] - balance.sizes[1]) <= 1);
  }
});
test('random captains are distinct, zero EHB is valid and equal ratings allow varied teams', () => {
  const layouts = new Set(), leaders = new Set();
  for (let seed = 1; seed < 40; seed++) {
    const result = balancedTeams(players([0, 0, 0, 0, 0, 0]), null, seeded(seed));
    assert.equal(result.filter(p => p.captain).length, 2);
    assert.deepEqual(teamBalance(result).sizes, [3, 3]);
    result.filter(p => p.captain).forEach(p => leaders.add(p.id));
    layouts.add(result.filter(p => p.team === 0).map(p => p.id).sort().join(','));
  }
  assert.equal(leaders.size, 6); assert.ok(layouts.size > 3);
});
test('large and odd pools remain complete, size-balanced and include captain EHB', () => {
  for (const n of [21, 50, 99, 100]) {
    const values = Array.from({ length: n }, (_, i) => i === 0 ? 5000 : (i * 157) % 1200);
    const result = balancedTeams(players(values), [1, 2], seeded(9));
    const b = teamBalance(result);
    assert.equal(result.length, n); assert.equal(new Set(result.map(p => p.id)).size, n); assert.ok(Math.abs(b.sizes[0] - b.sizes[1]) <= 1);
    assert.equal(b.totals.reduce((sum, value) => sum + value, 0), values.reduce((sum, value) => sum + value, 0));
    assert.ok(b.percent < 2, JSON.stringify(b));
  }
});
test('missing ratings cannot silently count as zero in a balanced draw; manual mode labels missing data', () => {
  assert.throws(() => balancedTeams(players([null, 100]), null), /EHB ontbreekt/);
  assert.throws(() => balancedTeams(players([10, 20]), [1, 1]), /verschillende kapiteins/);
  assert.throws(() => balancedTeams(players([10, 20]), [1, 99]), /kapiteins/);
  assert.throws(() => manualTeams(players([10, 20]), [[1], [1]], [1, 1]), /één team/);
  const manual = manualTeams(players([null, 100]), [[1], [2]], [1, 2]);
  assert.equal(teamBalance(manual).missing, 1);
});
