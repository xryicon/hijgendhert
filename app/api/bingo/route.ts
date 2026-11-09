import { env } from 'cloudflare:workers';
import { bingoIdentity, publicBingoWhere } from '@/lib/bingo-access';
import { applyProgress, emptyProgress, type BingoEvent, type BingoState, type BingoSummary } from '@/lib/bingo';
import { bingoActionSchema } from '@/lib/bingo-validation';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
type Row = { id: string; title: string; status: BingoEvent['status']; visibility: BingoEvent['visibility']; starts_at: string; ends_at: string; state: string; version: number; created_at: string; updated_at: string };
const toEvent = (row: Row): BingoEvent => ({ ...JSON.parse(row.state) as BingoState, id: row.id, status: row.status, visibility: row.visibility, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at });
export async function GET(request: Request) {
  try {
    const { user, canManage } = await bingoIdentity();
    if (!env.DB) return json({ error: 'De bingo-opslag is nog niet beschikbaar.' }, 503);
    const url = new URL(request.url);
    const requested = url.searchParams.get('id');
    const now = new Date().toISOString();
    if (url.searchParams.get('summary') === '1') {
      const live = await env.DB.prepare(`SELECT id,title,ends_at FROM bingo_events WHERE ${publicBingoWhere} ORDER BY updated_at DESC LIMIT 1`).bind(now).first<{ id: string; title: string; ends_at: string }>();
      return json({ visible: canManage || !!live, canManage, live });
    }
    if (requested && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requested)) return json({ error: 'Ongeldige bingo.' }, 400);
    const list = await env.DB.prepare(`SELECT id,title,status,visibility,starts_at,ends_at,updated_at FROM bingo_events WHERE (?2 = 1 OR (${publicBingoWhere})) ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, updated_at DESC LIMIT 50`).bind(now, canManage ? 1 : 0).all<Row>();
    const events: BingoSummary[] = list.results.map(r => ({ id: r.id, title: r.title, status: r.status, visibility: r.visibility, startsAt: r.starts_at, endsAt: r.ends_at, updatedAt: r.updated_at }));
    const selected = requested || events[0]?.id;
    const row = selected ? await env.DB.prepare(`SELECT * FROM bingo_events WHERE id = ?3 AND (?2 = 1 OR (${publicBingoWhere}))`).bind(now, canManage ? 1 : 0, selected).first<Row>() : null;
    if (!canManage && !row) return json({ error: 'Deze pagina is niet beschikbaar.' }, 404);
    if (requested && !row) return json({ error: 'Deze bingo is niet beschikbaar.' }, 404);
    return json({ events, event: row ? toEvent(row) : null, canManage, signedIn: !!user, fetchedAt: new Date().toISOString() });
  } catch { return json({ error: 'De bingo kon niet worden geladen. Probeer het opnieuw.' }, 503); }
}
export async function POST(request: Request) {
  try {
    const { user, canManage } = await bingoIdentity();
    if (!user) return json({ error: 'Log in om bingo te beheren.' }, 401);
    if (!canManage) return json({ error: 'Alleen de bingobeheerder kan wijzigingen opslaan.' }, 403);
    if (request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: 'Open het beheer vanuit deze website.' }, 403);
    if (!request.headers.get('Content-Type')?.includes('application/json')) return json({ error: 'Ongeldige aanvraag.' }, 415);
    if (!env.DB) return json({ error: 'De bingo-opslag is nog niet beschikbaar.' }, 503);
    const text = await request.text();
    if (text.length > 60000) return json({ error: 'Deze aanvraag is te groot.' }, 413);
    let raw: unknown; try { raw = JSON.parse(text); } catch { return json({ error: 'Ongeldige aanvraag.' }, 400); }
    const parsed = bingoActionSchema.safeParse(raw);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || 'Controleer de invoer.' }, 400);
    const input = parsed.data;
    const now = new Date().toISOString();
    if (input.action === 'create') {
      const id = crypto.randomUUID();
      const state: BingoState = { ...input.config, progress: emptyProgress(), log: [] };
      await env.DB.prepare('INSERT INTO bingo_events (id,title,status,starts_at,ends_at,state,version,owner_id,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,1,?7,?8,?8)').bind(id, state.title, 'draft', state.startsAt, state.endsAt, JSON.stringify(state), user.userId, now).run();
      return json({ event: { ...state, id, status: 'draft', visibility: 'private', version: 1, createdAt: now, updatedAt: now } }, 201);
    }
    const row = await env.DB.prepare('SELECT * FROM bingo_events WHERE id = ?1').bind(input.eventId).first<Row>();
    if (!row) return json({ error: 'Deze bingo bestaat niet.' }, 404);
    if (row.version !== input.version) return json({ error: 'De bingo is ondertussen aangepast. Ververs de pagina en probeer opnieuw.' }, 409);
    const event = toEvent(row);
    let state: BingoState = JSON.parse(row.state);
    let status = row.status;
    let visibility = row.visibility;
    if (input.action === 'edit') {
      if (status !== 'draft') return json({ error: 'Teams en doelen staan vast zodra de bingo gepubliceerd is.' }, 409);
      state = { ...input.config, progress: emptyProgress(), log: [] };
    } else if (input.action === 'publish') {
      if (status === 'finished') return json({ error: 'Deze bingo is afgerond.' }, 409);
      if (Date.parse(event.endsAt) <= Date.now()) return json({ error: 'Kies eerst een eindtijd in de toekomst.' }, 400);
      status = 'active';
      visibility = 'public';
    } else if (input.action === 'hide') {
      visibility = 'private';
    } else if (input.action === 'finish') {
      if (status !== 'active') return json({ error: 'Alleen een gepubliceerde bingo kan worden afgerond.' }, 409);
      status = 'finished';
      visibility = 'private';
    } else {
      if (status !== 'active') return json({ error: 'Voortgang kan alleen bij een gepubliceerde, niet afgeronde bingo worden bijgewerkt.' }, 409);
      if (Date.now() < Date.parse(event.startsAt)) return json({ error: 'De bingo is nog niet begonnen.' }, 409);
      if (input.count > event.tiles[input.tile].target) return json({ error: 'Voortgang mag niet hoger zijn dan het tegeldoel.' }, 400);
      const previous = event.progress[input.team][input.tile];
      if (previous.count === input.count && previous.note === input.note && previous.evidence === input.evidence) return json({ event });
      state = applyProgress(event, input.team, input.tile, input.count, input.note, input.evidence, now, crypto.randomUUID());
    }
    // One conditional statement makes edits atomic and prevents lost updates.
    const saved = await env.DB.prepare('UPDATE bingo_events SET title=?1,status=?2,starts_at=?3,ends_at=?4,state=?5,version=version+1,updated_at=?6,visibility=?9 WHERE id=?7 AND version=?8').bind(state.title, status, state.startsAt, state.endsAt, JSON.stringify(state), now, row.id, input.version, visibility).run();
    if (!saved.meta.changes) return json({ error: 'Iemand heeft de bingo tegelijk bijgewerkt. Ververs de pagina en probeer opnieuw.' }, 409);
    return json({ event: { ...state, id: row.id, status, visibility, version: input.version + 1, createdAt: row.created_at, updatedAt: now } });
  } catch { return json({ error: 'Opslaan is niet gelukt. Je wijziging is niet bevestigd; ververs om de laatste stand te zien.' }, 503); }
}
