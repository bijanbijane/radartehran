import crypto from 'node:crypto'; import { getApps, initializeApp, type App as FirebaseAdminApp } from 'firebase-admin/app'; import { getAuth, type DecodedIdToken } from 'firebase-admin/auth'; import { getAppCheck } from 'firebase-admin/app-check'; import { getFirestore, type Firestore as AdminFirestore } from 'firebase-admin/firestore'; import type { CityId } from '../types/models'; import { sanitizeInput, isBootstrapAdminEmail, normalizeCanonicalEmailIdentity } from './security'; import { getValidatedServerConfig, EXPECTED_FIREBASE_PROJECT_ID, EXPECTED_FIRESTORE_DATABASE_ID, } from './serverConfigValidator'; import { runLocalLegalRuleEngine as runCanonicalLegalRuleEngine } from './serverLegalRuleEngine'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export { getValidatedServerConfig, EXPECTED_FIREBASE_PROJECT_ID, EXPECTED_FIRESTORE_DATABASE_ID }; export const SUPPORTED_CITY_IDS: readonly CityId[] = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'] as const; export const TELEGRAM_MAX_MESSAGE_LENGTH = 900; export function isValidCityId(value: unknown): value is CityId { return typeof value === 'string' && (SUPPORTED_CITY_IDS as readonly string[]).includes(value); }
export function constantTimeSecretMatch(provided: string, expected: string): boolean { if (!provided || !expected) return false; const hashA = crypto.createHash('sha256').update(provided, 'utf8').digest(); const hashB = crypto.createHash('sha256').update(expected, 'utf8').digest(); return crypto.timingSafeEqual(hashA, hashB) && provided.length === expected.length; } export function redactFirebaseCredentialError(err: unknown): string { const raw = err instanceof Error ? err.message : String(err || 'FIREBASE_ADMIN_ERROR'); return raw
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[^\r\n"]*/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/"?private_key"?\s*:\s*"[^"]+"/gi, '"private_key":"[REDACTED]"')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]')
    .slice(0, 240); } export interface AdminAuthVerificationResult { authorized: boolean; statusCode: 200 | 400 | 401 | 403 | 503; reason: string; uid?: string; email?: string; actorUid?: string; actorEmail?: string; authTimeSeconds?: number; }
export interface VerifiedUserAuthResult { authorized: boolean; authenticated: boolean; statusCode: 200 | 400 | 401 | 403 | 503; reason: string; uid?: string; email?: string; authTimeSeconds?: number; }
export interface AdminAuthOptions { verifyIdTokenFn?: (idToken: string) => Promise<DecodedIdToken>; checkDelegatedAdminFn?: (uid: string, email: string) => Promise<boolean>; requirePrimaryBootstrapAdmin?: boolean; disallowStaticToken?: boolean; maxAuthAgeSeconds?: number; nowSeconds?: number; } const ADMIN_APP_NAME_PREFIX = 'radar-user-auth'; export function getFirebaseAdminApp(projectId: string, env: Record<string, string | undefined> = process.env): FirebaseAdminApp { if (env.PREVENT_PROD_FIREBASE_IN_TEST === 'true' && projectId === EXPECTED_FIREBASE_PROJECT_ID && !env.FIRESTORE_EMULATOR_HOST) { throw new Error('TEST_ISOLATION_GUARD: Production Firebase project access is blocked when PREVENT_PROD_FIREBASE_IN_TEST=true without emulator.'); }
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
  headers: Record<string, string | string[] | undefined>,
  env: Record<string, string | undefined> = process.env,
  customVerifyIdToken?: (idToken: string) => Promise<DecodedIdToken>,
): Promise<VerifiedUserAuthResult> {
  const config = getValidatedServerConfig(env);
  const authHeaderResult = extractSingleSecurityHeader(headers, 'authorization');
  if (!authHeaderResult.ok) return { authorized: false, authenticated: false, statusCode: 400, reason: authHeaderResult.reason };
  const rawAuthHeader = authHeaderResult.value || '';
  if (!rawAuthHeader.toLowerCase().startsWith('bearer ')) return { authorized: false, authenticated: false, statusCode: 401, reason: 'MISSING_BEARER_TOKEN' };
  const idToken = rawAuthHeader.slice(7).trim();
  if (idToken.length === 0 || idToken.length > 12_000 || /\s/.test(idToken)) return { authorized: false, authenticated: false, statusCode: 401, reason: 'INVALID_JWT_LENGTH' };
  const segments = idToken.split('.');
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) return { authorized: false, authenticated: false, statusCode: 401, reason: 'MALFORMED_JWT' };
  let decoded: DecodedIdToken;
  try {
    if (customVerifyIdToken) {
      decoded = await customVerifyIdToken(idToken);
    } else {
      const authClient = getAuth(getFirebaseAdminApp(config.firebaseProjectId, env));
      decoded = await authClient.verifyIdToken(idToken, true);
    }
  } catch (verifyErr: unknown) {
    const code = typeof (verifyErr as { code?: unknown })?.code === 'string' ? (verifyErr as { code: string }).code : '';
    const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr || '');
    if (code === 'auth/id-token-revoked') return { authorized: false, authenticated: false, statusCode: 401, reason: 'TOKEN_REVOKED' };
    if (code === 'auth/user-disabled') return { authorized: false, authenticated: false, statusCode: 401, reason: 'USER_ACCOUNT_DISABLED' };
    if (code === 'auth/id-token-expired' || code === 'auth/argument-error' || code === 'auth/invalid-id-token') {
      return { authorized: false, authenticated: false, statusCode: 401, reason: 'INVALID_OR_REVOKED_FIREBASE_TOKEN' };
    }
    const isTransient = code === 'auth/internal-error' || code === 'app/network-error' || code === 'app/invalid-credential' || /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|503|UNAVAILABLE|network|timeout|credential/i.test(msg);
    if (isTransient) return { authorized: false, authenticated: false, statusCode: 503, reason: 'FIREBASE_AUTH_DEPENDENCY_UNAVAILABLE' };
    return { authorized: false, authenticated: false, statusCode: 401, reason: 'INVALID_OR_REVOKED_FIREBASE_TOKEN' };
  }
  if (decoded.aud !== config.firebaseProjectId || decoded.iss !== `https://securetoken.google.com/${config.firebaseProjectId}`) {
    return { authorized: false, authenticated: false, statusCode: 401, reason: 'TOKEN_PROJECT_MISMATCH' };
  }
  const uid = typeof decoded.uid === 'string' && decoded.uid ? decoded.uid : decoded.sub;
  if (typeof uid !== 'string' || !uid.trim()) return { authorized: false, authenticated: false, statusCode: 401, reason: 'MISSING_SUBJECT_UID' };
  if (decoded.email_verified !== true) return { authorized: false, authenticated: false, statusCode: 403, reason: 'EMAIL_NOT_VERIFIED', uid };
  const email = normalizeCanonicalEmailIdentity(decoded.email);
  if (!email) return { authorized: false, authenticated: false, statusCode: 403, reason: 'MISSING_EMAIL_CLAIM', uid };
  const authTimeSeconds = typeof decoded.auth_time === 'number' && Number.isFinite(decoded.auth_time)
    ? decoded.auth_time
    : typeof decoded.iat === 'number' && Number.isFinite(decoded.iat)
      ? decoded.iat
      : undefined;
  return { authorized: true, authenticated: true, statusCode: 200, reason: 'VERIFIED_USER', uid, email, authTimeSeconds };
}
export const verifyFirebaseUserAuthorization = verifyAuthenticatedUserHeader;
export async function verifyAdminApiAuthorization(
  headers: Record<string, string | string[] | undefined>,
  env: Record<string, string | undefined> = process.env,
  options: AdminAuthOptions = {},
): Promise<AdminAuthVerificationResult> {
  const config = getValidatedServerConfig(env);
  const adminTokenHeaderResult = extractSingleSecurityHeader(headers, 'x-admin-token');
  if (!adminTokenHeaderResult.ok) return { authorized: false, statusCode: 400, reason: adminTokenHeaderResult.reason };
  const authHeaderResult = extractSingleSecurityHeader(headers, 'authorization');
  if (!authHeaderResult.ok) return { authorized: false, statusCode: 400, reason: authHeaderResult.reason };
  const rawAdminSecretHeader = adminTokenHeaderResult.value || '';
  if (rawAdminSecretHeader.length > 0 && !authHeaderResult.value) {
    if (options.requirePrimaryBootstrapAdmin || options.disallowStaticToken) {
      return { authorized: false, statusCode: 403, reason: 'STATIC_ADMIN_TOKEN_FORBIDDEN_FOR_OPERATION' };
    }
    if (config.adminApiSecret && constantTimeSecretMatch(rawAdminSecretHeader, config.adminApiSecret)) {
      return {
        authorized: true, statusCode: 200, reason: 'AUTHORIZED_SERVER_SECRET',
        uid: 'server-secret-admin', email: config.adminEmail, actorUid: 'server-secret-admin', actorEmail: config.adminEmail,
      };
    }
    return { authorized: false, statusCode: 403, reason: 'INVALID_ADMIN_SECRET' };
  }
  if (rawAdminSecretHeader.length > 0 && config.adminApiSecret && !constantTimeSecretMatch(rawAdminSecretHeader, config.adminApiSecret)) {
    return { authorized: false, statusCode: 403, reason: 'INVALID_ADMIN_SECRET' };
  }
  const userAuth = await verifyAuthenticatedUserHeader(headers, env, options.verifyIdTokenFn);
  if (!userAuth.authenticated || !userAuth.uid || !userAuth.email) {
    return { authorized: false, statusCode: userAuth.statusCode, reason: userAuth.reason, uid: userAuth.uid, actorUid: userAuth.uid };
  }
  if (typeof options.maxAuthAgeSeconds === 'number' && options.maxAuthAgeSeconds > 0) {
    const nowSec = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    const tokenAuthSec = userAuth.authTimeSeconds ?? 0;
    if (!tokenAuthSec || nowSec - tokenAuthSec > options.maxAuthAgeSeconds) {
      return {
        authorized: false, statusCode: 403, reason: 'RECENT_AUTHENTICATION_REQUIRED',
        uid: userAuth.uid, email: userAuth.email, actorUid: userAuth.uid, actorEmail: userAuth.email,
      };
    }
  }
  if (isBootstrapAdminEmail(userAuth.email) || userAuth.email === config.adminEmail) {
    return {
      authorized: true, statusCode: 200, reason: 'AUTHORIZED_BOOTSTRAP_ADMIN',
      uid: userAuth.uid, email: userAuth.email, actorUid: userAuth.uid, actorEmail: userAuth.email, authTimeSeconds: userAuth.authTimeSeconds,
    };
  }
  if (options.requirePrimaryBootstrapAdmin) {
    return {
      authorized: false, statusCode: 403, reason: 'DELEGATED_ADMIN_FORBIDDEN_FOR_PRIMARY_OPERATION',
      uid: userAuth.uid, email: userAuth.email, actorUid: userAuth.uid, actorEmail: userAuth.email,
    };
  }
  try {
    let isDelegated = false;
    if (options.checkDelegatedAdminFn) {
      isDelegated = await options.checkDelegatedAdminFn(userAuth.uid, userAuth.email);
    } else {
      const adminSnap = await getFirebaseAdminFirestoreForServer(env).collection('admins').doc(userAuth.uid).get();
      if (adminSnap.exists) isDelegated = isDelegatedAdminDocument(adminSnap.data() as Record<string, unknown> | undefined, userAuth.email);
    }
    if (isDelegated) {
      return {
        authorized: true, statusCode: 200, reason: 'AUTHORIZED_DELEGATED_ADMIN',
        uid: userAuth.uid, email: userAuth.email, actorUid: userAuth.uid, actorEmail: userAuth.email, authTimeSeconds: userAuth.authTimeSeconds,
      };
    }
  } catch {
    return { authorized: false, statusCode: 403, reason: 'ADMIN_ROLE_LOOKUP_FAILED', uid: userAuth.uid, email: userAuth.email, actorUid: userAuth.uid, actorEmail: userAuth.email };
  }
  return { authorized: false, statusCode: 403, reason: 'NOT_ADMIN_USER', uid: userAuth.uid, email: userAuth.email, actorUid: userAuth.uid, actorEmail: userAuth.email };
}
export type AppCheckEnforcementMode = 'disabled' | 'monitor' | 'enforced';
export interface AppCheckVerificationResult { allowed: boolean; mode: AppCheckEnforcementMode; statusCode: 200 | 401 | 403; reason: string; }
export async function verifyFirebaseAppCheckHeader(
  headers: Record<string, string | string[] | undefined>,
  env: Record<string, string | undefined> = process.env,
  customVerifyAppCheckFn?: (token: string) => Promise<{ appId: string }>,
): Promise<AppCheckVerificationResult> {
  const isProd = env.NODE_ENV === 'production';
  const rawMode = (env.FIREBASE_APP_CHECK_MODE || 'disabled').trim().toLowerCase();
  const mode: AppCheckEnforcementMode = rawMode === 'enforced' ? 'enforced' : rawMode === 'monitor' ? 'monitor' : 'disabled';
  const debugHeader = extractSingleSecurityHeader(headers, 'x-firebase-appcheck-debug');
  if (isProd && debugHeader.ok && debugHeader.value) return { allowed: false, mode, statusCode: 403, reason: 'APP_CHECK_DEBUG_TOKEN_FORBIDDEN_IN_PRODUCTION' };
  if (mode === 'disabled') return { allowed: true, mode, statusCode: 200, reason: 'APP_CHECK_DISABLED' };
  const headerRes = extractSingleSecurityHeader(headers, 'x-firebase-appcheck');
  if (!headerRes.ok) return { allowed: false, mode, statusCode: 401, reason: 'AMBIGUOUS_APP_CHECK_HEADER' };
  const token = headerRes.value || '';
  if (!token || token.length < 20 || token.length > 8192) {
    return mode === 'monitor' ? { allowed: true, mode, statusCode: 200, reason: 'APP_CHECK_MONITOR_MISSING_TOKEN' } : { allowed: false, mode, statusCode: 401, reason: 'MISSING_APP_CHECK_TOKEN' };
  }
  try {
    const config = getValidatedServerConfig(env);
    if (customVerifyAppCheckFn) await customVerifyAppCheckFn(token);
    else await getAppCheck(getFirebaseAdminApp(config.firebaseProjectId, env)).verifyToken(token);
    return { allowed: true, mode, statusCode: 200, reason: 'APP_CHECK_VERIFIED' };
  } catch {
    return mode === 'monitor' ? { allowed: true, mode, statusCode: 200, reason: 'APP_CHECK_MONITOR_INVALID_TOKEN' } : { allowed: false, mode, statusCode: 401, reason: 'INVALID_APP_CHECK_TOKEN' };
  }
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
export { requireAppCheckToken, createRequireAppCheckTokenMiddleware } from './appCheck';