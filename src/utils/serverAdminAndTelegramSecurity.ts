import crypto from 'node:crypto';
import { getCloudflareSessionContext } from './serverCloudflareSessionBridge'; import { getApps, initializeApp, type App as FirebaseAdminApp } from 'firebase-admin/app'; import { getFirestore, type Firestore as AdminFirestore } from 'firebase-admin/firestore'; import type { CityId } from '../types/models'; import { sanitizeInput, isBootstrapAdminEmail, normalizeCanonicalEmailIdentity } from './security'; import { getValidatedServerConfig, EXPECTED_FIREBASE_PROJECT_ID, EXPECTED_FIRESTORE_DATABASE_ID, } from './serverConfigValidator'; import { runLocalLegalRuleEngine as runCanonicalLegalRuleEngine } from './serverLegalRuleEngine'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export { getValidatedServerConfig, EXPECTED_FIREBASE_PROJECT_ID, EXPECTED_FIRESTORE_DATABASE_ID }; export const SUPPORTED_CITY_IDS: readonly CityId[] = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'] as const; export const TELEGRAM_MAX_MESSAGE_LENGTH = 900; export function isValidCityId(value: unknown): value is CityId { return typeof value === 'string' && (SUPPORTED_CITY_IDS as readonly string[]).includes(value); }
export function constantTimeSecretMatch(provided: string, expected: string): boolean { if (!provided || !expected) return false; const hashA = crypto.createHash('sha256').update(provided, 'utf8').digest(); const hashB = crypto.createHash('sha256').update(expected, 'utf8').digest(); return crypto.timingSafeEqual(hashA, hashB) && provided.length === expected.length; } export function redactFirebaseCredentialError(err: unknown): string { const raw = err instanceof Error ? err.message : String(err || 'FIREBASE_ADMIN_ERROR'); return raw
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[^\r\n"]*/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/"?private_key"?\s*:\s*"[^"]+"/gi, '"private_key":"[REDACTED]"')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]')
    .slice(0, 240); } export interface AdminAuthVerificationResult { authorized: boolean; statusCode: 200 | 400 | 401 | 403 | 503; reason: string; uid?: string; email?: string; actorUid?: string; actorEmail?: string; authTimeSeconds?: number; }
export interface VerifiedUserAuthResult { authorized: boolean; authenticated: boolean; statusCode: 200 | 400 | 401 | 403 | 503; reason: string; uid?: string; email?: string; authTimeSeconds?: number; authSource?: 'cloudflare_session'; isAdmin?: boolean; isPrimaryAdmin?: boolean; isDelegatedAdmin?: boolean; }
export interface AdminAuthOptions { requirePrimaryBootstrapAdmin?: boolean; /** @deprecated Static admin tokens are always rejected. */ disallowStaticToken?: boolean; maxAuthAgeSeconds?: number; nowSeconds?: number; } const ADMIN_APP_NAME_PREFIX = 'radar-user-auth'; export function getFirebaseAdminApp(projectId: string, env: Record<string, string | undefined> = process.env): FirebaseAdminApp { if (env.PREVENT_PROD_FIREBASE_IN_TEST === 'true' && projectId === EXPECTED_FIREBASE_PROJECT_ID && !env.FIRESTORE_EMULATOR_HOST) { throw new Error('TEST_ISOLATION_GUARD: Production Firebase project access is blocked when PREVENT_PROD_FIREBASE_IN_TEST=true without emulator.'); }
  const appName = `${ADMIN_APP_NAME_PREFIX}-${projectId}`;
  return getApps().find((app) => app.name === appName) || initializeApp({ projectId }, appName); }
export function getFirebaseAdminFirestoreForServer(env: Record<string, string | undefined> = process.env): AdminFirestore { const config = getValidatedServerConfig(env); return getFirestore(getFirebaseAdminApp(config.firebaseProjectId, env), config.firestoreDatabaseId); }
export async function executeAuthorizedAdminFirestoreOperation<T>(params: { policy: 'VERIFIED_USER' | 'RESOURCE_OWNER' | 'ADMIN' | 'PRIMARY_ADMIN' | 'INTERNAL_MAINTENANCE'; callerUid?: string; callerEmail?: string; resourceOwnerUid?: string; isAdmin?: boolean; isPrimaryAdmin?: boolean; isInternalMaintenance?: boolean;
  operation: () => Promise<T>; }): Promise<T> { const callerUid = typeof params.callerUid === 'string' ? params.callerUid.trim() : ''; if (params.policy === 'INTERNAL_MAINTENANCE') { if (!params.isInternalMaintenance) throw new Error('ADMIN_SDK_AUTHZ_DENIED: INTERNAL_MAINTENANCE_REQUIRED'); return params.operation(); }
  if (params.policy === 'PRIMARY_ADMIN') { if (!params.isPrimaryAdmin && !isBootstrapAdminEmail(params.callerEmail)) throw new Error('ADMIN_SDK_AUTHZ_DENIED: PRIMARY_ADMIN_REQUIRED'); return params.operation(); }
  if (params.policy === 'ADMIN') { if (!params.isAdmin && !params.isPrimaryAdmin && !isBootstrapAdminEmail(params.callerEmail)) throw new Error('ADMIN_SDK_AUTHZ_DENIED: ADMIN_REQUIRED'); return params.operation(); }
  if (!callerUid) throw new Error('ADMIN_SDK_AUTHZ_DENIED: AUTHENTICATED_UID_REQUIRED'); if (params.policy === 'RESOURCE_OWNER') {
    const ownerUid = typeof params.resourceOwnerUid === 'string' ? params.resourceOwnerUid.trim() : ''; const isAdminOverride = Boolean(params.isAdmin || params.isPrimaryAdmin || isBootstrapAdminEmail(params.callerEmail));
    if ((!ownerUid || callerUid !== ownerUid) && !isAdminOverride) throw new Error('ADMIN_SDK_AUTHZ_DENIED: RESOURCE_OWNER_MISMATCH'); }
  return params.operation();
}
export function extractSingleSecurityHeader(
  headers: Record<string, string | string[] | undefined>,
  targetNameLower: string,
): { ok: true; value: string | undefined; reason?: 'AMBIGUOUS_AUTH_HEADER' } | { ok: false; value?: undefined; reason: 'AMBIGUOUS_AUTH_HEADER' } {
  let matchedRaw: string | string[] | undefined;
  let matchCount = 0;
  for (const [key, val] of Object.entries(headers)) {
    if (key.toLowerCase() === targetNameLower && val !== undefined) {
      matchCount += 1;
      matchedRaw = val;
    }
  }
  if (matchCount > 1) return { ok: false, reason: 'AMBIGUOUS_AUTH_HEADER' };
  if (Array.isArray(matchedRaw)) {
    if (matchedRaw.length > 1) return { ok: false, reason: 'AMBIGUOUS_AUTH_HEADER' };
    matchedRaw = matchedRaw[0];
  }
  if (typeof matchedRaw === 'string') {
    if (matchedRaw.includes(',') || /[\r\n\u0000]/.test(matchedRaw)) return { ok: false, reason: 'AMBIGUOUS_AUTH_HEADER' };
    return { ok: true, value: matchedRaw.trim() };
  }
  return { ok: true, value: undefined };
}
export function isDelegatedAdminDocument(adminData: Record<string, unknown> | undefined, normalizedTokenEmail: string): boolean {
  if (!adminData) return false;
  if ((typeof adminData.role === 'string' ? adminData.role.trim().toLowerCase() : '') !== 'admin') return false;
  const docEmail = normalizeCanonicalEmailIdentity(adminData.email);
  if (typeof adminData.email === 'string' && adminData.email.trim().length > 0 && docEmail !== normalizedTokenEmail) return false;
  return adminData.revoked !== true && adminData.disabled !== true;
}
export async function verifyAuthenticatedUserHeader(
  _headers: Record<string, string | string[] | undefined>,
  _env: Record<string, string | undefined> = process.env,
): Promise<VerifiedUserAuthResult> {
  const principal = getCloudflareSessionContext();
  if (!principal) {
    return { authorized: false, authenticated: false, statusCode: 401, reason: 'CLOUDFLARE_SESSION_REQUIRED' };
  }

  const verifiedGoogle = principal.authProvider === 'google'
    && principal.emailVerified
    && Boolean(principal.email);
  const verifiedPhone = principal.authProvider === 'phone'
    && Boolean(principal.phoneNumber);
  if (!verifiedGoogle && !verifiedPhone) {
    return {
      authorized: false,
      authenticated: false,
      statusCode: 403,
      reason: 'CLOUDFLARE_SESSION_IDENTITY_UNVERIFIED',
      uid: principal.uid,
    };
  }

  return {
    authorized: true,
    authenticated: true,
    statusCode: 200,
    reason: 'VERIFIED_CLOUDFLARE_SESSION',
    uid: principal.uid,
    email: principal.email || undefined,
    authTimeSeconds: principal.authTimeSeconds || undefined,
    authSource: 'cloudflare_session',
    isAdmin: principal.isAdmin,
    isPrimaryAdmin: principal.isPrimaryAdmin,
    isDelegatedAdmin: principal.isDelegatedAdmin,
  };
}

export async function verifyAdminApiAuthorization(
  headers: Record<string, string | string[] | undefined>,
  _env: Record<string, string | undefined> = process.env,
  options: AdminAuthOptions = {},
): Promise<AdminAuthVerificationResult> {
  const adminTokenHeader = extractSingleSecurityHeader(headers, 'x-admin-token');
  if (!adminTokenHeader.ok) return { authorized: false, statusCode: 400, reason: adminTokenHeader.reason };
  if (adminTokenHeader.value) {
    return { authorized: false, statusCode: 403, reason: 'STATIC_ADMIN_TOKEN_RETIRED' };
  }

  const userAuth = await verifyAuthenticatedUserHeader(headers);
  if (!userAuth.authenticated || !userAuth.uid || !userAuth.email || userAuth.authSource !== 'cloudflare_session') {
    return {
      authorized: false,
      statusCode: userAuth.statusCode,
      reason: userAuth.reason || 'CLOUDFLARE_SESSION_AUTH_REQUIRED',
      uid: userAuth.uid,
      actorUid: userAuth.uid,
    };
  }

  if (typeof options.maxAuthAgeSeconds === 'number' && options.maxAuthAgeSeconds > 0) {
    const nowSec = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    const sessionAuthSec = userAuth.authTimeSeconds ?? 0;
    if (!sessionAuthSec || nowSec - sessionAuthSec > options.maxAuthAgeSeconds) {
      return {
        authorized: false,
        statusCode: 403,
        reason: 'RECENT_AUTHENTICATION_REQUIRED',
        uid: userAuth.uid,
        email: userAuth.email,
        actorUid: userAuth.uid,
        actorEmail: userAuth.email,
      };
    }
  }

  const isPrimaryAdmin = userAuth.isPrimaryAdmin === true;
  const isDelegatedAdmin = userAuth.isDelegatedAdmin === true;
  if (userAuth.isAdmin !== (isPrimaryAdmin || isDelegatedAdmin)) {
    return {
      authorized: false,
      statusCode: 403,
      reason: 'CLOUDFLARE_ADMIN_ROLE_CLAIMS_INCONSISTENT',
      uid: userAuth.uid,
      email: userAuth.email,
      actorUid: userAuth.uid,
      actorEmail: userAuth.email,
    };
  }
  if (!userAuth.isAdmin || (!isPrimaryAdmin && !isDelegatedAdmin)) {
    return {
      authorized: false,
      statusCode: 403,
      reason: 'NOT_ADMIN_USER',
      uid: userAuth.uid,
      email: userAuth.email,
      actorUid: userAuth.uid,
      actorEmail: userAuth.email,
    };
  }
  if (options.requirePrimaryBootstrapAdmin && !isPrimaryAdmin) {
    return {
      authorized: false,
      statusCode: 403,
      reason: 'DELEGATED_ADMIN_FORBIDDEN_FOR_PRIMARY_OPERATION',
      uid: userAuth.uid,
      email: userAuth.email,
      actorUid: userAuth.uid,
      actorEmail: userAuth.email,
    };
  }

  return {
    authorized: true,
    statusCode: 200,
    reason: isPrimaryAdmin ? 'AUTHORIZED_BOOTSTRAP_ADMIN' : 'AUTHORIZED_DELEGATED_ADMIN',
    uid: userAuth.uid,
    email: userAuth.email,
    actorUid: userAuth.uid,
    actorEmail: userAuth.email,
    authTimeSeconds: userAuth.authTimeSeconds,
  };
}

export type TelegramPayloadValidationErrorCode = 'UNSUPPORTED_CONTENT_TYPE' | 'INVALID_JSON_OBJECT' | 'FORBIDDEN_CLIENT_CREDENTIALS' | 'UNEXPECTED_PAYLOAD_FIELD' | 'INVALID_CITY' | 'MESSAGE_TOO_LONG';
export type TelegramPayloadValidationResult =
  | { valid: true; city: CityId; customText: string; statusCode?: 400 | 415; code?: TelegramPayloadValidationErrorCode; messageFa?: string; errorMessage?: string }
  | { valid: false; city?: CityId; customText?: string; statusCode: 400 | 415; code: TelegramPayloadValidationErrorCode; messageFa: string; errorMessage: string; };
const ALLOWED_TELEGRAM_BODY_KEYS: ReadonlySet<string> = new Set(['city', 'text']);
const FORBIDDEN_CREDENTIAL_KEYS: ReadonlySet<string> = new Set(['botToken', 'bot_token', 'token', 'channelId', 'channel_id', 'chatId', 'chat_id', 'apiKey', 'api_key']);
export function validateTelegramSendRequest(body: unknown, contentTypeHeader: string | undefined, queryCity?: unknown): TelegramPayloadValidationResult {
  const fail = (statusCode: 400 | 415, code: TelegramPayloadValidationErrorCode, msg: string): TelegramPayloadValidationResult => ({
    valid: false, statusCode, code, messageFa: msg, errorMessage: msg,
  });
  if (!(contentTypeHeader || '').toLowerCase().includes('application/json')) return fail(415, 'UNSUPPORTED_CONTENT_TYPE', 'هدر Content-Type باید application/json باشد.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'INVALID_JSON_OBJECT', 'ساختار درخواست نامعتبر است.');
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_CREDENTIAL_KEYS.has(key)) return fail(400, 'FORBIDDEN_CLIENT_CREDENTIALS', 'ارسال توکن ربات یا شناسه کانال از سمت کلاینت به دلایل امنیتی مسدود است.');
    if (!ALLOWED_TELEGRAM_BODY_KEYS.has(key)) return fail(400, 'UNEXPECTED_PAYLOAD_FIELD', `فیلد غیرمجاز در بدنه درخواست: ${sanitizeInput(key, 32)}`);
  }
  const rawCity = record.city !== undefined ? record.city : queryCity !== undefined ? queryCity : 'tehran';
  if (!isValidCityId(rawCity)) return fail(400, 'INVALID_CITY', 'شهر انتخاب‌شده معتبر نیست.');
  if (record.text !== undefined && typeof record.text !== 'string') return fail(400, 'INVALID_JSON_OBJECT', 'متن پیام باید از نوع رشته باشد.');
  const rawText = typeof record.text === 'string' ? record.text : '';
  if (rawText.length > TELEGRAM_MAX_MESSAGE_LENGTH) return fail(400, 'MESSAGE_TOO_LONG', `طول پیام بیش از حد مجاز (${TELEGRAM_MAX_MESSAGE_LENGTH} کاراکتر) است.`);
  return { valid: true, city: rawCity, customText: sanitizeInput(rawText, TELEGRAM_MAX_MESSAGE_LENGTH) };
}
interface TelegramWebhookReplayEntry {
  state: 'processing' | 'completed';
  updatedAtMs: number;
}
const processedTelegramUpdates = new Map<number, TelegramWebhookReplayEntry>();
const TELEGRAM_REPLAY_TTL_MS = 30 * 60 * 1000;
export function verifyAndDeduplicateTelegramWebhook(params: {
  secretHeader: string | undefined;
  expectedSecret: string | null;
  allowedChatIds?: readonly string[];
  payload: unknown;
  nowMs?: number;
}): { accepted: boolean; statusCode: 200 | 400 | 401 | 403 | 409; reason: string; updateId?: number } {
  if (!params.expectedSecret || params.expectedSecret.length < 16) return { accepted: false, statusCode: 401, reason: 'WEBHOOK_SECRET_NOT_CONFIGURED' };
  if (!constantTimeSecretMatch((params.secretHeader || '').trim(), params.expectedSecret)) return { accepted: false, statusCode: 401, reason: 'INVALID_WEBHOOK_SECRET_TOKEN' };
  if (!params.payload || typeof params.payload !== 'object' || Array.isArray(params.payload)) return { accepted: false, statusCode: 400, reason: 'MALFORMED_WEBHOOK_PAYLOAD' };
  const rec = params.payload as Record<string, unknown>;
  const updateId = Number(rec.update_id);
  if (!Number.isInteger(updateId) || updateId <= 0) return { accepted: false, statusCode: 400, reason: 'INVALID_UPDATE_ID' };
  const msg = (rec.message || rec.channel_post) as Record<string, unknown> | undefined;
  if (msg !== undefined && (typeof msg !== 'object' || msg === null || Array.isArray(msg))) return { accepted: false, statusCode: 400, reason: 'MALFORMED_MESSAGE_ENVELOPE' };
  const chat = msg?.chat as Record<string, unknown> | undefined;
  const chatId = chat?.id !== undefined ? String(chat.id) : '';
  if (params.allowedChatIds && params.allowedChatIds.length > 0 && (!chatId || !params.allowedChatIds.includes(chatId))) {
    return { accepted: false, statusCode: 403, reason: 'UNAUTHORIZED_TELEGRAM_CHAT_ID' };
  }
  const now = params.nowMs ?? Date.now();
  for (const [id, entry] of processedTelegramUpdates.entries()) {
    if (now - entry.updatedAtMs > TELEGRAM_REPLAY_TTL_MS) processedTelegramUpdates.delete(id);
  }
  const existing = processedTelegramUpdates.get(updateId);
  if (existing && now - existing.updatedAtMs < TELEGRAM_REPLAY_TTL_MS) return { accepted: false, statusCode: 409, reason: 'DUPLICATE_TELEGRAM_UPDATE_REPLAY', updateId };
  if (processedTelegramUpdates.size >= 5000) {
    const oldest = processedTelegramUpdates.keys().next().value;
    if (oldest !== undefined) processedTelegramUpdates.delete(oldest);
  }
  processedTelegramUpdates.set(updateId, { state: 'processing', updatedAtMs: now });
  return { accepted: true, statusCode: 200, reason: 'WEBHOOK_ACCEPTED', updateId };
}
export function commitTelegramWebhookProcessed(updateId: number, nowMs = Date.now()): void {
  if (Number.isInteger(updateId) && updateId > 0) processedTelegramUpdates.set(updateId, { state: 'completed', updatedAtMs: nowMs });
}
export function rollbackTelegramWebhookProcessed(updateId: number): void {
  const entry = processedTelegramUpdates.get(updateId);
  if (entry && entry.state === 'processing') processedTelegramUpdates.delete(updateId);
}
export function runLocalLegalRuleEngine(
  clauseText: string,
  contractType: 'اجاره‌نامه' | 'مبایعه‌نامه خرید' = 'اجاره‌نامه',
  areaUnit: AreaUnit = 'sqm',
  intlCurrency: IntlCurrencyCode = 'USD',
  referenceValuationMillionToman = 10000,
) {
  void formatAreaUnitLabel(areaUnit);
  void formatMillionTomanAsIntlCurrency(referenceValuationMillionToman, intlCurrency, 'en');
  return runCanonicalLegalRuleEngine(clauseText, contractType, areaUnit, intlCurrency, referenceValuationMillionToman);
}