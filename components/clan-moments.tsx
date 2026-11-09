"use client";
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Camera, Gem, PawPrint, Sparkles, X } from 'lucide-react';
import { moments } from '@/content/clan-life';
import type { ClanMoment } from '@/lib/community';

const categories = [{ id: 'all', label: 'Alle momenten' }, { id: 'drop', label: 'Rare drops' }, { id: 'pet', label: 'Pets' }, { id: 'milestone', label: 'Mijlpalen' }];
export default function ClanMoments() {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<ClanMoment | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (selected) dialog.current?.showModal(); else dialog.current?.close(); }, [selected]);
  const filtered = [...moments].filter(m => filter === 'all' || m.category === filter).sort((a, b) => b.date.localeCompare(a.date));
  return <section className="community-section moments-section container" id="clanmomenten">
    <div className="section-heading"><div><p className="eyebrow">CLANSCREENSHOTS</p><h2>Drops, pets en mijlpalen</h2><p className="section-description">Screenshots en achievements van onze leden.</p></div><a className="button outline" href="https://discord.gg/KFNqA6bnZ4" target="_blank" rel="noreferrer"><Camera size={16}/> Deel je moment op Discord <ArrowUpRight size={15}/></a></div>
    <div className="community-filters" role="group" aria-label="Clanmomenten filteren">{categories.map(c => <button key={c.id} className={filter === c.id ? 'selected' : ''} aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>{c.label}</button>)}</div>
    {filtered.length ? <div className="moment-grid">{filtered.map(m => <button key={m.id} className="moment-card" onClick={() => setSelected(m)} aria-label={`Bekijk ${m.title} van ${m.player}`}><img src={m.image} alt={m.imageAlt} loading="lazy"/><div><span className="mini-label">{categories.find(c => c.id === m.category)?.label}</span><h3>{m.title}</h3><p>{m.player}<span>{new Date(`${m.date}T12:00:00Z`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Amsterdam' })}</span></p></div></button>)}</div> : <div className="moments-empty panel"><Camera size={28} aria-hidden="true"/><span className="mini-label">HET ALBUM VAN HIJGEND HERT</span><h3>{filter === 'all' ? 'Nog geen screenshots toegevoegd.' : `Nog geen ${filter === 'drop' ? 'drops' : filter === 'pet' ? 'pets' : 'mijlpalen'} gedeeld.`}</h3><p>We hebben nog geen {filter === 'all' ? 'clanscreenshots' : 'screenshots in deze categorie'} toegevoegd. Deel je RuneScape-naam, een screenshot en het verhaal erachter met de clanleiding via Discord.</p><a className="text-link" href="https://discord.gg/KFNqA6bnZ4" target="_blank" rel="noreferrer">Deel je screenshot op Discord <ArrowUpRight size={15}/></a></div>}
    <div className="moments-note"><Camera size={16}/><p>Screenshots worden door de clanleiding toegevoegd. Er is geen automatische Discord-import.</p></div>
    <dialog ref={dialog} className="moment-dialog" aria-label={selected ? `${selected.title} van ${selected.player}` : 'Clanmoment'} onCancel={() => setSelected(null)} onClick={e => { if (e.target === dialog.current) setSelected(null); }}><button className="dialog-close" onClick={() => setSelected(null)} aria-label="Clanmoment sluiten"><X size={22}/></button>{selected && <><img src={selected.image} alt={selected.imageAlt}/><div><span className="mini-label">{selected.player}</span><h2>{selected.title}</h2><p>{selected.description}</p></div></>}</dialog>
  </section>;
}
