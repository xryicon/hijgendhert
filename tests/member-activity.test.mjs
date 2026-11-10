import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { build } = createRequire(import.meta.resolve('wrangler/package.json'))('esbuild');
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../lib/member-activity.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' });
const { memberActivities } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const snapshot = (day, level, kills, extra = {}) => ({ playerId: 701, createdAt: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`, data: { skills: { attack: { level }, overall: { level: 2000 + level } }, bosses: { vorkath: { kills } } }, ...extra });
const now = Date.parse('2026-11-01T00:00:00Z');

test('activities compare ordered snapshots, deduplicate, bound to ten and retain measured intervals', () => {
  const rows = Array.from({ length: 12 }, (_, i) => snapshot(i + 1, 70 + i, 100 + 10 * i));
  const result = memberActivities([...rows.reverse(), rows[0]], 701, [], now);
  assert.equal(result.length, 10); assert.equal(new Set(result.map(a => a.id)).size, 10);
  assert.equal(result[0].at, '2026-10-12T00:00:00Z'); assert.equal(result[0].since, '2026-10-11T00:00:00Z');
  assert.ok(result.some(a => a.title === 'Attack level 81'));
  assert.ok(result.some(a => a.title === 'Vorkath · +10 KC'));
  assert.equal(result.some(a => /overall/i.test(a.title)), false);
});
test('missing, unranked, declining, foreign, future and invalid measurements never invent gains', () => {
  assert.deepEqual(memberActivities([snapshot(1, 85, -1), snapshot(2, 85, 100)], 701, [], now), []);
  assert.deepEqual(memberActivities([snapshot(1, 85, 100), snapshot(2, 84, 90)], 701, [], now), []);
  assert.deepEqual(memberActivities([snapshot(1, 85, 100), snapshot(2, 99, 999, { playerId: 702 }), snapshot(3, 99, 999, { createdAt: '2099-01-01' }), { playerId: 701, createdAt: 'invalid' }], 701, [], now), []);
  assert.deepEqual(memberActivities([snapshot(1, 85, 100)], 701, [], now), []);
});
test('only confirmed finished event results enter the same chronological feed', () => {
  const event = { id: 7, title: 'Clanraid', status: 'finished', gained: 20, rank: 2, unit: 'kills', endsAt: '2026-10-30T00:00:00Z' };
  const result = memberActivities([snapshot(1, 85, 100), snapshot(2, 86, 110)], 701, [event, event, { ...event, id: 8, gained: 0 }, { ...event, id: 9, status: 'active' }], now);
  assert.equal(result.length, 3); assert.equal(result[0].kind, 'event'); assert.equal(result[0].detail, 'Plaats 2 · +20 kills');
});
