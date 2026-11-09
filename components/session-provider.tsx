"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DiscordMember } from '@/lib/member-types';

type Session = { status: 'loading' | 'authenticated' | 'anonymous' | 'unavailable'; member: DiscordMember | null; reason: string };
const initial: Session = { status: 'loading', member: null, reason: '' };
const SessionContext = createContext<Session & { refresh: () => Promise<void> }>({ ...initial, refresh: async () => {} });
export const useMemberSession = () => useContext(SessionContext);

export default function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(initial);
  const running = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (running.current || document.hidden) return;
    const controller = new AbortController(); running.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      const body = await response.json() as { authenticated?: boolean; member?: DiscordMember; reason?: string };
      if (running.current !== controller) return;
      if (response.ok && body.authenticated && body.member) setSession({ status: 'authenticated', member: body.member, reason: '' });
      else if (response.status === 401 || body.reason === 'setup') setSession({ status: 'anonymous', member: null, reason: body.reason || 'expired' });
      else setSession(old => ({ ...old, status: 'unavailable', reason: 'unavailable' }));
    } catch {
      if (running.current === controller) setSession(old => ({ ...old, status: 'unavailable', reason: 'unavailable' }));
    } finally {
      window.clearTimeout(timeout);
      if (running.current === controller) running.current = null;
    }
  }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('loggedOut') === '1') {
      try { localStorage.setItem('hh-signout', String(Date.now())); } catch { /* Optional cross-tab notification. */ }
    }
    void refresh();
    const visible = () => { if (!document.hidden) void refresh(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) void refresh(); };
    const storage = (event: StorageEvent) => { if (event.key === 'hh-signout') void refresh(); };
    const timer = window.setInterval(() => void refresh(), 60_000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', restored);
    window.addEventListener('storage', storage);
    return () => {
      const controller = running.current; running.current = null; controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pageshow', restored);
      window.removeEventListener('storage', storage);
    };
  }, [refresh]);
  useEffect(() => {
    if (session.status !== 'unavailable') return;
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [session.status, refresh]);
  return <SessionContext.Provider value={{ ...session, refresh }}>{children}</SessionContext.Provider>;
}
