/**
 * @file public/sw.js
 * @description Service Worker for Tehran Housing Radar (رادار محله‌های تهران).
 * Caches essential UI assets (HTML shell, JS/CSS bundles, fonts, icons, Leaflet map assets,
 * and read-only market pulse snapshots) to enable basic neighborhood exploration,
 * filtering, and calculators without an active internet connection. Map tiles are never
 * persisted in Cache API; their providers' HTTP cache directives remain authoritative.
 */

const CACHE_VERSION = 'v4-2026-10';
const APP_SHELL_CACHE = `tehran-radar-shell-${CACHE_VERSION}`;
const UI_ASSETS_CACHE = `tehran-radar-assets-${CACHE_VERSION}`;
const MAP_AND_API_CACHE = `tehran-radar-data-${CACHE_VERSION}`;

const ACTIVE_CACHES = [APP_SHELL_CACHE, UI_ASSETS_CACHE, MAP_AND_API_CACHE];

/**
 * Core app shell URLs pre-cached during Service Worker installation.
 */
const CORE_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
];

/**
 * External UI libraries (Leaflet 1.9.4 & Google Fonts CSS) warmed on best-effort basis.
 */
const OPTIONAL_WARM_URLS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  '/api/market-pulse?city=tehran',
];

/**
 * City-scoped honest offline JSON response for /api/market-pulse or /api/air-quality
 * when no prior cached response exists for the exact requested city (zero Tehran cross-city fallback).
 */
function createOfflineMarketPulseResponse(requestedCity) {
  const nowIso = new Date().toISOString();
  const safeCity = typeof requestedCity === 'string' && requestedCity.trim() ? requestedCity.trim().toLowerCase() : null;
  const payload = {
    status: 'offline_unavailable',
    city: safeCity,
    cacheStatus: 'OFFLINE_CITY_UNCACHED',
    offlineFallback: true,
    lastUpdatedIso: nowIso,
    lastUpdatedTimeFa: 'حالت آفلاین (دادهٔ زندهٔ این شهر هنوز کش نشده است)',
    nextScheduledTimeFa: 'پس از اتصال مجدد به اینترنت',
    airQuality: null,
    marketSummary: null,
    hoodLiveSnapshots: [],
  };
  return new Response(JSON.stringify(payload), {
    status: 503,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Radar-Offline': '1',
    },
  });
}

/**
 * Determines whether a request targets a sensitive/private API that must NEVER be cached.
 */
function isPrivateOrSensitiveRequest(request, url) {
  if (request.method !== 'GET') return true;
  if (
    request.headers.get('authorization') ||
    request.headers.get('Authorization') ||
    request.headers.get('x-admin-token')
  ) {
    return true;
  }
  const pathname = url.pathname || '';
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
    pathname.startsWith('/api/v1/rmep') ||
    pathname.startsWith('/api/v1/saved-searches') ||
    pathname.startsWith('/api/v1/search-history') ||
    pathname.startsWith('/api/v1/personalization/') ||
    pathname.startsWith('/api/search/saved')
  ) {
    return true;
  }
  return false;
}

/**
 * Determines whether a request is for a map tile (local proxy or public OSM/CARTO tile server).
 */
/**
 * Recognizes map tiles for network-only fetch handling and old-cache cleanup.
 * Keep the same-origin OSM proxy in this predicate: proxy responses are still
 * OSM-derived and must not become persistent offline-map tiles in Cache API.
 */
function isMapTileRequest(url) {
  const pathname = url.pathname || '';
  if (pathname.startsWith('/api/osm-tile/')) return true;
  const host = (url.hostname || '').toLowerCase();
  return (
    host === 'tile.openstreetmap.org' ||
    host.endsWith('.tile.openstreetmap.org') ||
    host === 'basemaps.cartocdn.com' ||
    host.endsWith('.basemaps.cartocdn.com') ||
    host === 'arcgisonline.com' ||
    host.endsWith('.arcgisonline.com')
  );
}



/**
 * Determines whether a request is for an essential UI asset (JS/CSS bundle, font, icon, Leaflet CDN, Vite module).
 */
function isEssentialUiAssetRequest(request, url) {
  const pathname = url.pathname || '';
  const host = (url.hostname || '').toLowerCase();

  if (
    host === 'cdn.jsdelivr.net' ||
    host === 'fonts.googleapis.com' ||
    host === 'fonts.gstatic.com'
  ) {
    return true;
  }

  if (url.origin !== self.location.origin) {
    return false;
  }

  if (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/src/') ||
    pathname.startsWith('/node_modules/') ||
    pathname.startsWith('/@vite/') ||
    pathname.startsWith('/@fs/')
  ) {
    return true;
  }

  if (
    pathname === '/manifest.json' ||
    pathname === '/icon.svg' ||
    pathname === '/apple-touch-icon.png' ||
    pathname.startsWith('/pwa-')
  ) {
    return true;
  }

  return /\.(js|mjs|ts|tsx|css|woff2?|ttf|otf|svg|png|jpe?g|webp|avif|ico)$/i.test(pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(APP_SHELL_CACHE);
      await Promise.allSettled(
        CORE_SHELL_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response && response.ok) {
              await shellCache.put(url, response.clone());
            }
          } catch {
            // Best-effort per asset during install
          }
        })
      );

      const assetsCache = await caches.open(UI_ASSETS_CACHE);
      const dataCache = await caches.open(MAP_AND_API_CACHE);
      await Promise.allSettled(
        OPTIONAL_WARM_URLS.map(async (url) => {
          try {
            const response = await fetch(url);
            if (response && (response.ok || response.type === 'opaque')) {
              const targetCache = url.startsWith('/api/') ? dataCache : assetsCache;
              await targetCache.put(url, response.clone());
            }
          } catch {
            // Ignore offline errors during warm-up
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

function isRadarOwnedSwCache(name) {
  return (
    typeof name === 'string' &&
    /^tehran-radar-(?:shell|assets|data)-v[0-9a-z._-]+$/i.test(name)
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.allSettled(
          cacheNames
            .filter((name) => isRadarOwnedSwCache(name) && !ACTIVE_CACHES.includes(name))
            .map((staleName) => caches.delete(staleName))
        );
      } catch {
        // Never block SW claim on cache enumeration failure
      }

      // Purge all previously cached map tiles. The PWA must not provide offline tile storage.
      try {
        const dataCache = await caches.open(MAP_AND_API_CACHE);
        const cachedRequests = await dataCache.keys();
        await Promise.all(
          cachedRequests.map(async (cachedRequest) => {
            try {
              const cachedUrl = new URL(cachedRequest.url);
              if (isMapTileRequest(cachedUrl)) {
                await dataCache.delete(cachedRequest);
              }
            } catch {
              // A malformed cache key must not prevent activation.
            }
          })
        );
      } catch {
        // Cache cleanup is best-effort; never block SW claim.
      }

      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  if (event.origin && event.origin !== self.location.origin) return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'CLEAR_USER_CACHES') {
    event.waitUntil(
      (async () => {
        try {
          await caches.delete(MAP_AND_API_CACHE);
        } catch {
          // Ignore cache deletion error
        }
      })()
    );
    return;
  }

  if (data.type === 'WARM_ASSET_URLS' && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const assetsCache = await caches.open(UI_ASSETS_CACHE);
        const safeUrls = data.urls
          .filter(
            (u) =>
              typeof u === 'string' &&
              u.length > 0 &&
              u.length < 512 &&
              !u.startsWith('//') &&
              !u.startsWith('/api/') &&
              ((u.startsWith('/') && !u.startsWith('/api/')) ||
                (u.startsWith(self.location.origin) && !u.slice(self.location.origin.length).startsWith('/api/')) ||
                u.startsWith('https://unpkg.com/'))
          )
          .slice(0, 40);

        await Promise.allSettled(
          safeUrls.map(async (rawUrl) => {
            try {
              const existing = await assetsCache.match(rawUrl);
              if (existing) return;
              const response = await fetch(rawUrl);
              if (response && (response.ok || response.type === 'opaque')) {
                await assetsCache.put(rawUrl, response.clone());
              }
            } catch {
              // Ignore individual warm failure
            }
          })
        );
      })()
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  if (isPrivateOrSensitiveRequest(request, url)) {
    return;
  }

  // 1. Navigation requests (HTML shell for neighborhood exploration & deep links)
  const acceptHeader = request.headers.get('accept') || '';
  if (request.mode === 'navigate' || acceptHeader.includes('text/html')) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            const shellCache = await caches.open(APP_SHELL_CACHE);
            shellCache.put('/index.html', networkResponse.clone()).catch(() => {});
            shellCache.put('/', networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        } catch {
          const shellCache = await caches.open(APP_SHELL_CACHE);
          const cachedIndex =
            (await shellCache.match(request, { ignoreSearch: true })) ||
            (await shellCache.match('/index.html')) ||
            (await shellCache.match('/'));
          if (cachedIndex) return cachedIndex;

          return new Response(
            '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>رادار تهران (آفلاین)</title></head><body><h1>ارتباط اینترنت برقرار نیست</h1><p>لطفاً یک بار صفحه را در حالت آنلاین باز کنید تا فایل‌های پایه ذخیره شوند.</p></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
    return;
  }

  // 2. Public read-only Market Pulse & Air Quality APIs: Network-First with strictly city-scoped offline cache
  if (
    url.origin === self.location.origin &&
    (url.pathname === '/api/market-pulse' || url.pathname === '/api/air-quality') &&
    url.searchParams.get('refresh') !== '1'
  ) {
    event.respondWith(
      (async () => {
        const dataCache = await caches.open(MAP_AND_API_CACHE);
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            dataCache.put(request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        } catch {
          const cachedResponse = await dataCache.match(request);
          if (cachedResponse) return cachedResponse;
          return createOfflineMarketPulseResponse(url.searchParams.get('city'));
        }
      })()
    );
    return;
  }

  // 3. Map tiles: use the browser's HTTP cache and provider Cache-Control headers.
  // Do not persist OSM-derived tiles in Cache API: the OSM standard tile service
  // prohibits offline-map use. Same-origin proxy tiles follow the same conservative rule.
  if (isMapTileRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // 4. Essential UI Assets (JS, CSS, Fonts, Icons, Leaflet CDN):
  // Use Network-First for unhashed Vite dev modules (/src/, /node_modules/, /@vite/, /@fs/)
  // to prevent mixing stale pre-bundled React ?v= hashes across reloads, and Stale-While-Revalidate
  // for immutable hashed bundles (/assets/) and static public resources.
  if (isEssentialUiAssetRequest(request, url)) {
    const pathname = url.pathname || '';
    const isUnhashedViteDevModule =
      url.origin === self.location.origin &&
      (pathname.startsWith('/src/') ||
        pathname.startsWith('/node_modules/') ||
        pathname.startsWith('/@vite/') ||
        pathname.startsWith('/@fs/'));

    event.respondWith(
      (async () => {
        const assetsCache = await caches.open(UI_ASSETS_CACHE);
        const shellCache = await caches.open(APP_SHELL_CACHE);

        if (isUnhashedViteDevModule) {
          try {
            const networkResponse = await fetch(request);
            if (networkResponse && networkResponse.ok) {
              assetsCache.put(request, networkResponse.clone()).catch(() => {});
            }
            return networkResponse;
          } catch {
            const cachedDevAsset =
              (await assetsCache.match(request)) ||
              (await assetsCache.match(request, { ignoreSearch: true }));
            if (cachedDevAsset) return cachedDevAsset;
            return new Response('', { status: 504, statusText: 'Offline Dev Module Unavailable' });
          }
        }

        const cachedAsset =
          (await assetsCache.match(request)) || (await shellCache.match(request));

        const fetchAndUpdate = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
              assetsCache.put(request, networkResponse.clone()).catch(() => {});
            }
            return networkResponse;
          })
          .catch(() => null);

        if (cachedAsset) {
          return cachedAsset;
        }

        const networkAsset = await fetchAndUpdate;
        if (networkAsset) {
          return networkAsset;
        }

        return new Response('', { status: 504, statusText: 'Offline Asset Unavailable' });
      })()
    );
  }
});
