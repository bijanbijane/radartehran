/**
 * @file src/utils/pwaOfflineSupport.ts
 * @description Pure utility module for PWA manifest validation, Service Worker
 * registration (`/sw.js`), essential UI asset discovery/warm-caching, and request
 * caching strategy classification for offline neighborhood exploration.
 */

import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';

export type ServiceWorkerCachingStrategy =
  | 'BypassPrivateOrMutation'
  | 'NetworkFirstShell'
  | 'NetworkFirstMarketData'
  | 'StaleWhileRevalidateMapTile'
  | 'NetworkOnlyExternalMapTile'
  | 'StaleWhileRevalidateUiAsset'
  | 'NetworkOnlyOther';

export interface ManifestIconEntry {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export interface WebAppManifestConfig {
  id?: string;
  name?: string;
  short_name?: string;
  description?: string;
  dir?: string;
  lang?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  display_override?: string[];
  orientation?: string;
  background_color?: string;
  theme_color?: string;
  prefer_related_applications?: boolean;
  offline_enabled?: boolean;
  categories?: string[];
  icons?: ManifestIconEntry[];
  shortcuts?: Array<{
    name: string;
    short_name?: string;
    description?: string;
    url: string;
  }>;
}

export interface ManifestAuditResult {
  valid: boolean;
  issues: string[];
  has192Icon: boolean;
  has512AnyIcon: boolean;
  hasMaskableIcon: boolean;
  hasOfflineShortcuts: boolean;
  displayAreaUnitLabel: string;
  referenceValuationIntlText: string;
}

/**
 * Validates that a parsed `manifest.json` object satisfies all PWA installability
 * and offline exploration requirements.
 */
export function validateManifestOfflineConfig(
  manifest: WebAppManifestConfig,
  options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; referenceValuationMillionToman?: number }
): ManifestAuditResult {
  const issues: string[] = [];

  if (manifest.id !== '/') {
    issues.push('MANIFEST_ID_MUST_BE_ROOT');
  }
  if (!manifest.name || manifest.name.trim().length < 3) {
    issues.push('MANIFEST_NAME_MISSING');
  }
  if (!manifest.short_name || manifest.short_name.trim().length === 0) {
    issues.push('MANIFEST_SHORT_NAME_MISSING');
  } else if ([...manifest.short_name.trim()].length > 12) {
    issues.push('MANIFEST_SHORT_NAME_EXCEEDS_12_CHARS');
  }
  if (manifest.start_url !== '/') {
    issues.push('MANIFEST_START_URL_MUST_BE_ROOT');
  }
  if (manifest.scope !== '/') {
    issues.push('MANIFEST_SCOPE_MUST_BE_ROOT');
  }
  if (manifest.display !== 'standalone' && manifest.display !== 'fullscreen') {
    issues.push('MANIFEST_DISPLAY_NOT_STANDALONE');
  }
  if (!manifest.theme_color || !manifest.background_color) {
    issues.push('MANIFEST_COLORS_MISSING');
  }
  if (manifest.offline_enabled !== true) {
    issues.push('MANIFEST_OFFLINE_ENABLED_FLAG_MISSING');
  }

  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const has192Icon = icons.some(
    (icon) => icon.sizes?.includes('192x192') && (!icon.purpose || icon.purpose === 'any')
  );
  const has512AnyIcon = icons.some(
    (icon) => icon.sizes?.includes('512x512') && (!icon.purpose || icon.purpose === 'any')
  );
  const hasMaskableIcon = icons.some((icon) => icon.purpose === 'maskable');
  const hasCombinedAnyMaskable = icons.some(
    (icon) => typeof icon.purpose === 'string' && icon.purpose.includes('any') && icon.purpose.includes('maskable')
  );

  if (!has192Icon) issues.push('MISSING_192X192_ANY_ICON');
  if (!has512AnyIcon) issues.push('MISSING_512X512_ANY_ICON');
  if (!hasMaskableIcon) issues.push('MISSING_MASKABLE_ICON');
  if (hasCombinedAnyMaskable) issues.push('COMBINED_ANY_MASKABLE_PURPOSE_FORBIDDEN');

  const hasOfflineShortcuts = Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2;
  if (!hasOfflineShortcuts) {
    issues.push('MISSING_OFFLINE_EXPLORATION_SHORTCUTS');
  }

  return {
    valid: issues.length === 0,
    issues,
    has192Icon,
    has512AnyIcon,
    hasMaskableIcon,
    hasOfflineShortcuts,
    displayAreaUnitLabel: formatAreaUnitLabel(options?.areaUnit ?? 'sqm'),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(options?.referenceValuationMillionToman ?? 0, options?.intlCurrency ?? 'IRT'),
  };
}

/**
 * Deterministically classifies how the Service Worker handles any HTTP request,
 * mirroring the runtime rules in `/public/sw.js`.
 */
export function classifyServiceWorkerRequestStrategy(input: {
  url: string;
  method?: string;
  mode?: string;
  acceptHeader?: string;
  hasAuthHeader?: boolean;
  appOrigin?: string;
}): ServiceWorkerCachingStrategy {
  const method = (input.method || 'GET').toUpperCase();
  if (method !== 'GET' || input.hasAuthHeader) {
    return 'BypassPrivateOrMutation';
  }

  const appOrigin = input.appOrigin || 'https://tehranradar.ir';
  let parsed: URL;
  try {
    parsed = new URL(input.url, appOrigin);
  } catch {
    return 'NetworkOnlyOther';
  }

  const pathname = parsed.pathname || '/';
  const host = (parsed.hostname || '').toLowerCase();

  if (
    pathname.startsWith('/api/admin/') ||
    pathname === '/api/system-health' ||
    pathname.startsWith('/api/object-storage/') ||
    pathname.startsWith('/api/account/') ||
    pathname.startsWith('/api/my-bargains') ||
    pathname.startsWith('/api/buyer-alerts') ||
    pathname.startsWith('/api/data-corrections') ||
    pathname.startsWith('/api/sponsors/') ||
    pathname.startsWith('/api/bargains/') ||
    pathname.startsWith('/api/contract-check') ||
    pathname.startsWith('/api/send-telegram') ||
    pathname.startsWith('/api/telegram-') ||
    pathname.startsWith('/api/v1/mcp') ||
    pathname.startsWith('/api/mcp') ||
    pathname.startsWith('/api/v1/rmep')
  ) {
    return 'BypassPrivateOrMutation';
  }

  if (input.mode === 'navigate' || (input.acceptHeader || '').includes('text/html')) {
    return 'NetworkFirstShell';
  }

  if (
    parsed.origin === appOrigin &&
    (pathname === '/api/market-pulse' || pathname === '/api/air-quality') &&
    parsed.searchParams.get('refresh') !== '1'
  ) {
    return 'NetworkFirstMarketData';
  }

  if (pathname.startsWith('/api/osm-tile/')) {
    return parsed.origin === appOrigin ? 'StaleWhileRevalidateMapTile' : 'NetworkOnlyExternalMapTile';
  }

  const isExternalMapTileHost =
    host === 'tile.openstreetmap.org' ||
    host.endsWith('.tile.openstreetmap.org') ||
    host === 'basemaps.cartocdn.com' ||
    host.endsWith('.basemaps.cartocdn.com') ||
    host === 'arcgisonline.com' ||
    host.endsWith('.arcgisonline.com');
  if (isExternalMapTileHost) {
    return 'NetworkOnlyExternalMapTile';
  }

  if (host === 'cdn.jsdelivr.net' || host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') {
    return 'StaleWhileRevalidateUiAsset';
  }

  if (
    parsed.origin === appOrigin &&
    (pathname.startsWith('/assets/') ||
      pathname.startsWith('/src/') ||
      pathname.startsWith('/node_modules/') ||
      pathname === '/manifest.json' ||
      pathname === '/icon.svg' ||
      pathname === '/apple-touch-icon.png' ||
      pathname.startsWith('/pwa-') ||
      /\.(js|mjs|ts|tsx|css|woff2?|ttf|otf|svg|png|jpe?g|webp|avif|ico)$/i.test(pathname))
  ) {
    return 'StaleWhileRevalidateUiAsset';
  }

  return 'NetworkOnlyOther';
}

/**
 * Collects active `<script>` and `<link rel="stylesheet">` URLs from the current document
 * so the Service Worker can proactively warm-cache all hashed Vite bundles.
 */
export function collectDocumentEssentialAssetUrls(doc?: Document | null): string[] {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : null);
  if (!targetDoc) return [];

  const urls = new Set<string>(['/', '/index.html', '/manifest.json', '/icon.svg']);
  const isSafeAssetAttr = (val: string | null): val is string =>
    Boolean(val && !/^(?:data:|javascript:|vbscript:|blob:|\/\/|\/api\/)/i.test(val.trim()));

  for (const script of Array.from(targetDoc.querySelectorAll('script[src]'))) {
    const src = script.getAttribute('src');
    if (isSafeAssetAttr(src)) urls.add(src.trim());
  }

  for (const link of Array.from(targetDoc.querySelectorAll('link[rel="stylesheet"][href], link[rel="modulepreload"][href]'))) {
    const href = link.getAttribute('href');
    if (isSafeAssetAttr(href)) urls.add(href.trim());
  }

  return Array.from(urls).slice(0, 40);
}

/**
 * Registers `/sw.js` in the browser and warms essential UI bundle URLs once active.
 */
export async function registerRadarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

    const sendWarmAssetsMessage = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const urls = collectDocumentEssentialAssetUrls();
      if (urls.length > 0) {
        worker.postMessage({ type: 'WARM_ASSET_URLS', urls });
      }
    };

    if (registration.active) {
      sendWarmAssetsMessage(registration.active);
    }

    navigator.serviceWorker.ready
      .then((readyReg) => {
        sendWarmAssetsMessage(readyReg.active);
        window.dispatchEvent(new CustomEvent('radar-sw-ready'));
      })
      .catch(() => {});

    return registration;
  } catch {
    return null;
  }
}
