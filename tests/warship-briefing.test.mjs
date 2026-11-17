import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { build } = createRequire(import.meta.resolve('wrangler/package.json'))('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ stdin: { contents: "export * from './lib/warship-briefing'; export * from './lib/warship-reveal'; export * from './lib/warship-intro';", resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { SEA_BRIEFING, SEA_BRIEFING_MS, seaBriefingStep, revealView, revealDuration, defaultSeaRules, seaRulesSchema, seaIntroSlides, seaIntroDuration, seaIntroStep, seaIntroAudience, introRevealDuration } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const rules = [{ id:'first', title:'Welkom', text:'Samen jagen.', seconds:10 }, { id:'second', title:'Bewijs', text:'Staff controleert iedere drop.', seconds:15 }];
const objectives = [{ id:'zulrah', boss:'zulrah', item:'Tanzanite fang', shots:2, limit:3 }, { id:'hydra', boss:'alchemical_hydra', item:"Hydra's claw", shots:4, limit:2 }];
const slides = seaIntroSlides(rules, objectives);
const at = Date.parse('2026-11-18T12:00:00Z');
const players = [{ id:1, rsn:'Alpha', team:0, captain:true }, { id:2, rsn:'Beta', team:1, captain:true }];
const game = pace => ({ status:'setup', teamAssignment:{ mode:'random', players }, reveal:{ at:new Date(at).toISOString(), opensAt:new Date(at + (pace === 4 ? introRevealDuration(2, slides) : revealDuration(2, pace))).toISOString(), pace, ...(pace === 4 ? {slides} : {}) } });

test('admin rules require unique identifiers, meaningful content and bounded reading times', () => {
  assert.equal(seaRulesSchema.safeParse(rules).success, true);
  assert.equal(seaRulesSchema.safeParse(defaultSeaRules()).success, true);
  for(const bad of [[], [...rules, rules[0]], Array.from({length:13}, (_,i)=>({...rules[0],id:String(i)})), [{...rules[0],seconds:7}], [{...rules[0],seconds:46}], [{...rules[0],seconds:10.5}], [{...rules[0],title:' '}], [{...rules[0],text:'a'.repeat(361)}], [{...rules[0],admin:true}]]) assert.equal(seaRulesSchema.safeParse(bad).success,false);
});
test('rules and configured drops share a precise ordered timeline, including late arrivals', () => {
  assert.deepEqual(slides.map(s=>s.kind), ['rule','rule','drop','drop']);
  assert.equal(seaIntroDuration(slides),41000); assert.equal(introRevealDuration(2,slides),69000);
  assert.equal(seaIntroStep(slides,-1),null); assert.equal(seaIntroStep(slides,41000),null);
  for(const [time,index] of [[0,0],[9999,0],[10000,1],[24999,1],[25000,2],[32999,2],[33000,3],[40999,3]]) assert.equal(seaIntroStep(slides,time).index,index);
  assert.deepEqual(slides[2],{kind:'drop',...objectives[0],durationMs:8000});
  assert.equal(seaIntroStep(slides,26500).elapsedMs,1500);
});
test('future boss names and items stay private until their card begins', () => {
  assert.deepEqual(seaIntroAudience(slides,-1,false).map(s=>s.kind), ['rule','rule','hidden_drop','hidden_drop']);
  const first = seaIntroAudience(slides,25000,false);
  assert.equal(first[2].item,'Tanzanite fang'); assert.equal(first[3].boss,undefined); assert.equal(first[3].item,undefined);
  assert.deepEqual(seaIntroAudience(slides,33000,false),slides);
  assert.deepEqual(seaIntroAudience(slides,-1,true),slides);
});
test('teams stay hidden throughout all rules and drops; no fresh draw on late entry', () => {
  const g=game(4);
  for(const time of [0,10000,25000,33000,40999,45999]) {
    const view=revealView(g,true,at+time);
    assert.equal(view.current,null); assert.deepEqual(view.revealed,[]);
  }
  assert.equal(revealView(g,true,at+46000).current.id,1);
  assert.equal(revealView(g,false,at+46000).current,null);
  assert.equal(revealView(g,true,at+69000).phase,'open');
  assert.equal(revealView(g,true,at+25000).briefing.durationMs,41000);
});
test('existing pace 2 and 3 announcements keep their original clocks without audio', () => {
  assert.equal(SEA_BRIEFING_MS,70500); assert.equal(SEA_BRIEFING.length,6);
  let time=0; for(const [i,rule] of SEA_BRIEFING.entries()) { assert.equal(seaBriefingStep(time).index,i); time+=rule.durationMs; }
  assert.equal(seaBriefingStep(time),null);
  assert.equal(revealView(game(3),true,at+75499).current,null);
  assert.equal(revealView(game(3),true,at+75500).current.id,1);
  assert.equal(revealView(game(2),true,at+5000).current.id,1);
  assert.equal(revealView(game(2),true,at+5000).briefing,null);
});
