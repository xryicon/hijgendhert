import { DurableObject } from 'cloudflare:workers';
import { ammo, evidenceKey, finishAtDeadline, hits, otherTeam, shipCells, validFleet, warshipActionSchema, warshipView, type WarshipActor, type WarshipGame, type WarshipSummary } from '../lib/warships';
import { balancedTeams, manualTeams, teamBalance, type SeaRoster, type SeaTeamDraw } from '../lib/warship-teams';
import { advanceReveal, revealDuration, revealLocked } from '../lib/warship-reveal';
import { generateFleet } from '../lib/warship-fleet';
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
export class ClanWarships extends DurableObject<Cloudflare.Env> {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS sea_games (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS sea_requests (id TEXT PRIMARY KEY, actor TEXT NOT NULL, game_id TEXT NOT NULL, payload TEXT NOT NULL)');
  }
  #read(id: string) {
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM sea_games WHERE id = ?', id).toArray()[0];
    if (!row) return null;
    const game = JSON.parse(row.data) as WarshipGame;
    const announced = advanceReveal(game);
    if (finishAtDeadline(game) || announced) this.#save(game);
    return game;
  }
  #save(g: WarshipGame) { this.ctx.storage.sql.exec('INSERT INTO sea_games VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', g.id, g.createdAt, JSON.stringify(g)); }
  #assign(g: WarshipGame, draw: SeaTeamDraw) {
    const normalize = (name: string) => name.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
    const oldCrew = g.crew;
    g.crew = draw.players.map(p => {
      const existing = oldCrew.find(old => old.playerId === p.id || (!old.playerId && normalize(old.rsn) === normalize(p.rsn)));
      return { playerId: p.id, rsn: p.rsn, ehb: p.ehb, team: p.team, captain: p.captain, userId: existing?.userId || '', name: existing?.name || '' };
    });
    g.teamAssignment = draw; delete g.teamDraft;
    g.drawLog = (g.drawLog || []).map(item => item.id === draw.id ? { ...item, confirmed: true } : item);
    g.fleets = [[], []]; g.locked = [false, false];
    g.requests = g.requests.filter(r => r.playerId && g.crew.some(p => p.playerId === r.playerId && !p.userId)).map(r => ({ ...r, team: g.crew.find(p => p.playerId === r.playerId)!.team }));
  }
  async #armAlarm() {
    const times: number[] = [];
    for (const row of this.ctx.storage.sql.exec<{ id: string }>('SELECT id FROM sea_games').toArray()) {
      const g = this.#read(row.id)!;
      if (['finished', 'cancelled'].includes(g.status)) continue;
      if (g.reveal && !g.reveal.startedAt) times.push(Date.parse(g.reveal.at));
      if (g.reveal && !g.reveal.completedAt) times.push(Date.parse(g.reveal.opensAt));
      if (g.status === 'active') times.push(Date.parse(g.config.endsAt));
    }
    if (times.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 50, Math.min(...times)));
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() { await this.#armAlarm(); }
  overview(actor: WarshipActor | null) {
    const games = this.ctx.storage.sql.exec<{ id: string }>('SELECT id FROM sea_games ORDER BY created_at DESC LIMIT 50').toArray().map(r => this.#read(r.id)!).filter(g => actor?.staff || g.published);
    return { games: games.slice(0, 10).map(g => ({ id: g.id, title: g.config.title, status: g.status, published: g.published, endsAt: g.config.endsAt, revealAt: g.reveal?.at || null, opensAt: g.reveal?.opensAt || null } satisfies WarshipSummary)), canManage: !!actor?.staff, signedIn: !!actor };
  }
  getGame(id: string, actor: WarshipActor | null) {
    const g = this.#read(id);
    return !g || (!actor?.staff && !g.published) ? fail(404, 'Dit event is nog niet openbaar.') : { ok: true as const, game: warshipView(g, actor) };
  }
  async replay(input: unknown, actor: WarshipActor) {
    const parsed = warshipActionSchema.safeParse(input);
    if (!parsed.success) return fail(400, 'Controleer de invoer.');
    const a = parsed.data;
    const saved = this.ctx.storage.sql.exec<{ actor: string; game_id: string; payload: string }>('SELECT actor, game_id, payload FROM sea_requests WHERE id = ?', a.requestId).toArray()[0];
    if (!saved) return null;
    if (saved.actor !== actor.id || saved.payload !== JSON.stringify(a)) return fail(409, 'Dit verzoek is al gebruikt. Ververs het bord.');
    await this.#armAlarm();
    return this.getGame(saved.game_id, actor);
  }
  async mutate(input: unknown, actor: WarshipActor, roster?: SeaRoster) {
    const parsed = warshipActionSchema.safeParse(input);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message || 'Controleer de invoer.');
    const a = parsed.data, payload = JSON.stringify(a);
    const replay = this.ctx.storage.sql.exec<{ actor: string; game_id: string; payload: string }>('SELECT actor, game_id, payload FROM sea_requests WHERE id = ?', a.requestId).toArray()[0];
    if (replay) return await this.replay(a, actor) || fail(409, 'Dit verzoek is niet meer beschikbaar. Ververs het bord.');
    const now = Date.now(), at = new Date(now).toISOString();
    let g: WarshipGame;
    if (a.type === 'create') {
      if (!actor.staff) return fail(403, 'Alleen de clanleiding kan een event maken.');
      const rows = this.ctx.storage.sql.exec<{ id: string }>('SELECT id FROM sea_games').toArray();
      if (rows.length >= 50) return fail(409, 'Het archief is vol. Neem contact op met de beheerder.');
      if (rows.some(r => !['finished', 'cancelled'].includes(this.#read(r.id)!.status))) return fail(409, 'Rond het huidige zeeslag-event eerst af.');
      if (Date.parse(a.config.endsAt) <= now || Date.parse(a.config.endsAt) > now + 90 * 86400000) return fail(400, 'Kies een eindtijd binnen de komende 90 dagen.');
      g = { id: crypto.randomUUID(), revision: 0, config: a.config, status: 'draft', published: false, createdAt: at, startedAt: null, finishedAt: null, winner: null, finishReason: '', fleets: [[], []], locked: [false, false], crew: [], requests: [], claims: [], shots: [], audit: [] };
    } else {
      const saved = this.#read(a.gameId);
      if (!saved || (!saved.published && !actor.staff)) return fail(404, 'Dit event is nog niet openbaar.');
      g = saved;
      if (g.revision !== a.revision) return fail(409, 'De stand is gewijzigd. Controleer het vernieuwde bord en probeer opnieuw.');
      if (a.type === 'publish') {
        if (!actor.staff) return fail(403, 'Alleen de clanleiding kan publiceren.');
        g.published = a.published;
        if (g.status === 'draft' && a.published) g.status = 'setup';
      } else {
        if (['finished', 'cancelled'].includes(g.status)) return fail(409, 'Dit event is afgesloten.');
        const me = g.crew.find(p => p.userId === actor.id);
        const preparing = g.status === 'draft' || g.status === 'setup';
        if (['edit', 'enrol', 'remove_member', 'captain', 'start', 'force_start', 'review', 'cancel', 'draw_teams', 'manual_teams', 'confirm_teams', 'schedule_reveal', 'cancel_reveal'].includes(a.type) && !actor.staff) return fail(403, 'Alleen de clanleiding kan dit aanpassen.');
        if (['edit', 'join', 'remove_member', 'fleet', 'start', 'force_start', 'draw_teams', 'manual_teams', 'confirm_teams', 'schedule_reveal', 'cancel_reveal'].includes(a.type) && !preparing) return fail(409, 'Teams, vloot en regels liggen vast zodra de zeeslag start.');
        if (g.reveal && ['draw_teams', 'manual_teams', 'confirm_teams', 'remove_member', 'join'].includes(a.type)) return fail(409, 'De aangekondigde indeling ligt vast. Trek de aankondiging vóór de loting in om deze te wijzigen.');
        if (revealLocked(g, now) && ['fleet', 'start', 'force_start', 'captain', 'edit'].includes(a.type)) return fail(409, 'De teamgebieden openen na de aankondiging.');
        if (g.audit.length >= 2000 && a.type !== 'cancel') return fail(409, 'De eventlimiet is bereikt. Laat staff het event afsluiten.');
        switch (a.type) {
          case 'edit':
            if (g.claims.length || Date.parse(a.config.endsAt) <= now || Date.parse(a.config.endsAt) > now + 90 * 86400000) return fail(400, 'Controleer de eindtijd.');
            g.config = a.config; break;
          case 'join':
            if (g.teamAssignment) return fail(409, 'Kies je ingedeelde Wise Old Man-naam om je Discordaccount te koppelen.');
            if (me) return fail(409, 'Je zit al in een team.');
            if (g.requests.length >= 100 || g.crew.length >= 100) return fail(409, 'De bemanning is vol.');
            g.requests = g.requests.filter(r => r.userId !== actor.id);
            g.requests.push({ userId: actor.id, name: actor.name, rsn: a.rsn, team: a.team, at }); break;
          case 'withdraw': g.requests = g.requests.filter(r => r.userId !== actor.id); break;
          case 'enrol': {
            const request = g.requests.find(r => r.userId === a.userId);
            if (!request) return fail(404, 'Deze aanvraag is niet meer open.');
            if (a.accept) {
              if (request.playerId) {
                const slot = g.crew.find(p => p.playerId === request.playerId);
                if (!slot || slot.userId || g.crew.some(p => p.userId === a.userId)) return fail(409, 'Deze speler of dit Discordaccount is al gekoppeld.');
                slot.userId = request.userId; slot.name = request.name;
                g.requests = g.requests.filter(r => r.userId !== a.userId && r.playerId !== request.playerId);
                break;
              }
              if (!preparing || g.teamAssignment) return fail(409, 'De teamindeling ligt vast.');
              const normalized = (s: string) => s.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
              if (g.crew.some(p => p.userId === a.userId || normalized(p.rsn) === normalized(request.rsn))) return fail(409, 'Deze speler zit al in een team.');
              if (g.crew.filter(p => p.team === request.team).length >= 50) return fail(409, 'Dit team is vol.');
              g.crew.push({ userId: request.userId, name: request.name, rsn: request.rsn, team: request.team, captain: !g.crew.some(p => p.team === request.team && p.captain) });
            }
            g.requests = g.requests.filter(r => r.userId !== a.userId); break;
          }
          case 'remove_member':
            if (g.teamAssignment) return fail(409, 'Pas de Wise Old Man-teamindeling aan en bevestig deze opnieuw.');
            g.crew = g.crew.filter(p => p.userId !== a.userId); break;
          case 'captain': {
            const captain = g.crew.find(p => p.userId === a.userId); if (!captain) return fail(404, 'Speler niet gevonden.');
            g.crew.forEach(p => { if (p.team === captain.team) p.captain = p.userId === captain.userId; });
            if (g.teamAssignment) g.teamAssignment = { ...g.teamAssignment, mode: 'manual', players: g.teamAssignment.players.map(p => ({ ...p, captain: !!g.crew.find(c => c.playerId === p.id)?.captain })) };
            break;
          }
          case 'fleet':
            if (!me?.captain) return fail(403, 'Alleen de kapitein kan de eigen vloot plaatsen.');
            if (!validFleet(a.placements)) return fail(400, 'Plaats alle vier schepen binnen het bord, zonder overlap.');
            g.fleets[me.team] = a.placements; g.locked[me.team] = a.locked; break;
          case 'force_start': {
            if (g.teamDraft) return fail(409, 'Bevestig eerst de voorgestelde teamindeling.');
            if (g.status !== 'setup' || !g.published || ![0, 1].every(t => g.crew.some(p => p.team === t && p.captain))) return fail(409, 'Publiceer het event en bevestig voor beide teams een kapitein.');
            if (Date.parse(g.config.endsAt) <= now) return fail(400, 'De eindtijd is verstreken.');
            for (const team of [0, 1] as const) {
              if (!g.locked[team] || !validFleet(g.fleets[team])) {
                g.fleets[team] = generateFleet();
                g.audit.push({ at, actor: actor.id, name: actor.name, action: `auto_fleet_${team}` });
              }
              g.locked[team] = true;
            }
            g.status = 'active'; g.startedAt = at;
            // Approved WOM slots can still be linked after force-start.
            g.requests = g.requests.filter(r => !!r.playerId);
            break;
          }
          case 'start':
            if (g.teamDraft) return fail(409, 'Bevestig eerst de voorgestelde teamindeling.');
            if (g.status !== 'setup' || !g.published || !g.locked.every(Boolean) || !g.fleets.every(validFleet) || ![0, 1].every(t => g.crew.some(p => p.team === t && p.captain && p.userId))) return fail(409, 'Publiceer het event, koppel beide kapiteins aan Discord en laat hen hun vloot vastzetten.');
            if (Date.parse(g.config.endsAt) <= now) return fail(400, 'De eindtijd is verstreken.');
            g.status = 'active'; g.startedAt = at; g.requests = []; break;
          case 'claim': {
            if (g.status !== 'active' || !me) return fail(403, 'Alleen deelnemers kunnen tijdens de zeeslag drops melden.');
            const objective = g.config.objectives.find(o => o.id === a.objectiveId);
            if (!objective) return fail(400, 'Kies een drop uit deze ronde.');
            if (g.claims.length >= 500 || g.claims.filter(c => c.userId === actor.id && c.status === 'pending').length >= 10) return fail(409, 'Wacht eerst op de beoordeling van openstaande drops.');
            if (Date.parse(a.droppedAt) < Math.floor(Date.parse(g.startedAt!) / 1000) * 1000 || Date.parse(a.droppedAt) > now || Date.parse(a.droppedAt) >= Date.parse(g.config.endsAt)) return fail(400, 'De drop moet tijdens dit event behaald zijn.');
            if (g.claims.some(c => evidenceKey(c.evidence) === evidenceKey(a.evidence))) return fail(409, 'Dit bewijs is al ingediend. Gebruik één bewijs per drop.');
            if (g.claims.filter(c => c.team === me.team && c.objectiveId === objective.id && c.status !== 'rejected').length >= objective.limit) return fail(409, 'De limiet voor deze drop is bereikt of wacht op beoordeling.');
            g.claims.push({ id: crypto.randomUUID(), userId: actor.id, name: actor.name, rsn: me.rsn, team: me.team, objectiveId: objective.id, evidence: a.evidence, droppedAt: a.droppedAt, submittedAt: at, status: 'pending', reviewer: null, reviewedAt: null, reason: '' }); break;
          }
          case 'review': {
            if (g.status !== 'active') return fail(409, 'De zeeslag is niet actief.');
            const claim = g.claims.find(c => c.id === a.claimId);
            if (!claim || claim.status !== 'pending') return fail(409, 'Deze drop is al beoordeeld.');
            if (!a.approve && !a.reason) return fail(400, 'Vul een reden voor afwijzing in.');
            const objective = g.config.objectives.find(o => o.id === claim.objectiveId)!;
            if (a.approve && g.claims.filter(c => c.team === claim.team && c.objectiveId === claim.objectiveId && c.status === 'approved').length >= objective.limit) return fail(409, 'De droplimiet is bereikt.');
            claim.status = a.approve ? 'approved' : 'rejected'; claim.reviewer = actor.name; claim.reviewedAt = at; claim.reason = a.reason; break;
          }
          case 'fire': {
            if (g.status !== 'active' || !me?.captain) return fail(403, 'Alleen de kapitein kan tijdens de zeeslag vuren.');
            if (ammo(g, me.team) < 1) return fail(409, 'Geen schoten over. Laat eerst een boss-drop goedkeuren.');
            if (g.shots.some(s => s.team === me.team && s.cell === a.cell)) return fail(409, 'Dit vak is al beschoten.');
            const target = g.fleets[otherTeam(me.team)].find(p => shipCells(p).includes(a.cell));
            const sunk = target && shipCells(target).every(cell => cell === a.cell || g.shots.some(s => s.team === me.team && s.cell === cell));
            g.shots.push({ team: me.team, cell: a.cell, result: target ? sunk ? 'sunk' : 'hit' : 'miss', sunkShip: sunk ? target.ship : null, at });
            if (hits(g, me.team) === 12) { g.status = 'finished'; g.winner = me.team; g.finishedAt = at; g.finishReason = 'De volledige vijandelijke vloot is gezonken.'; }
            break;
          }
          case 'cancel': g.status = 'cancelled'; g.finishedAt = at; g.finishReason = a.reason; break;
          case 'draw_teams':
          case 'manual_teams': {
            if (!roster || !Number.isFinite(Date.parse(roster.fetchedAt))) return fail(503, 'De Wise Old Man-clanlijst is tijdelijk niet beschikbaar.');
            const ids = a.type === 'draw_teams' ? a.playerIds : a.teams.flat();
            const players = ids.map(id => roster.players.find(p => p.id === id));
            if (new Set(ids).size !== ids.length || players.some(p => !p)) return fail(400, 'Kies verschillende spelers uit de huidige clanlijst.');
            let selected: SeaTeamDraw['players'];
            try { selected = a.type === 'draw_teams' ? balancedTeams(players as SeaRoster['players'], a.captainIds) : manualTeams(players as SeaRoster['players'], a.teams, a.captainIds); }
            catch (error) { return fail(400, error instanceof Error ? error.message : 'Controleer de teamindeling.'); }
            g.teamDraft = { id: a.requestId, at, mode: a.type === 'manual_teams' ? 'manual' : a.captainIds ? 'captains' : 'random', players: selected, fetchedAt: roster.fetchedAt, stale: roster.stale };
            const balance = teamBalance(selected);
            g.drawLog = [...(g.drawLog || []), { id: a.requestId, at, mode: g.teamDraft.mode, captains: [0, 1].map(t => selected.find(p => p.team === t && p.captain)!.rsn), totals: balance.totals, gap: balance.gap, confirmed: false }].slice(-20);
            break;
          }
          case 'confirm_teams': {
            if (!g.teamDraft || g.teamDraft.id !== a.drawId) return fail(409, 'Dit voorstel is gewijzigd. Controleer de nieuwste indeling.');
            this.#assign(g, g.teamDraft);
            break;
          }
          case 'schedule_reveal': {
            if (g.reveal && now >= Date.parse(g.reveal.at)) return fail(409, 'De aankondiging is al begonnen en kan niet opnieuw worden gepland.');
            const draw = g.teamDraft?.id === a.drawId ? g.teamDraft : g.teamAssignment?.id === a.drawId ? g.teamAssignment : null;
            if (!draw) return fail(409, 'Kies eerst een teamindeling en controleer het voorstel.');
            const time = Date.parse(a.at), opens = time + revealDuration(draw.players.length);
            if (time < now + 60000 || time > now + 90 * 86400000 || opens + 60000 >= Date.parse(g.config.endsAt)) return fail(400, 'Plan de loting minstens één minuut vooruit en laat na de onthulling tijd over vóór het eventeinde.');
            this.#assign(g, draw);
            g.reveal = { drawId: draw.id, at: a.at, opensAt: new Date(opens).toISOString(), headline: a.headline, message: a.message, startedAt: null, completedAt: null, pace: 2 };
            g.published = true; g.status = 'setup';
            break;
          }
          case 'cancel_reveal':
            if (!g.reveal || now >= Date.parse(g.reveal.at)) return fail(409, 'De aankondiging kan alleen vóór de start worden ingetrokken.');
            delete g.reveal; g.published = false; g.status = 'draft';
            break;
          case 'link_player': {
            if (me) return fail(409, 'Je Discordaccount is al aan een speler gekoppeld.');
            const slot = g.crew.find(p => p.playerId === a.playerId);
            if (!slot || slot.userId) return fail(409, 'Kies een ingedeelde speler die nog niet gekoppeld is.');
            if (g.requests.length >= 100) return fail(409, 'Wacht op de beoordeling van openstaande aanvragen.');
            g.requests = g.requests.filter(r => r.userId !== actor.id);
            g.requests.push({ playerId: slot.playerId, userId: actor.id, name: actor.name, rsn: slot.rsn, team: slot.team, at });
            break;
          }
        }
      }
    }
    g.revision++; g.audit.push({ at, actor: actor.id, name: actor.name, action: a.type });
    this.ctx.storage.transactionSync(() => { this.#save(g); this.ctx.storage.sql.exec('INSERT INTO sea_requests VALUES (?, ?, ?, ?)', a.requestId, actor.id, g.id, payload); });
    await this.#armAlarm();
    return this.getGame(g.id, actor);
  }
}
