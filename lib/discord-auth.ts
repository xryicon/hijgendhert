import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { DiscordMember } from './member-types';

export type DiscordEnv = {
  APP_ORIGIN?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_MEMBER_ROLE_IDS?: string;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_SESSION_SECRET?: string;
};

const API = 'https://discord.com/api/v10';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const SCOPES = ['identify', 'guilds.members.read'];
const SESSION_COOKIE = '__Host-hh-member';
const STATE_COOKIE = '__Host-hh-discord-state';
const PROFILE_COOKIE = '__Host-hh-profile';
const MAX_SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();
const snowflake = z.string().regex(/^\d{17,20}$/);
const randomText = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

export type DiscordConfig = {
  origin: string; clientId: string; clientSecret: string; guildId: string;
  roleIds: string[]; sessionSecret: string;
};
export type AccessCode = 'setup' | 'expired' | 'role' | 'server' | 'pending' | 'unavailable' | 'state' | 'cancelled';
export class DiscordAccessError extends Error {
  code: AccessCode;
  constructor(code: AccessCode) { super(code); this.name = 'DiscordAccessError'; this.code = code; }
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
    return { origin: origin.origin, clientId, guildId, roleIds, sessionSecret, clientSecret: env.DISCORD_CLIENT_SECRET };
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
function json(data: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers(privateHeaders);
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
const sessionSchema = z.object({ accessToken: z.string().min(10).max(512), userId: snowflake, expiresAt: z.number().int() }).strict();
const userSchema = z.object({ id: snowflake, username: z.string().min(1).max(100), global_name: z.string().max(100).nullable().optional() });
const memberSchema = z.object({ roles: z.array(snowflake).max(500), pending: z.boolean().optional(), nick: z.string().max(100).nullable().optional(), joined_at: z.string().max(50).optional(), user: userSchema.optional() });

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
    if (response.status >= 300 && response.status < 400) throw new DiscordAccessError('unavailable');
    return response;
  }
  catch { throw new DiscordAccessError('unavailable'); }
}
async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new DiscordAccessError('unavailable'); }
}
export async function checkMembership(config: DiscordConfig, token: string, fetcher: typeof fetch = fetch) {
  const response = await discordFetch(`${API}/users/@me/guilds/${config.guildId}/member`, { headers: { Authorization: `Bearer ${token}` } }, fetcher);
  if (response.status === 401) throw new DiscordAccessError('expired');
  if (response.status === 403 || response.status === 404) throw new DiscordAccessError('server');
  if (!response.ok) throw new DiscordAccessError('unavailable');
  const parsed = memberSchema.safeParse(await readJson(response));
  if (!parsed.success) throw new DiscordAccessError('unavailable');
  if (parsed.data.pending) throw new DiscordAccessError('pending');
  if (!config.roleIds.some(id => parsed.data.roles.includes(id))) throw new DiscordAccessError('role');
  return parsed.data;
}
export async function authorizeMember(request: Request, config: DiscordConfig, fetcher: typeof fetch = fetch, now = Date.now()): Promise<DiscordMember> {
  const parsed = sessionSchema.safeParse(await unseal(config, 'session', readCookie(request, SESSION_COOKIE)));
  if (!parsed.success || parsed.data.expiresAt <= now || parsed.data.expiresAt > now + MAX_SESSION_SECONDS * 1000) throw new DiscordAccessError('expired');
  // Never use roles stored in a session. Removed roles and server departures
  // are checked against Discord on every protected page or API request.
  const member = await checkMembership(config, parsed.data.accessToken, fetcher);
  if (!member.user || member.user.id !== parsed.data.userId) throw new DiscordAccessError('expired');
  return {
    id: member.user.id, displayName: member.nick || member.user.global_name || member.user.username,
    username: member.user.username,
    clanRole: member.roles.includes('1197327572720169030') ? 'Admin' : member.roles.includes('1408990525180084265') ? 'Staff team' : 'Member',
    joinedAt: member.joined_at && Number.isFinite(Date.parse(member.joined_at)) ? member.joined_at : null,
    expiresAt: parsed.data.expiresAt,
  };
}

async function revoke(config: DiscordConfig, accessToken: string, fetcher: typeof fetch) {
  try {
    const response = await discordFetch(`${TOKEN_URL}/revoke`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, token: accessToken, token_type_hint: 'access_token' }),
    }, fetcher);
    return response.ok;
  } catch { return false; }
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

async function callback(request: Request, config: DiscordConfig, fetcher: typeof fetch) {
  const params = new URL(request.url).searchParams;
  let accessToken: string | undefined;
  try {
    const parsed = stateSchema.safeParse(await unseal(config, 'state', readCookie(request, STATE_COOKIE)));
    const nonce = params.get('state') || '';
    if (!parsed.success || parsed.data.expiresAt <= Date.now() || parsed.data.expiresAt > Date.now() + 600_000 || !/^[A-Za-z0-9_-]{43}$/.test(nonce) || params.getAll('state').length !== 1 || !timingSafeEqual(Buffer.from(nonce), Buffer.from(parsed.data.nonce))) throw new DiscordAccessError('state');
    if (params.has('iss') && (params.getAll('iss').length !== 1 || params.get('iss') !== 'https://discord.com')) throw new DiscordAccessError('state');
    if (params.has('error')) throw new DiscordAccessError(params.get('error') === 'access_denied' ? 'cancelled' : 'unavailable');
    const code = params.get('code');
    if (!code || code.length > 2048 || params.getAll('code').length !== 1) throw new DiscordAccessError('state');
    const response = await discordFetch(TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'authorization_code', code, redirect_uri: `${config.origin}/api/auth/discord/callback`, code_verifier: parsed.data.verifier }),
    }, fetcher);
    if (!response.ok) throw new DiscordAccessError(response.status === 400 ? 'expired' : 'unavailable');
    const tokens = z.object({ access_token: z.string().min(10).max(512), token_type: z.literal('Bearer'), expires_in: z.number().int().positive(), scope: z.string() }).safeParse(await readJson(response));
    if (!tokens.success) throw new DiscordAccessError('unavailable');
    accessToken = tokens.data.access_token;
    if (!SCOPES.every(scope => tokens.data.scope.split(' ').includes(scope))) throw new DiscordAccessError('role');
    const member = await checkMembership(config, accessToken, fetcher);
    // identify is the only profile scope; email and message access are never requested.
    const userResponse = await discordFetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } }, fetcher);
    if (!userResponse.ok) throw new DiscordAccessError('unavailable');
    const user = userSchema.safeParse(await readJson(userResponse));
    if (!user.success || !member.user || user.data.id !== member.user.id) throw new DiscordAccessError('unavailable');
    const seconds = Math.min(tokens.data.expires_in, MAX_SESSION_SECONDS);
    const session = await seal(config, 'session', { accessToken, userId: user.data.id, expiresAt: Date.now() + seconds * 1000 });
    return redirect('/ledenomgeving', [clearState(), cookie(SESSION_COOKIE, session, seconds)]);
  } catch (error) {
    if (accessToken) await revoke(config, accessToken, fetcher);
    const code = error instanceof DiscordAccessError ? error.code : 'unavailable';
    return redirect(`/login?error=${code}`, [clearState(), clearSession()]);
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
    const interaction = z.object({ type: z.number().int(), application_id: snowflake, guild_id: snowflake.optional(), data: z.object({ name: z.string() }).optional(), member: memberSchema.optional() }).safeParse(JSON.parse(body.toString('utf8')));
    if (!interaction.success || interaction.data.application_id !== env.DISCORD_CLIENT_ID) return json({ error: 'Invalid application' }, 400);
    if (interaction.data.type === 1) return json({ type: 1 });
    const config = discordConfig(env);
    if (!config) return ephemeral('De Discord-koppeling wordt nog ingesteld. Probeer het later opnieuw.');
    const command = interaction.data;
    if (command.type !== 2 || command.data?.name !== 'website') return json({ error: 'Unknown interaction' }, 400);
    if (command.guild_id !== config.guildId) return ephemeral('Dit commando hoort bij de Discord-server van Hijgend Hert.');
    if (command.member?.pending || !config.roleIds.some(id => command.member?.roles.includes(id))) return ephemeral('Voor de ledenomgeving heb je de rol Member, Admin of Staff team nodig. Vraag de clanleiding om hulp als je rol ontbreekt.');
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
  if (url.pathname === '/api/auth/discord/callback') return callback(request, config, fetcher);
  if (logout) {
    if (request.headers.get('Origin') !== config.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Ongeldig verzoek.' }, 403);
    const session = sessionSchema.safeParse(await unseal(config, 'session', readCookie(request, SESSION_COOKIE)));
    const revoked = !session.success || await revoke(config, session.data.accessToken, fetcher);
    return redirect(revoked ? '/login?loggedOut=1' : '/login?loggedOut=1&revoke=pending', [clearSession(), clearState()]);
  }
  try { return json({ authenticated: true, member: await authorizeMember(request, config, fetcher) }); }
  catch (error) {
    const reason = error instanceof DiscordAccessError ? error.code : 'unavailable';
    return json({ authenticated: false, reason }, reason === 'unavailable' ? 503 : 401, reason === 'unavailable' ? [] : [clearSession()]);
  }
}
