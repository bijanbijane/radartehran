import crypto from 'node:crypto'; import path from 'node:path'; import { BOOTSTRAP_ADMIN_EMAILS, PRIMARY_BOOTSTRAP_ADMIN_EMAIL, normalizeCanonicalEmailIdentity, } from './security'; import { INITIAL_NEIGHBORHOODS } from '../data/neighborhoods'; import { getAllMultiCityNeighborhoods, MULTI_CITY_CONFIGS, type CityId } from '../data/multiCityData'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './areaUnit'; export type AdminOperationPermission =
  | 'listing_moderation'
  | 'sponsor_management'
  | 'neighborhood_price_management'
  | 'crm_access'
  | 'backup_and_restore'
  | 'security_configuration'
  | 'admin_registry_management'; const DELEGATED_ROLE_PERMISSIONS: Record<string, ReadonlySet<AdminOperationPermission>> = { moderator: new Set(['listing_moderation']), market_editor: new Set(['listing_moderation', 'neighborhood_price_management']), sponsor_manager: new Set(['sponsor_management', 'crm_access']), primary_admin: new Set([
    'listing_moderation', 'sponsor_management', 'neighborhood_price_management', 'crm_access', 'backup_and_restore', 'security_configuration', 'admin_registry_management', ]), }; export function evaluateAdminOperationAuthorization(params: { decodedEmail?: string; emailVerified?: boolean; delegatedRole?: string | null;
  delegatedRecordActive?: boolean; operation: AdminOperationPermission; }): { authorized: boolean; isPrimaryBootstrap: boolean; reason: string } { if (params.emailVerified !== true) { return { authorized: false, isPrimaryBootstrap: false, reason: 'EMAIL_NOT_VERIFIED_CLAIM' }; }
  const email = normalizeCanonicalEmailIdentity(params.decodedEmail); const isBootstrap = email !== null && (BOOTSTRAP_ADMIN_EMAILS as readonly string[]).includes(email); const isPrimary = email === PRIMARY_BOOTSTRAP_ADMIN_EMAIL || isBootstrap; if (isPrimary) {
    return { authorized: true, isPrimaryBootstrap: true, reason: 'AUTHORIZED_BOOTSTRAP_ADMIN' }; }
  const primaryOnlyOps: ReadonlySet<AdminOperationPermission> = new Set([
    'backup_and_restore', 'security_configuration', 'admin_registry_management', ]); if (primaryOnlyOps.has(params.operation)) { return { authorized: false, isPrimaryBootstrap: false, reason: 'PRIMARY_BOOTSTRAP_ADMIN_REQUIRED' }; }
  if (!params.delegatedRecordActive || !params.delegatedRole) { return { authorized: false, isPrimaryBootstrap: false, reason: 'NO_ACTIVE_DELEGATED_ROLE' }; }
  const allowedSet = DELEGATED_ROLE_PERMISSIONS[params.delegatedRole]; if (!allowedSet || !allowedSet.has(params.operation)) { return { authorized: false, isPrimaryBootstrap: false, reason: 'INSUFFICIENT_DELEGATED_PERMISSION' }; }
  return { authorized: true, isPrimaryBootstrap: false, reason: 'AUTHORIZED_DELEGATED_ADMIN' }; }
export function canonicalizeS3ObjectKey(
  rawKey: string, envScope: 'production' | 'staging' | 'test' = 'production',
): { ok: boolean; internalKey: string; canonicalUriPath: string; reason?: string } {
  const raw = String(rawKey || '').trim();
  if (
    !raw || /[\r\n\0\\]/.test(raw) || raw.includes('..') || raw.startsWith('/') ||
    /%2e|%2f|%5c/i.test(raw) || !/^[a-zA-Z0-9/_.-]{3,180}$/.test(raw)
  ) {
    return { ok: false, internalKey: '', canonicalUriPath: '', reason: 'INVALID_S3_OBJECT_KEY' };
  }
  const scopedKey = raw.startsWith(`${envScope}/`) ? raw : `${envScope}/${raw}`;
  const encodedSegments = scopedKey
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`));
  return { ok: true, internalKey: scopedKey, canonicalUriPath: `/${encodedSegments.join('/')}` };
}
export function verifyUploadedChunksIntegrity(params: {
  chunks: ReadonlyArray<{ partNumber: number; buffer: Buffer }>;
  expectedTotalBytes: number;
  clientClaimedSha256?: string;
}): { ok: boolean; computedSha256: string; reason?: string } {
  if (params.chunks.length === 0 || params.chunks.length > 500) return { ok: false, computedSha256: '', reason: 'EMPTY_CHUNKS' };
  if (!Number.isInteger(params.expectedTotalBytes) || params.expectedTotalBytes <= 0 || params.expectedTotalBytes > 64 * 1024 * 1024) {
    return { ok: false, computedSha256: '', reason: 'TOTAL_BYTE_SIZE_MISMATCH' };
  }
  let runningBytes = 0;
  for (let i = 0; i < params.chunks.length; i++) {
    if (params.chunks[i].partNumber !== i + 1 || !Buffer.isBuffer(params.chunks[i].buffer)) {
      return { ok: false, computedSha256: '', reason: 'OUT_OF_ORDER_OR_MISSING_PART' };
    }
    runningBytes += params.chunks[i].buffer.byteLength;
  }
  if (runningBytes !== params.expectedTotalBytes) return { ok: false, computedSha256: '', reason: 'TOTAL_BYTE_SIZE_MISMATCH' };
  const assembled = Buffer.concat(params.chunks.map((c) => c.buffer));
  const computedSha256 = crypto.createHash('sha256').update(assembled).digest('hex');
  if (params.clientClaimedSha256) {
    const claimed = String(params.clientClaimedSha256).trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(claimed) || !crypto.timingSafeEqual(Buffer.from(claimed, 'hex'), Buffer.from(computedSha256, 'hex'))) {
      return { ok: false, computedSha256, reason: 'CLIENT_CHECKSUM_MISMATCH' };
    }
  }
  return { ok: true, computedSha256 };
}
export function normalizeS3ProviderError(rawError: unknown): {
  code: 'STORAGE_AUTH_FAILED' | 'STORAGE_ACCESS_DENIED' | 'STORAGE_OBJECT_NOT_FOUND' | 'STORAGE_RATE_LIMITED' | 'STORAGE_TIMEOUT' | 'STORAGE_PROVIDER_ERROR';
  httpStatus: number;
  retriable: boolean;
  safeMessage: string;
} {
  const msg = String((rawError as Error)?.message || rawError || '');
  if (/InvalidAccessKeyId|SignatureDoesNotMatch|CredentialsError/i.test(msg)) {
    return { code: 'STORAGE_AUTH_FAILED', httpStatus: 502, retriable: false, safeMessage: 'Storage provider authentication failed.' };
  }
  if (/AccessDenied|Forbidden|403/i.test(msg)) {
    return { code: 'STORAGE_ACCESS_DENIED', httpStatus: 403, retriable: false, safeMessage: 'Storage operation not permitted.' };
  }
  if (/NoSuchKey|NotFound|404/i.test(msg)) {
    return { code: 'STORAGE_OBJECT_NOT_FOUND', httpStatus: 404, retriable: false, safeMessage: 'Requested media object was not found.' };
  }
  if (/SlowDown|TooManyRequests|429/i.test(msg)) {
    return { code: 'STORAGE_RATE_LIMITED', httpStatus: 429, retriable: true, safeMessage: 'Storage provider rate limit reached.' };
  }
  if (/Timeout|ETIMEDOUT|AbortError/i.test(msg)) {
    return { code: 'STORAGE_TIMEOUT', httpStatus: 504, retriable: true, safeMessage: 'Storage operation timed out.' };
  }
  return { code: 'STORAGE_PROVIDER_ERROR', httpStatus: 502, retriable: false, safeMessage: 'Storage operation failed.' };
}
export function validateListingMediaReferencesBeforePublication(params: {
  listingId: string;
  ownerUid: string;
  imageObjectKeys: readonly string[];
  verifiedObjectsRegistry: ReadonlyMap<
    string,
    { ownerUid: string; listingId?: string; state: 'pending' | 'ready' | 'failed' | 'deleted'; visibility: 'public' | 'private' }
  >;
}): { ok: boolean; reason?: string } {
  for (const key of params.imageObjectKeys) {
    const meta = params.verifiedObjectsRegistry.get(key);
    if (!meta) return { ok: false, reason: `UNREGISTERED_MEDIA_OBJECT_${key}` };
    if (meta.state !== 'ready') return { ok: false, reason: `MEDIA_OBJECT_NOT_READY_${key}` };
    if (meta.ownerUid !== params.ownerUid) return { ok: false, reason: `CROSS_OWNER_MEDIA_REFERENCE_${key}` };
    if (meta.listingId && meta.listingId !== params.listingId) {
      return { ok: false, reason: `CROSS_LISTING_MEDIA_REFERENCE_${key}` };
    }
  }
  return { ok: true };
}
/**
 * Tasks 741–759: Canonical Neighborhood Catalog, Point-in-Polygon / Coordinate Consistency,
 * Price Source Precedence, Iranian Mobile Normalization, and Buyer Lead Idempotency.
 */
export const CANONICAL_NEIGHBORHOOD_CATALOG_VERSION = '2026.10.1';
export function resolveCanonicalNeighborhoodIdentity(hoodId: number): {
  valid: boolean;
  hoodId: number;
  canonicalName: string;
  city: CityId;
  lat: number;
  lng: number;
} | null {
  const id = Number(hoodId);
  if (!Number.isInteger(id) || id < 1 || id > 999) return null;
  const tehranMatch = INITIAL_NEIGHBORHOODS.find((h) => h.id === id);
  if (tehranMatch) {
    return { valid: true, hoodId: id, canonicalName: tehranMatch.name, city: 'tehran', lat: tehranMatch.lat, lng: tehranMatch.lng };
  }
  for (const [cityKey, cfg] of Object.entries(MULTI_CITY_CONFIGS)) {
    const found = cfg.neighborhoods.find((h) => h.id === id);
    if (found) {
      return { valid: true, hoodId: id, canonicalName: found.name, city: cityKey as CityId, lat: found.lat, lng: found.lng };
    }
  }
  const extMatch = getAllMultiCityNeighborhoods().find((h) => h.id === id);
  if (extMatch) {
    return { valid: true, hoodId: id, canonicalName: extMatch.name, city: (extMatch as { city?: CityId }).city || 'tehran', lat: extMatch.lat, lng: extMatch.lng };
  }
  return null;
}
export function validatePropertyCoordinateAndNeighborhoodConsistency(params: {
  hoodId: number;
  lat?: number;
  lng?: number;
  maxDistanceKm?: number;
}): { ok: boolean; reason?: string; distanceKm?: number } {
  const canonical = resolveCanonicalNeighborhoodIdentity(params.hoodId);
  if (!canonical) return { ok: false, reason: 'UNKNOWN_CANONICAL_NEIGHBORHOOD_ID' };
  if (params.lat === undefined && params.lng === undefined) return { ok: true };
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: 'NON_FINITE_COORDINATES' };
  if (lat > 44 && lat < 64 && lng > 24 && lng < 40) {
    return { ok: false, reason: 'REVERSED_LAT_LNG_COORDINATES' };
  }
  if (lat < 24 || lat > 40 || lng < 44 || lng > 64) {
    return { ok: false, reason: 'COORDINATES_OUTSIDE_IRAN_BOUNDS' };
  }
  const dLat = ((lat - canonical.lat) * Math.PI) / 180;
  const dLng = ((lng - canonical.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((canonical.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const maxKm = params.maxDistanceKm ?? 15;
  if (distKm > maxKm) {
    return { ok: false, reason: 'COORDINATES_OUTSIDE_NEIGHBORHOOD_RADIUS', distanceKm: Number(distKm.toFixed(2)) };
  }
  return { ok: true, distanceKm: Number(distKm.toFixed(2)) };
}
export function resolveAuthoritativeNeighborhoodPrice(params: {
  seedBuyPerSqm: number;
  seedRahn80m: number;
  liveScrapedBuyPerSqm?: number;
  liveScrapedRahn80m?: number;
  adminOverrideBuyPerSqm?: number;
  adminOverrideRahn80m?: number;
}): { buyPerSqm: number; rahn80m: number; activeSource: 'ADMIN_OVERRIDE' | 'VERIFIED_LIVE_MARKET' | 'STATIC_SEED_BASELINE'; displayAreaUnitLabel?: string; buyPerSqmIntlText?: string } {
  const validBuy = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 10 && v <= 5000;
  const validRahn = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 50 && v <= 100000;
  const enrich = (buyPerSqm: number, rahn80m: number, activeSource: 'ADMIN_OVERRIDE' | 'VERIFIED_LIVE_MARKET' | 'STATIC_SEED_BASELINE') => ({
    buyPerSqm, rahn80m, activeSource, displayAreaUnitLabel: formatAreaUnitLabel(getStoredAreaUnit()), buyPerSqmIntlText: formatMillionTomanAsIntlCurrency(buyPerSqm, getStoredIntlCurrency()),
  });
  const hasAdmin = validBuy(params.adminOverrideBuyPerSqm) || validRahn(params.adminOverrideRahn80m);
  const hasLive = validBuy(params.liveScrapedBuyPerSqm) || validRahn(params.liveScrapedRahn80m);
  const buy = validBuy(params.adminOverrideBuyPerSqm) ? params.adminOverrideBuyPerSqm : validBuy(params.liveScrapedBuyPerSqm) ? params.liveScrapedBuyPerSqm : params.seedBuyPerSqm;
  const rahn = validRahn(params.adminOverrideRahn80m) ? params.adminOverrideRahn80m : validRahn(params.liveScrapedRahn80m) ? params.liveScrapedRahn80m : params.seedRahn80m;
  return enrich(buy, rahn, hasAdmin ? 'ADMIN_OVERRIDE' : hasLive ? 'VERIFIED_LIVE_MARKET' : 'STATIC_SEED_BASELINE');
}
export function normalizeCanonicalIranianMobile(rawInput: string): {
  ok: boolean;
  canonicalPhone: string;
  reason?: string;
} {
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const ascii = String(rawInput || '')
    .replace(/[۰-۹]/g, (d) => String(persianDigits.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .replace(/[\s()-]/g, '');
  let normalized = ascii;
  if (normalized.startsWith('+989')) normalized = '0' + normalized.slice(3);
  else if (normalized.startsWith('00989')) normalized = '0' + normalized.slice(4);
  else if (normalized.startsWith('989') && normalized.length === 12) normalized = '0' + normalized.slice(2);
  if (!/^09\d{9}$/.test(normalized)) {
    return { ok: false, canonicalPhone: '', reason: 'INVALID_IRANIAN_MOBILE_FORMAT' };
  }
  return { ok: true, canonicalPhone: normalized };
}
export function computeBuyerLeadSubmissionIdempotencyKey(params: {
  actorUid: string;
  canonicalPhone: string;
  hoodId: number;
  dealType: 'خرید' | 'اجاره';
  maxBudgetMillion: number;
}): string {
  const raw = `${params.actorUid}|${params.canonicalPhone}|${params.hoodId}|${params.dealType}|${Math.round(params.maxBudgetMillion)}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}
export function validateSafeStaticFileTarget(publicRootDir: string, requestedRelativePath: string): {
  allowed: boolean;
  resolvedPath: string;
  reason?: string;
} {
  const rel = String(requestedRelativePath || '').replace(/^\/+/, '');
  if (!rel || /[\r\n\0\\]/.test(rel) || /%2e|%2f|%5c|%00/i.test(rel) || rel.split('/').some((seg) => seg.startsWith('.') || seg === '..')) {
    return { allowed: false, resolvedPath: '', reason: 'DOTFILE_OR_TRAVERSAL_BLOCKED' };
  }
  const forbiddenPrefixes = ['src/', 'server.ts', 'scripts/', 'tests/', 'node_modules/', 'firestore.rules', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'firebase-blueprint.json', 'architecture-baseline.json'];
  if (forbiddenPrefixes.some((p) => rel.toLowerCase().startsWith(p))) {
    return { allowed: false, resolvedPath: '', reason: 'INTERNAL_SOURCE_PATH_BLOCKED' };
  }
  const absRoot = path.resolve(publicRootDir);
  const absTarget = path.resolve(absRoot, rel);
  if (absTarget !== absRoot && !absTarget.startsWith(absRoot + path.sep)) {
    return { allowed: false, resolvedPath: '', reason: 'STATIC_ROOT_ESCAPE_BLOCKED' };
  }
  return { allowed: true, resolvedPath: absTarget };
}
export function resolveTrustedRequestCorrelationId(clientHeaderValue?: string): string {
  const raw = String(clientHeaderValue || '').trim();
  if (/^[a-zA-Z0-9_-]{8,64}$/.test(raw)) {
    return `req-${raw}`;
  }
  return `req-${crypto.randomBytes(12).toString('hex')}`;
}
/**
 * Tasks 781–800: Firebase Emulator Production Guard, Compliance Manifest,
 * and End-to-End Identity-to-Authorization Matrix Evaluator.
 */
export function validateFirebaseEmulatorEnvironmentGuard(env: Record<string, string | undefined>): {
  ok: boolean;
  emulatorActive: boolean;
  reason?: string;
} {
  const isProd = env.NODE_ENV === 'production' || Boolean(env.K_SERVICE);
  const hasEmulatorHost = Boolean(
    env.FIREBASE_AUTH_EMULATOR_HOST ||
    env.FIRESTORE_EMULATOR_HOST ||
    env.VITE_USE_FIREBASE_EMULATOR === 'true',
  );
  if (isProd && hasEmulatorHost) {
    return { ok: false, emulatorActive: false, reason: 'EMULATOR_FORBIDDEN_IN_PRODUCTION' };
  }
  return { ok: true, emulatorActive: !isProd && hasEmulatorHost };
}
export interface FirebaseComplianceManifestEntry {
  settingId: string;
  controlBoundary: 'repository_enforced' | 'provider_console_managed';
  intendedPolicy: string;
  verificationStatus: 'verified_in_repo' | 'requires_external_console_verification';
}
export function buildFirebaseSecurityComplianceManifest(): readonly FirebaseComplianceManifestEntry[] {
  return [
    {
      settingId: 'firebase_project_and_database_binding',
      controlBoundary: 'repository_enforced',
      intendedPolicy: 'Locked to gen-lang-client-0713157837 / ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a',
      verificationStatus: 'verified_in_repo',
    },
    {
      settingId: 'firestore_security_rules_and_indexes',
      controlBoundary: 'repository_enforced',
      intendedPolicy: 'Strict default-deny firestore.rules + composite indexes in firestore.indexes.json',
      verificationStatus: 'verified_in_repo',
    },
    {
      settingId: 'firebase_console_email_enumeration_protection',
      controlBoundary: 'provider_console_managed',
      intendedPolicy: 'Enable Email Enumeration Protection in Firebase Console > Authentication > Settings',
      verificationStatus: 'requires_external_console_verification',
    },
    {
      settingId: 'gcp_browser_api_key_http_referrer_restrictions', controlBoundary: 'provider_console_managed', intendedPolicy: 'Restrict browser API key to authorized Cloud Run / production domains in Google Cloud Console', verificationStatus: 'requires_external_console_verification', }, ]; }