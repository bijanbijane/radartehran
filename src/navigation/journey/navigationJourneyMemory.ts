/**
 * RT-FE-NAVIGATION-ARCHITECTURE-014 — Bounded recent navigation (paths only, no secrets).
 */
const STORAGE_KEY = 'radar:nav:recent:v1';
const MAX_ITEMS = 8;

export interface RecentNavigationItem {
  path: string;
  titleFa: string;
  visitedAtIso: string;
}

export function recordRecentNavigation(path: string, titleFa: string): void {
  if (typeof window === 'undefined') return;
  const cleanPath = path.split('?')[0]?.split('#')[0] || '/';
  if (cleanPath.length > 180) return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const prev: RecentNavigationItem[] = raw ? (JSON.parse(raw) as RecentNavigationItem[]) : [];
    const next = [
      { path: cleanPath, titleFa: titleFa.slice(0, 120), visitedAtIso: new Date().toISOString() },
      ...prev.filter((p) => p.path !== cleanPath),
    ].slice(0, MAX_ITEMS);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readRecentNavigation(): RecentNavigationItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentNavigationItem[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}