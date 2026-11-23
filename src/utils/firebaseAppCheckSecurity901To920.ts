import crypto from 'node:crypto'; import { AUTHORITATIVE_FIREBASE_PROJECT_ID, AUTHORITATIVE_FIRESTORE_DATABASE_ID } from './serverConfigValidator'; import { constantTimeSecretMatch } from './serverAdminAndTelegramSecurity'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export const AUTHORITATIVE_FIREBASE_WEB_APP_ID = '1:935427453422:web:25817d32df713f2a68deff'; export const AUTHORITATIVE_FIREBASE_PROJECT_NUMBER = '935427453422'; export type AppCheckDeploymentEnvironment = 'development' | 'test' | 'staging' | 'preview' | 'production'; export type AppCheckProviderKind = 'recaptcha_enterprise' | 'recaptcha_v3' | 'debug_only_non_prod' | 'disabled_unconfigured'; export type AppCheckFailureCategory = | 'NONE' | 'MISSING_TOKEN' | 'MALFORMED_TOKEN' | 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'WRONG_PROJECT'
  | 'WRONG_APP_ID' | 'REPLAYED_CONSUMED_TOKEN' | 'DEBUG_TOKEN_FORBIDDEN_IN_PROD' | 'PROVIDER_INIT_FAILURE' | 'VERIFICATION_SERVICE_UNAVAILABLE'; export interface AppCheckResourceInventoryEntry { resourceId: string; serviceCategory: 'cloud_firestore' | 'firebase_auth' | 'firebase_storage' | 'realtime_database' | 'cloud_functions' | 'custom_express_api' | 'gemini_ai_proxy'; existsInRepository: boolean; actualSdk: string; accessPlane: 'client_and_admin_sdk' | 'admin_sdk_and_custom_backend' | 'not_used_in_repository'; currentCodeStatus: 'code_ready_monitor_or_enforced' | 'native_sdk_bound' | 'not_applicable'; externalConsoleEnforcementStatus: 'requires_external_console_activation' | 'custom_backend_controlled' | 'not_applicable'; supportsReplayProtection: boolean; requiredExternalConsoleStep: string; }
export const FIREBASE_APP_CHECK_RESOURCE_MATRIX: readonly AppCheckResourceInventoryEntry[] = [ { resourceId: 'cloud-firestore', serviceCategory: 'cloud_firestore', existsInRepository: true, actualSdk: `firebase/firestore@^13.1.0 + firebase-admin/firestore@^14.5.0 (${AUTHORITATIVE_FIRESTORE_DATABASE_ID})`,
    accessPlane: 'client_and_admin_sdk', currentCodeStatus: 'native_sdk_bound', externalConsoleEnforcementStatus: 'requires_external_console_activation', supportsReplayProtection: false, requiredExternalConsoleStep: 'Register web app 1:935427453422:web:25817d32df713f2a68deff with reCAPTCHA Enterprise in Firebase Console -> App Check, monitor metrics, then enable Cloud Firestore enforcement.', }, { resourceId: 'firebase-authentication', serviceCategory: 'firebase_auth', existsInRepository: true,
    actualSdk: `firebase/auth@^13.1.0 + firebase-admin/auth@^14.5.0 (${AUTHORITATIVE_FIREBASE_PROJECT_ID})`, accessPlane: 'client_and_admin_sdk', currentCodeStatus: 'native_sdk_bound',
    externalConsoleEnforcementStatus: 'requires_external_console_activation', supportsReplayProtection: false, requiredExternalConsoleStep: 'Enable Identity Platform / Firebase Auth App Check enforcement in Firebase Console only after verifying Google OAuth popup sign-in compatibility.', }, { resourceId: 'custom-object-storage', serviceCategory: 'firebase_storage', existsInRepository: true, actualSdk: 'Custom Express /api/object-storage/* (local + S3-compatible bucket)',
    accessPlane: 'admin_sdk_and_custom_backend', currentCodeStatus: 'code_ready_monitor_or_enforced', externalConsoleEnforcementStatus: 'custom_backend_controlled', supportsReplayProtection: true, requiredExternalConsoleStep: 'Set FIREBASE_APP_CHECK_MODE=enforced in server environment after verifying client token metrics.', }, { resourceId: 'firebase-realtime-database', serviceCategory: 'realtime_database', existsInRepository: false, actualSdk: 'none (not installed / not used)', accessPlane: 'not_used_in_repository', currentCodeStatus: 'not_applicable', externalConsoleEnforcementStatus: 'not_applicable', supportsReplayProtection: false, requiredExternalConsoleStep: 'None — Realtime Database is not used by Tehran Housing Radar.', }, { resourceId: 'firebase-cloud-functions', serviceCategory: 'cloud_functions', existsInRepository: false, actualSdk: 'none (Express monolith in server.ts; no firebase-functions deployed)', accessPlane: 'not_used_in_repository',
    currentCodeStatus: 'not_applicable', externalConsoleEnforcementStatus: 'not_applicable', supportsReplayProtection: false, requiredExternalConsoleStep: 'None — Cloud Functions are not used; custom Express endpoints enforce App Check directly.', },
  { resourceId: 'custom-express-api', serviceCategory: 'custom_express_api', existsInRepository: true, actualSdk: 'express@^4.21.2 + firebase-admin/app-check@^14.5.0', accessPlane: 'admin_sdk_and_custom_backend', currentCodeStatus: 'code_ready_monitor_or_enforced', externalConsoleEnforcementStatus: 'custom_backend_controlled',
    supportsReplayProtection: true, requiredExternalConsoleStep: 'Provision reCAPTCHA Enterprise site key in VITE_FIREBASE_APP_CHECK_SITE_KEY and set FIREBASE_APP_CHECK_MODE=enforced.', }, { resourceId: 'gemini-ai-proxy', serviceCategory: 'gemini_ai_proxy',
    existsInRepository: true, actualSdk: '@google/genai@^2.4.0 via server.ts /api/contract-check', accessPlane: 'admin_sdk_and_custom_backend', currentCodeStatus: 'code_ready_monitor_or_enforced',
    externalConsoleEnforcementStatus: 'custom_backend_controlled', supportsReplayProtection: true, requiredExternalConsoleStep: 'Enforce limited-use App Check token consumption on /api/contract-check to prevent automated quota drain.',
  }, ] as const;
export interface AppCheckEnvironmentPolicyInput {
  nodeEnv?: string; isProductionBuild?: boolean; viteRecaptchaEnterpriseSiteKey?: string;
  viteRecaptchaV3SiteKey?: string; viteAppCheckDebugToken?: string; allowAppCheckDebugInDev?: boolean; [key: string]: unknown;
}
export function resolveAppCheckEnvironmentPolicy(input: AppCheckEnvironmentPolicyInput) {
  const nodeEnv = String(input.nodeEnv ?? input.NODE_ENV ?? input.MODE ?? 'development').trim().toLowerCase();
  const isProd = Boolean(input.isProductionBuild || nodeEnv === 'production' || nodeEnv === 'staging' || nodeEnv === 'preview');
  const enterpriseKey = String(input.viteRecaptchaEnterpriseSiteKey ?? input.VITE_FIREBASE_APP_CHECK_SITE_KEY ?? '').trim();
  const v3Key = String(input.viteRecaptchaV3SiteKey ?? input.VITE_RECAPTCHA_V3_SITE_KEY ?? '').trim();
  const rawDebug = String(input.viteAppCheckDebugToken ?? input.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN ?? '').trim();
  const warnings: string[] = [];
  if (isProd && rawDebug.length > 0) {
    warnings.push('DEBUG_TOKEN_IGNORED_IN_PRODUCTION');
  }
  const debugModeAllowed = !isProd && Boolean(input.allowAppCheckDebugInDev || rawDebug.length > 0);
  const effectiveDebugToken = debugModeAllowed && rawDebug.length > 0 ? rawDebug : null;
  const hasEnterprise = enterpriseKey.length >= 20 && !/^(MY_|YOUR_|PLACEHOLDER|AIza)/i.test(enterpriseKey);
  const hasV3 = v3Key.length >= 20 && !/^(MY_|YOUR_|PLACEHOLDER|AIza)/i.test(v3Key);
  const providerType: AppCheckProviderKind = hasEnterprise
    ? 'recaptcha_enterprise'
    : hasV3
      ? 'recaptcha_v3'
      : debugModeAllowed
        ? 'debug_only_non_prod'
        : 'disabled_unconfigured';
  return {
    environment: (isProd ? 'production' : nodeEnv === 'test' ? 'test' : 'development') as AppCheckDeploymentEnvironment,
    providerType,
    providerKind: providerType,
    siteKey: hasEnterprise ? enterpriseKey : hasV3 ? v3Key : null,
    debugModeAllowed,
    allowDebugProvider: debugModeAllowed,
    effectiveDebugToken,
    isTokenAutoRefreshEnabled: true,
    configurationValid: isProd ? hasEnterprise || hasV3 : true,
    warnings,
  };
}
export function detectAccidentalDebugTokenExposure(envOrArtifact: Record<string, string | undefined> | string) {
  if (typeof envOrArtifact === 'string') {
    const hasUuid = /FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*["'][0-9a-f-]{36}["']/i.test(envOrArtifact);
    return {
      safeForProductionBundle: !hasUuid,
      clean: !hasUuid,
      exposedKeys: hasUuid ? ['FIREBASE_APPCHECK_DEBUG_TOKEN'] : [],
    };
  }
  const exposedKeys = Object.keys(envOrArtifact).filter(
    (k) => /APP_?CHECK.*DEBUG/i.test(k) && Boolean(envOrArtifact[k]?.trim()),
  );
  return {
    safeForProductionBundle: exposedKeys.length === 0,
    clean: exposedKeys.length === 0,
    exposedKeys,
  };
}
export type RouteAppCheckClassification = 'public_read_only' | 'webhook_signature_authenticated' | 'app_check_protected_public' | 'authenticated_user_and_app_check' | 'authenticated_user_and_limited_use_app_check' | 'admin_and_limited_use_app_check';
export interface RouteAppCheckPolicyEntry {
  method: 'GET' | 'POST' | 'DELETE'; pathPattern: string; classification: RouteAppCheckClassification;
  requiresUserAuth: boolean; requiresAdminAuth: boolean; requiresAppCheckToken: boolean; requiresLimitedUseToken: boolean; failClosedOnVerifierError: boolean;
}
export const APP_CHECK_ROUTE_POLICY_REGISTRY: readonly RouteAppCheckPolicyEntry[] = [
  { method: 'GET', pathPattern: '/api/market-pulse', classification: 'public_read_only', requiresUserAuth: false, requiresAdminAuth: false, requiresAppCheckToken: false, requiresLimitedUseToken: false, failClosedOnVerifierError: false },
  { method: 'GET', pathPattern: '/api/air-quality', classification: 'public_read_only', requiresUserAuth: false, requiresAdminAuth: false, requiresAppCheckToken: false, requiresLimitedUseToken: false, failClosedOnVerifierError: false },
  { method: 'POST', pathPattern: '/api/telegram/webhook', classification: 'webhook_signature_authenticated', requiresUserAuth: false, requiresAdminAuth: false, requiresAppCheckToken: false, requiresLimitedUseToken: false, failClosedOnVerifierError: false },
  { method: 'POST', pathPattern: '/api/contract-check', classification: 'app_check_protected_public', requiresUserAuth: false, requiresAdminAuth: false, requiresAppCheckToken: true, requiresLimitedUseToken: true, failClosedOnVerifierError: true },
  { method: 'POST', pathPattern: '/api/buyer-alerts', classification: 'authenticated_user_and_app_check', requiresUserAuth: true, requiresAdminAuth: false, requiresAppCheckToken: true, requiresLimitedUseToken: false, failClosedOnVerifierError: true },
  { method: 'POST', pathPattern: '/api/sponsors/reserve', classification: 'authenticated_user_and_limited_use_app_check', requiresUserAuth: true, requiresAdminAuth: false, requiresAppCheckToken: true, requiresLimitedUseToken: true, failClosedOnVerifierError: true },
  { method: 'POST', pathPattern: '/api/object-storage/upload-session', classification: 'authenticated_user_and_app_check', requiresUserAuth: true, requiresAdminAuth: false, requiresAppCheckToken: true, requiresLimitedUseToken: false, failClosedOnVerifierError: true },
  { method: 'POST', pathPattern: '/api/object-storage/upload-session/:id/commit', classification: 'authenticated_user_and_limited_use_app_check', requiresUserAuth: true, requiresAdminAuth: false, requiresAppCheckToken: true, requiresLimitedUseToken: true, failClosedOnVerifierError: true },
  { method: 'POST', pathPattern: '/api/admin/backup/export', classification: 'admin_and_limited_use_app_check', requiresUserAuth: true, requiresAdminAuth: true, requiresAppCheckToken: true, requiresLimitedUseToken: true, failClosedOnVerifierError: true },
  { method: 'POST', pathPattern: '/api/admin/backup/restore', classification: 'admin_and_limited_use_app_check', requiresUserAuth: true, requiresAdminAuth: true, requiresAppCheckToken: true, requiresLimitedUseToken: true, failClosedOnVerifierError: true },
  { method: 'POST', pathPattern: '/api/admin/runtime-env', classification: 'admin_and_limited_use_app_check', requiresUserAuth: true, requiresAdminAuth: true, requiresAppCheckToken: true, requiresLimitedUseToken: true, failClosedOnVerifierError: true },
] as const;
export function resolveRouteAppCheckPolicy(method: string, pathname: string): RouteAppCheckPolicyEntry {
  const cleanMethod = method.toUpperCase() as 'GET' | 'POST' | 'DELETE';
  const cleanPath = (pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';
  const exact = APP_CHECK_ROUTE_POLICY_REGISTRY.find((r) => r.method === cleanMethod && r.pathPattern === cleanPath);
  if (exact) return exact;
  if (/^\/api\/object-storage\/upload-session\/[^/]+\/commit$/.test(cleanPath)) {
    return APP_CHECK_ROUTE_POLICY_REGISTRY.find((r) => r.pathPattern === '/api/object-storage/upload-session/:id/commit')!;
  }
  if (cleanPath.startsWith('/api/admin/')) {
    return { method: cleanMethod, pathPattern: cleanPath, classification: 'admin_and_limited_use_app_check', requiresUserAuth: true, requiresAdminAuth: true, requiresAppCheckToken: true, requiresLimitedUseToken: true, failClosedOnVerifierError: true };
  }
  if (cleanPath.startsWith('/api/object-storage/upload')) {
    return { method: cleanMethod, pathPattern: cleanPath, classification: 'authenticated_user_and_app_check', requiresUserAuth: true, requiresAdminAuth: false, requiresAppCheckToken: true, requiresLimitedUseToken: false, failClosedOnVerifierError: true };
  }
  return { method: cleanMethod, pathPattern: cleanPath, classification: 'public_read_only', requiresUserAuth: false, requiresAdminAuth: false, requiresAppCheckToken: false, requiresLimitedUseToken: false, failClosedOnVerifierError: false };
}
export async function buildProtectedApiRequestHeaders(params: {
  method: string;
  pathname: string;
  bearerIdToken?: string | null;
  getAppCheckToken: (opts?: { limitedUse?: boolean }) => Promise<string | null>;
}) {
  const policy = resolveRouteAppCheckPolicy(params.method, params.pathname);
  const headers: Record<string, string> = {};
  if (params.bearerIdToken && params.bearerIdToken.trim()) {
    headers['Authorization'] = `Bearer ${params.bearerIdToken.trim()}`;
  }
  let usedLimitedUseToken = false;
  if (policy.requiresAppCheckToken) {
    const token = await params.getAppCheckToken({ limitedUse: policy.requiresLimitedUseToken });
    if (token && token.trim()) {
      headers['X-Firebase-AppCheck'] = token.trim();
      usedLimitedUseToken = policy.requiresLimitedUseToken;
    }
  }
  return { headers, usedLimitedUseToken, policy };
}
const consumedLimitedUseTokenDigests = new Set<string>();
const observabilityStats = {
  totalEvaluated: 0,
  verifiedCount: 0,
  byFailureReason: {} as Record<string, number>,
};
export function resetAppCheckSecurityStateForTests(): void {
  consumedLimitedUseTokenDigests.clear();
  observabilityStats.totalEvaluated = 0;
  observabilityStats.verifiedCount = 0;
  for (const k of Object.keys(observabilityStats.byFailureReason)) {
    delete observabilityStats.byFailureReason[k];
  }
}
export function recordAppCheckVerificationDiagnostic(reason: string): void {
  observabilityStats.totalEvaluated += 1;
  if (reason === 'OK') {
    observabilityStats.verifiedCount += 1;
  } else {
    const safeKey = String(reason || 'UNKNOWN').slice(0, 64);
    if (safeKey in observabilityStats.byFailureReason || Object.keys(observabilityStats.byFailureReason).length < 64) {
      observabilityStats.byFailureReason[safeKey] = (observabilityStats.byFailureReason[safeKey] ?? 0) + 1;
    }
  }
}
export function getAppCheckObservabilitySummary() {
  return {
    totalEvaluated: observabilityStats.totalEvaluated,
    verifiedCount: observabilityStats.verifiedCount,
    byFailureReason: { ...observabilityStats.byFailureReason },
  };
}
export async function verifyAndEnforceAppCheckAndAuthSeparation(params: {
  method: string;
  pathname: string;
  headers: Record<string, string | string[] | undefined>;
  enforcementMode: 'disabled' | 'monitor' | 'enforced';
  expectedProjectId?: string;
  expectedAppId?: string;
  authContext?: {
    authenticated: boolean;
    uid: string | null;
    email: string | null;
    emailVerified: boolean;
    isAdmin: boolean;
  };
  adminVerifier?: (
    token: string,
    opts?: { consume?: boolean },
  ) => Promise<{
    appId: string;
    projectNumber?: string;
    projectId?: string;
    exp: number;
    iat: number;
    alreadyConsumed?: boolean;
  }>;
}) {
  const policy = resolveRouteAppCheckPolicy(params.method, params.pathname);
  const expectedProject = params.expectedProjectId ?? AUTHORITATIVE_FIREBASE_PROJECT_ID;
  const expectedApp = params.expectedAppId ?? AUTHORITATIVE_FIREBASE_WEB_APP_ID;
  const auth = params.authContext ?? { authenticated: false, uid: null, email: null, emailVerified: false, isAdmin: false };
  const isolatedContext = {
    authIdentity: {
      authenticated: Boolean(auth.authenticated && auth.uid),
      uid: auth.authenticated ? auth.uid : null,
      email: auth.authenticated ? auth.email : null,
      emailVerified: Boolean(auth.authenticated && auth.emailVerified),
    },
    appCheckClaims: {
      verified: false,
      appId: null as string | null,
      projectId: null as string | null,
      consumedLimitedUse: false,
    },
    authorizationPermissions: {
      isAdmin: Boolean(auth.authenticated && auth.isAdmin),
    },
  };
  if (policy.requiresAppCheckToken && params.enforcementMode !== 'disabled') {
    const rawHeader = params.headers['x-firebase-appcheck'] ?? params.headers['X-Firebase-AppCheck'];
    if (Array.isArray(rawHeader) && rawHeader.length > 1) {
      recordAppCheckVerificationDiagnostic('APP_CHECK_TOKEN_MALFORMED');
      if (params.enforcementMode === 'enforced') return { allowed: false, httpStatus: 401, errorCode: 'APP_CHECK_TOKEN_MALFORMED', isolatedContext };
    }
    const token = typeof rawHeader === 'string' ? rawHeader.trim() : Array.isArray(rawHeader) && typeof rawHeader[0] === 'string' ? rawHeader[0].trim() : '';
    if (!token) {
      recordAppCheckVerificationDiagnostic('APP_CHECK_TOKEN_MISSING');
      if (params.enforcementMode === 'enforced') {
        return { allowed: false, httpStatus: 401, errorCode: 'APP_CHECK_TOKEN_MISSING', isolatedContext };
      }
    } else if (token.split('.').length !== 3 || token.length < 15 || token.length > 8192 || /[\r\n\u0000,\s]/.test(token)) {
      recordAppCheckVerificationDiagnostic('APP_CHECK_TOKEN_MALFORMED');
      if (params.enforcementMode === 'enforced') {
        return { allowed: false, httpStatus: 401, errorCode: 'APP_CHECK_TOKEN_MALFORMED', isolatedContext };
      }
    } else if (params.adminVerifier) {
      try {
        const claims = await params.adminVerifier(token, { consume: policy.requiresLimitedUseToken });
        const nowSec = Math.floor(Date.now() / 1000);
        if (!Number.isFinite(claims.exp) || claims.exp <= nowSec) {
          recordAppCheckVerificationDiagnostic('APP_CHECK_TOKEN_EXPIRED');
          return { allowed: false, httpStatus: 401, errorCode: 'APP_CHECK_TOKEN_EXPIRED', isolatedContext };
        }
        if (claims.projectId && claims.projectId !== expectedProject) {
          recordAppCheckVerificationDiagnostic('APP_CHECK_PROJECT_MISMATCH');
          return { allowed: false, httpStatus: 403, errorCode: 'APP_CHECK_PROJECT_MISMATCH', isolatedContext };
        }
        if (!constantTimeSecretMatch(claims.appId, expectedApp)) {
          recordAppCheckVerificationDiagnostic('APP_CHECK_APP_ID_MISMATCH');
          return { allowed: false, httpStatus: 403, errorCode: 'APP_CHECK_APP_ID_MISMATCH', isolatedContext };
        }
        if (policy.requiresLimitedUseToken) {
          const digest = crypto.createHash('sha256').update(token).digest('hex');
          if (claims.alreadyConsumed || consumedLimitedUseTokenDigests.has(digest)) {
            recordAppCheckVerificationDiagnostic('APP_CHECK_TOKEN_REPLAYED');
            return { allowed: false, httpStatus: 403, errorCode: 'APP_CHECK_TOKEN_REPLAYED', isolatedContext };
          }
          if (consumedLimitedUseTokenDigests.size >= 5000) {
            const oldest = consumedLimitedUseTokenDigests.values().next().value;
            if (oldest) consumedLimitedUseTokenDigests.delete(oldest);
          }
          consumedLimitedUseTokenDigests.add(digest);
        }
        isolatedContext.appCheckClaims = {
          verified: true, appId: claims.appId, projectId: claims.projectId ?? expectedProject, consumedLimitedUse: policy.requiresLimitedUseToken,
        };
        recordAppCheckVerificationDiagnostic('OK');
      } catch {
        recordAppCheckVerificationDiagnostic('APP_CHECK_VERIFIER_UNAVAILABLE_FAIL_CLOSED');
        if (policy.failClosedOnVerifierError || params.enforcementMode === 'enforced') {
          return {
            allowed: false,
            httpStatus: 503,
            errorCode: 'APP_CHECK_VERIFIER_UNAVAILABLE_FAIL_CLOSED',
            isolatedContext,
          };
        }
      }
    }
  }
  if (policy.requiresUserAuth && !isolatedContext.authIdentity.authenticated) {
    return {
      allowed: false,
      httpStatus: 401,
      errorCode: 'AUTH_REQUIRED_DESPITE_VALID_APP_CHECK',
      isolatedContext,
    };
  }
  if (policy.requiresAdminAuth && !isolatedContext.authorizationPermissions.isAdmin) {
    return {
      allowed: false,
      httpStatus: 403, errorCode: 'ADMIN_ROLE_REQUIRED_DESPITE_VALID_APP_CHECK', isolatedContext, }; } return { allowed: true, httpStatus: 200, errorCode: 'OK', isolatedContext }; }
export function evaluateStagedAppCheckRolloutReadiness(params: {
  totalRequestsSampled: number; verifiedAppCheckCount: number; missingOrInvalidCount: number; outdatedClientCount: number; debugTokenDetectedInProd: boolean;
  areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; referenceValuationMillionToman?: number;
}) {
  const ratio = params.totalRequestsSampled > 0 ? params.verifiedAppCheckCount / params.totalRequestsSampled : 0;
  const readyForStrictEnforcement = !params.debugTokenDetectedInProd && params.totalRequestsSampled >= 100 && ratio >= 0.98 && params.outdatedClientCount === 0;
  return {
    verifiedRatio: Number(ratio.toFixed(4)), readyForStrictEnforcement, recommendedMode: readyForStrictEnforcement ? 'enforced' : 'monitor',
    displayAreaUnitLabel: formatAreaUnitLabel(params.areaUnit ?? 'sqm'),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(params.referenceValuationMillionToman ?? 0, params.intlCurrency ?? 'IRT'),
  };
}
export { requireAppCheckToken, createRequireAppCheckTokenMiddleware } from './appCheckServerMiddleware';