import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { DiscordMember } from './member-types';
import { discordAvatarUrl } from './member-avatars';

import type { ClanProgress } from '../worker/clan-progress';

export type DiscordEnv = {
  APP_ORIGIN?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_MEMBER_ROLE_IDS?: string;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_SESSION_SECRET?: string;
  PROGRESS?: DurableObjectNamespace<ClanProgress>;
  DISCORD_SYNC?: DurableObjectNamespace<import('../worker/clan-discord').ClanDiscord>;
};

const API = 'https://discord.com/api/v10';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const SCOPES = ['identify', 'guilds.members.read'];
const SESSION_COOKIE = '__Host-hh-member';
const STATE_COOKIE = '__Host-hh-discord-state';
const PROFILE_COOKIE = '__Host-hh-profile';
const MAX_SESSION_SECONDS = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();
const snowflake = z.string().regex(/^\d{17,20}$/);
const randomText = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

export type DiscordConfig = {
  origin: string; clientId: string; clientSecret: string; guildId: string;
  roleIds: string[]; sessionSecret: string;
  membershipChecks?: DurableObjectNamespace<ClanProgress>;
};
export type AccessCode = 'setup' | 'expired' | 'role' | 'server' | 'pending' | 'unavailable' | 'state' | 'cancelled';
export class DiscordAccessError extends Error {
  code: AccessCode;
  detail?: string;
  retryAfter?: number;
  constructor(code: AccessCode, detail?: string, retryAfter?: number) { super(code); this.name = 'DiscordAccessError'; this.code = code; this.detail = detail; this.retryAfter = retryAfter; }
}

export function discordErrorReference(stage: 'PAGE' | 'SESSION', error: unknown) {
  const detail = error instanceof DiscordAccessError ? error.detail || error.code.toUpperCase() : 'INTERNAL';
  return `HH-${stage}-${/^[A-Z0-9_]{1,40}$/.test(detail) ? detail : 'UNAVAILABLE'}`;
}

export function discordConfig(env: DiscordEnv): DiscordConfig | null {
  try {
    const origin = new URL(env.APP_ORIGIN || '');
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) return null;
    const clientId = snowflake.parse(env.DISCORD_CLIENT_ID);
    const guildId = snowflake.parse(env.DISCORD_GUILD_ID || '1073630238115897455');
    const roleIds = (env.DISCORD_MEMBER_ROLE_IDS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (!roleIds.length || roleIds.length > 20 || roleIds.some(id => !snowflake.safeParse(id).success || id === guildId)) return null;
    const sessionSecret = env.DISCORD_SESSION_SECRET || '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(sessionSecret) || Buffer.from(sessionSecret, 'base64url').length !== 32) return null;
    if (!env.DISCORD_CLIENT_SECRET || env.DISCORD_CLIENT_SECRET.length < 16) return null;
    return { origin: origin.origin, clientId, guildId, roleIds, sessionSecret, clientSecret: env.DISCORD_CLIENT_SECRET, membershipChecks: env.PROGRESS };
  } catch { return null; }
}

export const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Pragma': 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function cookie(name: string, value: string, seconds: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(seconds))}`;
}
function readCookie(request: Request, name: string) {
  const matches = (request.headers.get('Cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : null;
}
function redirect(path: string, cookies: string[] = []) {
  const headers = new Headers({ ...privateHeaders, Location: path });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}
function json(data: unknown, status = 200, cookies: string[] = [], extraHeaders: Record<string, string> = {}) {
  const headers = new Headers({ ...privateHeaders, ...extraHeaders });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return Response.json(data, { status, headers });
}
const clearSession = () => cookie(SESSION_COOKIE, '', 0);
const clearState = () => cookie(STATE_COOKIE, '', 0);

// Authenticated encryption keeps Discord tokens out of browser JavaScript and
// binds state/session cookies to separate purposes and this exact application.
async function key(config: DiscordConfig) {
  return crypto.subtle.importKey('raw', new Uint8Array(Buffer.from(config.sessionSecret, 'base64url')), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function context(config: DiscordConfig, purpose: string) {
  return encoder.encode(`hh:v1:${purpose}:${config.origin}:${config.clientId}:${config.guildId}`);
}
export async function seal(config: DiscordConfig, purpose: 'state' | 'session' | 'profile', value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context(config, purpose) }, await key(config), encoder.encode(JSON.stringify(value)));
  const valueText = `v1.${Buffer.from(iv).toString('base64url')}.${Buffer.from(encrypted).toString('base64url')}`;
  if (valueText.length > 3700) throw new DiscordAccessError('unavailable');
  return valueText;
}
async function unseal(config: DiscordConfig, purpose: 'state' | 'session' | 'profile', value: string | null): Promise<unknown> {
  if (!value || value.length > 3700 || !/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const [, iv, ciphertext] = value.split('.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(Buffer.from(iv, 'base64url')), additionalData: context(config, purpose) }, await key(config), new Uint8Array(Buffer.from(ciphertext, 'base64url')));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch { return null; }
}
const stateSchema = z.object({ nonce: z.string().length(43), verifier: z.string().length(43), expiresAt: z.number().int() }).strict();
const sessionSchema = z.object({ accessToken: z.string().min(10).max(512), refreshToken: z.string().min(10).max(512).optional(), accessExpiresAt: z.number().int().optional(), userId: snowflake, expiresAt: z.number().int() }).strict();
const tokenSchema = z.object({ access_token: z.string().min(10).max(512), refresh_token: z.string().min(10).max(512).optional(), token_type: z.literal('Bearer'), expires_in: z.number().int().positive(), scope: z.string() });
const avatarHash = z.string().regex(/^(?:a_)?[a-f0-9]{32}$/).nullish().catch(null);
const userSchema = z.object({ id: snowflake, username: z.string().min(1).max(100), global_name: z.string().max(100).nullable().optional(), avatar: avatarHash });
const memberSchema = z.object({ roles: z.array(snowflake).max(500), pending: z.boolean().optional(), nick: z.string().max(100).nullable().optional(), joined_at: z.string().max(50).nullish(), user: userSchema.optional(), avatar: avatarHash });
export type DiscordGuildMember = z.infer<typeof memberSchema>;
export type DiscordMembershipResult = { member: DiscordGuildMember; cooldownSeconds: number };
export type DiscordMembershipOutcome = { ok: true; member: DiscordGuildMember } | { ok: false; code: AccessCode; detail?: string; retryAfter?: number };

// A display preference, never proof of RuneScape account ownership. It survives
// sign-out on this browser and is encrypted and bound to one Discord user.
export async function readPlayerPreference(request: Request, config: DiscordConfig, userId: string, now = Date.now()) {
  const parsed = z.object({ userId: snowflake, playerId: z.number().int().positive(), expiresAt: z.number().int() }).strict()
    .safeParse(await unseal(config, 'profile', readCookie(request, PROFILE_COOKIE)));
  return parsed.success && parsed.data.userId === userId && parsed.data.expiresAt > now ? parsed.data.playerId : null;
}
export async function playerPreferenceCookie(config: DiscordConfig, userId: string, playerId: number) {
  const seconds = 365 * 24 * 60 * 60;
  return cookie(PROFILE_COOKIE, await seal(config, 'profile', { userId, playerId, expiresAt: Date.now() + seconds * 1000 }), seconds);
}

async function discordFetch(url: string, init: RequestInit = {}, fetcher: typeof fetch = fetch) {
  try {
    // Workers rejects redirect: 'error' before sending a request. Handle redirects
    // manually so Discord credentials are never forwarded to another endpoint.
    const response = await fetcher(url, { ...init, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (response.status >= 300 && response.status < 400) throw new DiscordAccessError('unavailable', `REDIRECT${response.status}`);
    if (response.status === 429) {
      const header = response.headers.get('Retry-After');
      let seconds = header && /^\d+(\.\d+)?$/.test(header) ? Number(header) : header ? (Date.parse(header) - Date.now()) / 1000 : NaN;
      if (!Number.isFinite(seconds) || seconds <= 0) {
        try { const body = await readJson(response) as { retry_after?: unknown }; seconds = typeof body?.retry_after === 'number' ? body.retry_after : NaN; } catch { /* A malformed error must not create a retry loop. */ }
      } else await response.body?.cancel();
      throw new DiscordAccessError('unavailable', 'HTTP429', Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60);
    }
    return response;
  }
  catch (error) { throw error instanceof DiscordAccessError ? error : new DiscordAccessError('unavailable', 'NETWORK'); }
}
async function readJson(response: Response): Promise<unknown> {
  try {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('empty');
    const parts: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 65_536) { await reader.cancel(); throw new Error('large'); }
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch { throw new DiscordAccessError('unavailable', 'JSON'); }
}
export async function fetchDiscordMembership(guildId: string, token: string, fetcher: typeof fetch = fetch): Promise<DiscordMembershipResult> {
  if (!snowflake.safeParse(guildId).success || token.length < 10 || token.length > 512) throw new DiscordAccessError('expired');
  const response = await discordFetch(`${API}/users/@me/guilds/${guildId}/member`, { headers: { Authorization: `Bearer ${token}` } }, fetcher);
  if (response.status === 401) throw new DiscordAccessError('expired');
  if (response.status === 403 || response.status === 404) throw new DiscordAccessError('server');
  if (!response.ok) throw new DiscordAccessError('unavailable', `HTTP${response.status}`);
  const parsed = memberSchema.safeParse(await readJson(response));
  if (!parsed.success) throw new DiscordAccessError('unavailable', 'DATA');
  const reset = Number(response.headers.get('X-RateLimit-Reset-After'));
  const cooldownSeconds = response.headers.get('X-RateLimit-Remaining') === '0' && Number.isFinite(reset) && reset > 0 ? Math.ceil(reset) : 0;
  return { member: parsed.data, cooldownSeconds };
}

export async function checkMembership(config: DiscordConfig, token: string, fetcher: typeof fetch = fetch, fresh = true) {
  let member: DiscordGuildMember;
  if (config.membershipChecks) {
    // The object name contains only a hash, never an OAuth credential.
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${config.origin}:${config.clientId}:${config.guildId}:${token}`));
    const fingerprint = Buffer.from(digest).toString('hex');
    let result: DiscordMembershipOutcome;
    try { result = await config.membershipChecks.getByName(`discord-membership:${fingerprint}`).checkDiscordMembership(config.guildId, token, fresh); }
    catch { throw new DiscordAccessError('unavailable', 'CHECK_SERVICE', 60); }
    if (!result.ok) throw new DiscordAccessError(result.code, result.detail, result.retryAfter);
    member = result.member;
  } else member = (await fetchDiscordMembership(config.guildId, token, fetcher)).member;
  // Policy is evaluated on every use, including changes to configured roles.
  if (member.pending) throw new DiscordAccessError('pending');
  if (!config.roleIds.some(id => member.roles.includes(id))) throw new DiscordAccessError('role');
  return member;
}

async function clearMembershipCheck(config: DiscordConfig, token: string) {
  if (!config.membershipChecks) return;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${config.origin}:${config.clientId}:${config.guildId}:${token}`));
  await config.membershipChecks.getByName(`discord-membership:${Buffer.from(digest).toString('hex')}`).clearDiscordMembership();
}
export async function authorizeMember(request: Request, config: DiscordConfig, fetcher: typeof fetch = fetch, now = Date.now()): Promise<DiscordMember> {
  return (await authorizeMemberWithRoles(request, config, fetcher, now)).member;
}
// Raw role IDs stay server-side. Feature access is evaluated against live roles,
// never a role, owner or permissions value supplied by a client.
export async function authorizeMemberWithRoles(request: Request, config: DiscordConfig, fetcher: typeof fetch = fetch, now = Date.now()): Promise<{ member: DiscordMember; roles: string[] }> {
  const parsed = sessionSchema.safeParse(await unseal(config, 'session', readCookie(request, SESSION_COOKIE)));
  if (!parsed.success || parsed.data.expiresAt <= now || parsed.data.expiresAt > now + MAX_SESSION_SECONDS * 1000 || (parsed.data.accessExpiresAt !== undefined && parsed.data.accessExpiresAt <= now)) throw new DiscordAccessError('expired');
  // Bundle a page's read requests for at most 15 seconds. Mutations and admin
  // reads require a fresh provider check; no roles are trusted from the cookie.
  const path = new URL(request.url).pathname;
  const sharedRead = request.method === 'GET' && ['/profiel', '/api/auth/session', '/api/members/profile', '/api/members/event', '/api/members/notifications', '/api/members/clan-events', '/pk', '/api/pk', '/api/pk/session', '/api/pk/access'].includes(path);
  const member = await checkMembership(config, parsed.data.accessToken, fetcher, !sharedRead);
  if (!member.user || member.user.id !== parsed.data.userId) throw new DiscordAccessError('expired');
  return { roles: member.roles, member: {
    id: member.user.id, displayName: member.nick || member.user.global_name || member.user.username,
    username: member.user.username,
    avatarUrl: discordAvatarUrl(member.user, config.guildId, member.avatar),
    clanRole: member.roles.includes('1197327572720169030') ? 'Admin' : member.roles.includes('1408990525180084265') ? 'Staff team' : 'Member',
    joinedAt: member.joined_at && Number.isFinite(Date.parse(member.joined_at)) ? member.joined_at : null,
    expiresAt: parsed.data.expiresAt,
  } };
}

async function revoke(config: DiscordConfig, accessToken: string, fetcher: typeof fetch) {
  try {
    const response = await discordFetch(`${TOKEN_URL}/revoke`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, token: accessToken, token_type_hint: 'access_token' }),
    }, fetcher);
    return response.ok;
  } catch { return false; }
  finally { try { await clearMembershipCheck(config, accessToken); } catch { /* Coordinator failures already fail closed. */ } }
}

// Only the session endpoint renews credentials. Protected pages and data APIs
// remain read-only and still verify the current Discord roles on every request.
async function renewSession(request: Request, config: DiscordConfig, fetcher: typeof fetch) {
  const now = Date.now();
  const parsed = sessionSchema.safeParse(await unseal(config, 'session', readCookie(request, SESSION_COOKIE)));
  if (!parsed.success || parsed.data.expiresAt <= now || parsed.data.expiresAt > now + MAX_SESSION_SECONDS * 1000) throw new DiscordAccessError('expired');
  const old = parsed.data;
  if (!old.refreshToken || (old.accessExpiresAt ?? old.expiresAt) > now + 300_000) return { request, renewedCookie: null };
  const response = await discordFetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'refresh_token', refresh_token: old.refreshToken }),
  }, fetcher);
  // A stale request from another tab must not erase a newer rotated cookie.
  if (response.status === 400 || response.status === 401) throw new DiscordAccessError('expired', 'REFRESH_EXPIRED');
  if (!response.ok) throw new DiscordAccessError('unavailable', `HTTP${response.status}`);
  const tokens = tokenSchema.safeParse(await readJson(response));
  if (!tokens.success) throw new DiscordAccessError('unavailable', 'DATA');
  if (!SCOPES.every(scope => tokens.data.scope.split(' ').includes(scope))) throw new DiscordAccessError('role');
  const value = await seal(config, 'session', { ...old, accessToken: tokens.data.access_token, refreshToken: tokens.data.refresh_token || old.refreshToken, accessExpiresAt: now + tokens.data.expires_in * 1000 });
  const headers = new Headers(request.headers);
  const otherCookies = (headers.get('Cookie') || '').split(';').map(c => c.trim()).filter(c => c && !c.startsWith(`${SESSION_COOKIE}=`));
  headers.set('Cookie', [...otherCookies, `${SESSION_COOKIE}=${value}`].join('; '));
  return { request: new Request(request.url, { method: request.method, headers }), renewedCookie: cookie(SESSION_COOKIE, value, (old.expiresAt - now) / 1000) };
}

async function start(request: Request, config: DiscordConfig) {
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Open de inlogpagina op de website.' }, 403);
  const nonce = randomText();
  const verifier = randomText();
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))).toString('base64url');
  const url = new URL('https://discord.com/oauth2/authorize');
  url.search = new URLSearchParams({ client_id: config.clientId, response_type: 'code', redirect_uri: `${config.origin}/api/auth/discord/callback`, scope: SCOPES.join(' '), state: nonce, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
  return redirect(url.toString(), [cookie(STATE_COOKIE, await seal(config, 'state', { nonce, verifier, expiresAt: Date.now() + 600_000 }), 600)]);
}

async function callback(request: Request, config: DiscordConfig, fetcher: typeof fetch, env: DiscordEnv) {
  const params = new URL(request.url).searchParams;
  let accessToken: string | undefined;
  let stage = 'STATE';
  try {
    const parsed = stateSchema.safeParse(await unseal(config, 'state', readCookie(request, STATE_COOKIE)));
    const nonce = params.get('state') || '';
    if (!parsed.success || parsed.data.expiresAt <= Date.now() || parsed.data.expiresAt > Date.now() + 600_000 || !/^[A-Za-z0-9_-]{43}$/.test(nonce) || params.getAll('state').length !== 1 || !timingSafeEqual(Buffer.from(nonce), Buffer.from(parsed.data.nonce))) throw new DiscordAccessError('state');
    if (params.has('iss') && (params.getAll('iss').length !== 1 || params.get('iss') !== 'https://discord.com')) throw new DiscordAccessError('state');
    if (params.has('error')) throw new DiscordAccessError(params.get('error') === 'access_denied' ? 'cancelled' : 'unavailable');
    const code = params.get('code');
    if (!code || code.length > 2048 || params.getAll('code').length !== 1) throw new DiscordAccessError('state');
    stage = 'TOKEN';
    const response = await discordFetch(TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'authorization_code', code, redirect_uri: `${config.origin}/api/auth/discord/callback`, code_verifier: parsed.data.verifier }),
    }, fetcher);
    if (!response.ok) throw new DiscordAccessError(response.status === 400 ? 'expired' : 'unavailable', `HTTP${response.status}`);
    const tokens = tokenSchema.safeParse(await readJson(response));
    if (!tokens.success) throw new DiscordAccessError('unavailable', 'DATA');
    accessToken = tokens.data.access_token;
    if (!SCOPES.every(scope => tokens.data.scope.split(' ').includes(scope))) throw new DiscordAccessError('role');
    stage = 'MEMBER';
    const member = await checkMembership(config, accessToken, fetcher);
    // identify is the only profile scope; email and message access are never requested.
    stage = 'IDENTITY';
    const userResponse = await discordFetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } }, fetcher);
    if (!userResponse.ok) throw new DiscordAccessError('unavailable', `HTTP${userResponse.status}`);
    const user = userSchema.safeParse(await readJson(userResponse));
    if (!user.success) throw new DiscordAccessError('unavailable', 'DATA');
    if (!member.user) throw new DiscordAccessError('unavailable', 'MEMBERUSER');
    if (user.data.id !== member.user.id) throw new DiscordAccessError('unavailable', 'MISMATCH');
    stage = 'SESSION';
    const seconds = tokens.data.refresh_token ? MAX_SESSION_SECONDS : Math.min(tokens.data.expires_in, MAX_SESSION_SECONDS);
    const session = await seal(config, 'session', { accessToken, refreshToken: tokens.data.refresh_token, accessExpiresAt: Date.now() + tokens.data.expires_in * 1000, userId: user.data.id, expiresAt: Date.now() + seconds * 1000 });
    // Only a completed OAuth login produces a notice; session reads and renewals
    // never do. Hash the one-time state instead of retaining OAuth credentials.
    try {
      if (env.DISCORD_SYNC) {
        const digest = await crypto.subtle.digest('SHA-256', encoder.encode(parsed.data.nonce));
        await env.DISCORD_SYNC.getByName('clan:7059').recordLogin({ id: Buffer.from(digest).toString('hex'), userId: user.data.id, name: member.nick || user.data.global_name || user.data.username, at: new Date().toISOString() });
      }
    } catch { console.warn(JSON.stringify({ event: 'discord_login_notice_unavailable' })); }
    return redirect('/ledenomgeving', [clearState(), cookie(SESSION_COOKIE, session, seconds)]);
  } catch (error) {
    if (accessToken) await revoke(config, accessToken, fetcher);
    const code = error instanceof DiscordAccessError ? error.code : 'unavailable';
    // Fixed stage labels and status codes only: never log provider bodies,
    // authorization codes, tokens, cookies, secrets or account identifiers.
    const reference = `HH-${stage}-${error instanceof DiscordAccessError ? error.detail || code.toUpperCase() : 'INTERNAL'}`;
    console.warn(JSON.stringify({ event: 'discord_login_failed', reason: code, reference }));
    // A temporary provider failure during a new sign-in must not erase an
    // existing browser session. Every use of that session still checks roles.
    const retryAt = error instanceof DiscordAccessError && error.retryAfter ? Date.now() + error.retryAfter * 1000 : 0;
    return redirect(`/login?error=${code}${code === 'unavailable' ? `&ref=${reference}` : ''}${retryAt ? `&retryAt=${retryAt}` : ''}`, code === 'unavailable' ? [clearState()] : [clearState(), clearSession()]);
  }
}

function ephemeral(content: string, url?: string) {
  return json({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] }, ...(url ? { components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Open de ledenomgeving', url }] }] } : {}) } });
}

export async function discordInteraction(request: Request, env: DiscordEnv, now = Date.now()) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const publicKey = env.DISCORD_PUBLIC_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(publicKey) || !snowflake.safeParse(env.DISCORD_CLIENT_ID).success) return json({ error: 'Not configured' }, 503);
  const timestamp = request.headers.get('X-Signature-Timestamp') || '';
  const signature = request.headers.get('X-Signature-Ed25519') || '';
  if (!/^\d{10}$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > 300_000 || !/^[a-fA-F0-9]{128}$/.test(signature)) return json({ error: 'Invalid signature' }, 401);
  if (Number(request.headers.get('Content-Length')) > 32_768) return json({ error: 'Request too large' }, 413);
  // Bound the stream as well as Content-Length (which can be omitted or false).
  const reader = request.body?.getReader();
  if (!reader) return json({ error: 'Invalid request' }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32_768) { await reader.cancel(); return json({ error: 'Request too large' }, 413); }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    const key = await crypto.subtle.importKey('raw', new Uint8Array(Buffer.from(publicKey, 'hex')), 'Ed25519', false, ['verify']);
    const valid = await crypto.subtle.verify('Ed25519', key, new Uint8Array(Buffer.from(signature, 'hex')), new Uint8Array(Buffer.concat([Buffer.from(timestamp), body])));
    if (!valid) return json({ error: 'Invalid signature' }, 401);
    const interaction = z.object({ id: snowflake.optional(), type: z.number().int(), application_id: snowflake, guild_id: snowflake.optional(), channel_id: snowflake.optional(), message: z.object({ id: snowflake }).optional(), data: z.object({ name: z.string().optional(), custom_id: z.string().max(100).optional() }).optional(), member: memberSchema.optional() }).safeParse(JSON.parse(body.toString('utf8')));
    if (!interaction.success || interaction.data.application_id !== env.DISCORD_CLIENT_ID) return json({ error: 'Invalid application' }, 400);
    if (interaction.data.type === 1) return json({ type: 1 });
    const config = discordConfig(env);
    if (!config) return ephemeral('De Discord-koppeling wordt nog ingesteld. Probeer het later opnieuw.');
    const command = interaction.data;
    if (command.guild_id !== config.guildId) return ephemeral('Dit commando hoort bij de Discord-server van Hijgend Hert.');
    if (command.member?.pending || !config.roleIds.some(id => command.member?.roles.includes(id))) return ephemeral('Voor de ledenomgeving heb je de rol Member, Admin of Staff team nodig. Vraag de clanleiding om hulp als je rol ontbreekt.');
    if (command.type === 3) {
      const match = /^hh:event:(join|leave):([a-f0-9-]{36})$/.exec(command.data?.custom_id || '');
      if (!match || !z.string().uuid().safeParse(match[2]).success || !command.id || !command.channel_id || !command.message || !command.member?.user) return ephemeral('Deze knop is niet geldig. Open het event op de website.');
      if (!env.DISCORD_SYNC) return ephemeral('Eventinschrijvingen worden nog klaargezet.');
      try {
        // One local RPC; no Discord/WOM HTTP fetch before the 3-second reply.
        const result = await env.DISCORD_SYNC.getByName('clan:7059').register(match[2], command.member.user.id, command.member.nick || command.member.user.global_name || command.member.user.username, match[1] as 'join' | 'leave', { id: command.id, channelId: command.channel_id, messageId: command.message.id });
        return ephemeral(result.ok ? match[1] === 'join' ? 'Je bent aangemeld! Je inschrijving staat ook op de website.' : 'Je bent afgemeld. De website is ook bijgewerkt.' : result.error || 'Probeer opnieuw.');
      } catch { return ephemeral('Je inschrijving kon niet worden bevestigd. Probeer opnieuw of open de website.'); }
    }
    if (command.type !== 2 || command.data?.name !== 'website') return json({ error: 'Unknown interaction' }, 400);
    return ephemeral('Welkom, hert! Log in met je Discord-account om de ledenomgeving te openen.', `${config.origin}/login`);
  } catch { return json({ error: 'Invalid request' }, 400); }
}

export async function discordAuthRoute(request: Request, env: DiscordEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/discord/interactions') return discordInteraction(request, env);
  if (!['/api/auth/discord', '/api/auth/discord/callback', '/api/auth/session', '/api/auth/logout'].includes(url.pathname)) return null;
  const logout = url.pathname === '/api/auth/logout';
  if (request.method !== (logout ? 'POST' : 'GET')) return json({ error: 'Method not allowed' }, 405);
  const config = discordConfig(env);
  if (!config) return url.pathname === '/api/auth/session' ? json({ authenticated: false, reason: 'setup' }, 503) : redirect('/login?error=setup', [clearState(), clearSession()]);
  // Never derive OAuth redirect destinations from forwarded headers or user input.
  if (url.origin !== config.origin) return json({ error: 'Open de ledenomgeving op de officiële website.' }, 403);
  if (url.pathname === '/api/auth/discord') return start(request, config);
  if (url.pathname === '/api/auth/discord/callback') return callback(request, config, fetcher, env);
  if (logout) {
    if (request.headers.get('Origin') !== config.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Ongeldig verzoek.' }, 403);
    const session = sessionSchema.safeParse(await unseal(config, 'session', readCookie(request, SESSION_COOKIE)));
    const revoked = !session.success || await revoke(config, session.data.accessToken, fetcher);
    return redirect(revoked ? '/login?loggedOut=1' : '/login?loggedOut=1&revoke=pending', [clearSession(), clearState()]);
  }
  let renewedCookie: string | null = null;
  try {
    const renewed = await renewSession(request, config, fetcher);
    renewedCookie = renewed.renewedCookie;
    const member = await authorizeMember(renewed.request, config, fetcher);
    // Reuse the existing identity check. No additional Discord requests or credentials are saved.
    try { await env.PROGRESS?.getByName('clan:7059:avatars').rememberMemberAvatar(member); }
    catch { /* An unavailable picture directory must never interrupt sign-in. */ }
    return json({ authenticated: true, member }, 200, renewedCookie ? [renewedCookie] : []);
  }
  catch (error) {
    const reason = error instanceof DiscordAccessError ? error.code : 'unavailable';
    // Discord may already have invalidated the old refresh token. Preserve its
    // encrypted replacement during an outage, but grant no access until a fresh
    // membership check succeeds. Definitive role or identity denials still clear it.
    const cookies = reason === 'unavailable' ? (renewedCookie ? [renewedCookie] : [])
      : error instanceof DiscordAccessError && error.detail === 'REFRESH_EXPIRED' ? [] : [clearSession()];
    const reference = reason === 'unavailable' ? discordErrorReference('SESSION', error) : undefined;
    const retryAfter = reason === 'unavailable' ? error instanceof DiscordAccessError && error.retryAfter ? error.retryAfter : 60 : undefined;
    if (reference) console.warn(JSON.stringify({ event: 'discord_session_failed', reference }));
    return json({ authenticated: false, reason, ...(reference ? { reference } : {}) }, reason === 'unavailable' ? 503 : 401, cookies, retryAfter ? { 'Retry-After': String(retryAfter) } : {});
  }
}
