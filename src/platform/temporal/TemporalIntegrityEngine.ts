/**
 * @file src/platform/temporal/TemporalIntegrityEngine.ts
 * @description Stage 27 (RT-FE-REBUILD-TEMPORAL-DATA-INTEGRITY-027) Canonical Temporal Contract,
 * ISO-8601 vs Jalali separation, Observation vs Computation timestamp separation, and Domain Freshness Policy Engine.
 */

export type TemporalFreshnessStatus = 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';

export type TemporalDataDomain =
  | 'live_listing'
  | 'exchange_rate'
  | 'market_snapshot'
  | 'monthly_index'
  | 'static_geography';

export interface TemporalDomainThreshold {
  domain: TemporalDataDomain;
  freshMaxAgeMinutes: number;
  agingMaxAgeMinutes: number;
}

export const TEMPORAL_DOMAIN_THRESHOLDS: Record<TemporalDataDomain, TemporalDomainThreshold> = {
  exchange_rate: {
    domain: 'exchange_rate',
    freshMaxAgeMinutes: 60, // <= 1 hour is FRESH
    agingMaxAgeMinutes: 360, // <= 6 hours is AGING, > 6 hours is STALE
  },
  live_listing: {
    domain: 'live_listing',
    freshMaxAgeMinutes: 24 * 60, // <= 24 hours
    agingMaxAgeMinutes: 7 * 24 * 60, // <= 7 days
  },
  market_snapshot: {
    domain: 'market_snapshot',
    freshMaxAgeMinutes: 3 * 24 * 60, // <= 3 days
    agingMaxAgeMinutes: 14 * 24 * 60, // <= 14 days
  },
  monthly_index: {
    domain: 'monthly_index',
    freshMaxAgeMinutes: 35 * 24 * 60, // <= 35 days
    agingMaxAgeMinutes: 65 * 24 * 60, // <= 65 days
  },
  static_geography: {
    domain: 'static_geography',
    freshMaxAgeMinutes: 180 * 24 * 60, // <= 180 days
    agingMaxAgeMinutes: 365 * 24 * 60, // <= 365 days
  },
};

export interface TemporalEnvelope {
  /** Real observation timestamp at the data source (ISO-8601) — null if unknown */
  observedAt: string | null;
  /** Timestamp when the observation was ingested/received by the platform (ISO-8601) */
  receivedAt: string | null;
  /** Timestamp when the metric/report calculation was executed (ISO-8601) */
  computedAt: string;
  /** Timestamp when the output was published to consumers (ISO-8601) */
  publishedAt: string | null;
  /** Explicit display calendar label (e.g., Jalali string) kept strictly separate from ISO fields */
  displayDateFa: string | null;
  /** Explicit timezone identifier */
  timeZone: 'Asia/Tehran' | 'UTC';
  /** Evaluated freshness state based on observedAt (never computedAt!) */
  freshnessStatus: TemporalFreshnessStatus;
  /** Persian freshness label for UI display */
  freshnessLabelFa: string;
}

const ISO_8601_STRICT_REGEX =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

const JALALI_YEAR_PREFIX_REGEX = /^(13\d{2}|14\d{2}|۱۳\d{2}|۱۴\d{2})\b/;

/**
 * Validates that a string is a genuine Gregorian ISO-8601 timestamp and NOT a Jalali date string
 * (such as "1405/01/15", "بهار ۱۴۰۵", or "آبان ۱۴۰۴").
 */
export function isValidIso8601Timestamp(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (JALALI_YEAR_PREFIX_REGEX.test(trimmed)) return false;
  if (!ISO_8601_STRICT_REGEX.test(trimmed)) return false;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return false;
  const year = new Date(ms).getUTCFullYear();
  return year >= 1970 && year <= 2100;
}

/**
 * Sanitizes an ISO timestamp candidate: returns canonical ISO string if valid, or `null` if invalid/Jalali.
 */
export function sanitizeIso8601OrNull(raw: unknown): string | null {
  if (!isValidIso8601Timestamp(raw)) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  return new Date(Date.parse(trimmed)).toISOString();
}

/**
 * Evaluates data freshness strictly from `observedAt` (or `receivedAt` fallback if `observedAt` is unavailable),
 * NEVER from `computedAt`. If no valid reference timestamp exists, returns `UNKNOWN`.
 */
export function evaluateTemporalFreshness(params: {
  observedAt?: string | null;
  receivedAt?: string | null;
  domain?: TemporalDataDomain;
  nowMs?: number;
  isExpiredEntity?: boolean;
}): {
  status: TemporalFreshnessStatus;
  ageMinutes: number | null;
  labelFa: string;
} {
  if (params.isExpiredEntity) {
    return {
      status: 'STALE',
      ageMinutes: null,
      labelFa: 'منقضی‌شده (کهنه)',
    };
  }

  const validObserved = sanitizeIso8601OrNull(params.observedAt);
  const validReceived = sanitizeIso8601OrNull(params.receivedAt);
  const referenceIso = validObserved ?? validReceived;

  if (!referenceIso) {
    return {
      status: 'UNKNOWN',
      ageMinutes: null,
      labelFa: 'زمان مشاهده نامشخص',
    };
  }

  const nowMs = params.nowMs ?? Date.now();
  const refMs = Date.parse(referenceIso);
  const ageMinutes = Math.max(0, Math.round((nowMs - refMs) / 60_000));
  const policy = TEMPORAL_DOMAIN_THRESHOLDS[params.domain ?? 'market_snapshot'];

  if (ageMinutes <= policy.freshMaxAgeMinutes) {
    return {
      status: 'FRESH',
      ageMinutes,
      labelFa: 'تازه و به‌روز',
    };
  }

  if (ageMinutes <= policy.agingMaxAgeMinutes) {
    return {
      status: 'AGING',
      ageMinutes,
      labelFa: 'در آستانه کهنگی (نیازمند بروزرسانی)',
    };
  }

  return {
    status: 'STALE',
    ageMinutes,
    labelFa: 'داده قدیمی (خارج از بازه تازگی)',
  };
}

/**
 * Validates chronological ordering of a temporal lifecycle:
 * observedAt <= receivedAt <= computedAt <= publishedAt
 */
export function validateTemporalChronology(input: {
  observedAt?: string | null;
  receivedAt?: string | null;
  computedAt?: string | null;
  publishedAt?: string | null;
}): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const obs = sanitizeIso8601OrNull(input.observedAt);
  const rec = sanitizeIso8601OrNull(input.receivedAt);
  const cmp = sanitizeIso8601OrNull(input.computedAt);
  const pub = sanitizeIso8601OrNull(input.publishedAt);

  if (obs && rec && Date.parse(obs) > Date.parse(rec)) {
    violations.push('OBSERVED_AFTER_RECEIVED');
  }
  if (rec && cmp && Date.parse(rec) > Date.parse(cmp)) {
    violations.push('RECEIVED_AFTER_COMPUTED');
  }
  if (obs && cmp && Date.parse(obs) > Date.parse(cmp)) {
    violations.push('OBSERVED_AFTER_COMPUTED');
  }
  if (cmp && pub && Date.parse(cmp) > Date.parse(pub)) {
    violations.push('COMPUTED_AFTER_PUBLISHED');
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Builds a complete, validated `TemporalEnvelope` separating `observedAt`, `receivedAt`, `computedAt`,
 * `publishedAt`, and `displayDateFa`.
 */
export function createTemporalEnvelope(params: {
  observedAt?: unknown;
  receivedAt?: unknown;
  computedAt?: unknown;
  publishedAt?: unknown;
  displayDateFa?: string | null;
  domain?: TemporalDataDomain;
  timeZone?: 'Asia/Tehran' | 'UTC';
  nowMs?: number;
  isExpiredEntity?: boolean;
}): TemporalEnvelope {
  const nowIso = new Date(params.nowMs ?? Date.now()).toISOString();
  const observedAt = sanitizeIso8601OrNull(params.observedAt);
  const receivedAt = sanitizeIso8601OrNull(params.receivedAt);
  const computedAt = sanitizeIso8601OrNull(params.computedAt) ?? nowIso;
  const publishedAt = sanitizeIso8601OrNull(params.publishedAt);

  const freshness = evaluateTemporalFreshness({
    observedAt,
    receivedAt,
    domain: params.domain,
    nowMs: params.nowMs,
    isExpiredEntity: params.isExpiredEntity,
  });

  const safeDisplayFa =
    params.displayDateFa && String(params.displayDateFa).trim()
      ? String(params.displayDateFa).trim()
      : observedAt
        ? formatIsoToPersianDisplayDate(observedAt, params.timeZone ?? 'Asia/Tehran')
        : null;

  return {
    observedAt,
    receivedAt,
    computedAt,
    publishedAt,
    displayDateFa: safeDisplayFa,
    timeZone: params.timeZone ?? 'Asia/Tehran',
    freshnessStatus: freshness.status,
    freshnessLabelFa: freshness.labelFa,
  };
}

export function formatIsoToPersianDisplayDate(
  isoString: string | null | undefined,
  timeZone: 'Asia/Tehran' | 'UTC' = 'Asia/Tehran'
): string | null {
  const validIso = sanitizeIso8601OrNull(isoString);
  if (!validIso) return null;
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone,
    }).format(new Date(Date.parse(validIso)));
  } catch {
    return validIso.slice(0, 10);
  }
}
