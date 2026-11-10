import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { build } = createRequire(import.meta.resolve('wrangler/package.json'))('esbuild');
// Exercise the component's asynchronous transitions with controlled browser IO.
// Hooks are minimal adapters; no browser, Discord account or real timers are used.
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../components/session-provider.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'hook-adapter', setup(build) {
    build.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, args => ({ path: args.path, namespace: 'hooks' }));
    build.onLoad({ filter: /.*/, namespace: 'hooks' }, args => ({ contents: args.path.endsWith('jsx-runtime')
      ? 'export const jsx = (type, props) => ({type, props}); export const jsxs = jsx;'
      : `export const createContext = value => ({Provider: 'provider', value});
         export const useContext = context => context.value;
         export const useState = value => globalThis.__sessionHooks.useState(value);
         export const useRef = value => ({current:value});
         export const useCallback = fn => fn;
         export const useEffect = fn => globalThis.__sessionHooks.effects.push(fn);` }));
  } }],
});
const { default: SessionProvider } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function mount(fetcher, locks) {
  const originals = new Map(), timers = new Map(), stored = new Map();
  let state, nextTimer = 1, cleanup;
  const effects = [];
  const set = (key, value) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); };
  set('__sessionHooks', { effects, useState: value => { state = value; return [state, next => { state = typeof next === 'function' ? next(state) : next; }]; } });
  set('document', { hidden: false, querySelector: () => null, addEventListener() {}, removeEventListener() {} });
  set('window', { location: { search: '' }, setTimeout: fn => { const id = nextTimer++; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id), setInterval: () => 0, clearInterval() {}, addEventListener() {}, removeEventListener() {} });
  set('navigator', { locks });
  set('localStorage', { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) });
  set('fetch', fetcher);
  const context = SessionProvider({ children: null }).props.value;
  cleanup = effects.at(-1)();
  return { context, state: () => state, timers, dispose() { cleanup?.(); for (const [key, value] of originals) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; } } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('a verified profile wins over an older failed session request', async () => {
  let finish;
  const app = mount(() => new Promise(resolve => { finish = resolve; }));
  try {
    const member = { id: '234567890123456789', displayName: 'Hert' };
    app.context.acceptVerifiedMember(member);
    finish(Response.json({ reason: 'unavailable', reference: 'HH-SESSION-HTTP429' }, { status: 503 }));
    await settle();
    assert.equal(app.state().status, 'authenticated');
    assert.equal(app.state().member, member);
  } finally { app.dispose(); }
});

test('waiting on another tab cannot leave Account loading forever', async () => {
  let requests = 0;
  const app = mount(async () => { requests++; }, { request: (_name, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  try {
    assert.equal(app.state().status, 'loading');
    assert.equal(app.timers.size, 1);
    [...app.timers.values()][0]();
    await settle();
    assert.equal(app.state().status, 'unavailable');
    assert.equal(requests, 0);
    assert.equal(app.state().reference, 'HH-SESSION-CONNECTION');
  } finally { app.dispose(); }
});

test('Discord failure keeps a safe diagnostic and respects its retry deadline', async () => {
  let calls = 0;
  const app = mount(async () => { calls++; return Response.json({ reason: 'unavailable', reference: 'HH-SESSION-HTTP429' }, { status: 503, headers: { 'Retry-After': '120' } }); });
  try {
    await settle();
    assert.equal(app.state().reference, 'HH-SESSION-HTTP429');
    assert.ok(app.state().retryAt > Date.now() + 119_000);
    await app.context.refresh();
    assert.equal(calls, 1);
  } finally { app.dispose(); }
});
