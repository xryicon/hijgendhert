"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DiscordMember } from '@/lib/member-types';

type Session = { status: 'loading' | 'authenticated' | 'anonymous' | 'unavailable'; member: DiscordMember | null; reason: string };
const initial: Session = { status: 'loading', member: null, reason: '' };
const cooldownKey = 'hh-session-retry-at';
const routineCheckMs = 5 * 60_000;
// Only a retry deadline is shared, never identity, roles or credentials.
function sharedRetryAt() {
  try { const value = Number(localStorage.getItem(cooldownKey)); return Number.isFinite(value) && value > Date.now() ? value : 0; } catch { return 0; }
}
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
  const retryAt = useRef(0);
  const failures = useRef(0);
  const acceptVerifiedMember = useCallback((member: DiscordMember) => {
    checkedAt.current = Date.now();
    retryAt.current = 0; failures.current = 0;
    try { localStorage.removeItem(cooldownKey); } catch { /* Optional cross-tab backoff. */ }
    setSession({ status: 'authenticated', member, reason: '' });
  }, []);
  const refresh = useCallback(async (force = true) => {
    if (!force && failures.current === 0 && Date.now() - checkedAt.current < routineCheckMs) return;
    if (running.current || document.hidden) return;
    if (Date.now() < Math.max(retryAt.current, sharedRetryAt())) {
      failures.current = Math.max(1, failures.current);
      setSession(old => ({ ...old, status: 'unavailable', reason: 'unavailable' }));
      return;
    }
    const controller = new AbortController(); running.current = controller;
    let timeout: number | undefined;
    const pause = (response?: Response) => {
      failures.current += 1;
      const header = response?.headers.get('Retry-After');
      const providerWait = header && /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : header ? Date.parse(header) - Date.now() : 0;
      const backoff = Math.min(15 * 60_000, 60_000 * 2 ** Math.min(failures.current - 1, 4));
      retryAt.current = Math.max(sharedRetryAt(), Date.now() + Math.max(backoff, Number.isFinite(providerWait) ? providerWait : 0));
      try { localStorage.setItem(cooldownKey, String(retryAt.current)); } catch { /* In-memory backoff still applies. */ }
      setSession(old => ({ ...old, status: 'unavailable', reason: 'unavailable' }));
    };
    try {
      const check = async () => {
        // Another tab may have received a rate limit while this tab waited.
        if (Date.now() < sharedRetryAt()) return null;
        timeout = window.setTimeout(() => controller.abort(), 25_000);
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        return { response, body: await response.json() as { authenticated?: boolean; member?: DiscordMember; reason?: string } };
      };
      // Serialize cookie renewal across tabs. Credentials stay in HttpOnly cookies.
      const result = navigator.locks
        ? await navigator.locks.request('hh-session-check', { signal: controller.signal }, check)
        : await check();
      if (running.current !== controller) return;
      if (!result) { retryAt.current = sharedRetryAt(); failures.current = Math.max(1, failures.current); setSession(old => ({ ...old, status: 'unavailable', reason: 'unavailable' })); return; }
      const { response, body } = result;
      if (response.ok && body.authenticated && body.member) {
        checkedAt.current = Date.now(); failures.current = 0; retryAt.current = 0;
        try { localStorage.removeItem(cooldownKey); } catch { /* Optional storage. */ }
        setSession({ status: 'authenticated', member: body.member, reason: '' });
      }
      else if (response.status === 401 || body.reason === 'setup') {
        checkedAt.current = Date.now(); failures.current = 0; retryAt.current = 0;
        setSession({ status: 'anonymous', member: null, reason: body.reason || 'expired' });
      }
      else pause(response);
    } catch {
      if (running.current === controller) pause();
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
    const storage = (event: StorageEvent) => {
      if (event.key === 'hh-signout') {
        const controller = running.current; running.current = null; controller?.abort();
        checkedAt.current = Date.now(); failures.current = 0;
        setSession({ status: 'anonymous', member: null, reason: 'expired' });
      }
      if (event.key === cooldownKey) retryAt.current = sharedRetryAt();
    };
    const timer = window.setInterval(() => void refresh(false), 30_000);
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
  return <SessionContext.Provider value={{ ...session, refresh, acceptVerifiedMember }}>{children}</SessionContext.Provider>;
}
