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
