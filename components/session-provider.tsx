"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DiscordMember } from '@/lib/member-types';

type Session = { status: 'loading' | 'authenticated' | 'anonymous' | 'unavailable'; member: DiscordMember | null; reason: string };
const initial: Session = { status: 'loading', member: null, reason: '' };
const SessionContext = createContext<Session & { refresh: () => Promise<void>; acceptVerifiedMember: (member: DiscordMember) => void }>({ ...initial, refresh: async () => {}, acceptVerifiedMember: () => {} });
export const useMemberSession = () => useContext(SessionContext);

export function VerifiedMemberSession({ member }: { member: DiscordMember }) {
  const { acceptVerifiedMember } = useMemberSession();
  useEffect(() => acceptVerifiedMember(member), [acceptVerifiedMember, member]);
  return null;
}

export default function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(initial);
  const running = useRef<AbortController | null>(null);
  const checkedAt = useRef(0);
  const acceptVerifiedMember = useCallback((member: DiscordMember) => {
    checkedAt.current = Date.now();
    setSession({ status: 'authenticated', member, reason: '' });
  }, []);
  const refresh = useCallback(async (force = true) => {
    if (!force && Date.now() - checkedAt.current < 20_000) return;
    if (running.current || document.hidden) return;
    const controller = new AbortController(); running.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    try {
      const check = async () => {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        return { response, body: await response.json() as { authenticated?: boolean; member?: DiscordMember; reason?: string } };
      };
      // Serialize cookie renewal across tabs. Credentials stay in HttpOnly cookies.
      const { response, body } = navigator.locks
        ? await navigator.locks.request('hh-session-check', { signal: controller.signal }, check)
        : await check();
      if (running.current !== controller) return;
      checkedAt.current = Date.now();
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
    void refresh(false);
    const visible = () => { if (!document.hidden) void refresh(false); };
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
  return <SessionContext.Provider value={{ ...session, refresh, acceptVerifiedMember }}>{children}</SessionContext.Provider>;
}
