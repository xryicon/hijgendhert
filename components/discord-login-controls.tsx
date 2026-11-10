"use client";
import { useEffect, useState } from 'react';
import { ArrowRight, Hourglass, MessageCircle, RefreshCw } from 'lucide-react';
import { useMemberSession } from './session-provider';
import { discordWaitLabel } from '@/lib/discord-retry';

function useRetryClock(deadline: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!deadline || deadline <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return { waiting: deadline > 0 && (now === null || deadline > now), label: now === null ? '…' : discordWaitLabel((deadline - now) / 1000) };
}

export function SessionRetryButton({ retryAt = 0 }: { retryAt?: number }) {
  const session = useMemberSession();
  const clock = useRetryClock(Math.max(retryAt, session.retryAt));
  const [checking, setChecking] = useState(false);
  async function retry() { setChecking(true); try { await session.refresh(); } finally { setChecking(false); } }
  return <button type="button" className="member-login" disabled={clock.waiting || checking} onClick={() => void retry()}>
    {clock.waiting ? <Hourglass size={18}/> : <RefreshCw size={18}/>}<span>{clock.waiting ? `Opnieuw controleren over ${clock.label}` : checking ? 'Login controleren…' : 'Controleer mijn login'}</span>
  </button>;
}

export default function DiscordLoginControls({ authUrl, enabled, initialRetryAt, issue, reference }: { authUrl?: string; enabled: boolean; initialRetryAt: number; issue?: 'rate-limit' | 'connection'; reference: string | null }) {
  const session = useMemberSession();
  const deadline = Math.max(initialRetryAt, session.retryAt);
  const clock = useRetryClock(deadline);
  const reconnecting = clock.waiting || session.status === 'unavailable' || (issue && session.status === 'loading');
  const diagnostic = session.reference || reference;
  const limited = issue === 'rate-limit' || diagnostic?.endsWith('HTTP429');
  return <>
    {reconnecting && <div className="login-connection-note" role="status"><Hourglass size={19}/><div><strong>{limited ? 'Even wachten op Discord' : 'Verbinding met Discord herstellen'}</strong><p>{limited ? 'Discord vraagt om een korte pauze tussen de controles. Je bestaande login blijft bewaard.' : 'Je bestaande login blijft bewaard. We proberen de verbinding opnieuw zodra dat kan.'}</p></div></div>}
    {reconnecting ? <SessionRetryButton retryAt={initialRetryAt}/> : enabled && authUrl ? <a className="member-login" href={authUrl}><MessageCircle size={21}/><span>Inloggen met Discord</span><ArrowRight size={18}/></a> : <button className="member-login" disabled><MessageCircle size={21}/><span>Inloggen met Discord</span><ArrowRight size={18}/></button>}
    {reconnecting && diagnostic && <details className="login-diagnostics"><summary>Details voor clanbeheer</summary><p>Foutcode: {diagnostic}</p></details>}
  </>;
}
