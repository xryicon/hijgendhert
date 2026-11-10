import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { build } = createRequire(import.meta.resolve('wrangler/package.json'))('esbuild');
const result = await build({ entryPoints: [fileURLToPath(new URL('../lib/welcome.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'node', write: false });
const { nextBeginnerEvent, welcomeInput, DEFAULT_WELCOME } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

test('first clan evening chooses the soonest future beginner event and excludes ordinary, cancelled and started activities', () => {
  const now = Date.parse('2026-11-11T19:00:00Z');
  const event = (id, minutes, extra = {}) => ({ id, status: 'scheduled', beginnerFriendly: true, startsAt: new Date(now + minutes * 60000).toISOString(), ...extra });
  const events = [event('later', 90), event('cancelled', 1, { status: 'cancelled' }), event('started', 0), event('normal', 2, { beginnerFriendly: false }), event('past', -1), event('next', 5)];
  assert.equal(nextBeginnerEvent(events, now).id, 'next');
  assert.equal(events[0].id, 'later', 'selection must not reorder the calendar');
  assert.equal(nextBeginnerEvent(events, now + 100 * 60000), null);
  assert.equal(nextBeginnerEvent([{ id: 'legacy', status: 'scheduled', startsAt: new Date(now + 1).toISOString() }], now), null);
});

test('welcome content validates real image links and bounded member introductions', () => {
  assert.equal(DEFAULT_WELCOME.minimumTotal, 1250);
  for (const imageUrl of ['javascript:alert(1)', 'data:image/svg+xml,test', 'http://example.com/a.png', '//example.com/a.png', 'https://user:password@example.com/a.png']) assert.equal(welcomeInput.safeParse({ ...DEFAULT_WELCOME, photos: [{ imageUrl, caption: 'Clanavond' }] }).success, false);
  for (const imageUrl of ['https://example.com/clan.jpg', '/moments/clanavond.webp']) assert.equal(welcomeInput.safeParse({ ...DEFAULT_WELCOME, photos: [{ imageUrl, caption: 'Clanavond' }] }).success, true);
  assert.equal(welcomeInput.safeParse({ ...DEFAULT_WELCOME, photos: Array(7).fill({ imageUrl: '/clan-logo.png', caption: 'Te veel' }) }).success, false);
  assert.equal(welcomeInput.safeParse({ ...DEFAULT_WELCOME, members: [{ name: 'Hert', introduction: 'Ik leer graag samen bosses.', rsName: 'hert met spatie', avatarUrl: '' }] }).success, true);
});
