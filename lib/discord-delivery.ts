import { discordId, type SyncSettings } from './clan-discord';

export class DeliveryError extends Error {
  constructor(public status: number, public retrySeconds = 60) { super(`Discord HTTP ${status}`); }
}
export async function discordBotRequest(token: string, path: string, init: RequestInit = {}) {
  let response: Response;
  try { response = await fetch(`https://discord.com/api/v10${path}`, { ...init, redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' } }); }
  catch { throw new DeliveryError(503); }
  const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (reader) while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 262144) { await reader.cancel(); throw new DeliveryError(502); }
    chunks.push(value);
  }
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* Status remains authoritative. */ }
  const reset = Number(response.headers.get('X-RateLimit-Reset-After'));
  const cooldown = response.headers.get('X-RateLimit-Remaining') === '0' && Number.isFinite(reset) ? Math.max(1, Math.ceil(reset)) : 0;
  if (!response.ok) {
    const retry = Number(response.headers.get('Retry-After') || body.retry_after);
    throw new DeliveryError(response.status, response.status === 429 && Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : 60);
  }
  return { body, cooldown };
}
// Validate destinations before enabling delivery. A login channel must explicitly
// hide @everyone and may only grant view access to staff roles or the bot itself.
export async function validateDiscordChannels(token: string, guildId: string, clientId: string, settings: SyncSettings) {
  const channels = [...new Set([settings.loginEnabled ? settings.loginChannel : '', settings.eventsEnabled ? settings.eventsChannel : '', settings.raffleEnabled ? settings.raffleChannel : ''].filter(Boolean))];
  for (const id of channels) {
    const { body } = await discordBotRequest(token, `/channels/${id}`);
    if (body.guild_id !== guildId || ![0, 5].includes(Number(body.type))) throw new Error('Gebruik een tekstkanaal in de Hijgend Hert-server.');
    if (settings.loginEnabled && id === settings.loginChannel) {
      const overrides = Array.isArray(body.permission_overwrites) ? body.permission_overwrites as { id: string; type: number; allow: string; deny: string }[] : [];
      const view = BigInt(1024);
      const everyone = overrides.find(o => o.id === guildId && o.type === 0);
      const privateDefault = everyone && (BigInt(everyone.deny) & view) !== BigInt(0) && (BigInt(everyone.allow) & view) === BigInt(0);
      const safeRoles = ['1197327572720169030', '1408990525180084265'];
      // Bot role overwrites can be validated by fetching the guild role list.
      const granted = overrides.filter(o => (BigInt(o.allow) & view) !== BigInt(0) && !(o.type === 0 && safeRoles.includes(o.id)) && !(o.type === 1 && o.id === clientId));
      if (granted.length) {
        const { body: roleBody } = await discordBotRequest(token, `/guilds/${guildId}/roles`);
        const roles = Array.isArray(roleBody) ? roleBody as { id: string; tags?: { bot_id?: string } }[] : [];
        if (granted.some(o => o.type !== 0 || !roles.some(r => r.id === o.id && r.tags?.bot_id === clientId))) throw new Error('Het inlogkanaal mag alleen zichtbaar zijn voor Admin, Staff team en de bot.');
      }
      if (!privateDefault) throw new Error('Zet in het inlogkanaal Kanaal bekijken voor @everyone op weigeren.');
    }
    if (!discordId.safeParse(body.id).success) throw new Error('Discord kon dit kanaal niet bevestigen.');
  }
}
