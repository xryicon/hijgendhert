import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const { build } = createRequire(import.meta.resolve('wrangler/package.json'))('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ stdin: { contents: `export * from './lib/warship-briefing'; export * from './lib/warship-reveal'; export * from './lib/warship-narrator';`, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { SEA_BRIEFING, SEA_BRIEFING_MS, seaBriefingStep, revealView, revealDuration, SeaNarrator } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('six Dutch rules follow measured narration lengths, with readable pauses and every audio file present', async () => {
  assert.equal(SEA_BRIEFING.length, 6); assert.equal(SEA_BRIEFING_MS, 70500);
  let at = 0;
  for (const [i, rule] of SEA_BRIEFING.entries()) {
    assert.ok(rule.durationMs > rule.audioMs + 1500);
    assert.equal(seaBriefingStep(at).index, i);
    assert.equal(seaBriefingStep(at + rule.durationMs - 1).index, i);
    assert.ok((await readFile(new URL(`../public${rule.audio}`, import.meta.url))).length > 50000);
    at += rule.durationMs;
  }
  assert.equal(seaBriefingStep(-1), null); assert.equal(seaBriefingStep(at), null);
  assert.equal(seaBriefingStep(35500).index, 3, 'Late viewers join the current rule');
});
test('new schedules hide all assignments throughout rules, then reveal normally; old schedules retain their clocks', () => {
  const at = Date.parse('2026-11-18T12:00:00Z');
  const players = [{ id: 1, rsn: 'Alpha', team: 0, captain: true }, { id: 2, rsn: 'Beta', team: 1, captain: true }];
  const g = pace => ({ status: 'setup', teamAssignment: { mode: 'random', players }, reveal: { at: new Date(at).toISOString(), opensAt: new Date(at + revealDuration(2, pace)).toISOString(), pace } });
  const newest = g(3);
  assert.equal(revealDuration(2), 98500);
  for (const elapsed of [0, 12000, 35000, 70499, 70500, 75499]) {
    const view = revealView(newest, true, at + elapsed);
    assert.equal(view.current, null); assert.deepEqual(view.revealed, []);
  }
  assert.equal(revealView(newest, true, at + 75500).current.id, 1);
  assert.equal(revealView(newest, false, at + 75500).current, null);
  assert.equal(revealView(newest, true, at + 98500).phase, 'open');
  const old = revealView(g(2), true, at + 5000);
  assert.equal(old.current.id, 1); assert.equal(old.briefing, null); assert.equal(old.timing.introMs, 5000);
});

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function audio() {
  const starts = [], nodes = [];
  const context = { state: 'running', destination: {}, resume: async () => {}, close: async () => {}, decodeAudioData: async () => ({ duration: 10 }), createBufferSource: () => { const node = { connect() {}, disconnect() {}, stop() { node.stopped = true; }, start(when, offset) { starts.push(offset); } }; nodes.push(node); return node; } };
  return { context, starts, nodes };
}
test('mute and leaving the scene prevent delayed audio downloads from starting', async () => {
  const a = audio(), response = deferred();
  const narrator = new SeaNarrator(a.context, () => response.promise);
  const pending = narrator.play('/rule.mp3', () => 0, assert.fail);
  narrator.stop(); response.resolve(new Response(new Uint8Array([1,2]))); await pending;
  assert.deepEqual(a.starts, []); narrator.dispose();
});
test('narration seeks to the live clock, never queues overlapping rules, and skips elapsed clips', async () => {
  const a = audio(), narrator = new SeaNarrator(a.context, async () => new Response(new Uint8Array([1,2])));
  await narrator.play('/first.mp3', () => 3.5, assert.fail); assert.deepEqual(a.starts, [3.5]);
  await narrator.play('/second.mp3', () => 1, assert.fail); assert.equal(a.nodes[0].stopped, true);
  await narrator.play('/second.mp3', () => 12, assert.fail); assert.deepEqual(a.starts, [3.5, 1]);
  narrator.dispose(); assert.equal(a.nodes[1].stopped, true);
});
test('download errors surface without breaking the rules timeline and can be retried', async () => {
  const a = audio(); let unavailable = true, message = '';
  const narrator = new SeaNarrator(a.context, async () => unavailable ? new Response('', { status: 503 }) : new Response(new Uint8Array([1,2])));
  await narrator.play('/first.mp3', () => 0, text => { message = text; });
  assert.match(message, /niet worden geladen/); assert.deepEqual(a.starts, []);
  unavailable = false; await narrator.play('/first.mp3', () => 2, assert.fail); assert.deepEqual(a.starts, [2]); narrator.dispose();
});
