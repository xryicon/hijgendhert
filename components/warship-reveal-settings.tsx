'use client';
import { useState } from 'react';
import { CalendarClock, Megaphone } from 'lucide-react';
import type { WarshipView } from '@/lib/warships';
import { localInput } from './warship-forms';
export default function WarshipRevealSettings({ game, busy, act }: { game: WarshipView; busy: boolean; act: (type: string, fields?: Record<string, unknown>) => Promise<boolean> }) {
  const [at, setAt] = useState(game.reveal ? localInput(game.reveal.at) : '');
  const [headline, setHeadline] = useState(game.reveal?.headline || 'Hijgend Hert vaart uit');
  const [message, setMessage] = useState(game.reveal?.message || 'Twee vloten. Eén clan. Ontdek wie jouw kapitein wordt en met wie jij de strijd aangaat.');
  const [cancel, setCancel] = useState(false);
  const drawId = game.teamDraft?.id || game.teamAssignment?.id || game.reveal?.drawId;
  if (!game.canManage || !['draft', 'setup'].includes(game.status) || !drawId) return null;
  if (game.reveal && game.reveal.phase !== 'countdown') return <p className="sea-note">De geplande onthulling is begonnen. De aangekondigde teamindeling ligt vast.</p>;
  return <section className="sea-reveal-settings"><div className="sea-section-heading"><div><small>LAAT DE CLAN SAMEN AFTELLEN</small><h2><Megaphone size={22}/> De grote aankondiging</h2><p>Plan de start van de introductie: eerst jullie spelregels, daarna de bosses en hun drops, gevolgd door de teamonthulling. De Zeeslag-tab verschijnt meteen met de aftelling; teamgebieden blijven gesloten tot de onthulling klaar is.</p></div></div>
    <form onSubmit={e => { e.preventDefault(); if (at) void act('schedule_reveal', { drawId, at: new Date(at).toISOString(), headline, message }); }}><div className="sea-form-grid"><label><CalendarClock size={15}/> Start van spelregels & onthulling<input required type="datetime-local" value={at} onChange={e => setAt(e.target.value)} disabled={busy}/><small>Jouw lokale tijd. De leestijd volgt jullie regels, plus 8 seconden per boss drop. Het rad start vijf seconden daarna.</small></label><label>Titel van de aankondiging<input required maxLength={100} value={headline} onChange={e => setHeadline(e.target.value)} disabled={busy}/></label></div><label>Bericht aan de clan<textarea required maxLength={500} value={message} onChange={e => setMessage(e.target.value)} disabled={busy}/></label><p className="sea-note">De uitleg en teamonthulling volgen voor iedereen dezelfde klok. De introductie is volledig zonder geluid. Dit bevestigt de gekozen teams, publiceert het event en wist bestaande scheepsopstellingen. Koppel deelnemers alvast aan hun Discordaccount via Bemanning. De server opent na de onthulling alleen hun eigen vloot. Staff start het boss-drop-event zodra beide kapiteins hun schepen hebben geplaatst.</p><button type="submit" className="button gold" disabled={busy || !at}>{game.reveal ? 'Planning bijwerken' : 'Plan & publiceer aankondiging'}</button></form>
    {game.reveal && <div className="sea-reveal-cancel">{cancel ? <><p>De aankondiging intrekken? Het event wordt privé; de gekozen teams en accountkoppelingen blijven bewaard.</p><div className="sea-buttons"><button className="button outline" type="button" disabled={busy} onClick={() => void act('cancel_reveal').then(ok => { if (ok) setCancel(false); })}>Trek aankondiging in</button><button type="button" className="sea-text-button" disabled={busy} onClick={() => setCancel(false)}>Terug</button></div></> : <button type="button" className="sea-text-button" disabled={busy} onClick={() => setCancel(true)}>Aankondiging intrekken</button>}</div>}
  </section>;
}
