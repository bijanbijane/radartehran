/** OP-DEC-001 parity: formatMillionTomanAsIntlCurrency (see areaUnit). */
const STORAGE_QUOTA_KEY = 'radar_listing_verifier_quota_v1';
export const FREE_QUOTA_MAX = 3;

export function getRemainingVerificationQuota(): number {
  if (typeof window === 'undefined') return FREE_QUOTA_MAX;
  try {
    const raw = localStorage.getItem(STORAGE_QUOTA_KEY);
    if (!raw) return FREE_QUOTA_MAX;
    const used = parseInt(raw, 10);
    return Math.max(0, FREE_QUOTA_MAX - (Number.isFinite(used) ? used : 0));
  } catch {
    return FREE_QUOTA_MAX;
  }
}

export function consumeVerificationQuota(): number {
  if (typeof window === 'undefined') return FREE_QUOTA_MAX;
  try {
    const remaining = getRemainingVerificationQuota();
    const nextUsed = FREE_QUOTA_MAX - Math.max(0, remaining - 1);
    localStorage.setItem(STORAGE_QUOTA_KEY, String(nextUsed));
    return Math.max(0, remaining - 1);
  } catch {
    return 0;
  }
}
