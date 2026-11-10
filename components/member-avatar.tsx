"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isDiscordAvatarUrl } from '@/lib/member-avatars';
import { useMemberSession } from './session-provider';

const Pictures = createContext<Record<string, string>>({});
export function MemberAvatarProvider({ children }: { children: ReactNode }) {
  const session = useMemberSession();
  const [pictures, setPictures] = useState<Record<string, string>>({});
  const identity = session.status === 'authenticated' ? `${session.member?.id}:${session.member?.avatarUrl}` : session.status;
  useEffect(() => {
    if (session.status === 'loading') return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/clan/avatars', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]), cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json() as { avatars?: unknown };
        if (!body.avatars || typeof body.avatars !== 'object' || Array.isArray(body.avatars)) return;
        const entries = Object.entries(body.avatars).slice(0, 2000).filter(([id, url]) => /^[1-9]\d*$/.test(id) && isDiscordAvatarUrl(url));
        if (!controller.signal.aborted) setPictures(Object.fromEntries(entries));
      } catch { /* Photos are optional; the member list remains usable. */ }
    })();
    return () => controller.abort();
  }, [identity, session.status]);
  return <Pictures.Provider value={pictures}>{children}</Pictures.Provider>;
}

export default function MemberAvatar({ playerId, src, name, className = '', fallback }: {
  playerId?: number; src?: string | null; name: string; className?: string; fallback?: ReactNode;
}) {
  const pictures = useContext(Pictures);
  const url = src === undefined && playerId ? pictures[String(playerId)] : src;
  const [failed, setFailed] = useState<string | null>(null);
  const photo = isDiscordAvatarUrl(url) && failed !== url;
  return <span className={`clan-avatar ${className}${photo ? ' has-photo' : ''}`}>
    {photo ? <img src={url} alt={`Profielfoto van ${name}`} width={128} height={128} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(url)}/> : fallback || <img src="/clan-logo.png" alt="" width={96} height={112}/>}
  </span>;
}
