'use client';
import { useEffect, useState } from 'react';
import { Crosshair } from 'lucide-react';
import { useMemberSession } from './session-provider';
import Link from './site-link';
export default function PkAccessLink({ onNavigate }: { onNavigate?: () => void }) {
  const session = useMemberSession(); const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    setAllowed(false); if (session.status !== 'authenticated') return;
    const controller = new AbortController();
    void fetch('/api/pk/access', { cache: 'no-store', signal: controller.signal }).then(async r => r.ok ? await r.json() as { allowed: boolean } : { allowed: false }).then(value => { if (!controller.signal.aborted) setAllowed(value.allowed === true); }).catch(() => {});
    return () => controller.abort();
  }, [session.status, session.member?.id]);
  if (!allowed || session.status !== 'authenticated') return null;
  return <Link href="/pk" prefetch={false} onClick={onNavigate}><Crosshair size={15}/><span>PK</span></Link>;
}
