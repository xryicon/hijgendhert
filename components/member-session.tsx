"use client";
import { useEffect, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { useMemberSession } from './session-provider';

export default function MemberSession({ children }: { children: ReactNode }) {
  const session = useMemberSession();
  useEffect(() => {
    if (session.status !== 'anonymous') return;
    const reason = ['expired', 'role', 'server', 'pending', 'setup'].includes(session.reason) ? session.reason : 'expired';
    window.location.replace(`/login?error=${reason}`);
  }, [session.status, session.reason]);
  if (session.status === 'unavailable') return <section className="member-connection" role="status">
    <RefreshCw size={24}/><h1>Even opnieuw verbinden</h1>
    <p>We kunnen je Discord-rol nu niet controleren. Je sessie blijft bewaard; we proberen het automatisch opnieuw.</p>
    <button type="button" onClick={() => void session.refresh()}>Opnieuw proberen</button>
  </section>;
  if (session.status === 'anonymous') return <p role="status">Je toegang wordt opnieuw gecontroleerd…</p>;
  // The initial server render is already protected by requireDiscordMember().
  return children;
}
