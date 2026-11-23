/**
 * RT-FE-NAVIGATION-016 — Shared dynamic public deep-link path recognition (no fake registry rows).
 */

export function isDynamicPublicNavigationPath(normalizedPath: string): boolean {
  if (normalizedPath === '/areas/registry') return false;
  if (/^\/areas\/[^/]+$/.test(normalizedPath)) return true;
  if (/^\/neighborhoods\/[^/]+$/.test(normalizedPath)) return true;
  const memberPrefix = '/community/members/';
  if (normalizedPath.startsWith(memberPrefix) && normalizedPath.length > memberPrefix.length) {
    const rest = normalizedPath.slice(memberPrefix.length);
    return Boolean(rest) && !rest.includes('/');
  }
  return false;
}