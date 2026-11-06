/**
 * @file src/utils/appCheck.ts
 * @description Client-side Firebase App Check lifecycle & Server-side `requireAppCheckToken` Express middleware.
 */
import crypto from 'node:crypto'; import type { Request, Response, NextFunction, RequestHandler } from 'express'; import type { FirebaseApp } from 'firebase/app'; import { initializeAppCheck as sdkInitializeAppCheck, ReCaptchaEnterpriseProvider as SdkReCaptchaEnterpriseProvider, ReCaptchaV3Provider as SdkReCaptchaV3Provider, getToken as sdkGetToken, getLimitedUseToken as sdkGetLimitedUseToken, type AppCheck, type AppCheckOptions, type CustomProvider, } from 'firebase/app-check';
import { getAppCheck as getAdminAppCheck } from 'firebase-admin/app-check'; import { AUTHORITATIVE_FIREBASE_WEB_APP_ID, resolveAppCheckEnvironmentPolicy, recordAppCheckVerificationDiagnostic } from './firebaseAppCheckSecurity901To920';
import { EXPECTED_FIREBASE_PROJECT_ID, EXPECTED_FIRESTORE_DATABASE_ID, extractSingleSecurityHeader, getFirebaseAdminApp, constantTimeSecretMatch } from './serverAdminAndTelegramSecurity';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface VerifiedAppCheckContext {
  verified: true; appId: string; projectId: string; token: string; alreadyConsumed: boolean; sub?: string; iss?: string; aud?: string | string[];
  exp?: number; iat?: number; verifiedAtIso: string; }
declare global { namespace Express { interface Request { appCheck?: VerifiedAppCheckContext; } } }
export interface AppCheckSdkBindings { initializeAppCheck: (app: FirebaseApp, options: AppCheckOptions) => AppCheck; createEnterpriseProvider: (siteKey: string) => AppCheckOptions['provider']; createV3Provider: (siteKey: string) => AppCheckOptions['provider'];
  getToken: (appCheckInstance: AppCheck, forceRefresh?: boolean) => Promise<{ token: string }>;
  getLimitedUseToken: (appCheckInstance: AppCheck) => Promise<{ token: string }>;
}
const defaultSdkBindings: AppCheckSdkBindings = {
  initializeAppCheck: (app, options) => sdkInitializeAppCheck(app, options),
  createEnterpriseProvider: (siteKey) => new SdkReCaptchaEnterpriseProvider(siteKey),
  createV3Provider: (siteKey) => new SdkReCaptchaV3Provider(siteKey),
  getToken: (instance, forceRefresh) => sdkGetToken(instance, forceRefresh),
  getLimitedUseToken: (instance) => sdkGetLimitedUseToken(instance),
};
export interface ClientAppCheckInitOptions {
  siteKey?: string; providerType?: 'recaptcha_enterprise' | 'recaptcha_v3'; isTokenAutoRefreshEnabled?: boolean;
  isProduction?: boolean; debugToken?: string; isBrowserRuntime?: boolean; sdk?: Partial<AppCheckSdkBindings>;
}
export interface AppCheckLifecycleRecord {
  appCheckInitialized: boolean; providerType: 'recaptcha_enterprise' | 'recaptcha_v3' | 'disabled';
  siteKeyUsed: string | null; isTokenAutoRefreshEnabled: boolean; callOrder: string[];
  displayAreaUnitLabel?: string; referenceValuationIntlText?: string;
}
const initializedApps = new WeakMap<object, AppCheck>();
let activeLifecycleRecord: AppCheckLifecycleRecord = {
  appCheckInitialized: false, providerType: 'disabled', siteKeyUsed: null, isTokenAutoRefreshEnabled: true, callOrder: [],
};
export function resetAppCheckLifecycleForTests(): void {
  activeLifecycleRecord = { appCheckInitialized: false, providerType: 'disabled', siteKeyUsed: null, isTokenAutoRefreshEnabled: true, callOrder: [] };
}
export function getAppCheckLifecycleState(areaUnit: AreaUnit = 'sqm', intlCurrency: IntlCurrencyCode = 'IRT'): AppCheckLifecycleRecord {
  return {
    ...activeLifecycleRecord,
    callOrder: [...activeLifecycleRecord.callOrder],
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(10_000, intlCurrency),
  };
}
export function initializeFirebaseAppCheck(
  app: FirebaseApp,
  options: ClientAppCheckInitOptions = {},
): AppCheck | null {
  if (!app || typeof app !== 'object') {
    throw new Error('APP_CHECK_INIT_ERROR: A valid FirebaseApp instance is required.');
  }
  const existing = initializedApps.get(app as unknown as object);
  if (existing) return existing;
  const isBrowser = options.isBrowserRuntime ?? typeof window !== 'undefined';
  if (!isBrowser) return null;
  const isProd = Boolean(options.isProduction);
  if (isProd && options.debugToken) {
    throw new Error('APP_CHECK_SECURITY_VIOLATION: Debug tokens are strictly forbidden in production builds.');
  }
  const rawSiteKey = (options.siteKey ?? '').trim();
  if (
    !rawSiteKey ||
    rawSiteKey.length < 10 ||
    /^(MY_|YOUR_|PLACEHOLDER|AIza)/i.test(rawSiteKey)
  ) {
    return null;
  }
  const providerKind =
    options.providerType === 'recaptcha_v3' ? 'recaptcha_v3' : 'recaptcha_enterprise';
  const policy = resolveAppCheckEnvironmentPolicy({
    nodeEnv: isProd ? 'production' : 'development',
    isProductionBuild: isProd,
    viteRecaptchaEnterpriseSiteKey: providerKind === 'recaptcha_enterprise' ? rawSiteKey : undefined,
    viteRecaptchaV3SiteKey: providerKind === 'recaptcha_v3' ? rawSiteKey : undefined,
  });
  if (!policy.siteKey) {
    return null;
  }
  const sdk: AppCheckSdkBindings = { ...defaultSdkBindings, ...options.sdk };
  const provider: CustomProvider | AppCheckOptions['provider'] =
    providerKind === 'recaptcha_v3'
      ? sdk.createV3Provider(policy.siteKey)
      : sdk.createEnterpriseProvider(policy.siteKey);
  const isTokenAutoRefreshEnabled = options.isTokenAutoRefreshEnabled ?? true;
  activeLifecycleRecord.callOrder.push('appCheck');
  const instance = sdk.initializeAppCheck(app, {
    provider,
    isTokenAutoRefreshEnabled,
  });
  initializedApps.set(app as unknown as object, instance);
  activeLifecycleRecord.appCheckInitialized = true;
  activeLifecycleRecord.providerType = providerKind;
  activeLifecycleRecord.siteKeyUsed = policy.siteKey;
  activeLifecycleRecord.isTokenAutoRefreshEnabled = isTokenAutoRefreshEnabled;
  return instance;
}
export function initializeAppServicesWithAppCheck<TFirestore = unknown, TStorage = unknown>(params: {
  app: FirebaseApp;
  appCheckOptions: ClientAppCheckInitOptions;
  initFirestore: (app: FirebaseApp, databaseId: string) => TFirestore;
  initStorage?: (app: FirebaseApp) => TStorage;
  firestoreDatabaseId?: string;
  requireAppCheckBeforeServices?: boolean;
}): {
  appCheck: AppCheck | null;
  firestore: TFirestore;
  storage: TStorage | null;
  callOrder: string[];
} {
  const appCheck = initializeFirebaseAppCheck(params.app, params.appCheckOptions);
  if (params.requireAppCheckBeforeServices && !appCheck) {
    throw new Error(
      'APP_CHECK_LIFECYCLE_GUARD: App Check must be initialized before Firestore or Storage services can be utilized.',
    );
  }
  const dbId = params.firestoreDatabaseId || EXPECTED_FIRESTORE_DATABASE_ID;
  activeLifecycleRecord.callOrder.push('firestore');
  const firestore = params.initFirestore(params.app, dbId);
  let storage: TStorage | null = null;
  if (params.initStorage) {
    activeLifecycleRecord.callOrder.push('storage');
    storage = params.initStorage(params.app);
  }
  return {
    appCheck,
    firestore,
    storage,
    callOrder: [...activeLifecycleRecord.callOrder],
  };
}
export interface AdminVerifyAppCheckTokenResponse {
  appId: string;
  alreadyConsumed?: boolean;
  token?: {
    sub?: string;
    iss?: string;
    aud?: string | string[];
    exp?: number;
    iat?: number;
    [key: string]: unknown;
  };
}
export interface RequireAppCheckMiddlewareOptions {
  consume?: boolean;
  expectedAppId?: string;
  expectedProjectId?: string;
  env?: Record<string, string | undefined>;
  verifyTokenFn?: (
    token: string,
    options?: { consume?: boolean },
  ) => Promise<AdminVerifyAppCheckTokenResponse>;
}
const consumedMiddlewareTokenHashes = new Set<string>();
export function resetConsumedMiddlewareTokensForTests(): void {
  consumedMiddlewareTokenHashes.clear();
}
export function createRequireAppCheckTokenMiddleware(
  options: RequireAppCheckMiddlewareOptions = {},
): RequestHandler {
  return async function requireAppCheckTokenMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const env = options.env ?? process.env;
    const expectedAppId = options.expectedAppId ?? AUTHORITATIVE_FIREBASE_WEB_APP_ID;
    const expectedProjectId = options.expectedProjectId ?? EXPECTED_FIREBASE_PROJECT_ID;
    const failClosed = (status: 400 | 401 | 403 | 503, code: string, message: string): void => {
      recordAppCheckVerificationDiagnostic(code);
      res.setHeader('Cache-Control', 'no-store');
      res.status(status).json({
        status: 'error',
        code,
        message,
      });
    };
    if (env.NODE_ENV === 'production') {
      const debugHeader = extractSingleSecurityHeader(
        req.headers as Record<string, string | string[] | undefined>,
        'x-firebase-appcheck-debug',
      );
      if (!debugHeader.ok || debugHeader.value) {
        failClosed(403, 'APP_CHECK_DEBUG_FORBIDDEN_IN_PROD', 'استفاده از توکن دیباگ App Check در محیط عملیاتی مسدود است.');
        return;
      }
    }
    const queryObj = (req.query ?? {}) as Record<string, unknown>;
    const bodyObj = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    if (
      queryObj.appCheckToken !== undefined ||
      queryObj['x-firebase-appcheck'] !== undefined ||
      bodyObj.appCheckToken !== undefined
    ) {
      failClosed(400, 'APP_CHECK_TOKEN_IN_URL_OR_BODY_FORBIDDEN', 'توکن App Check فقط باید در هدر X-Firebase-AppCheck ارسال شود.');
      return;
    }
    const headerExtracted = extractSingleSecurityHeader(
      req.headers as Record<string, string | string[] | undefined>,
      'x-firebase-appcheck',
    );
    if (!headerExtracted.ok) {
      failClosed(401, 'AMBIGUOUS_APP_CHECK_HEADER', 'هدر X-Firebase-AppCheck تکراری یا نامعتبر است.');
      return;
    }
    const rawToken = (headerExtracted.value ?? '').trim();
    if (!rawToken) {
      failClosed(401, 'APP_CHECK_TOKEN_MISSING', 'هدر امنیتی X-Firebase-AppCheck ارسال نشده است.');
      return;
    }
    const jwtParts = rawToken.split('.');
    if (
      jwtParts.length !== 3 ||
      jwtParts.some((part) => part.length === 0) ||
      rawToken.length < 20 ||
      rawToken.length > 8192 ||
      /\s/.test(rawToken)
    ) {
      failClosed(401, 'APP_CHECK_TOKEN_MALFORMED', 'ساختار توکن X-Firebase-AppCheck نامعتبر است.');
      return;
    }
    try {
      const shouldConsume = Boolean(options.consume);
      const verificationResult: AdminVerifyAppCheckTokenResponse = options.verifyTokenFn
        ? await options.verifyTokenFn(rawToken, shouldConsume ? { consume: true } : undefined)
        : await getAdminAppCheck(getFirebaseAdminApp(expectedProjectId, env)).verifyToken(
            rawToken,
            shouldConsume ? { consume: true } : undefined,
          );
      if (!verificationResult || typeof verificationResult.appId !== 'string' || !verificationResult.appId.trim()) {
        failClosed(403, 'INVALID_APP_CHECK_CLAIMS', 'پاسخ اعتبارسنجی App Check فاقد شناسه برنامه معتبر است.');
        return;
      }
      if (!constantTimeSecretMatch(verificationResult.appId, expectedAppId)) {
        failClosed(403, 'APP_CHECK_APP_ID_MISMATCH', 'شناسه برنامه در توکن App Check با اپلیکیشن رسمی مطابقت ندارد.');
        return;
      }
      const decodedToken = verificationResult.token ?? {};
      const nowSec = Math.floor(Date.now() / 1000);
      if (typeof decodedToken.exp === 'number' && (!Number.isFinite(decodedToken.exp) || decodedToken.exp <= nowSec)) {
        failClosed(401, 'APP_CHECK_TOKEN_EXPIRED', 'مهلت اعتبار توکن X-Firebase-AppCheck به پایان رسیده است.');
        return;
      }
      if (typeof decodedToken.iat === 'number' && (!Number.isFinite(decodedToken.iat) || decodedToken.iat > nowSec + 86400 || (typeof decodedToken.exp === 'number' && decodedToken.iat > decodedToken.exp))) {
        failClosed(401, 'APP_CHECK_TOKEN_FUTURE_IAT', 'زمان صدور توکن X-Firebase-AppCheck نامعتبر است.');
        return;
      }
      if (decodedToken.aud !== undefined) {
        const audList = Array.isArray(decodedToken.aud) ? decodedToken.aud : [decodedToken.aud];
        const matchesProject = audList.some(
          (entry) => typeof entry === 'string' && (entry === expectedProjectId || entry === `projects/${expectedProjectId}`),
        );
        if (!matchesProject) {
          failClosed(403, 'APP_CHECK_PROJECT_MISMATCH', 'پروژه هدف توکن App Check معتبر نیست.');
          return;
        }
      }
      if (shouldConsume) {
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        if (verificationResult.alreadyConsumed || consumedMiddlewareTokenHashes.has(tokenHash)) {
          failClosed(403, 'APP_CHECK_TOKEN_REPLAYED', 'این توکن یک‌بارمصرف قبلاً استفاده شده است.');
          return;
        }
        if (consumedMiddlewareTokenHashes.size >= 5000) {
          const oldest = consumedMiddlewareTokenHashes.values().next().value;
          if (oldest) consumedMiddlewareTokenHashes.delete(oldest);
        }
        consumedMiddlewareTokenHashes.add(tokenHash);
      }
      req.appCheck = {
        verified: true,
        appId: verificationResult.appId,
        projectId: expectedProjectId,
        token: rawToken,
        alreadyConsumed: Boolean(verificationResult.alreadyConsumed),
        sub: typeof decodedToken.sub === 'string' ? decodedToken.sub : verificationResult.appId,
        iss: typeof decodedToken.iss === 'string' ? decodedToken.iss : undefined,
        aud: decodedToken.aud,
        exp: typeof decodedToken.exp === 'number' ? decodedToken.exp : undefined, iat: typeof decodedToken.iat === 'number' ? decodedToken.iat : undefined, verifiedAtIso: new Date().toISOString(), }; recordAppCheckVerificationDiagnostic('OK'); next(); } catch { failClosed(403, 'APP_CHECK_VERIFICATION_FAILED', 'اعتبارسنجی توکن X-Firebase-AppCheck ناموفق بود (Fail-Closed).'); } }; }
/**
 * Default centralized Express middleware function `requireAppCheckToken` that extracts
 * `X-Firebase-AppCheck`, validates it with Firebase Admin SDK, attaches claims to `req.appCheck`,
 * and fails closed on any verification failure.
 */
export const requireAppCheckToken: RequestHandler = createRequireAppCheckTokenMiddleware();