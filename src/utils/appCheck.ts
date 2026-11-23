/**
 * @file src/utils/appCheck.ts
 * @description Client-side Firebase App Check lifecycle & Server-side `requireAppCheckToken` Express middleware.
 */
import type { FirebaseApp } from 'firebase/app'; import { initializeAppCheck as sdkInitializeAppCheck, ReCaptchaEnterpriseProvider as SdkReCaptchaEnterpriseProvider, ReCaptchaV3Provider as SdkReCaptchaV3Provider, getToken as sdkGetToken, getLimitedUseToken as sdkGetLimitedUseToken, type AppCheck, type AppCheckOptions, type CustomProvider, } from 'firebase/app-check';
import { resolveAppCheckEnvironmentPolicy } from './firebaseAppCheckSecurity901To920';
import { EXPECTED_FIRESTORE_DATABASE_ID } from './serverAdminAndTelegramSecurity';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type { VerifiedAppCheckContext, AdminVerifyAppCheckTokenResponse, RequireAppCheckMiddlewareOptions } from './appCheckServerMiddleware';
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
export {
  createRequireAppCheckTokenMiddleware,
  requireAppCheckToken,
  resetConsumedMiddlewareTokensForTests,
} from './appCheckServerMiddleware';