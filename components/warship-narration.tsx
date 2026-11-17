'use client';
import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { SEA_BRIEFING, seaBriefingStep } from '@/lib/warship-briefing';
import { SeaNarrator } from '@/lib/warship-narrator';

export function useWarshipNarration(revealKey: string, elapsedMs: number, presenting: boolean) {
  const narrator = useRef<SeaNarrator | null>(null);
  const [enabled, setEnabled] = useState(false), [error, setError] = useState('');
  const [visible, setVisible] = useState(true);
  const [supported, setSupported] = useState(true);
  const epoch = useRef(0), enabledRef = useRef(false), elapsed = useRef({ value: elapsedMs, received: 0 });
  elapsed.current = { value: elapsedMs, received: performance.now() }; enabledRef.current = enabled;
  const step = seaBriefingStep(elapsedMs);
  useEffect(() => {
    setSupported('AudioContext' in window); setEnabled(false); setError('');
    return () => { epoch.current++; narrator.current?.dispose(); narrator.current = null; };
  }, [revealKey]);
  useEffect(() => {
    const changed = () => setVisible(!document.hidden); changed();
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  useEffect(() => {
    const player = narrator.current;
    if (!player) return;
    if (enabled && visible && presenting && step) {
      const index = step.index;
      void player.play(step.rule.audio, () => {
        const current = seaBriefingStep(elapsed.current.value + performance.now() - elapsed.current.received);
        return current?.index === index ? current.elapsedMs / 1000 : Infinity;
      }, message => { setError(message); setEnabled(false); });
    } else player.stop();
    return () => player.stop();
  }, [enabled, visible, presenting, step?.index, revealKey]);
  async function toggle() {
    if (enabledRef.current) { epoch.current++; narrator.current?.stop(); setEnabled(false); return; }
    const attempt = ++epoch.current;
    try {
      const player = narrator.current ||= new SeaNarrator(new AudioContext());
      await player.unlock();
      if (epoch.current !== attempt) return;
      player.preload(SEA_BRIEFING.map(rule => rule.audio)); setError(''); setEnabled(true);
    } catch (e) { if (epoch.current === attempt) { setError(e instanceof Error ? e.message : 'Geluid is niet beschikbaar in deze browser.'); setEnabled(false); } }
  }
  return <div className="sea-narration"><button type="button" aria-pressed={enabled} disabled={!supported} onClick={() => void toggle()}>{enabled ? <Volume2 size={17}/> : <VolumeX size={17}/>} {enabled ? 'Geluid uitzetten' : 'Geluid aan'}</button><span role="status">{error || (!supported ? 'Lees de spelregels mee op het scherm.' : enabled ? step && presenting ? 'Nederlandse voice-over' : 'Geluid staat klaar voor de spelregels' : 'Klik om de Nederlandse uitleg te horen.')}</span></div>;
}
