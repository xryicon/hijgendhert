import communitySnapshot from '@/content/community-snapshot.json';
import { env } from 'cloudflare:workers';
import { readWiseOldMan, womConnection, womErrorCode, womRetryAfter } from '@/lib/wise-old-man';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const connection = womConnection(env);
  const diagnostics = { 'X-HH-WOM-Mode': connection.apiKey ? 'api-key' : 'public', 'X-HH-WOM-Revision': 'public-v1' };
  const resource = url.searchParams.get('resource') || 'group';
  const metric = url.searchParams.get('metric') || 'overall';
  const period = url.searchParams.get('period') || 'week';
  if (!['group', 'competitions', 'gained'].includes(resource) || !['overall', 'ehb'].includes(metric) || !['week', 'month'].includes(period)) return Response.json({ error: 'Ongeldige selectie.' }, { status: 400 });
  const path = '/groups/7059' + (resource === 'group' ? '' : resource === 'competitions' ? '/competitions' : `/gained?metric=${metric}&period=${period}&limit=10`);
  try {
    const value = await readWiseOldMan<unknown>(path, url.origin, { ...connection, retryRejectedKey: url.searchParams.get('retry') === '1' });
    let data = value.data;
    if (resource === 'group' && (!data || typeof data !== 'object' || !('id' in data) || data.id !== 7059 || !('memberships' in data) || !Array.isArray(data.memberships))) throw new Error('De clangegevens zijn tijdelijk niet beschikbaar.');
    if (resource !== 'group') {
      if (!Array.isArray(data)) throw new Error('De gegevens zijn tijdelijk niet beschikbaar.');
      data = resource === 'competitions' ? [...data].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)) : data.slice(0, 10);
    }
    return Response.json({ ...value, data }, { headers: { ...diagnostics, 'Cache-Control': value.stale ? 'no-store' : 'public, max-age=60, s-maxage=900', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    if (resource === 'competitions' && Date.now() - Date.parse(communitySnapshot.fetchedAt) < 48 * 60 * 60 * 1000) return Response.json({ data: [...communitySnapshot.competitions].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)), fetchedAt: communitySnapshot.fetchedAt, stale: true }, { headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ error: error instanceof Error ? error.message : 'De gegevens zijn tijdelijk niet beschikbaar.', code: womErrorCode(error) }, { status: 503, headers: { ...diagnostics, 'Cache-Control': 'no-store', 'Retry-After': womRetryAfter(error) } });
  }
}
