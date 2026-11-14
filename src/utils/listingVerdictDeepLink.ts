/** OP-DEC-001 parity: formatMillionTomanAsIntlCurrency (see areaUnit). */
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

import { resolveRouteFromLocation } from '../navigation/url/navigationUrlContract';

export function resolvePrimaryViewFromUrl(): PrimaryViewId | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('verdictText') && !params.get('view') && window.location.pathname === '/') {
    return 'home';
  }
  const resolved = resolveRouteFromLocation(window.location.pathname, window.location.search);
  if (window.location.pathname === '/' && !params.get('view')) return null;
  return resolved.viewId as PrimaryViewId;
}
