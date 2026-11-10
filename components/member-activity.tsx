"use client";
import { useEffect, useState } from 'react';
import { Activity, ArrowUp, RefreshCw, Swords, Trophy } from 'lucide-react';
import type { MemberActivity } from '@/lib/member-activity';

export default function MemberActivityFeed({ username }: { username: string }) {
  const [result, setResult] = useState<{ activities: MemberActivity[]; stale?: boolean } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let mounted = true;
    setResult(null); setError('');
    const timer = setTimeout(() => controller.abort(), 65000);
    void (async () => {
      try {
        const response = await fetch(`/api/clan/member/activity?username=${encodeURIComponent(username)}`, { signal: controller.signal });
        const data = await response.json() as { activities: MemberActivity[]; stale?: boolean; error?: string };
        if (!response.ok) throw new Error(data.error || 'Activiteiten zijn tijdelijk niet beschikbaar.');
        if (!controller.signal.aborted) setResult(data);
      } catch { if (!controller.signal.aborted) setError('Activiteiten zijn tijdelijk niet beschikbaar. Probeer het later opnieuw.'); }
      finally { clearTimeout(timer); if (mounted && controller.signal.aborted) setError('Activiteiten ophalen duurt te lang. Probeer het later opnieuw.'); }
    })();
    return () => { mounted = false; clearTimeout(timer); controller.abort(); };
  }, [username, attempt]);
  return <section className="member-activity-panel" aria-labelledby="activity-title">
    <div className="activity-heading"><div><p className="profile-section-label"><Activity size={15}/> HET AVONTUUR GAAT DOOR</p><h2 id="activity-title">Laatste activiteiten</h2></div><span>MAX. 10</span></div>
    <p className="profile-feature-note">Level-ups, bosskills en bevestigde eventresultaten. Gemeten tussen updates; de datum is het meetmoment.</p>
    {error ? <p className="profile-feature-note" role="status">{error} <button className="text-link" onClick={() => setAttempt(n => n + 1)}><RefreshCw size={14}/> Opnieuw proberen</button></p> : !result ? <p className="profile-feature-note" role="status">Recente avonturen ophalen…</p> : result.activities.length ? <ol className="member-activity-list">{result.activities.map(entry => <li key={entry.id}><span className={`activity-icon activity-${entry.kind}`}>{entry.kind === 'level' ? <ArrowUp size={19}/> : entry.kind === 'boss' ? <Swords size={19}/> : <Trophy size={19}/>}</span><div><strong>{entry.title}</strong><p>{entry.detail}</p></div><time dateTime={entry.at} title={entry.since ? `Tussen ${new Date(entry.since).toLocaleString('nl-NL')} en ${new Date(entry.at).toLocaleString('nl-NL')}` : new Date(entry.at).toLocaleString('nl-NL')}>{new Date(entry.at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}</time></li>)}</ol> : <p className="activity-empty">Nog geen recente veranderingen gemeten. Nieuwe level-ups en bosskills verschijnen zodra ze in twee opeenvolgende metingen zichtbaar zijn.</p>}
    <p className="profile-feature-note activity-source">{result?.stale && 'Laatst beschikbare gegevens. '}Gebaseerd op maximaal 20 Wise Old Man-metingen uit de afgelopen maand en opgeslagen eventresultaten. Quests en drops zijn nog niet gekoppeld.</p>
  </section>;
}
