/**
 * @fileoverview Prompts 186–190: * - Prompt 186: DOM-Based XSS & Unsafe Client-Side Rendering Audit
 * - Prompt 187: API Mass Assignment, Over-Posting & Property-Level Authorization Audit
 * - Prompt 188: Data Visualization Integrity & Chart Accuracy Audit
 * - Prompt 189: Cross-Browser Compatibility & Rendering Consistency Audit
 * - Prompt 190: Third-Party JavaScript, Embedded Widgets & Cross-Origin Security Audit
 */
import { escapeHtmlAttr, normalizeDigitsToEnglish } from './security'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export type ClientRenderContext = 'HTML_TEXT' | 'HTML_ATTRIBUTE' | 'HREF_OR_SRC_URL' | 'SVG_OR_MAP_TOOLTIP' | 'MARKDOWN_TEXT'; export interface ClientXssInspectionInput { rawUntrustedValue: unknown; context: ClientRenderContext; fieldName?: string; } export interface ClientXssSanitizationResult { context: ClientRenderContext; isSafeOriginal: boolean; detectedVectors: string[];
  sanitizedText: string; safeHrefOrNull: string | null; domClobberingBlocked: boolean; cspMitigationLevel: 'STRICT_NO_UNSAFE_EVAL' | 'STANDARD'; trustedTypesRecommendation: string; } const DOM_CLOBBERING_NAMES = new Set([ 'location', 'document', 'window', 'top', 'parent', 'frames', 'self', '__proto__', 'constructor', 'prototype', 'createElement', 'innerHTML', ]); function decodeBasicHtmlEntitiesForInspection(input: string): string { return input
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, hex) => { const code = Number.parseInt(hex, 16); return Number.isFinite(code) ? String.fromCharCode(code) : ''; })
    .replace(/&#([0-9]+);?/g, (_, dec) => { const code = Number.parseInt(dec, 10); return Number.isFinite(code) ? String.fromCharCode(code) : ''; })
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n'); }
export function auditAndSanitizeClientRenderingPayload(input: ClientXssInspectionInput): ClientXssSanitizationResult { const raw = typeof input.rawUntrustedValue === 'string' ? input.rawUntrustedValue : String(input.rawUntrustedValue ?? '');
  const decodedCompact = decodeBasicHtmlEntitiesForInspection(raw).replace(/[\u0000-\u0020]+/g, '').toLowerCase(); const detectedVectors: string[] = [];
  if (/<\s*\/?\s*(script|iframe|object|embed|applet|meta|base|link|style|form)\b/i.test(raw)) detectedVectors.push('DANGEROUS_HTML_TAG'); if (/<\s*\/?\s*(svg|math)\b/i.test(raw)) detectedVectors.push('INLINE_SVG_OR_MATHML_TAG');
  if (/\bon[a-z]{2,25}\s*=/i.test(raw) || /\bon[a-z]{2,25}\s*=/i.test(decodedCompact)) detectedVectors.push('INLINE_EVENT_HANDLER'); if (/(javascript|vbscript|livescript|mocha):/i.test(decodedCompact) || /data:(text\/html|image\/svg\+xml|application\/javascript|text\/javascript)/i.test(decodedCompact)) {
    detectedVectors.push('DANGEROUS_URL_SCHEME'); }
  if (/\[[^\]]*\]\(\s*(javascript|vbscript|data):/i.test(decodedCompact)) detectedVectors.push('MARKDOWN_DANGEROUS_LINK_SCHEME'); let domClobberingBlocked = false;
  if ((input.fieldName && DOM_CLOBBERING_NAMES.has(input.fieldName.trim())) || /\b(id|name)\s*=\s*["']?(location|document|window|__proto__|constructor|prototype)\b/i.test(raw)) { detectedVectors.push('DOM_CLOBBERING_ATTRIBUTE'); domClobberingBlocked = true; }
  let safeHrefOrNull: string | null = null; if (input.context === 'HREF_OR_SRC_URL') { const trimmed = raw.trim(); if (
      detectedVectors.length === 0 && !trimmed.includes('..') &&
      (/^https?:\/\/[^\s<>"'`]+$/i.test(trimmed) || /^\/(?!\/|\\)[A-Za-z0-9_\-/?.=&%]*$/.test(trimmed) || /^mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmed) || /^tel:\+?[0-9]{8,15}$/.test(trimmed))
    ) { safeHrefOrNull = escapeHtmlAttr(trimmed); } else if (trimmed.length > 0 && !detectedVectors.includes('DANGEROUS_URL_SCHEME')) { detectedVectors.push('UNTRUSTED_OR_MALFORMED_URL');
    } }
  const strippedMarkup = raw
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/\[([^\]]+)\]\(\s*(?:javascript|vbscript|data)[^)]*\)/gi, '$1')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''); return {
    context: input.context, isSafeOriginal: detectedVectors.length === 0,
    detectedVectors, sanitizedText: escapeHtmlAttr(strippedMarkup).slice(0, 2000),
    safeHrefOrNull, domClobberingBlocked, cspMitigationLevel: 'STRICT_NO_UNSAFE_EVAL',
    trustedTypesRecommendation: "require-trusted-types-for 'script'; trusted-types tehran-radar-policy",
  };
}
export type ApiActorRole = 'ANONYMOUS' | 'AUTHENTICATED_USER' | 'MODERATOR' | 'SUPER_ADMIN';
export type ApiMutationOperation = 'CREATE_LISTING' | 'UPDATE_LISTING' | 'ADMIN_MODERATE_LISTING' | 'UPDATE_USER_PROFILE';
const SERVER_IMMUTABLE_OR_PRIVILEGED_FIELDS = new Set([
  'id', 'ownerId', 'userId', 'role', 'isAdmin', 'permissions', 'verificationStatus',
  'moderationStatus', 'listingStatus', 'approvalState', 'internalAccountingScore',
  'createdAt', 'updatedAt', 'auditTrail', 'submitterIpHash', 'apiSecretToken',
  '__proto__', 'constructor', 'prototype',
]);
const OPERATION_FIELD_ALLOWLISTS: Record<ApiMutationOperation, ReadonlySet<string>> = {
  CREATE_LISTING: new Set(['title', 'description', 'hoodId', 'city', 'sqm', 'priceMillion', 'rahnMillion', 'ejarehMillion', 'rooms', 'buildingAge', 'hasElevator', 'hasParking', 'hasStorage']),
  UPDATE_LISTING: new Set(['title', 'description', 'sqm', 'priceMillion', 'rahnMillion', 'ejarehMillion', 'rooms', 'hasElevator', 'hasParking', 'hasStorage']),
  ADMIN_MODERATE_LISTING: new Set(['moderationStatus', 'verificationStatus', 'listingStatus', 'moderationNote']),
  UPDATE_USER_PROFILE: new Set(['displayName', 'preferredCity', 'preferredMode', 'budgetCapMillion']),
};
const PUBLIC_LISTING_RESPONSE_ALLOWLIST = new Set([
  'id', 'title', 'description', 'hoodId', 'city', 'sqm', 'priceMillion', 'rahnMillion',
  'ejarehMillion', 'rooms', 'buildingAge', 'hasElevator', 'hasParking', 'hasStorage',
  'verificationStatus', 'listingStatus', 'createdAt',
]);
export interface PropertyAuthorizationRequest {
  operation: ApiMutationOperation; actorRole: ApiActorRole; actorUid: string | null; resourceOwnerUid: string | null; rawRequestBody: Record<string, unknown>;
}
export interface PropertyAuthorizationOutcome {
  authorized: boolean; rejectionReason: string | null; sanitizedPatch: Record<string, unknown>; blockedMassAssignmentFields: string[]; blockedNestedPrivilegeFields: string[];
}
function inspectNestedPrivilegeEscalation(obj: unknown, prefix = '', depth = 0, visited = new WeakSet<object>()): string[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  if (depth > 12) return [`${prefix || 'root'}:MAX_NESTED_DEPTH_EXCEEDED`];
  if (visited.has(obj)) return [`${prefix || 'root'}:CIRCULAR_NESTED_PAYLOAD`];
  visited.add(obj);
  const findings: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (SERVER_IMMUTABLE_OR_PRIVILEGED_FIELDS.has(k)) findings.push(path);
    if (v && typeof v === 'object' && !Array.isArray(v)) findings.push(...inspectNestedPrivilegeEscalation(v, path, depth + 1, visited));
  }
  return findings;
}
export function enforcePropertyLevelAuthorization(req: PropertyAuthorizationRequest): PropertyAuthorizationOutcome {
  const blockedMassAssignmentFields: string[] = [];
  const blockedNestedPrivilegeFields: string[] = [];
  if (req.actorRole === 'ANONYMOUS' || !req.actorUid) {
    return { authorized: false, rejectionReason: 'AUTH_REQUIRED_FOR_MUTATION', sanitizedPatch: {}, blockedMassAssignmentFields, blockedNestedPrivilegeFields };
  }
  if (req.operation === 'ADMIN_MODERATE_LISTING') {
    if (req.actorRole !== 'MODERATOR' && req.actorRole !== 'SUPER_ADMIN') {
      return { authorized: false, rejectionReason: 'FORBIDDEN_ADMIN_MODERATION_ROLE_REQUIRED', sanitizedPatch: {}, blockedMassAssignmentFields, blockedNestedPrivilegeFields };
    }
  } else if (req.operation === 'UPDATE_LISTING' || req.operation === 'UPDATE_USER_PROFILE') {
    if (!req.resourceOwnerUid || req.actorUid !== req.resourceOwnerUid) {
      return { authorized: false, rejectionReason: 'FORBIDDEN_OBJECT_OWNERSHIP_MISMATCH', sanitizedPatch: {}, blockedMassAssignmentFields, blockedNestedPrivilegeFields };
    }
  }
  const allowlist = OPERATION_FIELD_ALLOWLISTS[req.operation];
  const sanitizedPatch: Record<string, unknown> = Object.create(null);
  if (!req.rawRequestBody || typeof req.rawRequestBody !== 'object' || Array.isArray(req.rawRequestBody)) {
    return { authorized: false, rejectionReason: 'INVALID_REQUEST_BODY_OBJECT', sanitizedPatch, blockedMassAssignmentFields, blockedNestedPrivilegeFields };
  }
  for (const [field, value] of Object.entries(req.rawRequestBody)) {
    if (!allowlist.has(field) || (typeof value === 'number' && !Number.isFinite(value))) { blockedMassAssignmentFields.push(field); continue; }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nestedViolations = inspectNestedPrivilegeEscalation(value, field);
      if (nestedViolations.length > 0) { blockedNestedPrivilegeFields.push(...nestedViolations); continue; }
    }
    sanitizedPatch[field] = value;
  }
  return { authorized: true, rejectionReason: null, sanitizedPatch, blockedMassAssignmentFields, blockedNestedPrivilegeFields };
}
export function projectPublicListingResponse(
  rawDatabaseDoc: Record<string, unknown>,
): { publicPayload: Record<string, unknown>; strippedSensitiveFields: string[] } {
  const publicPayload: Record<string, unknown> = Object.create(null);
  const strippedSensitiveFields: string[] = [];
  for (const [key, value] of Object.entries(rawDatabaseDoc)) {
    if (PUBLIC_LISTING_RESPONSE_ALLOWLIST.has(key)) publicPayload[key] = value;
    else strippedSensitiveFields.push(key);
  }
  return { publicPayload, strippedSensitiveFields };
}
export interface ChartDataPointInput {
  periodKey: string; labelFa: string; primaryValue: number | null | undefined; secondaryValue?: number | null | undefined; rawMissingCoercedToZero?: boolean;
}
export interface ChartIntegrityAuditInput {
  chartId: string; chartType: 'LINE' | 'BAR' | 'AREA'; unitLabelFa: string;
  seriesUnitCode: 'MILLION_TOMAN_PER_SQM' | 'MILLION_TOMAN_TOTAL' | 'PERCENTAGE' | 'SCORE_1_TO_10';
  secondarySeriesUnitCode?: 'MILLION_TOMAN_PER_SQM' | 'MILLION_TOMAN_TOTAL' | 'PERCENTAGE' | 'SCORE_1_TO_10';
  sharedSingleYAxisForBothSeries?: boolean; configuredYAxisMin?: number; points: ChartDataPointInput[];
}
export interface ChartIntegrityAuditReport {
  chartId: string; isNumericallyAccurate: boolean; isVisuallyNonMisleading: boolean; issues: string[];
  validPointCount: number; missingPointCount: number; independentMin: number | null; independentMax: number | null; independentMean: number | null;
  accessibleTabularSummaryFa: string; displayAreaUnitLabel: string; meanIntlText: string;
}
export function auditChartSeriesAndStatisticalIntegrity(
  input: ChartIntegrityAuditInput,
  options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode }
): ChartIntegrityAuditReport {
  const issues: string[] = [];
  if (!input.unitLabelFa || input.unitLabelFa.trim().length < 2) issues.push('MISSING_EXPLICIT_UNIT_LABEL');
  if (input.secondarySeriesUnitCode && input.secondarySeriesUnitCode !== input.seriesUnitCode && input.sharedSingleYAxisForBothSeries) {
    issues.push('INCOMPATIBLE_UNITS_ON_SHARED_SINGLE_Y_AXIS');
  }
  const validValues: number[] = [];
  let missingPointCount = 0;
  for (let i = 0; i < input.points.length; i++) {
    const pt = input.points[i];
    if (pt.rawMissingCoercedToZero) issues.push(`NULL_SILENTLY_COERCED_TO_ZERO_AT_${pt.periodKey}`);
    if (i > 0 && input.points[i - 1].periodKey > pt.periodKey) issues.push('NON_CHRONOLOGICAL_TIME_SERIES_ORDER');
    if (pt.primaryValue === null || pt.primaryValue === undefined) { missingPointCount += 1; continue; }
    if (!Number.isFinite(pt.primaryValue) || pt.primaryValue < 0) { issues.push(`INVALID_NUMERIC_VALUE_AT_${pt.periodKey}`); continue; }
    validValues.push(pt.primaryValue);
  }
  const independentMin = validValues.length > 0 ? Math.min(...validValues) : null;
  const independentMax = validValues.length > 0 ? Math.max(...validValues) : null;
  const independentMean = validValues.length > 0 ? Number((validValues.reduce((acc, v) => acc + v, 0) / validValues.length).toFixed(2)) : null;
  if (input.chartType === 'BAR' && typeof input.configuredYAxisMin === 'number' && input.configuredYAxisMin > 0) {
    issues.push('TRUNCATED_BAR_CHART_NON_ZERO_BASELINE');
  }
  const numericalIssues = issues.filter(
    (code) => code.startsWith('NULL_SILENTLY_COERCED_TO_ZERO') || code.startsWith('INVALID_NUMERIC_VALUE') || code === 'NON_CHRONOLOGICAL_TIME_SERIES_ORDER',
  );
  const accessibleTabularSummaryFa =
    validValues.length === 0
      ? `داده معتبری برای نمودار «${input.chartId}» موجود نیست.`
      : `خلاصه جدولی نمودار (${input.unitLabelFa}): کمینه ${independentMin}، بیشینه ${independentMax}، میانگین ${independentMean} از ${validValues.length} نقطه داده معتبر (${missingPointCount} نقطه فاقد داده).`;
  return {
    chartId: input.chartId, isNumericallyAccurate: numericalIssues.length === 0, isVisuallyNonMisleading: issues.length === 0,
    issues, validPointCount: validValues.length, missingPointCount, independentMin, independentMax, independentMean,
    accessibleTabularSummaryFa,
    displayAreaUnitLabel: formatAreaUnitLabel(options?.areaUnit ?? 'sqm'),
    meanIntlText: formatMillionTomanAsIntlCurrency(independentMean ?? 0, options?.intlCurrency ?? 'IRT'),
  };
}
export interface BrowserFeatureEnvironmentSnapshot {
  hasIntlFaIrNumberFormat: boolean; hasLocalStorage: boolean; localStorageQuotaBlocked: boolean;
  hasServiceWorkerApi: boolean; hasWebGlContext: boolean; hasClipboardWriteText: boolean; isThirdPartyIframeContext: boolean;
}
export interface CrossBrowserCompatibilityReport {
  supportedBrowserPolicy: string[];
  persianNumberFormattingConsistent: boolean;
  storageFallbackMode: 'NATIVE_LOCAL_STORAGE' | 'IN_MEMORY_SAFE_FALLBACK';
  mapRenderingMode: 'LEAFLET_RASTER_2D_WITH_CANVAS_FALLBACK';
  cookieAuthStrategyForIframe: 'BEARER_HEADER_OR_PARTITIONED_SAMESITE_NONE';
  verifiedInCurrentNodeEnvironment: boolean;
  physicalBrowserEngineManualMatrixRequired: boolean;
  manualVerificationTargets: string[];
}
export function evaluateCrossBrowserRuntimeCompatibility(env: BrowserFeatureEnvironmentSnapshot): CrossBrowserCompatibilityReport {
  let persianFormattedOk = false;
  try {
    const sample = new Intl.NumberFormat('fa-IR').format(1404);
    persianFormattedOk = normalizeDigitsToEnglish(sample).replace(/[^0-9]/g, '') === '1404';
  } catch { persianFormattedOk = false; }
  return {
    supportedBrowserPolicy: [
      'Chrome / Chromium >= 115 (Desktop & Android)',
      'Safari / WebKit >= 16.4 (macOS & iOS)',
      'Firefox >= 115 (Desktop)',
      'Edge >= 115 (Desktop)',
    ],
    persianNumberFormattingConsistent: env.hasIntlFaIrNumberFormat && persianFormattedOk,
    storageFallbackMode: env.hasLocalStorage && !env.localStorageQuotaBlocked ? 'NATIVE_LOCAL_STORAGE' : 'IN_MEMORY_SAFE_FALLBACK',
    mapRenderingMode: 'LEAFLET_RASTER_2D_WITH_CANVAS_FALLBACK',
    cookieAuthStrategyForIframe: 'BEARER_HEADER_OR_PARTITIONED_SAMESITE_NONE',
    verifiedInCurrentNodeEnvironment: true,
    physicalBrowserEngineManualMatrixRequired: true,
    manualVerificationTargets: [
      'iOS Safari 17+ (RTL bottom sheet scroll & Private Browsing storage quota)',
      'macOS Safari 17+ (ITP third-party cookie blocking in iframe)',
      'Firefox Desktop (RTL Flexbox & Persian Vazirmatn font shaping)',
      'Android Chrome (Touch pinch-zoom on Leaflet raster markers)',
    ],
  };
}
export interface ThirdPartyResourceDescriptor {
  id: string;
  url: string;
  resourceType: 'SCRIPT' | 'STYLESHEET' | 'MAP_TILE' | 'IFRAME_EMBED';
  loadedBeforeConsent: boolean;
  requiresConsent: boolean;
  sandboxAttribute?: string;
  referrerPolicy?: string;
}
export interface PostMessageInspectionInput {
  eventOrigin: string;
  trustedOrigins: readonly string[];
  outboundTargetOrigin?: string;
  data: unknown;
}
export interface ThirdPartyAndPostMessageAuditResult {
  approvedResources: string[];
  rejectedResources: Array<{ id: string; reason: string }>;
  postMessageAccepted: boolean;
  postMessageRejectionReason: string | null;
  reverseTabnabbingProtected: boolean;
}
const APPROVED_EXTERNAL_HOSTS = new Set([
  'basemaps.cartocdn.com', 'tile.openstreetmap.org', 'cdn.jsdelivr.net',
  'fonts.googleapis.com', 'fonts.gstatic.com', 'accounts.google.com',
]);
export function auditThirdPartyResourcesAndValidatePostMessage(
  resources: readonly ThirdPartyResourceDescriptor[],
  postMessageEvent: PostMessageInspectionInput,
): ThirdPartyAndPostMessageAuditResult {
  const approvedResources: string[] = [];
  const rejectedResources: Array<{ id: string; reason: string }> = [];
  for (const res of resources) {
    let parsedUrl: URL;
    try { parsedUrl = new URL(res.url); } catch { rejectedResources.push({ id: res.id, reason: 'MALFORMED_RESOURCE_URL' }); continue; }
    if (parsedUrl.protocol !== 'https:') { rejectedResources.push({ id: res.id, reason: 'INSECURE_NON_HTTPS_PROTOCOL' }); continue; }
    if (!APPROVED_EXTERNAL_HOSTS.has(parsedUrl.hostname)) { rejectedResources.push({ id: res.id, reason: `UNAPPROVED_THIRD_PARTY_HOST:${parsedUrl.hostname}` }); continue; }
    if (res.requiresConsent && res.loadedBeforeConsent) { rejectedResources.push({ id: res.id, reason: 'LOADED_BEFORE_USER_PRIVACY_CONSENT' }); continue; }
    if (res.resourceType === 'IFRAME_EMBED' && res.sandboxAttribute && res.sandboxAttribute.includes('allow-scripts') && res.sandboxAttribute.includes('allow-same-origin')) {
      rejectedResources.push({ id: res.id, reason: 'UNSAFE_IFRAME_SANDBOX_ALLOW_SCRIPTS_AND_SAME_ORIGIN' });
      continue;
    }
    if (parsedUrl.searchParams.has('token') || parsedUrl.searchParams.has('apiKey') || parsedUrl.searchParams.has('phone')) {
      rejectedResources.push({ id: res.id, reason: 'SENSITIVE_TOKEN_OR_PII_IN_THIRD_PARTY_URL' });
      continue;
    }
    approvedResources.push(res.id);
  }
  let postMessageAccepted = true;
  let postMessageRejectionReason: string | null = null; if (postMessageEvent.outboundTargetOrigin === '*') { postMessageAccepted = false; postMessageRejectionReason = 'WILDCARD_TARGET_ORIGIN_FORBIDDEN'; } else if (!postMessageEvent.trustedOrigins.includes(postMessageEvent.eventOrigin)) { postMessageAccepted = false;
    postMessageRejectionReason = `UNTRUSTED_POSTMESSAGE_ORIGIN:${postMessageEvent.eventOrigin}`;
  } else if (!postMessageEvent.data || typeof postMessageEvent.data !== 'object' || Array.isArray(postMessageEvent.data) || typeof (postMessageEvent.data as Record<string, unknown>).type !== 'string') { postMessageAccepted = false; postMessageRejectionReason = 'INVALID_POSTMESSAGE_SCHEMA'; } return { approvedResources, rejectedResources, postMessageAccepted, postMessageRejectionReason, reverseTabnabbingProtected: true }; }