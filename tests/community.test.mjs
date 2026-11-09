import test from 'node:test';
import assert from 'node:assert/strict';
import { awardFrom, monthKey, monthlyLeaders, overlapsDay } from '../lib/community.ts';

const base = { id: 1, title: 'Boss of the week Test', metric: 'scurrius', type: 'classic', groupId: 7059, startsAt: '2026-10-26T11:00:00Z', endsAt: '2026-11-01T22:59:00Z', participantCount: 3 };
const player = (id, gained, metric = 'scurrius') => ({ player: { id, username: `player ${id}`, displayName: `Player ${id}` }, deltas: [{ metric, values: { gained } }] });
test('awards all positive tied leaders, regardless of incoming order', () => {
  const award = awardFrom({ ...base, participations: [player(1, 20), player(2, 100), player(3, 100)] });
  assert.deepEqual(award.winners.map(p => p.id), [2, 3]);
  assert.equal(award.unit, 'kills');
});
test('zero, missing and negative gains never generate a winner', () => {
  assert.equal(awardFrom({ ...base, participations: [player(1, 0), player(2, -1), { player: { id: 3 }, deltas: [] }] }).winners.length, 0);
});
test('combined competitions use total points, not a component metric', () => {
  const award = awardFrom({ ...base, metrics: [{ metric: 'scurrius' }, { metric: 'araxxor' }], participations: [player(1, 10, 'total'), player(2, 20, 'total')] });
  assert.equal(award.winners[0].id, 2);
  assert.equal(award.unit, 'punten');
});
test('monthly wins count tied wins equally and keep tied monthly leaders', () => {
  const a = awardFrom({ ...base, participations: [player(1, 10), player(2, 10)] });
  const b = awardFrom({ ...base, id: 2, participations: [player(1, 5), player(2, 5)] });
  assert.deepEqual(monthlyLeaders([a, b]).map(p => [p.id, p.wins]), [[1, 2], [2, 2]]);
});
test('month attribution and multi-day calendar use Dutch timezone at boundaries', () => {
  assert.equal(monthKey('2026-10-31T23:30:00Z'), '2026-11');
  assert.equal(monthKey('2026-06-30T22:30:00Z'), '2026-07');
  assert.equal(overlapsDay({ startsAt: '2026-10-31T23:30:00Z', endsAt: '2026-11-02T22:59:00Z' }, '2026-11-01'), true);
  assert.equal(overlapsDay({ startsAt: '2026-10-31T23:30:00Z', endsAt: '2026-11-02T22:59:00Z' }, '2026-10-31'), false);
});
