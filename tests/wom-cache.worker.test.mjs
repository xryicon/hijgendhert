import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const requireWrangler = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare } = requireWrangler('miniflare');
const { build } = requireWrangler('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://clan.example';
const bundle = await build({ stdin: { contents: `
  import { WomCache } from './worker/wom-cache.ts';
  import { readWiseOldMan, womConnection, womErrorCode, womRetryAfter } from './lib/wise-old-man.ts';
  export { WomCache };
  export default { async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/legacy') {
      const body = await request.json();
      for(const item of body) await caches.default.put(new Request(url.origin + item.path), Response.json(item.data, {headers: {'Cache-Control':'public, max-age=86400'}}));
      return new Response('ok');
    }
    try { return Response.json(await readWiseOldMan(url.searchParams.get('path') || '/groups/7059', url.origin, {...womConnection(env), retryRejectedKey:url.searchParams.has('retry')})); }
    catch(error) { return Response.json({code:womErrorCode(error), error:error.message}, {status:503,headers:{'Retry-After':womRetryAfter(error)}}); }
  } };`, resolveDir: root, sourcefile: 'wom-cache-test-worker.ts', loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', external: ['cloudflare:workers'] });
function runtime(options = {}) {
  const calls = [];
  const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate:'2026-05-15', compatibilityFlags:['nodejs_compat'],
    bindings: { WOM_AUTH_MODE:'public', WOM_API_KEY:'old-invalid-test-key', ...options.bindings }, durableObjects:{WOM_CACHE:{className:'WomCache',useSQLite:true}},
    ...(options.persist ? {durableObjectsPersist:options.persist} : {}), outboundService:async request => {
      assert.equal(new URL(request.url).origin,'https://api.wiseoldman.net');
      assert.equal(request.headers.has('x-api-key'),false); assert.equal(request.headers.has('Authorization'),false);
      calls.push({url:request.url,at:Date.now()});
      if(options.delay) await new Promise(resolve=>setTimeout(resolve,options.delay));
      return options.failure ? Response.json({}, {status:429,headers:{'Retry-After':String(options.retry || 7200)}}) : Response.json({id:7059,memberCount:423,memberships:[],source:'provider'});
    }});
  return {mf,calls};
}
const read = (mf, suffix='') => mf.dispatchFetch(origin + '/read' + suffix);
const legacy = (mf, rows) => mf.dispatchFetch(origin + '/legacy',{method:'POST',body:JSON.stringify(rows)});
const oldGroup = (age) => ({data:{id:7059,memberCount:423,memberships:[],source:'saved'},fetchedAt:new Date(Date.now()-age).toISOString(),stale:false});

test('profile boss snapshots share the cache while unsupported player paths stay blocked', async()=>{
  const {mf,calls}=runtime();
  try {
    const response=await read(mf,'?path='+encodeURIComponent('/players/hert'));
    assert.equal(response.status,200); assert.equal(calls.length,1);
    assert.equal((await read(mf,'?path='+encodeURIComponent('/players/hert'))).status,200); assert.equal(calls.length,1);
    const invalid=await read(mf,'?path='+encodeURIComponent('/players/hert/competitions/standings'));
    assert.equal(invalid.status,503); assert.equal((await invalid.json()).code,'WOM_PATH'); assert.equal(calls.length,1);
  } finally { await mf.dispose(); }
});

test('shared cache coalesces simultaneous requests and spaces independent cache misses', async()=>{
  const {mf,calls}=runtime({delay:80});
  try {
    const responses=await Promise.all(Array.from({length:12},()=>read(mf)));
    assert.ok(responses.every(response=>response.status===200)); assert.equal(calls.length,1);
    const second=await read(mf,'?path='+encodeURIComponent('/groups/7059/competitions'));
    assert.equal(second.status,200); assert.equal(calls.length,2);
    assert.ok(calls[1].at-calls[0].at>=3800, 'Different cache misses are spaced, not sent as a burst');
    assert.equal((await (await read(mf)).json()).stale,false); assert.equal(calls.length,2);
  } finally { await mf.dispose(); }
});

test('cold deployment honors the known public pause even without any edge cache', async()=>{
  const deadline=new Date(Date.now()+7200_000).toISOString();
  const {mf,calls}=runtime({bindings:{WOM_PUBLIC_PAUSE_UNTIL:deadline}});
  try {
    const response=await read(mf,'?retry=1');
    assert.equal(response.status,503); assert.ok(Number(response.headers.get('Retry-After'))>7100);
    const body=await response.json(); assert.equal(body.code,'WOM_HTTP_429'); assert.match(body.error,/opnieuw vanaf/); assert.equal(calls.length,0);
  } finally { await mf.dispose(); }
});

test('legacy data and a longer cooldown survive a real object storage restart', async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'hh-wom-cache-'));
  const first=runtime({persist:directory});
  let firstDisposed=false;
  const initial=oldGroup(2*3600_000);
  try {
    await legacy(first.mf,[{path:'/__wom-data/v1/groups/7059',data:initial},{path:'/__wom-data/rate-limit/v2/public',data:{retryAt:Date.now()+10800_000,code:'WOM_HTTP_429'}}]);
    const value=await (await read(first.mf,'?retry=1')).json();
    assert.equal(value.data.source,'saved'); assert.equal(value.stale,true); assert.equal(value.fetchedAt,initial.fetchedAt); assert.equal(first.calls.length,0);
    await first.mf.dispose();
    firstDisposed=true;
    const second=runtime({persist:directory});
    try {
      const restored=await (await read(second.mf)).json();
      assert.equal(restored.data.source,'saved'); assert.equal(restored.stale,true); assert.equal(restored.fetchedAt,initial.fetchedAt);
      const missing=await read(second.mf,'?path='+encodeURIComponent('/groups/7059/competitions'));
      assert.equal(missing.status,503); assert.ok(Number(missing.headers.get('Retry-After'))>10700); assert.equal(second.calls.length,0);
    } finally { await second.mf.dispose(); }
  } finally { if(!firstDisposed) await first.mf.dispose(); await rm(directory,{recursive:true,force:true}); }
});

test('old successful data is immediately returned while one background refresh runs', async()=>{
  const {mf,calls}=runtime({delay:600}); const initial=oldGroup(2*86400_000);
  try {
    await legacy(mf,[{path:'/__wom-data/v1/groups/7059',data:initial}]);
    const started=Date.now(); const result=await (await read(mf)).json();
    assert.ok(Date.now()-started<500,'A saved response should not wait for the provider');
    assert.equal(result.stale,true); assert.equal(result.fetchedAt,initial.fetchedAt);
    await new Promise(resolve=>setTimeout(resolve,750));
    const fresh=await (await read(mf)).json(); assert.equal(fresh.data.source,'provider'); assert.equal(fresh.stale,false); assert.equal(calls.length,1);
  } finally { await mf.dispose(); }
});

test('seven-day retention expires and a rate limit applies to every path', async()=>{
  const {mf,calls}=runtime({failure:true});
  try {
    await legacy(mf,[{path:'/__wom-data/v1/groups/7059',data:oldGroup(8*86400_000)}]);
    const first=await read(mf); assert.equal(first.status,503); assert.equal((await first.json()).code,'WOM_HTTP_429');
    const second=await read(mf,'?path='+encodeURIComponent('/groups/7059/competitions')+'&retry=1');
    assert.equal(second.status,503); assert.equal(calls.length,1);
  } finally { await mf.dispose(); }
});
