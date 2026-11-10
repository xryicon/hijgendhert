'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CHRISTMAS_DECORATION } from '@/lib/christmas-decoration';
import type { SiteAppearance } from '@/lib/site-appearance';

type AppearanceState = { appearance: SiteAppearance; available: boolean };
const AppearanceContext = createContext<(AppearanceState & { apply: (appearance: SiteAppearance) => void }) | null>(null);
export function useSiteAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('Site appearance provider missing');
  return value;
}
export default function SiteAppearanceProvider({ initial, children }: { initial: AppearanceState; children: React.ReactNode }) {
  const [state, setState] = useState(initial);
  const apply = useCallback((appearance: SiteAppearance) => setState(old => appearance.revision >= old.appearance.revision ? { appearance, available: true } : old), []);
  useEffect(() => { document.documentElement.dataset.season = state.appearance.christmasEnabled ? 'christmas' : 'default'; }, [state.appearance.christmasEnabled]);
  useEffect(() => { if (initial.available) apply(initial.appearance); }, [initial, apply]);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; let running = false;
    async function refresh() {
      if (running || controller.signal.aborted) return;
      if (document.hidden) { timer = setTimeout(refresh, 30_000); return; }
      running = true;
      try {
        const response = await fetch('/api/site/appearance', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
        if (!response.ok) throw new Error('unavailable');
        const data = await response.json() as { appearance: SiteAppearance };
        if (!controller.signal.aborted && typeof data.appearance?.christmasEnabled === 'boolean' && Number.isInteger(data.appearance.revision)) apply(data.appearance);
      } catch { if (!controller.signal.aborted) setState(old => ({ ...old, available: false })); }
      finally { running = false; if (!controller.signal.aborted) timer = setTimeout(refresh, 30_000); }
    }
    function visible() {
      document.documentElement.dataset.seasonPaused = document.hidden ? 'true' : 'false';
      if (!document.hidden) { clearTimeout(timer); void refresh(); }
    }
    timer = setTimeout(refresh, initial.available ? 30_000 : 0);
    document.addEventListener('visibilitychange', visible);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [apply, initial.available]);
  return <AppearanceContext.Provider value={{ ...state, apply }}><div dangerouslySetInnerHTML={{ __html: CHRISTMAS_DECORATION }}/>{children}</AppearanceContext.Provider>;
}
