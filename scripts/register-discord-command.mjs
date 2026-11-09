// Run locally with a secret environment file; never pass secrets as arguments.
const { DISCORD_CLIENT_ID: clientId, DISCORD_CLIENT_SECRET: clientSecret } = process.env;
const guildId = process.env.DISCORD_GUILD_ID || '1073630238115897455';
if (!/^\d{17,20}$/.test(clientId || '') || !/^\d{17,20}$/.test(guildId) || !clientSecret) {
  throw new Error('Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in the ignored .dev.vars file first.');
}
async function request(url, init) {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Discord returned HTTP ${response.status}. Check the application settings; no secret values have been logged.`);
  return response.json();
}
const credentials = await request('https://discord.com/api/oauth2/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'applications.commands.update' }),
});
if (typeof credentials.access_token !== 'string') throw new Error('Discord did not return a command registration token.');
// POST upserts only this named command; it never removes other commands.
const command = await request(`https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`, {
  method: 'POST', headers: { Authorization: `Bearer ${credentials.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'website', description: 'Open de ledenomgeving van Hijgend Hert', type: 1 }),
});
console.log(`Registered /website for guild ${guildId} (command ${command.id}).`);
