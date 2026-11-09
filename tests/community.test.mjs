import test from 'node:test';
import assert from 'node:assert/strict';
import { awardFrom, monthKey, monthlyLeaders, overlapsDay, weeklyRound } from '../lib/community.ts';

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

test('weekly cards choose an active skill ahead of future and completed rounds', () => {
  const now = Date.parse('2026-11-09T12:00:00Z');
  const skill = { ...base, metric: 'hunter', title: 'Skill of the Week Hunter' };
  const active = { ...skill, id: 2, startsAt: '2026-11-05T23:35:00Z', endsAt: '2026-11-15T22:59:00Z' };
  const next = { ...skill, id: 3, startsAt: '2026-11-20T11:00:00Z', endsAt: '2026-11-27T22:59:00Z' };
  const result = weeklyRound([next, skill, active, base], 'skill', now);
  assert.equal(result.state, 'active');
  assert.deepEqual(result.events.map(e => e.id), [2]);
});

test('the entire latest boss round stays selectable without mixing earlier rounds', () => {
  const earlier = { ...base, id: 9, startsAt: '2026-10-12T11:00:00Z', endsAt: '2026-10-18T22:59:00Z' };
  const second = { ...base, id: 2, metric: 'araxxor', title: 'Boss of the week Araxxor' };
  const result = weeklyRound([second, earlier, base], 'boss', Date.parse('2026-11-09T12:00:00Z'));
  assert.equal(result.state, 'past');
  assert.deepEqual(result.events.map(e => e.id), [1, 2]);
});

test('upcoming rounds take precedence over old results and use the nearest start', () => {
  const soon = { ...base, id: 3, startsAt: '2026-11-10T11:00:00Z', endsAt: '2026-11-17T22:59:00Z' };
  const later = { ...soon, id: 4, startsAt: '2026-11-20T11:00:00Z', endsAt: '2026-11-27T22:59:00Z' };
  const result = weeklyRound([base, later, soon], 'boss', Date.parse('2026-11-09T12:00:00Z'));
  assert.equal(result.state, 'upcoming');
  assert.deepEqual(result.events.map(e => e.id), [3]);
});

test('weekly event boundaries are precise, with empty and invalid records handled', () => {
  assert.equal(weeklyRound([base], 'boss', Date.parse(base.startsAt)).state, 'active');
  assert.equal(weeklyRound([base], 'boss', Date.parse(base.endsAt)).state, 'past');
  assert.equal(weeklyRound([base], 'skill', Date.now()).state, 'empty');
  assert.equal(weeklyRound([{ ...base, startsAt: 'invalid' }], 'boss', Date.now()).state, 'empty');
});
