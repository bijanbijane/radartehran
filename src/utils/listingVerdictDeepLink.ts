import type { PrimaryViewId } from './areaUnit';

export function readHomeVerdictPrefillFromUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = new URLSearchParams(window.location.search).get('verdictText');
    if (!raw) return '';
    return decodeURIComponent(raw.replace(/\+/g, ' ')).slice(0, 400);
  } catch {
    return '';
  }
}

export function resolvePrimaryViewFromUrl(): PrimaryViewId | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const v = params.get('view');
  if (v === 'home' || v === 'discover' || v === 'intelligence' || v === 'tools' || v === 'userspace' || v === 'map' || v === 'admin') return v;
  if (params.get('verdictText')) return 'home';
  return null;
}
