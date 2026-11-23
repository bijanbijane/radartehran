import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyServiceWorkerRequestStrategy,
  validateManifestOfflineConfig,
  type WebAppManifestConfig,
} from '../src/utils/pwaOfflineSupport';

console.log('📲 Running PWA Manifest & Offline Service Worker Verification Suite...\n');

const rootDir = process.cwd();
const manifestPath = path.join(rootDir, 'public/manifest.json');
const swPath = path.join(rootDir, 'public/sw.js');

// 1. Verify manifest.json structure, icons, and offline exploration shortcuts
const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestRaw) as WebAppManifestConfig;
const audit = validateManifestOfflineConfig(manifest);

assert.equal(
  audit.valid,
  true,
  `Expected valid offline manifest.json, got issues: ${audit.issues.join(', ')}`
);
assert.equal(audit.has192Icon, true, 'Must include 192x192 any icon');
assert.equal(audit.has512AnyIcon, true, 'Must include 512x512 any icon');
assert.equal(audit.hasMaskableIcon, true, 'Must include dedicated maskable icon');
assert.equal(audit.hasOfflineShortcuts, true, 'Must include offline exploration shortcuts');

// 2. Verify physical icon files exist in /public
for (const iconFile of [
  'public/icon.svg',
  'public/pwa-192x192.png',
  'public/pwa-512x512.png',
  'public/pwa-maskable-512x512.png',
  'public/apple-touch-icon.png',
]) {
  const fullPath = path.join(rootDir, iconFile);
  assert.ok(fs.existsSync(fullPath), `Expected icon asset ${iconFile} to exist`);
  assert.ok(fs.statSync(fullPath).size > 100, `Expected ${iconFile} to be non-empty`);
}

// 3. Verify Service Worker file exists and implements install, activate, message, and fetch handlers
assert.ok(fs.existsSync(swPath), 'public/sw.js must exist');
const swSource = fs.readFileSync(swPath, 'utf8');
assert.ok(swSource.includes("self.addEventListener('install'"), 'sw.js must handle install event');
assert.ok(swSource.includes("self.addEventListener('activate'"), 'sw.js must handle activate event');
assert.ok(swSource.includes("self.addEventListener('fetch'"), 'sw.js must handle fetch event');
assert.ok(swSource.includes('skipWaiting'), 'sw.js must call skipWaiting()');
assert.ok(swSource.includes('clients.claim'), 'sw.js must call clients.claim()');
assert.ok(swSource.includes('/manifest.json'), 'sw.js must pre-cache /manifest.json');
assert.ok(swSource.includes('/index.html'), 'sw.js must pre-cache /index.html');

// 4. Verify request caching strategy classification for offline neighborhood exploration
assert.equal(
  classifyServiceWorkerRequestStrategy({
    url: 'https://tehranradar.ir/?city=tehran&hood=5',
    mode: 'navigate',
    acceptHeader: 'text/html',
  }),
  'NetworkFirstShell'
);
assert.equal(
  classifyServiceWorkerRequestStrategy({
    url: 'https://tehranradar.ir/assets/data-neighborhoods-abc123.js',
  }),
  'StaleWhileRevalidateUiAsset'
);
assert.equal(
  classifyServiceWorkerRequestStrategy({
    url: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js',
  }),
  'StaleWhileRevalidateUiAsset'
);
assert.equal(
  classifyServiceWorkerRequestStrategy({
    url: 'https://tehranradar.ir/api/osm-tile/osm/13/5264/3226.png',
  }),
  'StaleWhileRevalidateMapTile'
);
assert.equal(
  classifyServiceWorkerRequestStrategy({
    url: 'https://tehranradar.ir/api/market-pulse?city=tehran',
  }),
  'NetworkFirstMarketData'
);
assert.equal(
  classifyServiceWorkerRequestStrategy({
    url: 'https://tile.openstreetmap.org/13/5264/3226.png',
  }),
  'NetworkOnlyExternalMapTile',
  'Direct OpenStreetMap tiles must not be stored by the Radar Service Worker'
);
assert.equal(
  classifyServiceWorkerRequestStrategy({
    url: 'https://a.basemaps.cartocdn.com/light_all/13/5264/3226.png',
  }),
  'NetworkOnlyExternalMapTile',
  'Direct CARTO tiles must remain network-only unless a provider-specific cache policy is implemented'
);
assert.equal(
  classifyServiceWorkerRequestStrategy({
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/13/1/2/3',
  }),
  'NetworkOnlyExternalMapTile',
  'Direct ArcGIS tiles must remain network-only unless a provider-specific cache policy is implemented'
);
assert.ok(
  swSource.includes('isExternalMapTileRequest(url)'),
  'Service Worker must bypass its tile cache for external tile providers'
);
assert.ok(
  swSource.includes('if (isExternalMapTileRequest(cachedUrl))'),
  'Service Worker activation must purge previously cached external tile responses'
);
assert.equal(
  classifyServiceWorkerRequestStrategy({
    url: 'https://tehranradar.ir/api/admin/env-config',
  }),
  'BypassPrivateOrMutation'
);
assert.equal(
  classifyServiceWorkerRequestStrategy({
    url: 'https://tehranradar.ir/api/market-pulse?city=tehran',
    hasAuthHeader: true,
  }),
  'BypassPrivateOrMutation'
);

console.log('✅ All PWA Manifest & Offline Service Worker tests passed!\n');
