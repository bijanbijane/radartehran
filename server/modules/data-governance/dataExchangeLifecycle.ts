/** @file server/modules/data-governance/dataExchangeLifecycle.ts — Stage 27 External Data Exchange, Provenance, Conflict Resolution & Licenses */
import crypto from 'node:crypto';
import { normalizePersianSearchText } from '../search/socialDiscoveryAndFeed';

export type DataUsageScope = 'INTERNAL_ANALYTICS' | 'PUBLIC_AGGREGATE' | 'COMMERCIAL_REPORT' | 'PRICING_CALIBRATION';
export type FreshnessState = 'FRESH' | 'AGING' | 'STALE' | 'EXPIRED' | 'UNKNOWN';
export type DuplicateMatchVerdict = 'EXACT' | 'PROBABLE' | 'REQUIRES_REVIEW' | 'DISTINCT';

export interface ExternalDataSourceLicense {
  sourceId: string;
  nameFa: string;
  licensed: boolean;
  allowedScopes: DataUsageScope[];
  maxTtlHours: number;
}

export interface StandardizedListingFact {
  recordId: string;
  sourceId: string;
  rawAreaText: string;
  standardizedSqm: number;
  rawCityFa: string;
  standardizedCityFa: string;
  rawPriceMillion: number;
  observedAtIso: string | null;
  retrievedAtIso: string;
  freshness: FreshnessState;
  qualityScore0To100: number;
  provenanceHash: string;
}

export function classifyFreshness(observedAtIso: string | null | undefined, maxTtlHours = 72, nowMs = Date.now()): FreshnessState {
  if (!observedAtIso) return 'UNKNOWN';
  const ts = Date.parse(observedAtIso);
  if (!Number.isFinite(ts)) return 'UNKNOWN';
  const ageHours = Math.max(0, (nowMs - ts) / 3_600_000);
  if (ageHours <= maxTtlHours * 0.35) return 'FRESH';
  if (ageHours <= maxTtlHours * 0.75) return 'AGING';
  if (ageHours <= maxTtlHours) return 'STALE';
  return 'EXPIRED';
}

export function evaluateDuplicateMatch(a: { neighborhoodFa: string; sqm: number; floor?: number }, b: { neighborhoodFa: string; sqm: number; floor?: number }): {
  verdict: DuplicateMatchVerdict;
  autoMergeAllowed: boolean;
} {
  const sameHood = normalizePersianSearchText(a.neighborhoodFa) === normalizePersianSearchText(b.neighborhoodFa);
  const sqmDiff = Math.abs(a.sqm - b.sqm);
  if (sameHood && sqmDiff === 0 && a.floor === b.floor) {
    return { verdict: 'EXACT', autoMergeAllowed: true };
  }
  if (sameHood && sqmDiff <= 3) {
    return { verdict: 'REQUIRES_REVIEW', autoMergeAllowed: false };
  }
  return { verdict: 'DISTINCT', autoMergeAllowed: false };
}

export class DataExchangeLifecycleService {
  private readonly sources: ExternalDataSourceLicense[] = [
    { sourceId: 'licensed-municipal-open', nameFa: 'داده باز شهرداری تاییدشده', licensed: true, allowedScopes: ['INTERNAL_ANALYTICS', 'PUBLIC_AGGREGATE'], maxTtlHours: 168 },
    { sourceId: 'unlicensed-scrape-blocked', nameFa: 'منبع فاقد مجوز کتبی', licensed: false, allowedScopes: [], maxTtlHours: 24 },
  ];
  private readonly standardizedFacts: StandardizedListingFact[] = [];
  private readonly conflictHistory: Array<{ id: string; fieldName: string; winningValue: unknown; overwrittenValue: unknown; preservedAtIso: string }> = [];

  canUseSourceForScope(sourceId: string, scope: DataUsageScope): { allowed: boolean; reasonFa?: string } {
    const src = this.sources.find((s) => s.sourceId === sourceId);
    if (!src) return { allowed: false, reasonFa: 'منبع داده در رجیستری تعریف نشده است.' };
    if (!src.licensed) return { allowed: false, reasonFa: 'ورود و استفاده از داده فاقد مجوز (Unlicensed) مسدود است.' };
    if (!src.allowedScopes.includes(scope)) return { allowed: false, reasonFa: `مجوز منبع برای کاربرد ${scope} صادر نشده است.` };
    return { allowed: true };
  }

  ingestExternalFact(params: {
    sourceId: string;
    rawCityFa: string;
    rawAreaSqm: number;
    rawPriceMillion: number;
    observedAtIso?: string | null;
  }): { ok: boolean; reasonFa?: string; fact?: StandardizedListingFact } {
    const gate = this.canUseSourceForScope(params.sourceId, 'INTERNAL_ANALYTICS');
    if (!gate.allowed) return { ok: false, reasonFa: gate.reasonFa };
    const src = this.sources.find((s) => s.sourceId === params.sourceId)!;
    const retrievedAtIso = new Date().toISOString();
    const freshness = classifyFreshness(params.observedAtIso, src.maxTtlHours);

    const standardizedSqm = Math.max(10, Math.round(params.rawAreaSqm));
    const standardizedCityFa = normalizePersianSearchText(params.rawCityFa) === 'تهران' ? 'تهران' : params.rawCityFa.trim();
    const checksPassed = [
      Boolean(src.licensed),
      standardizedSqm >= 15 && standardizedSqm <= 2000,
      params.rawPriceMillion > 0,
      Boolean(standardizedCityFa),
      freshness !== 'EXPIRED',
      Boolean(params.observedAtIso),
      true,
      true,
    ].filter(Boolean).length;
    const qualityScore0To100 = Math.round((checksPassed / 8) * 100);

    const fact: StandardizedListingFact = {
      recordId: `dxf_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      sourceId: params.sourceId,
      rawAreaText: `${params.rawAreaSqm} متر`,
      standardizedSqm,
      rawCityFa: params.rawCityFa,
      standardizedCityFa,
      rawPriceMillion: params.rawPriceMillion,
      observedAtIso: params.observedAtIso ?? null,
      retrievedAtIso,
      freshness,
      qualityScore0To100,
      provenanceHash: crypto.createHash('sha256').update(`${params.sourceId}:${params.rawAreaSqm}:${params.rawPriceMillion}:${retrievedAtIso}`).digest('hex').slice(0, 16),
    };
    this.standardizedFacts.unshift(fact);
    return { ok: true, fact };
  }

  resolveFieldConflictPreservingHistory(fieldName: string, oldValue: unknown, newValue: unknown) {
    const record = {
      id: `cnf_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
      fieldName,
      winningValue: newValue,
      overwrittenValue: oldValue,
      preservedAtIso: new Date().toISOString(),
    };
    this.conflictHistory.unshift(record);
    return record;
  }

  getDataExchangeOverview() {
    return {
      sources: this.sources,
      factsCount: this.standardizedFacts.length,
      recentFacts: this.standardizedFacts.slice(0, 10),
      conflictHistoryCount: this.conflictHistory.length,
    };
  }
}

export const defaultDataExchangeLifecycle = new DataExchangeLifecycleService();
