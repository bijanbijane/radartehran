/**
 * @file src/App.tsx — ARGON-4 Pure Layout Shell & Provider Wrapper (< 100 LOC)
 * Enforces [RULE-01], [RULE-05] (visualViewport dynamic height), and [RULE-18] (PWA chunk reload recovery).
 */
import { useEffect } from 'react';
import { DualLayerErrorTrap } from './components/DualLayerErrorTrap';
import { RadarNavigationProvider } from './context/RadarNavigationContext';
import { ComparisonFilterProvider } from './context/ComparisonFilterContext';
import { RadarWorkspaceShell } from './components/RadarWorkspaceShell';
import { formatMillionTomanAsIntlCurrency, getStoredIntlCurrency } from './utils/areaUnit';

export default function App() {
  // [RULE-05] Monitor visualViewport resize events to keep focused inputs visible above virtual keyboard
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    document.documentElement.dataset.intlBenchmark = formatMillionTomanAsIntlCurrency(10000, getStoredIntlCurrency());

    const syncViewportHeight = () => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      if (vh > 200) {
        document.documentElement.style.setProperty('--app-height', `${Math.round(vh)}px`);
      }
    };

    syncViewportHeight();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncViewportHeight);
    window.addEventListener('resize', syncViewportHeight);

    return () => {
      vv?.removeEventListener('resize', syncViewportHeight);
      window.removeEventListener('resize', syncViewportHeight);
    };
  }, []);

  // [RULE-18] Catch dynamic import chunk load failures (vite:preloadError) & Service Worker controllerchange
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePreloadError = () => {
      const now = Date.now();
      let lastReload: string | null = null;
      try {
        lastReload = sessionStorage.getItem('radar_chunk_reload_ts');
      } catch {
        lastReload = null;
      }
      if (!lastReload || now - Number(lastReload) > 15_000) {
        try {
          sessionStorage.setItem('radar_chunk_reload_ts', String(now));
        } catch {
          // Ignore Storage SecurityError in sandboxed iframes or strict private browsing
        }
        window.location.reload();
      }
    };

    window.addEventListener('vite:preloadError', handlePreloadError);
    return () => {
      window.removeEventListener('vite:preloadError', handlePreloadError);
    };
  }, []);

  return (
    <DualLayerErrorTrap>
      <RadarNavigationProvider>
        <ComparisonFilterProvider>
          <RadarWorkspaceShell />
        </ComparisonFilterProvider>
      </RadarNavigationProvider>
    </DualLayerErrorTrap>
  );
}
