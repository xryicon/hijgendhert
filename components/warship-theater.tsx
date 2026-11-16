'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, LockKeyhole, ShieldCheck } from 'lucide-react';
import type { WarshipView } from '@/lib/warships';
import ClanCrest from './clan-crest';

export default function WarshipTheater({ game, onExit, children }: { game: WarshipView; onExit: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const root = useRef<HTMLElement>(null), exit = useRef<HTMLButtonElement>(null);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted || !root.current) return;
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    const siblings = Array.from(document.body.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el !== root.current);
    const inert = siblings.map(el => el.inert);
    siblings.forEach(el => { el.inert = true; }); document.body.style.overflow = 'hidden';
    exit.current?.focus({ preventScroll: true });
    return () => { siblings.forEach((el, i) => { el.inert = inert[i]; }); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [mounted]);
  if (!mounted) return null;
  return createPortal(<section ref={root} className="sea-page sea-theater" role="dialog" aria-modal="true" aria-labelledby="sea-theater-title" onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); onExit(); }
    if (e.key !== 'Tab') return;
    const buttons = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || []);
    const first = buttons[0], last = buttons.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }}>
    <header className="sea-theater-header"><div className="sea-theater-brand"><ClanCrest/><div><span>HIJGEND HERT · ZEESLAG</span><h1 id="sea-theater-title">{game.config.title}</h1></div></div><button ref={exit} className="sea-theater-exit" onClick={onExit}><ArrowLeft size={16}/><span>Terug naar event</span></button></header>
    {children}
    <footer className="sea-theater-footer"><span><LockKeyhole size={13}/>Jouw vloot opent na de onthulling</span><span>{game.linkedPlayer ? <><ShieldCheck size={13}/>{game.linkedPlayer.rsn} · gekoppeld</> : 'Ingelogd met Discord'}</span></footer>
  </section>, document.body);
}
