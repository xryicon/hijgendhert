import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { build } = createRequire(import.meta.resolve('wrangler/package.json'))('esbuild');
const bundle = await build({entryPoints:[fileURLToPath(new URL('../lib/warship-proof.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'});
const {matchDiscordDrop,nextShotClaim,safeDiscordAttachment}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const goals=[{id:'bandos',boss:'general_graardor',item:'Bandos chestplate / tassets / boots',shots:2},{id:'cerb',boss:'cerberus',item:'Primordial / Pegasian / Eternal crystal',shots:3},{id:'zulrah',boss:'zulrah',item:'Tanzanite fang / Magic fang / Serpentine visage',shots:2}];
test('drop names match whole configured names and expand common item shorthand without guessing',()=>{
  for(const [caption,id] of [['Drop: Bandos tassets!','bandos'],['BANDOS BOOTS','bandos'],['Primordial crystal','cerb'],['Eternal crystal','cerb'],['Tanzanite fang gekregen','zulrah']])assert.equal(matchDiscordDrop(caption,goals)?.id,id);
  for(const caption of ['boots','Dragon boots','Tanzanite','Magic fangtastic','Geen naam','Bandos boots en Eternal crystal'])assert.equal(matchDiscordDrop(caption,goals),null);
  const duplicate=[{id:'one',boss:'general_graardor',item:'Godsword shard 1'},{id:'two',boss:'commander_zilyana',item:'Godsword shard 1'}];
  assert.equal(matchDiscordDrop('Godsword shard 1',duplicate),null);
  assert.equal(matchDiscordDrop('General Graardor Godsword shard 1',duplicate)?.id,'one');
});
test('shot credits are consumed once per reward and preserve links when more claims are approved',()=>{
  const g={config:{objectives:goals},claims:[{id:'a',team:0,status:'approved',objectiveId:'bandos',reviewedAt:'2026-11-17T12:00:00Z'},{id:'b',team:0,status:'pending',objectiveId:'cerb',reviewedAt:null}],shots:[]};
  for(let i=0;i<2;i++){const c=nextShotClaim(g,0);assert.equal(c.id,'a');g.shots.push({team:0,cell:i,claimId:c.id});}
  assert.equal(nextShotClaim(g,0),null);assert.equal(nextShotClaim(g,1),null);
  g.claims[1].status='approved';g.claims[1].reviewedAt='2026-11-17T12:01:00Z';
  for(let i=0;i<3;i++){const c=nextShotClaim(g,0);assert.equal(c.id,'b');g.shots.push({team:0,cell:10+i,claimId:c.id});}
  assert.equal(nextShotClaim(g,0),null);assert.deepEqual(g.shots.slice(0,2).map(s=>s.claimId),['a','a']);
});
test('legacy shots reserve spent ammunition but are never assigned fabricated proof',()=>{
  const g={config:{objectives:goals},claims:[{id:'a',team:0,status:'approved',objectiveId:'bandos',reviewedAt:'2026-11-17T12:00:00Z'}],shots:[{team:0,cell:1}]};
  assert.equal(nextShotClaim(g,0).id,'a');assert.equal(g.shots[0].claimId,undefined);
  g.shots.push({team:0,cell:2,claimId:'a'});assert.equal(nextShotClaim(g,0),null);
});
test('only the exact Discord CDN attachment path can be used',()=>{
  assert.equal(safeDiscordAttachment('https://cdn.discordapp.com/attachments/123/456/drop.png?ex=1','123','456'),true);
  for(const url of ['https://evil.example/attachments/123/456/drop.png','https://cdn.discordapp.com.evil.example/attachments/123/456/drop.png','http://cdn.discordapp.com/attachments/123/456/drop.png','https://user@cdn.discordapp.com/attachments/123/456/drop.png','https://cdn.discordapp.com/attachments/123/4567/drop.png'])assert.equal(safeDiscordAttachment(url,'123','456'),false);
});
