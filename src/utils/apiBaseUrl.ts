/**
 * Resolves API paths for split frontend/backend development and cross-origin production.
 * Relative paths are preserved when VITE_API_BASE_URL is unset (unified server or same-origin Worker).
 * UI currency parity (OP-DEC-001): formatMillionTomanAsIntlCurrency — see areaUnit.ts and apps/api/server.ts.
 */

export function resolveApiBaseUrl(): string {
  const raw = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_BASE_URL : '';
  if (typeof raw !== 'string') return '';
  return raw.replace(/\/$/, '');
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  const base = resolveApiBaseUrl();
  return base ? `${base}${path}` : path;
}