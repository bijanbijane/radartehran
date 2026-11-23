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
export function createAppCheckAwareFetch(
  originalFetch: typeof fetch,
  appOrigin: string,
  getTokenValue: () => Promise<string | null>,
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
    if (!isSameOriginApi || request.headers.has('x-firebase-appcheck')) {
      return originalFetch(request);
    }

    let token: string | null = null;
    try {
      token = (await getTokenValue())?.trim() || null;
    } catch {
      token = null;
    }
    if (!token) {
      // Backend App Check enforcement remains authoritative and fails closed.
      return originalFetch(request);
    }

    const headers = new Headers(request.headers);
    headers.set('X-Firebase-AppCheck', token);
    return originalFetch(new Request(request, { headers }));
  };
}

export function installClientAppCheckFetchInterceptor(app: FirebaseApp): boolean {
  if (typeof window === 'undefined' || !app || typeof app !== 'object') return false;
  if (fetchInterceptorInstalled.has(window)) return true;
  const instance = initializedAppChecks.get(app as unknown as object);
  if (!instance) return false;

  const originalFetch = window.fetch.bind(window);
  window.fetch = createAppCheckAwareFetch(
    originalFetch,
    window.location.origin,
    async () => {
      const result = await getToken(instance, false);
      return result?.token || null;
    },
  );
  fetchInterceptorInstalled.add(window);
  return true;
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
