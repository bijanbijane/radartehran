#!/usr/bin/env node
/**
 * @file scripts/cloudflare/smoke-test-staging.mjs
 * @description Live HTTP & Synthetic Storage Smoke Verification for `radartehran-staging`.
 * Supports `--url <https://radartehran-staging.*.workers.dev>` for post-deploy live verification
 * and `--local-dry` for pre-deploy local verification.
 */

import assert from 'node:assert/strict';

async function verifyLiveStagingUrl(baseUrl) {
  const origin = baseUrl.replace(/\/+$/, '');
  console.log(`[smoke-test-staging] Running live HTTP verification against ${origin}...`);

  // 1. Public Health, Read-Only D1 Migration Readiness & OpenAPI Endpoints
  for (const path of ['/api/healthz', '/api/health/liveness', '/api/health/readiness', '/api/openapi.json']) {
    const res = await fetch(`${origin}${path}`);
    if (path === '/api/health/readiness' && res.status === 503) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        `REQUIRED_D1_MIGRATION_PENDING: Staging Worker reports pending canonical D1 migrations (${JSON.stringify(errBody?.migrationReadiness?.pendingMigrations || [])}). Run .github/workflows/migrate-staging-d1.yml before routine deployment.`,
      );
    }
    assert.equal(res.status, 200, `Expected 200 on ${path}, got ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    assert.ok(ct.includes('application/json'), `Expected JSON content-type on ${path}`);
    if (path === '/api/health/readiness') {
      const readinessJson = await res.json();
      assert.equal(readinessJson.migrationReadiness?.ledgerTable, 'd1_migrations');
      assert.equal(
        readinessJson.migrationReadiness?.allCanonicalMigrationsApplied,
        true,
        'Expected all canonical D1 migrations to be applied in d1_migrations',
      );
    }
  }

  // 2. Static Assets, Manifest, Sitemap, Robots
  const rootRes = await fetch(`${origin}/`);
  assert.equal(rootRes.status, 200);
  const rootHtml = await rootRes.text();
  assert.ok(rootHtml.includes('dir="rtl"') || rootHtml.includes('رادار'), 'Expected RTL Persian root HTML');

  const manifestRes = await fetch(`${origin}/manifest.json`);
  assert.equal(manifestRes.status, 200);

  const robotsRes = await fetch(`${origin}/robots.txt`);
  assert.equal(robotsRes.status, 200);

  const sitemapRes = await fetch(`${origin}/sitemap.xml`);
  assert.equal(sitemapRes.status, 200);

  // 3. Unknown /api/* JSON 404 guarantee (never SPA index.html)
  const notFoundRes = await fetch(`${origin}/api/non-existent-staging-smoke-check`);
  assert.equal(notFoundRes.status, 404);
  const notFoundJson = await notFoundRes.json();
  assert.equal(notFoundJson.code, 'API_ENDPOINT_NOT_FOUND');

  // 4. Authentication & Admin Authorization rejection checks
  const unauthUpload = await fetch(`${origin}/api/object-storage/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(unauthUpload.status, 401);

  const malformedAuthDiag = await fetch(`${origin}/api/admin/worker-diagnostics`, {
    headers: { Authorization: 'Bearer malformed.jwt.token' },
  });
  assert.equal(malformedAuthDiag.status, 401);

  // 5. Public Market Pulse SWR Cache
  const pulseRes = await fetch(`${origin}/api/market-pulse?city=tehran`);
  assert.equal(pulseRes.status, 200);
  const pulseJson = await pulseRes.json();
  assert.equal(pulseJson.status, 'ok');

  console.log(`[smoke-test-staging] PASS: All live HTTP & security checks succeeded on ${origin}`);
}

async function main() {
  const args = process.argv.slice(2);
  const urlIdx = args.indexOf('--url');
  const targetUrl = urlIdx >= 0 ? args[urlIdx + 1] : process.env.STAGING_WORKER_URL;

  if (!targetUrl) {
    console.log(
      '[smoke-test-staging] No --url or STAGING_WORKER_URL provided. Run `npm run test:cloudflare` for local Worker + SQLite verification, or pass `--url https://radartehran-staging.<subdomain>.workers.dev` after remote deployment.',
    );
    return;
  }

  await verifyLiveStagingUrl(targetUrl);
}

main().catch((err) => {
  console.error('[smoke-test-staging] FAILED:', err);
  process.exit(1);
});
