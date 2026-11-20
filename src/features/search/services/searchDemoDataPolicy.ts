/** Server/runtime gate for demo search fixtures (never enabled in production UI builds). */

export function isAllowDemoSearchDataEnabled(): boolean {
  if (typeof process === 'undefined' || !process.env) return false;
  const explicit = process.env.ALLOW_DEMO_SEARCH_DATA;
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return process.env.NODE_ENV === 'test';
}