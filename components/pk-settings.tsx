'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Swords } from 'lucide-react';
import type { PkSettings } from '@/lib/pk';
import Link from './site-link';
export default function PkSettingsPanel() {
  const [settings, setSettings] = useState<PkSettings | null>(null), [role, setRole] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  async function load() { const response = await fetch('/api/admin/pk/settings', { cache: 'no-store' }); const value = await response.json() as { settings: PkSettings; error?: string }; if (!response.ok) throw new Error(value.error || 'PK-instellingen niet geladen.'); setSettings(value.settings); setRole(value.settings.roleId); setError(''); }
  useEffect(() => { void load().catch(e => setError(e.message)); }, []);
  async function save(e: FormEvent) {
    e.preventDefault(); if (!settings) return; setBusy(true); setError(''); setMessage('');
    try { const response = await fetch('/api/admin/pk/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: settings.revision, roleId: role.trim() }) }); const value = await response.json() as { settings: PkSettings; error?: string }; if (!response.ok) throw new Error(value.error || 'Opslaan niet gelukt.'); setSettings(value.settings); setMessage('PK-toegang opgeslagen.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Probeer opnieuw.'); } finally { setBusy(false); }
  }
  return <div className="pk-settings"><div className="clan-admin-section-title"><Swords size={23}/><div><h2>Toegang tot PK-sessies</h2><p>Leden met deze Discord-rol kunnen sessies starten en meekijken. Admin en Staff team houden toegang.</p></div></div><form onSubmit={save}><fieldset disabled={busy || !settings}><label>PK Discord-rol-ID<input inputMode="numeric" pattern="[0-9]{17,20}" placeholder="Rol-ID later toevoegen" value={role} onChange={e => setRole(e.target.value)}/></label><p>Laat leeg om toegang voor gewone leden uit te zetten. De PK-rol komt bovenop de bestaande clanrol voor het inloggen.</p><div className="clan-admin-actions"><button className="button gold" type="submit">{busy ? 'Opslaan…' : 'PK-rol bewaren'}</button><Link className="text-link" href="/pk">Open PK-sessies →</Link></div></fieldset></form>{message && <p role="status">{message}</p>}{error && <p role="alert">{error} <button className="text-link" type="button" onClick={() => void load().catch(e => setError(e.message))}>Opnieuw laden</button></p>}</div>;
}
