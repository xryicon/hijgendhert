import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { build } = createRequire(import.meta.resolve('wrangler/package.json'))('esbuild');
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../lib/notifications.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' });
const { updateNotificationFeed: update, visibleNotifications: visible } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const now = Date.parse('2026-11-10T16:00:00Z');
const day = 86_400_000;
const iso = ms => new Date(ms).toISOString();
const competition = (extra = {}) => ({ id: 1, groupId: 7059, title: 'Skill of the Week Hunter', metric: 'hunter', startsAt: iso(now + day), endsAt: iso(now + 8 * day), ...extra });
const activity = (extra = {}) => ({ id: 'raid-night', title: 'Clanraid', category: 'raid', startsAt: iso(now + day), endsAt: iso(now + day + 3_600_000), description: 'Samen raiden', ...extra });
const raffle = (extra = {}) => ({ id: '018e28de-cba8-4e33-af2b-ce5d3f9cc17c', title: 'Novemberloterij', prize: 'Clanprijs', status: 'scheduled', createdAt: now - 60000, drawAt: now + day, ...extra });

test('announcements use stable ids, true raffle dates and fixed internal destinations', () => {
  const updates = { competitions: [competition()], calendar: [activity()], raffles: [raffle()] };
  const first = update(null, updates, now);
  assert.equal(first.notifications.length, 3);
  assert.equal(first.notifications.find(n => n.kind === 'raffle').createdAt, iso(now - 60000));
  const repeated = update(first, updates, now + 60000);
  assert.deepEqual(repeated.notifications, first.notifications);
  assert.ok(first.notifications.every(n => ['/events?dag=2026-11-11#kalender', '/events#raffle'].includes(n.href)));
  assert.equal(first.notifications.some(n => n.kind === 'event_start'), false);
});

test('a start is emitted once when due, including during a source outage after first observation', () => {
  const first = update(null, { competitions: [competition()] }, now);
  const due = update(first, {}, now + day);
  assert.equal(due.notifications.filter(n => n.kind === 'event_start').length, 1);
  assert.equal(due.notifications.find(n => n.kind === 'event_start').createdAt, iso(now + day));
  const later = update(due, {}, now + day + 60000);
  assert.deepEqual(later.notifications, due.notifications);
});

test('first observation of historical rows does not flood the feed with new announcements', () => {
  const state = update(null, { competitions: Array.from({ length: 1000 }, (_, i) => competition({ id: i + 1, startsAt: iso(now - (i + 40) * day), endsAt: iso(now - (i + 33) * day) })),
    calendar: [activity({ startsAt: iso(now - 50 * day), endsAt: iso(now - 49 * day) })],
    raffles: [raffle({ createdAt: now - 40 * day, drawAt: now - 33 * day, status: 'drawn' })] }, now);
  assert.deepEqual(state.notifications, []);
  assert.deepEqual(state.sources.competitions, []);
});

test('calendar changes create one revision and rescheduling removes the obsolete start', () => {
  const original = activity({ startsAt: iso(now - 60000), endsAt: iso(now + 3600000) });
  const first = update(null, { calendar: [original] }, now);
  assert.ok(first.notifications.some(n => n.kind === 'event_start'));
  const future = { ...original, title: 'Clanraid verplaatst', startsAt: iso(now + day), endsAt: iso(now + day + 3600000) };
  const changed = update(first, { calendar: [future] }, now + 60000);
  assert.equal(changed.notifications.filter(n => n.kind === 'calendar_update').length, 1);
  assert.equal(changed.notifications.some(n => n.kind === 'event_start'), false);
  assert.deepEqual(update(changed, { calendar: [future] }, now + 120000).notifications, changed.notifications);
});

test('live participant counts do not generate schedule changes, and missing future entries cannot start later', () => {
  const first = update(null, { competitions: [competition({ participantCount: 20 })] }, now);
  const unchanged = update(first, { competitions: [competition({ participantCount: 21 })] }, now + 1000);
  assert.equal(unchanged.notifications.length, 1);
  const removed = update(unchanged, { competitions: [] }, now + 2000);
  assert.deepEqual(removed.notifications, []);
  assert.deepEqual(update(removed, {}, now + day).notifications, []);
});

test('malformed data, foreign groups and external hrefs never produce invented notifications', () => {
  const first = update(null, { competitions: [competition()], calendar: [activity()] }, now);
  const offline = update(first, { competitions: { error: 'offline' }, calendar: [{ broken: true }] }, now + 1000);
  assert.deepEqual(offline.notifications, first.notifications);
  const partial = update(first, { calendar: [activity({ id: 'another-raid' }), { id: 'raid-night', broken: true }] }, now + 2000);
  assert.ok(partial.notifications.some(n => n.id === 'calendar:raid-night:new'), 'A malformed row must not erase the previous valid activity');
  const bad = update(null, { competitions: [competition({ groupId: 42 }), competition({ startsAt: 'bad' }), competition({ title: '' })], calendar: [activity({ id: '../bad' })], raffles: [raffle({ createdAt: now + 1000 })] }, now);
  assert.deepEqual(bad.notifications, []);
  const injected = update(null, { calendar: [activity({ discordUrl: 'javascript:alert(1)', href: 'https://evil.invalid' })] }, now);
  assert.equal(injected.notifications[0].href, '/events?dag=2026-11-11#kalender');
});

test('cancelled raffle announcements disappear and new snapshots do not mutate previous state', () => {
  const first = update(null, { raffles: [raffle()] }, now);
  const saved = JSON.stringify(first);
  const cancelled = update(first, { raffles: [raffle({ status: 'cancelled' })] }, now + 1000);
  assert.deepEqual(cancelled.notifications, []);
  assert.equal(JSON.stringify(first), saved);
});

test('stored and displayed feeds are bounded, chronological and expire', () => {
  const state = update(null, { calendar: Array.from({ length: 300 }, (_, i) => activity({ id: `raid-${i}`, title: `Clanraid ${i}` })) }, now);
  assert.equal(state.notifications.length, 100);
  assert.equal(state.sources.calendar.length, 200);
  assert.equal(visible(state, now).length, 50);
  assert.deepEqual(visible(state, now + 31 * day), []);
  const repeat = update(state, { calendar: Array.from({ length: 300 }, (_, i) => activity({ id: `raid-${i}`, title: `Clanraid ${i}` })) }, now + 60000);
  assert.deepEqual(repeat.notifications, state.notifications, 'Untracked excess rows must not reappear as new at each poll');
});

test('calendar links target the actual Dutch start day around midnight', () => {
  const state = update(null, { calendar: [activity({ startsAt: '2026-11-11T23:30:00Z', endsAt: '2026-11-12T01:00:00Z' })] }, now);
  assert.equal(state.notifications[0].href, '/events?dag=2026-11-12#kalender');
});
