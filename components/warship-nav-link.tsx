'use client';
import { useEffect, useState } from 'react';
import { Anchor } from 'lucide-react';
import Link from './site-link';
import type { WarshipSummary } from '@/lib/warships';
export default function WarshipNavLink({ active, onNavigate }: { active: boolean; onNavigate: () => void }) {
  const [event, setEvent] = useState<WarshipSummary | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let fetching = false, retryAt = 0;
    async function load() {
      if (document.hidden || fetching || Date.now() < retryAt || controller.signal.aborted) return;
      fetching = true;
      try {
        const r = await fetch('/api/warships/navigation', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
        if (!r.ok) { retryAt = Date.now() + Math.max(30, Number(r.headers.get('Retry-After')) || 30) * 1000; if (!controller.signal.aborted) setEvent(null); return; }
        const data = await r.json() as { event: WarshipSummary | null };
        if (!controller.signal.aborted) setEvent(data.event);
      } catch { if (!controller.signal.aborted) { retryAt = Date.now() + 30000; setEvent(null); } }
      finally { fetching = false; }
    }
    void load(); const interval = setInterval(load, 30000);
    document.addEventListener('visibilitychange', load); window.addEventListener('hh-zeeslag-change', load);
    return () => { controller.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', load); window.removeEventListener('hh-zeeslag-change', load); };
  }, []);
  if (!event) return null;
  return <Link href={`/zeeslag?event=${event.id}`} className={`sea-nav-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} prefetch={false} onClick={onNavigate}><Anchor size={15}/><span>Zeeslag</span><i aria-hidden="true"/></Link>;
}
