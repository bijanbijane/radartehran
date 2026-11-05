import crypto from 'node:crypto'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export function buildRadarContentSecurityPolicy(options?: { isDev?: boolean; reportOnly?: boolean }): { headerName: 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only'; headerValue: string; } { const isDev = Boolean(options?.isDev); const scriptSrc = isDev ? "'self' 'unsafe-inline'" : "'self'"; const connectSrc = [ "'self'", 'https://*.googleapis.com', 'https://*.firebaseio.com',
    'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://air-quality-api.open-meteo.com', 'https://api.open-meteo.com', 'https://nominatim.openstreetmap.org', ...(isDev ? ['ws:', 'wss:'] : []), ].join(' '); const directives = [
    "default-src 'self'", `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com", "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net", "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://images.unsplash.com https://picsum.photos",
    `connect-src ${connectSrc}`, "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'", ]; return { headerName: options?.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy', headerValue: directives.join('; '), }; }
export function buildStandardSecurityHeaders(options: { isHttps: boolean; isPrivateResponse: boolean; isDev?: boolean }): Record<string, string> { const csp = buildRadarContentSecurityPolicy({ isDev: options.isDev, reportOnly: false }); const headers: Record<string, string> = { [csp.headerName]: csp.headerValue, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=()', 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups', 'Cross-Origin-Resource-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN', 'Cache-Control': options.isPrivateResponse ? 'private, no-store, no-cache, must-revalidate' : 'public, max-age=60', }; if (options.isHttps) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'; if (options.isPrivateResponse) headers.Vary = 'Authorization, Cookie'; return headers; } export function evaluateCsrfProtection(input: {
  method: string; hasSessionCookie: boolean; hasExplicitBearerToken: boolean; originHeader?: string; refererHeader?: string; csrfTokenHeader?: string; expectedCsrfToken?: string; allowedOrigins: string[]; }): { allowed: boolean; reason?: string } { const method = input.method.toUpperCase(); if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return { allowed: true }; if (input.hasExplicitBearerToken && !input.hasSessionCookie) return { allowed: true }; if (input.hasSessionCookie) { const sourceOrigin = input.originHeader || (input.refererHeader ? safeExtractOrigin(input.refererHeader) : '');
    if (!sourceOrigin || !input.allowedOrigins.includes(sourceOrigin)) return { allowed: false, reason: 'CSRF_ORIGIN_MISMATCH' }; const cand = Buffer.from(String(input.csrfTokenHeader || ''), 'utf8'); const exp = Buffer.from(String(input.expectedCsrfToken || ''), 'utf8'); if (cand.length === 0 || cand.length !== exp.length || !crypto.timingSafeEqual(cand, exp)) { return { allowed: false, reason: 'CSRF_TOKEN_INVALID' }; }
  } return { allowed: true }; }
function safeExtractOrigin(urlStr: string): string { try { return new URL(urlStr).origin; } catch { return ''; } }
const ALLOWED_EXTERNAL_FETCH_HOSTS = new Set([
  'air-quality-api.open-meteo.com', 'api.open-meteo.com', 'nominatim.openstreetmap.org', 'a.tile.openstreetmap.org', 'b.tile.openstreetmap.org', 'c.tile.openstreetmap.org', 'api.divar.ir', ]); export function validateOutboundUrlAgainstSsrf( rawUrl: string, redirectDepth = 0, maxRedirects = 2
): { allowed: boolean; reason?: string; normalizedUrl?: string } { if (redirectDepth > maxRedirects) return { allowed: false, reason: 'MAX_REDIRECTS_EXCEEDED' }; try { const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return { allowed: false, reason: 'HTTPS_REQUIRED' }; if (parsed.username || parsed.password) return { allowed: false, reason: 'EMBEDDED_CREDENTIALS_FORBIDDEN' }; const host = parsed.hostname.toLowerCase(); if (
      host === 'localhost' || host.endsWith('.local') ||
      host.endsWith('.internal') || host === '169.254.169.254' ||
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|0\.|169\.254\.)/.test(host) || host.startsWith('[')
    ) { return { allowed: false, reason: 'PRIVATE_OR_METADATA_ADDRESS_BLOCKED' }; }
    if (parsed.port && parsed.port !== '443') return { allowed: false, reason: 'NON_STANDARD_PORT_BLOCKED' }; if (!ALLOWED_EXTERNAL_FETCH_HOSTS.has(host)) return { allowed: false, reason: 'HOST_NOT_IN_ALLOWLIST' }; return { allowed: true, normalizedUrl: parsed.toString() }; } catch {
    return { allowed: false, reason: 'MALFORMED_URL' }; }
}
export function sanitizeNavigationRedirectTarget(
  rawTarget: string | null | undefined, fallbackInternalPath = '/'
): { safeTarget: string; wasRejected: boolean; reason?: string } { if (!rawTarget || typeof rawTarget !== 'string') {
    return { safeTarget: fallbackInternalPath, wasRejected: false }; }
  let decoded = rawTarget.trim();
  try {
    decoded = decodeURIComponent(decoded).trim();
  } catch {
    return { safeTarget: fallbackInternalPath, wasRejected: true, reason: 'MALFORMED_ENCODING' };
  }
  if (
    !decoded.startsWith('/') || decoded.startsWith('//') || decoded.startsWith('/\\') ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded) || decoded.includes('@') || decoded.includes('\r') || decoded.includes('\n')
  ) {
    return { safeTarget: fallbackInternalPath, wasRejected: true, reason: 'UNTRUSTED_REDIRECT_DESTINATION' };
  }
  return { safeTarget: decoded, wasRejected: false };
}
export function validateBoundedRequestPayload(
  payload: unknown,
  options?: { maxBytes?: number; maxDepth?: number; maxKeys?: number }
): { valid: boolean; reason?: string } {
  const maxBytes = options?.maxBytes ?? 100_000;
  const maxDepth = options?.maxDepth ?? 6;
  const maxKeys = options?.maxKeys ?? 120;
  let keyCount = 0;
  const seen = new WeakSet<object>();
  function checkDepth(node: unknown, depth: number): boolean {
    if (depth > maxDepth) return false;
    if (!node || typeof node !== 'object') return true;
    if (seen.has(node)) return false;
    seen.add(node);
    const entries = Object.entries(node as Record<string, unknown>);
    keyCount += entries.length;
    if (keyCount > maxKeys) return false;
    return entries.every(([k, val]) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype' && checkDepth(val, depth + 1));
  }
  if (!checkDepth(payload, 0)) return { valid: false, reason: 'EXCESSIVE_NESTING_OR_KEYS' };
  try {
    if (JSON.stringify(payload ?? {}).length > maxBytes) return { valid: false, reason: 'PAYLOAD_TOO_LARGE' };
  } catch {
    return { valid: false, reason: 'EXCESSIVE_NESTING_OR_KEYS' };
  }
  return { valid: true };
}
const PROTECTED_SERVER_FIELDS = new Set([
  'id', 'listingId', 'propertyId', 'publisherId', 'ownerId', 'userId', 'uid', 'role', 'isAdmin',
  'emailVerified', 'verificationState', 'moderationStatus', 'revisionNumber', 'createdAt', 'createdAtIso', 'updatedAtIso',
  '__proto__', 'constructor', 'prototype',
]);
export function filterAllowedMutationFields<T extends Record<string, unknown>>(
  rawInput: T,
  allowedWritableFields: readonly string[]
): { sanitizedPatch: Record<string, unknown>; rejectedProtectedFields: string[]; rejectedUnknownFields: string[] } {
  const allowedSet = new Set(allowedWritableFields);
  const sanitizedPatch: Record<string, unknown> = Object.create(null);
  const rejectedProtectedFields: string[] = [];
  const rejectedUnknownFields: string[] = [];
  for (const [key, val] of Object.entries(rawInput || {})) {
    if (PROTECTED_SERVER_FIELDS.has(key)) {
      rejectedProtectedFields.push(key);
    } else if (!allowedSet.has(key)) {
      rejectedUnknownFields.push(key);
    } else if (val !== undefined) {
      sanitizedPatch[key] = val;
    }
  }
  return { sanitizedPatch, rejectedProtectedFields, rejectedUnknownFields };
}
export function evaluateFirestoreRuleAccessMatrix(input: {
  collection: 'userPreferences' | 'bargains' | 'votes' | 'buyerAlerts' | 'sponsorRequests' | 'neighborhoodOverrides' | 'admins';
  operation: 'read' | 'create' | 'update' | 'delete';
  actorUid: string | null;
  actorEmailVerified: boolean;
  isAdmin: boolean;
  docId?: string;
  resourceOwnerUid?: string;
  incomingPayload?: Record<string, unknown>;
}): { allowed: boolean; ruleReason: string } {
  const isAuthed = Boolean(input.actorUid);
  switch (input.collection) {
    case 'userPreferences': {
      const isSelf = isAuthed && input.actorUid === input.docId;
      return { allowed: isSelf && input.operation !== 'delete', ruleReason: isSelf ? 'OWNER_PREFS_ACCESS' : 'CROSS_ACCOUNT_PREFS_DENIED' };
    }
    case 'bargains': {
      if (input.operation === 'read') return { allowed: true, ruleReason: 'PUBLIC_BARGAIN_READ' };
      if (input.operation === 'create') {
        const validOwner = isAuthed && (!input.incomingPayload?.publisherUid || input.incomingPayload.publisherUid === input.actorUid);
        return { allowed: validOwner, ruleReason: validOwner ? 'AUTHED_BARGAIN_CREATE' : 'UNAUTHED_OR_SPOOFED_OWNER_DENIED' };
      }
      const canModify = input.isAdmin || (isAuthed && Boolean(input.resourceOwnerUid) && input.actorUid === input.resourceOwnerUid);
      return { allowed: canModify, ruleReason: canModify ? 'OWNER_OR_ADMIN_BARGAIN_MUTATION' : 'UNAUTHORIZED_BARGAIN_MUTATION' };
    }
    case 'votes': {
      if (input.operation === 'read') {
        const canRead = input.isAdmin || (isAuthed && input.actorEmailVerified && input.resourceOwnerUid === input.actorUid);
        return { allowed: canRead, ruleReason: canRead ? 'SCOPED_VOTE_READ' : 'CROSS_USER_VOTE_READ_DENIED' };
      }
      if (input.operation === 'create') {
        const canVote = isAuthed && input.actorEmailVerified && input.incomingPayload?.userId === input.actorUid;
        return { allowed: canVote, ruleReason: canVote ? 'VERIFIED_USER_VOTE_CREATE' : 'UNVERIFIED_OR_SPOOFED_VOTE_DENIED' };
      }
      return { allowed: input.isAdmin, ruleReason: input.isAdmin ? 'ADMIN_VOTE_MODERATION' : 'IMMUTABLE_USER_VOTE' };
    }
    case 'buyerAlerts':
    case 'sponsorRequests': {
      if (input.operation === 'create') return { allowed: true, ruleReason: 'PUBLIC_LEAD_SUBMISSION' };
      return { allowed: input.isAdmin, ruleReason: input.isAdmin ? 'ADMIN_CRM_ACCESS' : 'PRIVATE_PII_COLLECTION_DENIED' };
    }
    case 'neighborhoodOverrides':
    case 'admins': {
      if (input.collection === 'neighborhoodOverrides' && input.operation === 'read') {
        return { allowed: true, ruleReason: 'PUBLIC_OVERRIDE_READ' };
      }
      if (input.collection === 'admins' && input.operation === 'read') {
        const canCheckSelf = isAuthed && input.actorEmailVerified && input.docId === input.actorUid;
        return { allowed: canCheckSelf || input.isAdmin, ruleReason: canCheckSelf || input.isAdmin ? 'SELF_OR_ADMIN_CHECK' : 'ADMIN_LIST_ENUMERATION_DENIED' };
      }
      return { allowed: input.isAdmin, ruleReason: input.isAdmin ? 'ADMIN_PRIVILEGED_WRITE' : 'NON_ADMIN_WRITE_DENIED' };
    }
  }
}
export interface PublicListingResponseDto {
  id: string; hoodId: number; title: string; type: 'خرید' | 'اجاره'; sqm: number;
  priceText: string; discountPercent: number; street: string; createdAtIso?: string;
  displayAreaUnitLabel?: string; benchmarkValuationIntlText?: string;
}
export function projectPublicListingDto(rawDoc: Record<string, unknown>, areaUnit: AreaUnit = getStoredAreaUnit(), intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()): PublicListingResponseDto {
  const sqm = Number(rawDoc.sqm) || 75;
  return {
    id: String(rawDoc.id || ''), hoodId: Number(rawDoc.hoodId) || 1,
    title: String(rawDoc.title || '').slice(0, 160), type: rawDoc.type === 'اجاره' ? 'اجاره' : 'خرید',
    sqm, priceText: String(rawDoc.priceText || '').slice(0, 120),
    discountPercent: Number(rawDoc.discountPercent) || 10, street: String(rawDoc.street || '').slice(0, 100),
    ...(typeof rawDoc.createdAtIso === 'string' ? { createdAtIso: rawDoc.createdAtIso } : {}),
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    benchmarkValuationIntlText: formatMillionTomanAsIntlCurrency(sqm * 110, intlCurrency),
  };
}
export function buildSafeContentDispositionHeader(
  rawFilename: string,
  dispositionType: 'inline' | 'attachment',
  detectedMimeType: string
): { contentDisposition: string; contentType: string; xContentTypeOptions: 'nosniff' } {
  const safeMime = /^(image\/(jpeg|png|webp)|application\/pdf|text\/csv)$/i.test(detectedMimeType)
    ? detectedMimeType
    : 'application/octet-stream';
  const effectiveDisposition = safeMime === 'application/octet-stream' || safeMime === 'text/csv' ? 'attachment' : dispositionType;
  const cleanName = (rawFilename || 'download')
    .replace(/[\r\n"\\/<>|:*?\x00-\x1F]/g, '_')
    .replace(/\.\.+/g, '_')
    .slice(0, 90);
  const asciiFallback = cleanName.replace(/[^\x20-\x7E]/g, '_') || 'file';
  const utf8Encoded = encodeURIComponent(cleanName);
  return {
    contentDisposition: `${effectiveDisposition}; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`,
    contentType: safeMime,
    xContentTypeOptions: 'nosniff',
  };
}
export function validateImageProcessingSafety(input: {
  byteLength: number;
  widthPx: number;
  heightPx: number;
  frameCount?: number;
  magicHeaderHex: string;
}): { safe: boolean; reason?: string; detectedFormat?: 'jpeg' | 'png' | 'webp' } {
  if (input.byteLength <= 0 || input.byteLength > 8 * 1024 * 1024) return { safe: false, reason: 'FILE_SIZE_OUT_OF_BOUNDS' };
  const hex = input.magicHeaderHex.toLowerCase();
  const format = hex.startsWith('ffd8ff') ? 'jpeg' : hex.startsWith('89504e47') ? 'png' : hex.startsWith('52494646') ? 'webp' : undefined;
  if (!format) return { safe: false, reason: 'UNSUPPORTED_OR_SPOOFED_IMAGE_MAGIC' };
  if (input.widthPx <= 0 || input.heightPx <= 0 || input.widthPx > 8192 || input.heightPx > 8192) {
    return { safe: false, reason: 'EXCESSIVE_IMAGE_DIMENSIONS' };
  }
  if (input.widthPx * input.heightPx > 25_000_000) {
    return { safe: false, reason: 'DECOMPRESSION_BOMB_PIXEL_LIMIT_EXCEEDED' };
  }
  if ((input.frameCount ?? 1) > 1) return { safe: false, reason: 'ANIMATED_IMAGE_NOT_ALLOWED' };
  return { safe: true, detectedFormat: format };
}
export function inspectSvgContentSecurity(rawSvgText: string): {
  isSafeTrustedVector: boolean;
  hazards: string[];
} {
  const hazards: string[] = [];
  if (/<script\b/i.test(rawSvgText)) hazards.push('EMBEDDED_SCRIPT');
  if (/\bon[a-z]+\s*=/i.test(rawSvgText)) hazards.push('EVENT_HANDLER_ATTRIBUTE');
  if (/<foreignObject\b/i.test(rawSvgText)) hazards.push('FOREIGN_OBJECT');
  if (/(?:href|xlink:href)\s*=\s*["']\s*(?:javascript:|data:|https?:\/\/)/i.test(rawSvgText)) hazards.push('UNSAFE_EXTERNAL_OR_SCRIPT_HREF');
  if (/<!ENTITY\b/i.test(rawSvgText)) hazards.push('XML_ENTITY_EXPANSION');
  return { isSafeTrustedVector: hazards.length === 0, hazards };
}
export function scanTextForAccidentalSecretExposure(content: string): {
  hasExposedSecrets: boolean;
  findings: Array<{ ruleId: string; redactedSample: string }>;
} {
  const findings: Array<{ ruleId: string; redactedSample: string }> = [];
  const rules: Array<{ id: string; regex: RegExp }> = [
    { id: 'PRIVATE_KEY_PEM', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
    { id: 'TELEGRAM_BOT_TOKEN', regex: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g },
    { id: 'GITHUB_PAT', regex: /\bghp_[A-Za-z0-9]{36}\b/g },
    { id: 'SERVER_ENV_ASSIGNMENT', regex: /\b(?:GEMINI_API_KEY|ADMIN_PANEL_SECRET|TELEGRAM_BOT_TOKEN)\s*=\s*["'][^"'\s]{12,}["']/g },
  ];
  for (const r of rules) {
    const matches = content.match(r.regex) || [];
    for (const m of matches) {
      findings.push({ ruleId: r.id, redactedSample: `${m.slice(0, 6)}...[REDACTED]` });
    }
  }
  return { hasExposedSecrets: findings.length > 0, findings };
}
export type CredentialRotationStage =
  | 'active'
  | 'replacement_staged'
  | 'connectivity_verified'
  | 'consumers_switched'
  | 'previous_revoked'
  | 'emergency_revoked';
export function advanceCredentialRotationStage(
  currentStage: CredentialRotationStage,
  replacementConnectivityVerified: boolean,
  emergencyCompromise = false
): { nextStage: CredentialRotationStage; previousCredentialRevoked: boolean; canRollbackToPrevious: boolean } {
  if (emergencyCompromise) {
    return { nextStage: 'emergency_revoked', previousCredentialRevoked: true, canRollbackToPrevious: false };
  }
  if (currentStage === 'active') {
    return { nextStage: 'replacement_staged', previousCredentialRevoked: false, canRollbackToPrevious: true };
  }
  if (currentStage === 'replacement_staged') {
    return replacementConnectivityVerified
      ? { nextStage: 'connectivity_verified', previousCredentialRevoked: false, canRollbackToPrevious: true }
      : { nextStage: 'active', previousCredentialRevoked: false, canRollbackToPrevious: true };
  }
  if (currentStage === 'connectivity_verified') {
    return { nextStage: 'consumers_switched', previousCredentialRevoked: false, canRollbackToPrevious: true };
  }
  return { nextStage: 'previous_revoked', previousCredentialRevoked: true, canRollbackToPrevious: false };
}
const ALLOWED_QUERY_SORT_FIELDS = new Set(['buyPerSqm', 'rahn80m', 'overallScore', 'createdAtIso', 'discountPercent']);
export function validateApiQueryComplexity(input: {
  pageSize?: number;
  filterCount?: number;
  sortBy?: string;
  idListLength?: number;
  dateRangeDays?: number;
}): { valid: boolean; reason?: string; boundedPageSize: number } {
  const pageSize = Number(input.pageSize ?? 20);
  if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > 50) { return { valid: false, reason: 'PAGE_SIZE_LIMIT_EXCEEDED', boundedPageSize: 50 }; } if ((input.filterCount ?? 0) > 10) return { valid: false, reason: 'TOO_MANY_FILTERS', boundedPageSize: pageSize }; if (input.sortBy && !ALLOWED_QUERY_SORT_FIELDS.has(input.sortBy)) { return { valid: false, reason: 'UNSUPPORTED_SORT_FIELD', boundedPageSize: pageSize }; } if ((input.idListLength ?? 0) > 30) return { valid: false, reason: 'ID_LIST_TOO_LARGE', boundedPageSize: pageSize }; if ((input.dateRangeDays ?? 0) > 366) return { valid: false, reason: 'DATE_RANGE_TOO_WIDE', boundedPageSize: pageSize }; return { valid: true, boundedPageSize: pageSize }; }