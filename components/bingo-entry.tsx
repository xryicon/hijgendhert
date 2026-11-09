"use client";
import { useEffect, useState } from 'react';
import { ArrowRight, Grid2X2, LockKeyhole, Swords } from 'lucide-react';
type BingoAccess = { visible: boolean; canManage: boolean; live: { id: string; title: string; ends_at: string } | null };
export function useBingoAccess() {
  const [access, setAccess] = useState<BingoAccess>({ visible: false, canManage: false, live: null });
  useEffect(() => {
    const controller = new AbortController();
    async function load() { if (document.hidden) return; try { const r = await fetch('/api/bingo?summary=1', { signal: controller.signal, cache: 'no-store' }); if (!r.ok) return; const body = await r.json() as BingoAccess; if (!controller.signal.aborted) setAccess(body); } catch { /* Keep the section hidden until access is verified. */ } }
    void load(); const timer = setInterval(load, 30000); document.addEventListener('visibilitychange', load);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, []);
  return access;
}
export default function BingoEntry({ access }: { access: BingoAccess }) {
  if (!access.visible) return null;
  return <div className="container bingo-home-entry"><div className="bingo-home-icon">{access.live ? <Swords size={27}/> : <Grid2X2 size={27}/>}</div><div><span className="mini-label">{access.live ? 'CLANBINGO · NU ACTIEF' : <><LockKeyhole size={10}/> PRIVÉ · ALLEEN VOOR BEHEER</>}</span><h3>{access.live?.title || 'Het volgende avontuur begint met jullie bord.'}</h3><p>{access.live ? 'Twee teams, 25 doelen. Volg de voortgang en het klassement.' : 'Bereid de bingo voor en maak het bord zichtbaar tijdens het event.'}</p></div><a className="button outline" href={access.live ? `/bingo?event=${access.live.id}` : '/bingo'}>{access.live ? 'Volg de bingo' : 'Bingo beheren'} <ArrowRight size={15}/></a></div>;
}
