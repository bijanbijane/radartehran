#!/usr/bin/env node
/**
 * Post-deploy smoke test for the production API Worker's built-in Workers Cache.
 *
 * Set RADAR_API_BASE_URL to the public frontend Worker origin that proxies /api/*
 * through its RADAR_API service binding, for example:
 *   RADAR_API_BASE_URL=https://radartehran-frontend.bijanbijane-1.workers.dev
 *
 * This script is intentionally read-only and uses public endpoints only.
 */
import assert from 'node:assert/strict';

const rawBaseUrl = process.env.RADAR_API_BASE_URL?.trim();
if (!rawBaseUrl) {
  console.error('Missing RADAR_API_BASE_URL');
  process.exit(2);
}

const baseUrl = new URL(rawBaseUrl);
assert.ok(['https:', 'http:'].includes(baseUrl.protocol), 'RADAR_API_BASE_URL must be HTTP(S)');
baseUrl.pathname = baseUrl.pathname.replace(/\/$/, '');

function endpoint(path) {
  return new URL(path.replace(/^\//, ''), baseUrl.toString().replace(/\/$/, '') + '/');
}

async function get(path, origin) {
  const headers = new Headers({ Accept: 'application/json' });
  if (origin) headers.set('Origin', origin);
  return fetch(endpoint(path), { method: 'GET', headers, redirect: 'manual' });
}

function hasDirective(header, directive) {
  return (header ?? '').split(',').some((part) => part.trim().toLowerCase() === directive.toLowerCase());
}

function hasVaryOrigin(header) {
  return (header ?? '').split(',').some((part) => part.trim().toLowerCase() === 'origin');
}

const publicPath = '/api/v1/commerce/catalog';
const firstPublic = await get(publicPath);
const secondPublic = await get(publicPath);

assert.equal(firstPublic.status, 200, 'public catalog first request must return 200');
assert.equal(secondPublic.status, 200, 'public catalog second request must return 200');
assert.ok(hasDirective(secondPublic.headers.get('cache-control'), 'public'), 'catalog must be explicitly public-cacheable');
assert.ok(
  /max-age=300/i.test(secondPublic.headers.get('cache-control') ?? ''),
  'catalog must retain its bounded 300-second TTL'
);
const secondCacheStatus = secondPublic.headers.get('cf-cache-status')?.toUpperCase() ?? '';
assert.ok(
  ['HIT', 'REVALIDATED'].includes(secondCacheStatus),
  `second catalog request must be served from Workers Cache; got ${secondCacheStatus || 'missing Cf-Cache-Status'}`
);

const healthResponses = await Promise.all([get('/api/health'), get('/api/health')]);
for (const response of healthResponses) {
  assert.equal(response.status, 200, 'health endpoint must remain available');
  assert.ok(hasDirective(response.headers.get('cache-control'), 'no-store'), 'health must remain no-store');
  assert.notEqual(response.headers.get('cf-cache-status')?.toUpperCase(), 'HIT', 'health must never be served from shared cache');
}

const allowedOrigin = process.env.RADAR_ALLOWED_ORIGIN?.trim() || baseUrl.origin;
const disallowedOrigin = 'https://untrusted.example';
const [allowedCors, disallowedCors] = await Promise.all([
  get(publicPath, allowedOrigin),
  get(publicPath, disallowedOrigin),
]);
assert.equal(allowedCors.headers.get('access-control-allow-origin'), allowedOrigin);
assert.equal(disallowedCors.headers.get('access-control-allow-origin'), null);
assert.ok(hasVaryOrigin(allowedCors.headers.get('vary')), 'allowed CORS variant must vary by Origin');
assert.ok(hasVaryOrigin(disallowedCors.headers.get('vary')), 'disallowed CORS variant must also vary by Origin');

console.log(JSON.stringify({
  status: 'PASS',
  publicCatalog: {
    firstCacheStatus: firstPublic.headers.get('cf-cache-status'),
    secondCacheStatus,
    cacheControl: secondPublic.headers.get('cache-control'),
  },
  privateHealth: healthResponses.map((response) => ({
    cacheControl: response.headers.get('cache-control'),
    cacheStatus: response.headers.get('cf-cache-status'),
  })),
  cors: {
    allowedOrigin: allowedCors.headers.get('access-control-allow-origin'),
    disallowedOrigin: disallowedCors.headers.get('access-control-allow-origin'),
    vary: allowedCors.headers.get('vary'),
  },
}, null, 2));
