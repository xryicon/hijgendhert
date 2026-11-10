import { DurableObject } from 'cloudflare:workers';
import { pkActionSchema, pkCreateSchema, pkSettingsSchema, pkStatusLabel, pkTotals, type PkAction, type PkActor, type PkPlayerChoice, type PkSession, type PkSettings, type PkSummary, type PkView } from '../lib/pk';

const fail = (status: number, error: string) => ({ ok: false as const, status, error });
// One clan's PK ledger coordinates its live groups and recent session archive.
// All membership changes, recipient snapshots and totals commit atomically.
export class ClanPk extends DurableObject<Cloudflare.Env> {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS pk_settings (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS pk_sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, ended_at TEXT, started_at TEXT NOT NULL, data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS pk_recent ON pk_sessions(ended_at DESC)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS pk_requests (id TEXT PRIMARY KEY, actor TEXT NOT NULL, session_id TEXT NOT NULL, payload TEXT NOT NULL)');
  }
  getSettings(): PkSettings { const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM pk_settings WHERE id = 1').toArray()[0]; return row ? JSON.parse(row.data) : { revision: 0, roleId: '' }; }
  saveSettings(input: unknown, actor: PkActor) {
    if (!actor.staff) return fail(403, 'Alleen Admin en Staff team kunnen de PK-rol instellen.');
    const result = pkSettingsSchema.safeParse(input);
    if (!result.success || result.data.roleId === this.env.DISCORD_GUILD_ID) return fail(400, 'Vul een geldig rol-ID in, geen server-ID.');
    if (result.data.revision !== this.getSettings().revision) return fail(409, 'De PK-instellingen zijn gewijzigd. Laad opnieuw.');
    const settings = { ...result.data, revision: result.data.revision + 1 };
    this.ctx.storage.sql.exec('INSERT INTO pk_settings VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', JSON.stringify(settings));
    return { ok: true as const, settings };
  }
  #session(id: string): PkSession | null { const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM pk_sessions WHERE id = ?', id).toArray()[0]; return row ? JSON.parse(row.data) : null; }
  #view(session: PkSession, actor: PkActor): PkView { return { ...session, totals: pkTotals(session), viewerId: actor.id, canManage: !session.endedAt && (session.ownerId === actor.id || actor.staff) }; }
  getSession(id: string, actor: PkActor) { const session = this.#session(id); return session ? { ok: true as const, session: this.#view(session, actor) } : fail(404, 'Deze PK-sessie is niet gevonden.'); }
  listSessions() {
    const summarize = (row: { data: string }): PkSummary => { const s = JSON.parse(row.data) as PkSession; return { id: s.id, title: s.title, ownerName: s.ownerName, startedAt: s.startedAt, endedAt: s.endedAt, gp: pkTotals(s).gp, playerCount: s.players.length, activeCount: s.players.filter(p => p.status === 'active').length }; };
    return { active: this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM pk_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 20').toArray().map(summarize), recent: this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM pk_sessions WHERE ended_at IS NOT NULL ORDER BY ended_at DESC, id DESC LIMIT 5').toArray().map(summarize) };
  }
  #replay(requestId: string, payload: string, actor: PkActor) {
    const row = this.ctx.storage.sql.exec<{ actor: string; session_id: string; payload: string }>('SELECT actor, session_id, payload FROM pk_requests WHERE id = ?', requestId).toArray()[0];
    return row ? row.actor === actor.id && row.payload === payload ? this.getSession(row.session_id, actor) : fail(409, 'Dit verzoek is al gebruikt. Ververs de sessie.') : null;
  }
  #write(s: PkSession, actor: PkActor, requestId: string, payload: string) {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT INTO pk_sessions VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET ended_at = excluded.ended_at, data = excluded.data', s.id, s.ownerId, s.endedAt, s.startedAt, JSON.stringify(s));
      this.ctx.storage.sql.exec('INSERT INTO pk_requests VALUES (?, ?, ?, ?)', requestId, actor.id, s.id, payload);
    });
    return { ok: true as const, session: this.#view(s, actor) };
  }
  create(input: unknown, actor: PkActor, players: PkPlayerChoice[]) {
    if (!actor.staff && !actor.roleIds?.includes(this.getSettings().roleId || 'unconfigured')) return fail(403, 'Je PK-toegang is gewijzigd.');
    const parsed = pkCreateSchema.safeParse(input); if (!parsed.success) return fail(400, 'Geef de sessie een naam en kies de spelers.');
    const value = parsed.data, payload = JSON.stringify(value); const previous = this.#replay(value.requestId, payload, actor); if (previous) return previous;
    const open = this.ctx.storage.sql.exec<{ owner: string }>('SELECT owner FROM pk_sessions WHERE ended_at IS NULL').toArray();
    if (open.some(row => row.owner === actor.id)) return fail(409, 'Je leidt al een actieve sessie. Rond die eerst af.');
    if (open.length >= 20) return fail(409, 'Er zijn al 20 actieve sessies. Rond eerst een sessie af.');
    if (players.length !== value.playerIds.length || players.some(p => !value.playerIds.includes(p.id)) || new Set(players.map(p => p.id)).size !== players.length) return fail(400, 'Kies geldige clanleden uit Wise Old Man.');
    const now = new Date().toISOString();
    const session: PkSession = { id: value.requestId, title: value.title, ownerId: actor.id, ownerName: actor.name, revision: 1, startedAt: now, endedAt: null, players: players.map(p => ({ ...p, status: 'active', joinedAt: now, changedAt: now })), drops: [], requests: [], timeline: [{ sequence: 1, at: now, actor: actor.name, text: `Sessie gestart met ${players.map(p => p.name).join(', ')}.` }] };
    return this.#write(session, actor, value.requestId, payload);
  }
  mutate(input: PkAction, actor: PkActor, choices: PkPlayerChoice[] = []) {
    if (!actor.staff && !actor.roleIds?.includes(this.getSettings().roleId || 'unconfigured')) return fail(403, 'Je PK-toegang is gewijzigd.');
    const parsed = pkActionSchema.safeParse(input); if (!parsed.success) return fail(400, 'Controleer de ingevulde gegevens.');
    const value = parsed.data, payload = JSON.stringify(value); const replay = this.#replay(value.requestId, payload, actor); if (replay) return replay;
    const s = this.#session(value.sessionId); if (!s) return fail(404, 'Deze sessie bestaat niet.');
    if (!['join_request', 'cancel_request'].includes(value.type) && s.ownerId !== actor.id && !actor.staff) return fail(403, 'Alleen de sessieleider en staff kunnen deze sessie wijzigen.');
    if (s.endedAt) return fail(409, 'Deze sessie is afgesloten. Het overzicht staat vast.');
    if (s.revision !== value.revision) return fail(409, 'De sessie is net gewijzigd. De nieuwste stand wordt geladen; controleer je invoer en probeer opnieuw.');
    if (s.timeline.length >= 2500 && value.type !== 'finish') return fail(409, 'Deze sessie is vol. Rond hem af en start een nieuwe sessie.');
    const now = new Date().toISOString(); let text = '';
    if (value.type === 'join_request') {
      const player = choices.find(p => p.id === value.playerId);
      if (!player) return fail(400, 'Kies je RuneScape-naam uit Wise Old Man.');
      if (s.players.some(p => p.id === player.id && p.status !== 'left')) return fail(409, 'Deze speler zit al in de groep. Vraag de leider om de status aan te passen.');
      if (s.requests.some(r => r.status === 'pending' && (r.requesterId === actor.id || r.player.id === player.id))) return fail(409, 'Er staat al een verzoek open voor jou of deze speler.');
      if (s.requests.length >= 100) return fail(409, 'Het maximum aantal verzoeken is bereikt. Vraag de leider je toe te voegen.');
      s.requests.push({ id: value.requestId, requesterId: actor.id, requesterName: actor.name, player, at: now, status: 'pending', resolvedAt: null, resolvedBy: null });
      text = `${actor.name} vraagt om mee te doen als ${player.name}.`;
    } else if (value.type === 'resolve_request' || value.type === 'cancel_request') {
      const join = s.requests.find(r => r.id === value.joinId);
      if (!join || join.status !== 'pending') return fail(409, 'Dit verzoek is al afgehandeld.');
      if (value.type === 'cancel_request' && join.requesterId !== actor.id) return fail(403, 'Je kunt alleen je eigen verzoek intrekken.');
      const decision = value.type === 'cancel_request' ? 'cancelled' : value.decision;
      if (decision === 'accepted') {
        const player = s.players.find(p => p.id === join.player.id);
        if (player && player.status !== 'left') return fail(409, 'Deze speler zit al in de groep. Wijs het dubbele verzoek af.');
        if (!player && s.players.length >= 50) return fail(409, 'De groep heeft al 50 spelers.');
        if (player) { player.status = 'active'; player.changedAt = now; }
        else s.players.push({ ...join.player, status: 'active', joinedAt: now, changedAt: now });
      }
      join.status = decision; join.resolvedAt = now; join.resolvedBy = actor.name;
      text = `Verzoek van ${join.requesterName} (${join.player.name}) ${decision === 'accepted' ? 'geaccepteerd. Speler deelt mee vanaf de volgende drop' : decision === 'declined' ? 'afgewezen' : 'ingetrokken'}.`;
    } else if (value.type === 'add_players') {
      if (choices.length !== value.playerIds.length || choices.some(p => !value.playerIds.includes(p.id)) || new Set(choices.map(p => p.id)).size !== choices.length) return fail(400, 'Kies geldige clanleden uit Wise Old Man.');
      if (s.players.length + choices.length > 50 || choices.some(p => s.players.some(existing => existing.id === p.id))) return fail(409, 'Maximaal 50 unieke spelers. Gebruik Hervatten voor een terugkerende speler.');
      s.players.push(...choices.map(p => ({ ...p, status: 'active' as const, joinedAt: now, changedAt: now })));
      text = `Aangesloten: ${choices.map(p => p.name).join(', ')}. Tellen mee vanaf de volgende drop.`;
    } else if (value.type === 'player_status') {
      const p = s.players.find(p => p.id === value.playerId); if (!p) return fail(404, 'Speler niet gevonden.');
      if (p.status === value.status) return fail(409, 'Deze speler heeft die status al.');
      p.status = value.status; p.changedAt = now; text = `${p.name}: ${pkStatusLabel[value.status]}.`;
    } else if (value.type === 'add_drop') {
      const player = value.playerId ? s.players.find(p => p.id === value.playerId) : null;
      if (value.playerId && !player) return fail(400, 'Kies een speler uit deze sessie.');
      const label = player ? `Loot van ${player.name}` : value.label!;
      const active = s.players.filter(p => p.status === 'active');
      if (!active.length) return fail(409, 'Zet eerst minimaal één speler op Actief.');
      if (s.drops.length >= 500) return fail(409, 'Maximaal 500 drops per sessie. Rond deze sessie af.');
      const share = Math.floor(value.gp / active.length);
      s.drops.push({ id: value.requestId, label, ...(player ? { playerId: player.id, playerName: player.name } : {}), gp: value.gp, at: now, addedBy: actor.name, shares: active.map(p => ({ playerId: p.id, gp: share })), remainder: value.gp - share * active.length, removedAt: null, removedBy: null, reason: null });
      text = `${label}: ${value.gp.toLocaleString('nl-NL')} GP toegevoegd, verdeeld over ${active.length} actieve spelers.`;
    } else if (value.type === 'remove_drop') {
      const drop = s.drops.find(d => d.id === value.dropId); if (!drop || drop.removedAt) return fail(409, 'Deze drop is niet beschikbaar of al verwijderd.');
      drop.removedAt = now; drop.removedBy = actor.name; drop.reason = value.reason;
      text = `Drop verwijderd: ${drop.label} (${drop.gp.toLocaleString('nl-NL')} GP). Reden: ${value.reason}`;
    } else { s.endedAt = now; for (const r of s.requests) if (r.status === 'pending') { r.status = 'cancelled'; r.resolvedAt = now; r.resolvedBy = actor.name; } text = `Sessie afgesloten. Totaal: ${pkTotals(s).gp.toLocaleString('nl-NL')} GP. Openstaande verzoeken gesloten.`; }
    s.revision++; s.timeline.push({ sequence: s.revision, at: now, actor: actor.name, text });
    return this.#write(s, actor, value.requestId, payload);
  }
}
