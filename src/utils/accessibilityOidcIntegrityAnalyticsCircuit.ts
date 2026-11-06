import crypto from 'node:crypto';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type ImplementationPresenceState = 'IMPLEMENTED_IN_CODE' | 'PARTIALLY_IMPLEMENTED' | 'NOT_IMPLEMENTED'; export interface AccessibilitySummaryTableRow { month: string; buyPerSqmMillion: number; rahn80mMillion: number; monthlyRentEquivMillion: number; }
export function buildScreenReaderChartAndStatusSummary(params: { hoodName: string; status: 'green' | 'yellow' | 'red'; buyPerSqmMillion: number; rahn80mMillion: number; rows: AccessibilitySummaryTableRow[]; }, areaUnit: AreaUnit = getStoredAreaUnit(), intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()): { ariaLabelFa: string; statusTextAlternativeFa: string; wcagAutomatedOnlyClaim: false; displayAreaUnitLabel?: string; buyPerSqmIntlText?: string; } { const statusTextAlternativeFa = params.status === 'green'
      ? 'مناسب و هم‌خوان با بودجه انتخابی (وضعیت سبز)'
      : params.status === 'yellow'
        ? 'نیازمند افزایش جزئی بودجه تا ۱۵ درصد (وضعیت زرد)'
        : 'فراتر از سقف بودجه فعلی (وضعیت قرمز)'; const first = params.rows[0]; const last = params.rows[params.rows.length - 1]; const trendSpanText = first && last
      ? `از متری ${first.buyPerSqmMillion} میلیون تومان در ${first.month} به ${last.buyPerSqmMillion} میلیون تومان در ${last.month}`
      : `متری ${params.buyPerSqmMillion} میلیون تومان`;
  return {
    ariaLabelFa: `خلاصه دسترس‌پذیر محله ${params.hoodName}: ${statusTextAlternativeFa}. میانگین خرید ${trendSpanText} و رهن کامل ۸۰ متری ${params.rahn80mMillion} میلیون تومان.`,
    statusTextAlternativeFa, wcagAutomatedOnlyClaim: false, displayAreaUnitLabel: formatAreaUnitLabel(areaUnit), buyPerSqmIntlText: formatMillionTomanAsIntlCurrency(params.buyPerSqmMillion, intlCurrency), }; } export interface OidcTokenClaimsCandidate { iss: string; aud: string; sub: string; email?: string; email_verified?: boolean; exp: number; iat: number; nonce?: string; } export class OidcAndOAuthFlowSecurityGuard { private readonly expectedIssuer: string; private readonly expectedAudience: string; private readonly allowedRedirectOrigins: Set<string>; private readonly activeStates = new Map<string, { nonce: string; expiresAtMs: number; consumed: boolean }>(); constructor(options: { expectedIssuer: string;
    expectedAudience: string; allowedRedirectOrigins: string[]; }) { this.expectedIssuer = options.expectedIssuer; this.expectedAudience = options.expectedAudience; this.allowedRedirectOrigins = new Set(options.allowedRedirectOrigins.map((o) => o.replace(/\/+$/, ''))); }
  issueStateAndNonce(nowMs = Date.now(), ttlMs = 10 * 60_000): { state: string; nonce: string } {
    if (this.activeStates.size >= 2000) {
      for (const [k, v] of this.activeStates.entries()) { if (v.consumed || v.expiresAtMs <= nowMs) this.activeStates.delete(k); }
      if (this.activeStates.size >= 2000) { const oldest = this.activeStates.keys().next().value; if (oldest !== undefined) this.activeStates.delete(oldest); }
    }
    const state = `st_${crypto.randomBytes(16).toString('hex')}`;
    const nonce = `nc_${crypto.randomBytes(16).toString('hex')}`;
    this.activeStates.set(state, { nonce, expiresAtMs: nowMs + Math.max(1000, Math.min(ttlMs, 3_600_000)), consumed: false }); return { state, nonce }; }
  validateCallbackAndIdToken(params: { state: string; redirectUri: string; claims: OidcTokenClaimsCandidate; bootstrapAdminEmails?: string[]; nowMs?: number;
  }): { authenticated: boolean; grantedAdminRole: boolean; reason:
      | 'OK' | 'INVALID_OR_REPLAYED_STATE' | 'STATE_EXPIRED' | 'DISALLOWED_REDIRECT_URI'
      | 'INVALID_ISSUER_OR_AUDIENCE' | 'TOKEN_EXPIRED' | 'NONCE_MISMATCH' | 'UNVERIFIED_EMAIL_CANNOT_LINK_OR_ELEVATE'; } { const nowMs = params.nowMs ?? Date.now(); const storedState = this.activeStates.get(params.state);
    if (!storedState || storedState.consumed) { return { authenticated: false, grantedAdminRole: false, reason: 'INVALID_OR_REPLAYED_STATE' }; }
    if (!Number.isFinite(nowMs) || nowMs > storedState.expiresAtMs) { storedState.consumed = true;
      return { authenticated: false, grantedAdminRole: false, reason: 'STATE_EXPIRED' }; }
    storedState.consumed = true; // One-time state consumption
    let parsedOrigin = '';
    try {
      const u = new URL(params.redirectUri);
      if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
        return { authenticated: false, grantedAdminRole: false, reason: 'DISALLOWED_REDIRECT_URI' };
      }
      parsedOrigin = u.origin;
    } catch {
      return { authenticated: false, grantedAdminRole: false, reason: 'DISALLOWED_REDIRECT_URI' };
    }
    if (!this.allowedRedirectOrigins.has(parsedOrigin)) {
      return { authenticated: false, grantedAdminRole: false, reason: 'DISALLOWED_REDIRECT_URI' };
    }
    if (params.claims.iss !== this.expectedIssuer || params.claims.aud !== this.expectedAudience) {
      return { authenticated: false, grantedAdminRole: false, reason: 'INVALID_ISSUER_OR_AUDIENCE' };
    }
    if (!Number.isFinite(params.claims.exp) || params.claims.exp * 1000 <= nowMs) {
      return { authenticated: false, grantedAdminRole: false, reason: 'TOKEN_EXPIRED' };
    }
    if (params.claims.nonce !== storedState.nonce) {
      return { authenticated: false, grantedAdminRole: false, reason: 'NONCE_MISMATCH' };
    }
    if (params.claims.email && params.claims.email_verified !== true) {
      return { authenticated: false, grantedAdminRole: false, reason: 'UNVERIFIED_EMAIL_CANNOT_LINK_OR_ELEVATE' };
    }
    const normalizedEmail = (params.claims.email || '').trim().toLowerCase();
    const grantedAdminRole =
      params.claims.email_verified === true &&
      Boolean(params.bootstrapAdminEmails?.map((e) => e.toLowerCase()).includes(normalizedEmail));
    return { authenticated: true, grantedAdminRole, reason: 'OK' };
  }
}
export type ReferentialIntegrityCategory = 'VALID_ACTIVE_RECORD' | 'INTENTIONAL_HISTORICAL_ARCHIVE' | 'PENDING_DELETE_JOURNAL_TRACKED' | 'DANGLING_NEIGHBORHOOD_REFERENCE' | 'DANGLING_STORAGE_OBJECT_REFERENCE' | 'ORPHANED_STORAGE_BINARY';
export interface ReferentialIntegrityDryRunReport {
  dryRunOnlyNoRecordsDeleted: true;
  findings: Array<{ entityType: 'bargain_listing' | 'resident_vote' | 'storage_object'; entityId: string; category: ReferentialIntegrityCategory; detail: string; }>;
  summaryCounts: Record<ReferentialIntegrityCategory, number>;
}
export function auditCrossCollectionReferentialIntegrity(params: {
  validNeighborhoodIds: number[];
  listings: Array<{ id: string; hoodId: number; mediaObjectIds: string[]; isHistoricalArchived?: boolean; }>;
  votes: Array<{ id: string; hoodId: number }>;
  storedObjectIds: string[];
  pendingDeleteObjectIds: string[];
}): ReferentialIntegrityDryRunReport {
  const hoodSet = new Set(params.validNeighborhoodIds);
  const storageSet = new Set(params.storedObjectIds);
  const pendingSet = new Set(params.pendingDeleteObjectIds);
  const referencedObjectIds = new Set<string>();
  const findings: ReferentialIntegrityDryRunReport['findings'] = [];
  const summaryCounts: Record<ReferentialIntegrityCategory, number> = {
    VALID_ACTIVE_RECORD: 0, INTENTIONAL_HISTORICAL_ARCHIVE: 0, PENDING_DELETE_JOURNAL_TRACKED: 0,
    DANGLING_NEIGHBORHOOD_REFERENCE: 0, DANGLING_STORAGE_OBJECT_REFERENCE: 0, ORPHANED_STORAGE_BINARY: 0,
  };
  const recordFinding = (
    entityType: 'bargain_listing' | 'resident_vote' | 'storage_object',
    entityId: string,
    category: ReferentialIntegrityCategory,
    detail: string,
  ) => {
    summaryCounts[category] += 1;
    findings.push({ entityType, entityId, category, detail });
  };
  for (const l of params.listings) {
    for (const oid of l.mediaObjectIds) referencedObjectIds.add(oid);
    if (l.isHistoricalArchived) {
      recordFinding('bargain_listing', l.id, 'INTENTIONAL_HISTORICAL_ARCHIVE', 'Historical archived listing retained intentionally');
      continue;
    }
    if (!hoodSet.has(l.hoodId)) {
      recordFinding('bargain_listing', l.id, 'DANGLING_NEIGHBORHOOD_REFERENCE', `References unknown hoodId=${l.hoodId}`);
      continue;
    }
    const missingMedia = l.mediaObjectIds.filter((oid) => !storageSet.has(oid) && !pendingSet.has(oid));
    if (missingMedia.length > 0) {
      recordFinding('bargain_listing', l.id, 'DANGLING_STORAGE_OBJECT_REFERENCE', `Missing storage objects: ${missingMedia.join(', ')}`);
      continue;
    }
    recordFinding('bargain_listing', l.id, 'VALID_ACTIVE_RECORD', 'All parent and media references intact');
  }
  for (const v of params.votes) {
    if (!hoodSet.has(v.hoodId)) {
      recordFinding('resident_vote', v.id, 'DANGLING_NEIGHBORHOOD_REFERENCE', `Vote references unknown hoodId=${v.hoodId}`);
    } else {
      recordFinding('resident_vote', v.id, 'VALID_ACTIVE_RECORD', 'Vote neighborhood reference valid');
    }
  }
  for (const oid of params.storedObjectIds) {
    if (pendingSet.has(oid)) {
      recordFinding('storage_object', oid, 'PENDING_DELETE_JOURNAL_TRACKED', 'Tracked in deletion journal for two-phase cleanup');
    } else if (!referencedObjectIds.has(oid)) {
      recordFinding('storage_object', oid, 'ORPHANED_STORAGE_BINARY', 'Unreferenced storage object candidate for manual review');
    } else {
      recordFinding('storage_object', oid, 'VALID_ACTIVE_RECORD', 'Referenced by active listing');
    }
  }
  return {
    dryRunOnlyNoRecordsDeleted: true,
    findings,
    summaryCounts,
  };
}
const SENSITIVE_TELEMETRY_QUERY_PARAMS = new Set([
  'token',
  'id_token',
  'access_token',
  'sig',
  'phone',
  'email',
  'contact',
  'key',
]);
export function sanitizeTelemetryEventAndUrl(params: {
  rawUrl: string;
  eventName: string;
  properties: Record<string, unknown>;
  userGrantedOptionalTelemetry: boolean;
  isEssentialSecurityAuditEvent?: boolean;
}): {
  shouldRecord: boolean;
  sanitizedUrl: string;
  sanitizedProperties: Record<string, unknown>;
} {
  if (!params.isEssentialSecurityAuditEvent && !params.userGrantedOptionalTelemetry) {
    return { shouldRecord: false, sanitizedUrl: '', sanitizedProperties: {} };
  }
  let sanitizedUrl = params.rawUrl;
  try {
    const u = new URL(params.rawUrl, 'https://tehran-radar.local');
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE_TELEMETRY_QUERY_PARAMS.has(key.toLowerCase())) {
        u.searchParams.set(key, '[REDACTED]');
      }
    }
    sanitizedUrl = `${u.pathname}${u.search}`;
  } catch {
    sanitizedUrl = params.rawUrl.split('?')[0];
  }
  const sanitizedProperties: Record<string, unknown> = Object.create(null);
  for (const [k, v] of Object.entries(params.properties || {})) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (/password|secret|token|phone|email|ip|lat|lng|budget/i.test(k)) {
      sanitizedProperties[k] = '[REDACTED_PII]';
    } else {
      sanitizedProperties[k] = v;
    }
  }
  return {
    shouldRecord: true,
    sanitizedUrl,
    sanitizedProperties,
  };
}
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type DataFreshnessProvenance =
  | 'LIVE_FRESH_OBSERVATION'
  | 'STALE_CACHED_FALLBACK_NOT_LIVE'
  | 'UNAVAILABLE_DEGRADED';
export class ExternalProviderCircuitBreaker<T> {
  private state: CircuitBreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAtMs = 0;
  private cachedValue: { data: T; fetchedAtIso: string } | null = null;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  constructor(options?: { failureThreshold?: number; resetTimeoutMs?: number }) {
    this.failureThreshold = options?.failureThreshold ?? 3;
    this.resetTimeoutMs = options?.resetTimeoutMs ?? 30_000;
  }
  getState(): CircuitBreakerState {
    return this.state;
  }
  computeBackoffWithJitterMs(attempt: number, seed = 0.5): number {
    const baseMs = Math.min(8000, 200 * Math.pow(2, Math.max(0, attempt)));
    const jitter = Math.round(baseMs * 0.2 * Math.max(0, Math.min(1, seed)));
    return baseMs + jitter;
  }
  async executeWithFallback(params: {
    nowMs?: number;
    nowIso?: string;
    callProvider: () => Promise<T>;
    validatePayload: (payload: T) => boolean;
  }): Promise<{
    circuitState: CircuitBreakerState;
    provenance: DataFreshnessProvenance;
    isLive: boolean;
    data: T | null;
    fetchedAtIso: string | null;
  }> {
    const nowMs = params.nowMs ?? Date.now();
    const nowIso = params.nowIso ?? new Date(nowMs).toISOString();
    if (this.state === 'OPEN') {
      if (nowMs - this.openedAtMs >= this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
      } else {
        return this.buildFallbackResponse();
      }
    }
    try {
      const result = await params.callProvider();
      if (!params.validatePayload(result)) {
        throw new Error('PROVIDER_SEMANTIC_VALIDATION_FAILED');
      }
      this.consecutiveFailures = 0;
      this.state = 'CLOSED';
      this.cachedValue = { data: result, fetchedAtIso: nowIso };
      return {
        circuitState: this.state,
        provenance: 'LIVE_FRESH_OBSERVATION',
        isLive: true,
        data: result,
        fetchedAtIso: nowIso,
      };
    } catch {
      this.consecutiveFailures += 1;
      if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.failureThreshold) {
        this.state = 'OPEN';
        this.openedAtMs = nowMs;
      }
      return this.buildFallbackResponse();
    }
  }
  private buildFallbackResponse(): {
    circuitState: CircuitBreakerState;
    provenance: DataFreshnessProvenance;
    isLive: false;
    data: T | null;
    fetchedAtIso: string | null;
  } {
    if (this.cachedValue) {
      return {
        circuitState: this.state,
        provenance: 'STALE_CACHED_FALLBACK_NOT_LIVE',
        isLive: false,
        data: this.cachedValue.data,
        fetchedAtIso: this.cachedValue.fetchedAtIso,
      }; } return { circuitState: this.state, provenance: 'UNAVAILABLE_DEGRADED', isLive: false, data: null, fetchedAtIso: null, }; } }