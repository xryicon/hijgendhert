'use client';
import { useEffect, useState } from 'react';
import { Anchor, ArrowRight, LockKeyhole } from 'lucide-react';
import { useMemberSession } from './session-provider';
import type { WarshipOverview } from '@/lib/warships';
export default function WarshipEntry() {
  const session = useMemberSession();
  const [data, setData] = useState<WarshipOverview | null>(null);
  useEffect(() => {
    setData(null); if (session.status === 'loading' || session.status === 'unavailable') return;
    const controller = new AbortController(); let busy = false, retryAt = 0;
    const load = async () => {
      if (document.hidden || busy || Date.now() < retryAt) return;
      busy = true;
      try { const r = await fetch('/api/warships', { cache: 'no-store', signal: controller.signal }); if (!r.ok) { setData(null); retryAt = Date.now() + Math.max(30, Number(r.headers.get('Retry-After')) || 30) * 1000; return; } const value = await r.json() as WarshipOverview; if (!controller.signal.aborted) setData(value); }
      catch { /* No private event link without confirmed access. */ } finally { busy = false; }
    };
    void load(); const timer = setInterval(load, 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [session.status, session.member?.id]);
  const current = data?.games.find(g => !['finished', 'cancelled'].includes(g.status));
  if (!current && !data?.canManage) return null;
  return <a className="sea-entry" href={current ? `/zeeslag?event=${current.id}` : '/zeeslag'}><span className="sea-entry-emblem"><Anchor size={38}/></span><span className="sea-entry-copy"><small>{!current?.published ? <><LockKeyhole size={12}/> ALLEEN CLANLEIDING</> : 'BOSS DROPS · TWEE VLOTEN'}</small><strong>{current?.title || 'Zeeslag Bingo'}</strong><span>Jaag op boss drops. Verdien schoten. Breng de andere vloot tot zinken.</span></span><span className="sea-entry-action">{current?.status === 'active' ? 'Naar de zeeslag' : data?.canManage ? 'Open de haven' : 'Bekijk het event'} <ArrowRight size={19}/></span></a>;
}
