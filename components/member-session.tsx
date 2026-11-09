"use client";
import { useEffect, useState, type ReactNode } from 'react';

export default function MemberSession({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let checking = false;
    async function verify() {
      if (checking || document.hidden || controller.signal.aborted) return;
      checking = true;
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) {
          setLocked(true);
          const body = await response.json() as { reason?: string };
          const reason = body.reason && ['expired', 'role', 'server', 'pending', 'unavailable', 'setup'].includes(body.reason) ? body.reason : 'unavailable';
          window.location.replace(`/login?error=${reason}`);
        }
      } catch {
        if (!controller.signal.aborted) { setLocked(true); window.location.replace('/login?error=unavailable'); }
      } finally { checking = false; }
    }
    const timer = window.setInterval(verify, 60_000);
    const onVisible = () => { if (!document.hidden) void verify(); };
    const onRestore = (event: PageTransitionEvent) => { if (event.persisted) void verify(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onRestore);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('pageshow', onRestore); };
  }, []);
  return locked ? <p role="status">Je toegang wordt opnieuw gecontroleerd…</p> : children;
}
