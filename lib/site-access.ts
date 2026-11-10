import { timingSafeEqual } from 'node:crypto';
import { maintenancePage } from './maintenance-page';
import type { SiteAccessLimits } from '../worker/site-access';
import { loadSiteAppearance, type AppearanceEnv } from './site-appearance';

export type SiteAccessEnv = AppearanceEnv & {
  SITE_MAINTENANCE_MODE?: string;
  SITE_ACCESS_SECRET?: string;
  DISCORD_SESSION_SECRET?: string;
  SITE_ACCESS_LIMITS?: DurableObjectNamespace<SiteAccessLimits>;
};

// Only the salted verifier is bundled into the server. The access code is never
// sent to the browser, embedded in the page, or recorded in application logs.
const ACCESS_CODE_SALT = 'f04c28f8fd6ebccc817121bf040395281f967b78d6a211f2d45c12d899df7db3';
const ACCESS_CODE_HASH = '170e8666fa636f3ae3e866eec72d5ba9ed6e662867060044b75ff1ce6473e183';
const ACCESS_CODE_ITERATIONS = 100_000;
const COOKIE_NAME = '__Host-hh-preview';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();
const PUBLIC_ASSETS = new Set([
  '/clan-logo.png', '/hijgend-hert-woodland.webp', '/fonts/cinzel-semibold.ttf',
  '/fonts/inter-regular.ttf', '/favicon.svg', '/christmas.css', '/christmas-evergreen.svg',
  '/hijgend-hert-woodland-winter.webp',
]);
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Pragma': 'no-cache',
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};
type Settings = { origin: string; secret: Uint8Array<ArrayBuffer> };
type GateError = 'invalid' | 'rate' | 'unavailable';

function settings(url: URL, env: SiteAccessEnv): Settings | null {
  const secret = env.SITE_ACCESS_SECRET || env.DISCORD_SESSION_SECRET || '';
  if (url.protocol !== 'https:' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
  const decoded = Buffer.from(secret, 'base64url');
  if (decoded.length !== 32 || decoded.toString('base64url') !== secret) return null;
  return { origin: url.origin, secret: new Uint8Array(decoded) };
}

function safeNext(value: string | null | undefined, origin: string): string {
  if (!value || value.length > 1024 || !value.startsWith('/') || value.startsWith('//')) return '/';
  // Check decoded forms as well: backslashes, encoded separators, and control
  // characters must never turn a local redirect into another origin or header.
  let decoded = value;
  for (let depth = 0; depth < 3; depth++) {
    if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith('//')) return '/';
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { return '/'; }
  }
  if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith('//')) return '/';
  try {
    const target = new URL(value, origin);
    const decodedTarget = new URL(decoded, origin);
    if (target.origin !== origin || decodedTarget.origin !== origin) return '/';
    const forbidden = (path: string) => path === '/binnenkort' || path.startsWith('/binnenkort/') || path === '/api/site-access' || path.startsWith('/api/site-access/');
    if (forbidden(target.pathname) || forbidden(decodedTarget.pathname)) return '/';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return '/'; }
}

function gateLocation(next: string, error?: GateError): string {
  const query = new URLSearchParams({ next });
  if (error) query.set('error', error);
  return `/binnenkort?${query}`;
}
function redirect(location: string, extra: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { ...headers, ...extra, Location: location } });
}
function unavailable(): Response {
  return Response.json({ error: 'De website is in onderhoud. Gebruik de toegangscode op de onderhoudspagina.' }, { status: 503, headers: { ...headers, 'Retry-After': '900' } });
}
async function page(env: SiteAccessEnv, next: string, error?: GateError, status = 200, head = false): Promise<Response> {
  const { appearance } = head ? { appearance: { christmasEnabled: false } } : await loadSiteAppearance(env);
  return new Response(head ? null : maintenancePage({ next, error, christmasEnabled: appearance.christmasEnabled }), {
    status, headers: {
      ...headers, 'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; font-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'",
    },
  });
}

async function signingKey(config: Settings): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', config.secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function signingText(origin: string, payload: string): Uint8Array<ArrayBuffer> {
  // Separate the preview cookie from all Discord uses of the same secret and
  // invalidate preview sessions when the configured code verifier changes.
  return encoder.encode(`hh-site-access-cookie-v1\n${origin}\n${ACCESS_CODE_HASH}\n${payload}`);
}
async function validCookie(request: Request, config: Settings): Promise<boolean> {
  const raw = request.headers.get('Cookie') || '';
  if (raw.length > 16_384) return false;
  const matches = raw.split(';').map(part => part.trim()).filter(part => part.startsWith(`${COOKIE_NAME}=`));
  if (matches.length !== 1) return false;
  const value = matches[0].slice(COOKIE_NAME.length + 1);
  const match = /^v1\.([A-Za-z0-9_-]{1,512})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return false;
  try {
    const bytes = Buffer.from(match[1], 'base64url');
    const signature = Buffer.from(match[2], 'base64url');
    if (bytes.toString('base64url') !== match[1] || signature.toString('base64url') !== match[2]) return false;
    const payload: unknown = JSON.parse(bytes.toString('utf8'));
    if (!payload || typeof payload !== 'object') return false;
    const data = payload as Record<string, unknown>;
    const now = Date.now();
    if (data.v !== 1 || typeof data.iat !== 'number' || typeof data.exp !== 'number' || !Number.isSafeInteger(data.iat) || !Number.isSafeInteger(data.exp) || data.iat > now || data.iat < 0 || data.exp <= now || data.exp - data.iat !== SESSION_SECONDS * 1000 || typeof data.nonce !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(data.nonce)) return false;
    return await crypto.subtle.verify('HMAC', await signingKey(config), signature, signingText(config.origin, match[1]));
  } catch { return false; }
}
async function previewCookie(config: Settings): Promise<string> {
  const iat = Date.now();
  const payload = Buffer.from(JSON.stringify({ v: 1, iat, exp: iat + SESSION_SECONDS * 1000, nonce: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url') })).toString('base64url');
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', await signingKey(config), signingText(config.origin, payload))).toString('base64url');
  return `${COOKIE_NAME}=v1.${payload}.${signature}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}
async function validCode(code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(code), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: ACCESS_CODE_ITERATIONS, salt: Buffer.from(ACCESS_CODE_SALT, 'hex') }, key, 256);
  return timingSafeEqual(Buffer.from(derived), Buffer.from(ACCESS_CODE_HASH, 'hex'));
}
async function formBody(request: Request): Promise<URLSearchParams> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Invalid form');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2048) { await reader.cancel(); throw new Error('Form too large'); }
    chunks.push(value);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export async function siteAccessRoute(request: Request, env: SiteAccessEnv): Promise<Response | null> {
  if (env.SITE_MAINTENANCE_MODE === 'off') return null;
  const url = new URL(request.url);
  const read = request.method === 'GET' || request.method === 'HEAD';
  if (read && PUBLIC_ASSETS.has(url.pathname)) return null;
  // Discord still verifies the signature downstream; this bypass grants no page
  // or member API access and allows the registered bot endpoint to stay healthy.
  if (request.method === 'POST' && url.pathname === '/api/discord/interactions') return null;
  const config = settings(url, env);
  const next = safeNext(url.searchParams.get('next'), url.origin);
  if (url.pathname === '/api/site-access' && request.method === 'POST') {
    if (!config || !env.SITE_ACCESS_LIMITS) return page(env, next, 'unavailable', 503);
    if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return new Response('Ongeldig verzoek.', { status: 403, headers });
    if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') return new Response('Ongeldig formulier.', { status: 415, headers });
    let destination = next;
    try {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const ipHash = Buffer.from(await crypto.subtle.digest('SHA-256', encoder.encode(`hh-site-access-limit-v1\n${ip}`))).toString('hex');
      const limit = await env.SITE_ACCESS_LIMITS.getByName(ipHash).attempt();
      let form: URLSearchParams;
      try { form = await formBody(request); } catch {
        return redirect(gateLocation(destination, limit.allowed ? 'invalid' : 'rate'), limit.allowed ? {} : { 'Retry-After': String(limit.retryAfter) });
      }
      destination = safeNext(form.get('next'), url.origin);
      if (!limit.allowed) return redirect(gateLocation(destination, 'rate'), { 'Retry-After': String(limit.retryAfter) });
      if (form.getAll('code').length !== 1 || form.getAll('next').length > 1 || !(await validCode((form.get('code') || '').trim()))) return redirect(gateLocation(destination, 'invalid'));
      return redirect(destination, { 'Set-Cookie': await previewCookie(config) });
    } catch { return redirect(gateLocation(destination, 'unavailable')); }
  }
  if (config && await validCookie(request, config)) return url.pathname === '/binnenkort' ? redirect(next) : null;
  if (url.pathname === '/binnenkort' && read) {
    const suppliedError = url.searchParams.get('error');
    const error = config && env.SITE_ACCESS_LIMITS ? suppliedError === 'invalid' || suppliedError === 'rate' || suppliedError === 'unavailable' ? suppliedError : undefined : 'unavailable';
    return page(env, next, error, config && env.SITE_ACCESS_LIMITS ? 200 : 503, request.method === 'HEAD');
  }
  if (!read || url.pathname.startsWith('/api/') || /\.(?:js|mjs|css|map|json|wasm)$/i.test(url.pathname)) return unavailable();
  return redirect(gateLocation(safeNext(`${url.pathname}${url.search}`, url.origin)));
}
