/**
 * @file src/utils/securityGovernance601To639.ts
 * @description
 * Security, Privacy, Firestore Query, Financial Ledger, Purpose-Specific Consent, * Publication Policy, Trusted Server Time, Graceful Shutdown, Listing Fraud Separation, * Vote Aggregation, Sponsor Slot Exclusivity, Market Generation Ordering, and Job Lease
 * Governance (Tasks 601–639).
 */
import crypto from 'node:crypto'; import zlib from 'node:zlib'; import { evaluatePropertyListingTrust, normalizePersianAddressText, validateIranianPostalCode,
  type PropertyListingCandidate, type ListingAnomalyClassification, } from '../data/listingFraudAndAddressEngine'; import type { Neighborhood } from '../data/neighborhoods'; import { isValidFirestoreDocId, sanitizeInput } from './domainSecurityValidators'; import { redactSensitiveForensicText } from './serverForensicsAndIncidentResponse'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export function resolveHttpSecurityHeadersPolicy(params: { isHttps: boolean; nodeEnv?: string;
  hstsPreloadVerified?: boolean; }): Record<string, string> { const headers: Record<string, string> = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups', 'Origin-Agent-Cluster': '?1',
    'Permissions-Policy': 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)', }; if (params.nodeEnv === 'production' && params.isHttps) { headers['Strict-Transport-Security'] = params.hstsPreloadVerified
      ? 'max-age=31536000; includeSubDomains; preload'
      : 'max-age=31536000'; }
  return headers; }
export function shouldCompressHttpResponse(params: { path: string; hasAuthHeaders: boolean; byteLength: number; }): boolean { if (params.byteLength < 1024 || params.hasAuthHeaders) return false;
  const p = params.path || '/'; return !(
    p.startsWith('/api/admin/') ||
    p === '/api/system-health' ||
    p.startsWith('/api/buyer-alerts') ||
    p.startsWith('/api/sponsors/') ||
    p.startsWith('/api/bargains/') ||
    p === '/api/contract-check' );
}
export function safeDecompressBoundedBuffer(
  compressed: Buffer, encoding: 'gzip' | 'br',
  maxOutputBytes = 512 * 1024, ): { ok: true; buffer: Buffer } | { ok: false; code: 'DECOMPRESSION_LIMIT_EXCEEDED' | 'DECOMPRESSION_FAILED' } {
  try {
    const out =
      encoding === 'br'
        ? zlib.brotliDecompressSync(compressed, { maxOutputLength: maxOutputBytes })
        : zlib.gunzipSync(compressed, { maxOutputLength: maxOutputBytes });
    return { ok: true, buffer: out };
  } catch (err: any) {
    const msg = String(err?.message || err?.code || '');
    return {
      ok: false,
      code: /ERR_BUFFER_TOO_LARGE|maxOutputLength|too large/i.test(msg)
        ? 'DECOMPRESSION_LIMIT_EXCEEDED'
        : 'DECOMPRESSION_FAILED',
    };
  }
}
export function sanitizeDiagnosticTelemetryEvent(
  rawEvent: Record<string, unknown>,
  telemetryEnabled = true,
): Record<string, unknown> | null {
  if (!telemetryEnabled) return null;
  const safeMsg = redactSensitiveForensicText(String(rawEvent.message || rawEvent.sanitizedMessage || ''))
    .replace(/(?:\/app\/applet\/|\/Users\/[^\s]+|[A-Za-z]:\\[^\s]+)/g, '[REDACTED_PATH]');
  return {
    eventType: sanitizeInput(String(rawEvent.eventType || 'DIAGNOSTIC'), 40),
    correlationId: sanitizeInput(String(rawEvent.correlationId || 'none'), 64),
    routeCategory: sanitizeInput(String(rawEvent.routeCategory || 'app'), 40),
    outcome: rawEvent.outcome === 'error' ? 'error' : 'ok',
    errorCode: sanitizeInput(String(rawEvent.errorCode || 'NONE'), 48),
    sanitizedMessage: safeMsg.slice(0, 180),
    timestampIso: new Date().toISOString(),
  };
}
export function formatUserFacingErrorBoundaryState(
  error: unknown,
  isProduction = process.env.NODE_ENV === 'production',
): { userMessageFa: string; errorCode: string; exposedStack: string } {
  const rawMsg = error instanceof Error ? error.message : String(error || '');
  const sanitized = redactSensitiveForensicText(rawMsg).replace(
    /(?:\/app\/applet\/|\/Users\/[^\s]+|[A-Za-z]:\\[^\s]+)/g,
    '[PATH]',
  );
  return {
    userMessageFa: isProduction
      ? 'خطایی در نمایش این بخش رخ داد. اطلاعات حساس و نشست شما محفوظ است؛ لطفاً دوباره تلاش کنید.'
      : sanitized.slice(0, 200) || 'خطای رابط کاربری',
    errorCode: 'UI_RENDER_BOUNDARY_CAUGHT',
    exposedStack: isProduction ? '' : error instanceof Error ? String(error.stack || '').slice(0, 600) : '',
  };
}
export const TRUSTED_MAP_TILE_ORIGINS: ReadonlySet<string> = new Set([
  'https://tile.openstreetmap.org',
  'https://tile1.neshan.org',
  'https://tile2.neshan.org',
  'https://tile3.neshan.org',
  'https://tile4.neshan.org',
]);
export function validateMapTileResourceUrl(
  rawUrl: string,
  nodeEnv = process.env.NODE_ENV,
): { valid: boolean; reason?: string } {
  if (rawUrl.startsWith('/api/osm-tile/') || rawUrl.startsWith('/api/neshan-tile/')) {
    if (rawUrl.includes('..') || rawUrl.includes('\\')) return { valid: false, reason: 'INVALID_TILE_URL' };
    return /\b(phone|email|token|uid|search|lat|lng)=/i.test(rawUrl)
      ? { valid: false, reason: 'SENSITIVE_QUERY_IN_TILE_URL' }
      : { valid: true };
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: 'INVALID_TILE_URL' };
  }
  if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'MIXED_CONTENT_HTTP_FORBIDDEN' };
  }
  if (!TRUSTED_MAP_TILE_ORIGINS.has(`${parsed.protocol}//${parsed.host.toLowerCase()}`)) {
    return { valid: false, reason: 'UNTRUSTED_TILE_ORIGIN' };
  }
  for (const key of parsed.searchParams.keys()) {
    if (key.toLowerCase() !== 'key') return { valid: false, reason: 'UNEXPECTED_QUERY_PARAM_ON_TILE' };
  }
  return { valid: true };
}
const PUBLIC_BARGAIN_SORT_FIELDS: ReadonlySet<string> = new Set(['createdAt', 'offeredTotalMillion', 'sqm', 'discountPct']);
const PUBLIC_BARGAIN_FILTER_FIELDS: ReadonlySet<string> = new Set(['city', 'hoodId', 'dealType', 'status']);
export function validatePublicBargainQuerySpec(spec: {
  sortBy?: string;
  sortDir?: string;
  filters?: Record<string, unknown>;
}): { valid: boolean; reason?: string; enforcedStatus: 'approved'; sortBy: string; sortDir: 'asc' | 'desc' } {
  const sortBy = spec.sortBy ?? 'createdAt';
  const sortDir = spec.sortDir === 'asc' ? 'asc' : 'desc';
  if (sortBy.includes('.') || !PUBLIC_BARGAIN_SORT_FIELDS.has(sortBy)) {
    return { valid: false, reason: 'DISALLOWED_SORT_FIELD', enforcedStatus: 'approved', sortBy: 'createdAt', sortDir: 'desc' };
  }
  const filters = spec.filters ?? {};
  const keys = Object.keys(filters);
  if (keys.length > 5) return { valid: false, reason: 'TOO_MANY_FILTERS', enforcedStatus: 'approved', sortBy, sortDir };
  for (const k of keys) {
    if (k.includes('.') || !PUBLIC_BARGAIN_FILTER_FIELDS.has(k)) {
      return { valid: false, reason: `DISALLOWED_FILTER_FIELD:${k}`, enforcedStatus: 'approved', sortBy, sortDir };
    }
    if (k === 'status' && filters[k] !== 'approved') {
      return { valid: false, reason: 'PUBLIC_QUERY_MUST_ENFORCE_APPROVED_STATUS', enforcedStatus: 'approved', sortBy, sortDir };
    }
  }
  return { valid: true, enforcedStatus: 'approved', sortBy, sortDir };
}
export function reconcileCounterWithSourceRecords(params: {
  counterName: string;
  storedTotal: number;
  sourceRecordIds: readonly string[];
}): { authoritativeCount: number; driftDetected: boolean; driftDelta: number } {
  const uniqueIds = new Set(params.sourceRecordIds.filter((id) => isValidFirestoreDocId(id)));
  const authoritativeCount = uniqueIds.size;
  const driftDelta = params.storedTotal - authoritativeCount;
  return { authoritativeCount, driftDetected: driftDelta !== 0, driftDelta };
}
export type SponsorFinancialEventType = 'REQUEST_SUBMITTED' | 'PRICE_DETERMINED' | 'SPONSOR_APPROVED' | 'RESERVATION_CREATED' | 'DURATION_EXTENDED' | 'SPONSOR_RELEASED' | 'REQUEST_REJECTED';
export interface SponsorFinancialEvent {
  eventId: string; idempotencyKey: string; sponsorRequestId: string; hoodId: number; eventType: SponsorFinancialEventType;
  actorUid: string; previousState: string; resultingState: string; amountMillionToman: number; planMonths: 1 | 3; timestampIso: string;
  displayAreaUnitLabel?: string; amountIntlText?: string;
}
const sponsorFinancialEvents: SponsorFinancialEvent[] = [];
export function appendSponsorFinancialEvent(
  params: Omit<SponsorFinancialEvent, 'eventId' | 'timestampIso'> & { nowMs?: number; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode },
): SponsorFinancialEvent {
  const existing = sponsorFinancialEvents.find((e) => e.idempotencyKey === params.idempotencyKey);
  if (existing) return existing;
  const event: SponsorFinancialEvent = {
    ...params,
    eventId: `sfe_${params.nowMs ?? Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    timestampIso: new Date(params.nowMs ?? Date.now()).toISOString(),
    displayAreaUnitLabel: formatAreaUnitLabel(params.areaUnit ?? 'sqm'),
    amountIntlText: formatMillionTomanAsIntlCurrency(params.amountMillionToman, params.intlCurrency ?? 'IRT'),
  };
  if (sponsorFinancialEvents.length >= 2000) sponsorFinancialEvents.shift();
  sponsorFinancialEvents.push(event);
  return event;
}
export function getSponsorFinancialEventLog(sponsorRequestId?: string): readonly SponsorFinancialEvent[] {
  return sponsorRequestId ? sponsorFinancialEvents.filter((e) => e.sponsorRequestId === sponsorRequestId) : sponsorFinancialEvents;
}
export type ConsentPurpose = 'buyer_alert_contact' | 'contact_info_processing' | 'external_ai_contract_analysis' | 'optional_analytics';
export interface ConsentEventRecord {
  eventId: string; uid: string; purpose: ConsentPurpose; state: 'granted' | 'withdrawn'; policyVersion: string; timestampIso: string;
}
const immutableConsentTrail: ConsentEventRecord[] = [];
const currentConsentStateByUidAndPurpose = new Map<string, ConsentEventRecord>();
export function recordPurposeSpecificConsent(params: { uid: string; purpose: ConsentPurpose; state: 'granted' | 'withdrawn'; policyVersion?: string; nowMs?: number }): ConsentEventRecord {
  const ev: ConsentEventRecord = {
    eventId: `cns_${params.nowMs ?? Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    uid: params.uid, purpose: params.purpose, state: params.state, policyVersion: params.policyVersion || '2026.10',
    timestampIso: new Date(params.nowMs ?? Date.now()).toISOString(),
  };
  if (immutableConsentTrail.length >= 5000) immutableConsentTrail.shift();
  immutableConsentTrail.push(ev);
  const mapKey = `${params.uid}:${params.purpose}`;
  if (!currentConsentStateByUidAndPurpose.has(mapKey) && currentConsentStateByUidAndPurpose.size >= 5000) {
    const oldest = currentConsentStateByUidAndPurpose.keys().next().value;
    if (oldest !== undefined) currentConsentStateByUidAndPurpose.delete(oldest);
  }
  currentConsentStateByUidAndPurpose.set(mapKey, ev);
  return ev;
}
export function verifyActiveConsentForPurpose(
  uid: string,
  requiredPurpose: ConsentPurpose,
): { allowed: boolean; reason: 'ACTIVE_CONSENT_VERIFIED' | 'CONSENT_MISSING' | 'CONSENT_WITHDRAWN' } {
  const current = currentConsentStateByUidAndPurpose.get(`${uid}:${requiredPurpose}`);
  if (!current) return { allowed: false, reason: 'CONSENT_MISSING' };
  if (current.state !== 'granted') return { allowed: false, reason: 'CONSENT_WITHDRAWN' };
  return { allowed: true, reason: 'ACTIVE_CONSENT_VERIFIED' };
}
export function getImmutableConsentAuditTrail(uid: string): readonly ConsentEventRecord[] {
  return immutableConsentTrail.filter((e) => e.uid === uid);
}
export function isBargainEligibleForPublicPublication(record: Record<string, unknown> | null | undefined): boolean {
  if (!record || typeof record !== 'object' || !isValidFirestoreDocId(record.id)) return false;
  if (record.status !== 'approved') return false;
  return !(record.deleted === true || record.suspended === true || record.deletionState === 'tombstoned');
}
export function buildIdentityAndStateScopedCacheKey(params: {
  visibilityScope: 'public' | 'user' | 'admin';
  callerUid?: string;
  city: string;
  mode: string;
  hoodId?: number | null;
  publicationRevision: number;
}): { cacheKey: string; allowSharedPublicCache: boolean } {
  const scopePart = params.visibilityScope === 'public' ? 'pub' : `${params.visibilityScope}:${params.callerUid || 'anon'}`;
  return {
    cacheKey: `v1:${scopePart}:${params.city}:${params.mode}:${params.hoodId ?? 'all'}:rev${params.publicationRevision}`,
    allowSharedPublicCache: params.visibilityScope === 'public',
  };
}
export function evaluateTrustedServerTimeWindow(params: {
  clientTimestampIso?: string;
  serverNowMs: number;
  maxClockSkewMs?: number;
  cooldownMs: number;
  lastActionServerMs?: number | null;
}): { allowed: boolean; authoritativeTimestampIso: string; reason?: string } {
  const skewLimit = params.maxClockSkewMs ?? 5 * 60 * 1000;
  const iso = new Date(params.serverNowMs).toISOString();
  if (params.clientTimestampIso) {
    const clientMs = Date.parse(params.clientTimestampIso);
    if (!Number.isFinite(clientMs) || Math.abs(clientMs - params.serverNowMs) > skewLimit) {
      return { allowed: false, authoritativeTimestampIso: iso, reason: 'CLIENT_TIMESTAMP_OUTSIDE_ALLOWED_SKEW' };
    }
  }
  if (typeof params.lastActionServerMs === 'number' && (!Number.isFinite(params.lastActionServerMs) || params.serverNowMs - params.lastActionServerMs < params.cooldownMs)) {
    return { allowed: false, authoritativeTimestampIso: iso, reason: 'SERVER_COOLDOWN_ACTIVE' };
  }
  return { allowed: true, authoritativeTimestampIso: iso };
}
export function buildCanonicalCompositeDocumentId(namespace: string, components: readonly string[]): string {
  if (!/^[a-zA-Z0-9_-]{1,24}$/.test(namespace) || components.length === 0) throw new Error('INVALID_COMPOSITE_ID_NAMESPACE');
  const encodedParts = components.map((part) => {
    const str = String(part);
    if (!str || str.length > 128 || /[\u0000-\u001F/\\]/.test(str)) throw new Error('INVALID_COMPOSITE_ID_COMPONENT');
    return `${str.length}_${str}`;
  });
  return `${namespace}__${encodedParts.join('__')}`;
}
export {
  ServerLifecycleCoordinator,
  evaluateReleaseRollbackCompatibility,
  evaluateAuthoritativeListingSubmission,
  computeAuthoritativeNeighborhoodVoteAggregate,
  isPublicSponsorCurrentlyActive,
  allocateExclusiveSponsorSlotAtomically,
  MarketRefreshGenerationTracker,
  DistributedJobLeaseCoordinator,
  executeWithAuditFailurePolicy,
} from './securityGovernanceLifecycleAndListings';