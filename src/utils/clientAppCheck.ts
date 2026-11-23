/**
 * @file src/utils/clientAppCheck.ts
 * @description Browser-safe Firebase App Check initializer. Strictly imports ONLY
 * `firebase/app` and `firebase/app-check` for client Vite bundles.
 */
import type { FirebaseApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  getToken,
  type AppCheck,
} from 'firebase/app-check';
import { formatMillionTomanAsIntlCurrency } from './areaUnit';
export { formatMillionTomanAsIntlCurrency };

const initializedAppChecks = new WeakMap<object, AppCheck>();

export function resolveBrowserAppCheckSiteKey(
  envLike?: Record<string, string | undefined>,
): string | null {
  const metaEnv =
    envLike ??
    (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string | undefined> }).env
      ? (import.meta as { env: Record<string, string | undefined> }).env
      : {});
  const raw = (
    metaEnv.VITE_FIREBASE_APP_CHECK_SITE_KEY ||
    metaEnv.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY ||
    ''
  ).trim();
  if (
    !raw ||
    raw.length < 10 ||
    /^(MY_|YOUR_|PLACEHOLDER|UNDEFINED|NULL|TODO)/i.test(raw)
  ) {
    return null;
  }
  return raw;
}

export function initClientAppCheckIfConfigured(
  app: FirebaseApp,
  envLike?: Record<string, string | undefined>,
): AppCheck | null {
  if (!app || typeof app !== 'object' || typeof window === 'undefined') {
    return null;
  }
  const existing = initializedAppChecks.get(app as unknown as object);
  if (existing) return existing;

  const siteKey = resolveBrowserAppCheckSiteKey(envLike);
  if (!siteKey) return null;

  try {
    const instance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    initializedAppChecks.set(app as unknown as object, instance);
    return instance;
  } catch {
    return null;
  }
}

const fetchInterceptorInstalled = new WeakSet<object>();

/**
 * Attach a Firebase App Check token to every same-origin /api request.
 * Firebase ID tokens remain the responsibility of each authenticated caller.
 * The wrapper never forwards App Check tokens to third-party origins.
 */
export function createFirebaseAuthenticatedApiFetch(
  originalFetch: typeof fetch,
  appOrigin: string,
  getFirebaseIdToken: () => Promise<string | null>,
  getFirebaseAppCheckToken: () => Promise<string | null>,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let request: Request;
    try {
      request = new Request(input, init);
    } catch {
      return originalFetch(input, init);
    }

    const requestUrl = new URL(request.url);
    const isSameOriginApi =
      requestUrl.origin === appOrigin &&
      (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/'));
    if (!isSameOriginApi) return originalFetch(request);

    const needsIdToken = !request.headers.has('authorization');
    const needsAppCheckToken = !request.headers.has('x-firebase-appcheck');
    if (!needsIdToken && !needsAppCheckToken) return originalFetch(request);

    const [idToken, appCheckToken] = await Promise.all([
      needsIdToken ? getFirebaseIdToken().catch(() => null) : Promise.resolve(null),
      needsAppCheckToken ? getFirebaseAppCheckToken().catch(() => null) : Promise.resolve(null),
    ]);

    if (!idToken && !appCheckToken) {
      // The API remains authoritative: protected routes reject missing/invalid tokens.
      return originalFetch(request);
    }

    const headers = new Headers(request.headers);
    if (needsIdToken && idToken?.trim()) {
      headers.set('Authorization', `Bearer ${idToken.trim()}`);
    }
    if (needsAppCheckToken && appCheckToken?.trim()) {
      headers.set('X-Firebase-AppCheck', appCheckToken.trim());
    }
    return originalFetch(new Request(request, { headers }));
  };
}

export function assignFetchSafely(
  target: { fetch?: typeof fetch },
  wrappedFetch: typeof fetch,
): boolean {
  if (!target || typeof target !== 'object') return false;
  const ownDescriptor = Object.getOwnPropertyDescriptor(target, 'fetch');
  const isGetterOnly = Boolean(ownDescriptor && ownDescriptor.get && !ownDescriptor.set);

  if (!isGetterOnly) {
    try {
      target.fetch = wrappedFetch;
      if (target.fetch === wrappedFetch) return true;
    } catch {
      // Fall through to Object.defineProperty when a getter-only accessor exists on target or its prototype.
    }
  }

  if (ownDescriptor && ownDescriptor.configurable === false) {
    return false;
  }

  try {
    Object.defineProperty(target, 'fetch', {
      value: wrappedFetch,
      writable: true,
      enumerable: ownDescriptor?.enumerable ?? true,
      configurable: true,
    });
    return target.fetch === wrappedFetch;
  } catch {
    return false;
  }
}

export function installClientAppCheckFetchInterceptor(
  app: FirebaseApp,
  getFirebaseIdToken: () => Promise<string | null> = async () => null,
  targetWindow: (Pick<Window, 'fetch'> & { location?: { origin?: string } }) | undefined =
    typeof window !== 'undefined' ? window : undefined,
): boolean {
  if (!targetWindow || !app || typeof app !== 'object') return false;
  if (fetchInterceptorInstalled.has(targetWindow)) return true;
  if (typeof targetWindow.fetch !== 'function') return false;

  const instance = initializedAppChecks.get(app as unknown as object);
  const originalFetch = targetWindow.fetch.bind(targetWindow);
  const appOrigin = targetWindow.location?.origin || '';
  const wrappedFetch = createFirebaseAuthenticatedApiFetch(
    originalFetch,
    appOrigin,
    getFirebaseIdToken,
    async () => {
      if (!instance) return null;
      const result = await getToken(instance, false);
      return result?.token || null;
    },
  );

  const installed = assignFetchSafely(targetWindow, wrappedFetch);
  if (installed) {
    fetchInterceptorInstalled.add(targetWindow);
  }
  return installed;
}

export async function getOptionalClientAppCheckHeaders(
  app: FirebaseApp,
): Promise<Record<string, string>> {
  const instance = initializedAppChecks.get(app as unknown as object);
  if (!instance) return {};
  try {
    const res = await getToken(instance, false);
    if (res?.token) {
      return { 'X-Firebase-AppCheck': res.token };
    }
  } catch {
    // App Check token acquisition should degrade gracefully when unconfigured
  }
  return {};
}
