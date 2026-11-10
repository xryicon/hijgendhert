'use client';
import ClanCrest from './clan-crest';
import { Check, Snowflake } from 'lucide-react';
import { useState } from 'react';
import { useSiteAppearance } from './site-appearance-provider';
import type { SiteAppearance } from '@/lib/site-appearance';

export default function AdminAppearance() {
  const { appearance, available, apply } = useSiteAppearance();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState('');
  async function toggle() {
    if (busy || !available) return;
    setBusy(true); setError(''); setSaved('');
    try {
      const response = await fetch('/api/admin/appearance', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...appearance, christmasEnabled: !appearance.christmasEnabled }), signal: AbortSignal.timeout(20_000) });
      const body = await response.json() as { appearance?: SiteAppearance; error?: string };
      if (!response.ok || !body.appearance) throw new Error(body.error || 'Het thema kon niet worden opgeslagen.');
      apply(body.appearance); setSaved(body.appearance.christmasEnabled ? 'Kerstthema staat aan voor de hele website.' : 'Kerstthema staat uit. De normale stijl is weer actief.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Opslaan is niet gelukt. Probeer opnieuw.'); }
    finally { setBusy(false); }
  }
  return <section className="clan-admin-panel appearance-panel"><div className="clan-admin-section-title"><Snowflake size={26}/><div><h2>Een warm clanhuis in de winter</h2><p>Geef de hele website een feestelijk Hijgend Hert-jasje.</p></div></div>
    <div className="appearance-theme-card"><div className="appearance-preview" aria-hidden="true"><img src="/christmas-evergreen.svg" alt=""/><ClanCrest className="appearance-preview-crest"/><span>KERST BIJ HIJGEND HERT</span></div><div className="appearance-theme-copy"><p className="eyebrow">SEIZOENSTHEMA</p><h3>Kerst in het clanhuis</h3><p>Dennentakken, gloeiende lichtjes rond het gewei, rode en gouden details en zachte sneeuw. Op de homepage, events, ledenprofielen, accountpagina’s en Clanbeheer.</p><div className="appearance-switch-row"><div><strong>Kerstthema</strong><span>{busy ? 'Instelling bewaren…' : appearance.christmasEnabled ? 'Aan voor alle bezoekers' : 'Uit — normale Hijgend Hert-stijl'}</span></div><button type="button" role="switch" aria-label="Kerstthema" aria-checked={appearance.christmasEnabled} disabled={busy || !available} onClick={() => void toggle()}><span/></button></div><p className="appearance-help">Je keuze wordt meteen opgeslagen. Open pagina’s volgen binnen 30 seconden. Bezoekers die minder beweging hebben ingesteld, zien stilstaande decoratie.</p></div></div>
    {!available && <p className="clan-admin-feedback error" role="status">De thema-instelling is tijdelijk niet bereikbaar. We proberen automatisch opnieuw.</p>}
    {error && <p className="clan-admin-feedback error" role="alert">{error}</p>}
    {saved && <p className="clan-admin-feedback" role="status"><Check size={16}/>{saved}</p>}
  </section>;
}
