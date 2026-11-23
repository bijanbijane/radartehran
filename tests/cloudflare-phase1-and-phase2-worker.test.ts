/**
 * @file tests/cloudflare-phase1-and-phase2-worker.test.ts
 * @description Comprehensive verification suite for Phase 1 (Cloudflare Runtime Foundation)
 * and Phase 2 (Modular API & Backend Strangler Migration — Group 1A & Group 1B).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { REGISTERED_API_ROUTES } from '../src/utils/expressRouteCatalog';
import { resetWorkerRateLimitWindowsForTests } from '../worker/contextAndSecurity';
import workerEntrypoint from '../worker/index';
import {
  ROUTE_MIGRATION_CONTROL_REGISTER,
  UNMOUNTED_ENTERPRISE_DOMAIN_MODULES,
  findMigrationRegisterEntry,
  getMigrationProgressSummary,
} from '../worker/migrationRegister';
import type { WorkerEnv } from '../worker/types';

function createMockAssetsBinding(): WorkerEnv['ASSETS'] {
  return {
    async fetch(input: RequestInfo | URL): Promise<Response> {
      const req = input instanceof Request ? input : new Request(String(input));
      const url = new URL(req.url);
      if (url.pathname === '/assets/index-a1b2c3d4.js') {
        return new Response('console.log("asset ok");', {
          status: 200,
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        });
      }
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response(
          `<!doctype html><html lang="fa" dir="rtl"><head><title>رادار محله‌های تهران</title><meta name="description" content="پیش‌فرض" /><meta property="og:title" content="پیش‌فرض" /><meta property="og:description" content="پیش‌فرض" /><meta property="og:url" content="https://radartehran.ir/" /><link rel="canonical" href="https://radartehran.ir/" /></head><body><div id="root"></div></body></html>`,
          {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }
        );
      }
      return new Response('Not Found', { status: 404 });
    },
  };
}

describe('Phase 1: Cloudflare Runtime Foundation Verification', () => {
  it('1. validates wrangler.jsonc schema, environments, assets binding, and zero secret leakage', () => {
    const wranglerRaw = fs.readFileSync(path.resolve(process.cwd(), 'wrangler.jsonc'), 'utf8');
    const strippedJson = wranglerRaw
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    const parsed = JSON.parse(strippedJson) as Record<string, unknown>;

    assert.equal(parsed.name, 'radartehran');
    assert.equal(parsed.main, './worker/index.ts');
    assert.equal(parsed.compatibility_date, '2026-03-01');
    assert.deepEqual(parsed.compatibility_flags, ['nodejs_compat']);

    const assets = parsed.assets as Record<string, unknown>;
    assert.equal(assets.directory, './dist');
    assert.equal(assets.binding, 'ASSETS');
    assert.equal(assets.not_found_handling, 'single-page-application');
    assert.ok(Array.isArray(assets.run_worker_first));
    assert.ok((assets.run_worker_first as string[]).includes('/api/*'));

    const envCfg = parsed.env as Record<string, Record<string, unknown>>;
    assert.ok(envCfg.preview);
    assert.ok(envCfg.staging);
    assert.ok(envCfg.production);
    assert.ok(!/AIza|sk-|TELEGRAM_BOT_TOKEN/i.test(wranglerRaw));
  });

  it('1b. keeps backend staging Cron Triggers disabled until isolated D1 is provisioned', () => {
    const backendRaw = fs.readFileSync(path.resolve(process.cwd(), 'wrangler.backend.jsonc'), 'utf8');
    const backendStripped = backendRaw
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    const backendParsed = JSON.parse(backendStripped) as Record<string, any>;
    const backendStaging = backendParsed.env?.staging as Record<string, any>;
    assert.ok(backendStaging, 'backend staging environment must be explicitly defined');
    const backendCache = backendParsed.cache as Record<string, unknown> | undefined;
    assert.equal(backendCache?.enabled, true, 'production API Worker Cache must be enabled');
    assert.equal(backendStaging.cache?.enabled, false, 'staging Worker Cache must stay disabled until isolated end-to-end validation');
    assert.deepEqual(backendStaging.triggers?.crons, [], 'backend staging cron triggers must stay disabled until isolated staging D1 databases are provisioned');
    assert.ok(!Array.isArray(backendStaging.d1_databases) || backendStaging.d1_databases.length === 0, 'backend staging must not bind production D1 databases');
  });

  it('2. enforces strict Worker module isolation (no express, firebase-admin, sharp, or disk cache imports)', () => {
    const workerFiles = [
      'worker/types.ts',
      'worker/contextAndSecurity.ts',
      'worker/migrationRegister.ts',
      'worker/router.ts',
      'worker/index.ts',
      'worker/routes/healthAndMetadataRoutes.ts',
      'worker/routes/intelligenceAndCommerceRoutes.ts',
      'worker/routes/edgePlatformAndStorageRoutes.ts',
      'worker/routes/objectStorageRoutes.ts',
      'worker/routes/objectStorageHelpers.ts',
      'worker/routes/objectStorageUploadHandlers.ts',
    ];
    for (const relPath of workerFiles) {
      const content = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
      assert.ok(
        !/from\s+['"](?:express|firebase-admin|sharp|.*serverMarketPulseEngine)['"]/i.test(
          content
        ),
        `Forbidden Node/Express import detected in ${relPath}`
      );
      const lineCount = content.split('\n').length;
      assert.ok(lineCount < 500, `${relPath} exceeds 500 lines (${lineCount})`);
    }
  });

  it('3. serves GET /api/health, /api/healthz, /api/health/liveness, and /api/health/readiness with sanitized payloads', async () => {
    const env: WorkerEnv = { ENVIRONMENT: 'preview', APP_URL: 'https://radartehran.ir' };

    const healthRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/health'),
      env
    );
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('cache-control'), 'no-store', 'health responses must bypass shared Worker Cache');
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(healthRes.headers.get('x-correlation-id'));
    const healthBody = (await healthRes.json()) as Record<string, unknown>;
    assert.equal(healthBody.status, 'ok');
    assert.equal(healthBody.service, 'radartehran-cloudflare-worker');
    assert.equal(healthBody.runtime, 'cloudflare_workers');
    assert.equal(healthBody.environment, 'preview');

    const healthzRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/healthz'),
      env
    );
    assert.equal(healthzRes.status, 200);
    const healthzBody = (await healthzRes.json()) as Record<string, unknown>;
    assert.equal(healthzBody.status, 'ok');
    assert.equal(typeof healthzBody.displayAreaUnitLabel, 'string');
    assert.equal(typeof healthzBody.referenceValuationIntlText, 'string');

    const liveRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/health/liveness'),
      env
    );
    assert.equal(liveRes.status, 200);
    const liveBody = (await liveRes.json()) as Record<string, unknown>;
    assert.equal(liveBody.ok, true);
    assert.equal(liveBody.probe, 'liveness');

    const readyRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/health/readiness'),
      env
    );
    assert.equal(readyRes.status, 200);
    const readyBody = (await readyRes.json()) as Record<string, unknown>;
    assert.equal(readyBody.ok, true);
    assert.equal(readyBody.probe, 'readiness');

    // Preview may intentionally omit D1; production/staging must never report READY without USER_DB.
    const productionWithoutDb = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/health/readiness'),
      { ENVIRONMENT: 'production', APP_URL: 'https://radartehran.ir' },
    );
    assert.equal(productionWithoutDb.status, 503);
    const productionReadinessBody = (await productionWithoutDb.json()) as Record<string, unknown>;
    assert.equal(productionReadinessBody.code, 'USER_DB_NOT_BOUND');
    assert.equal(productionReadinessBody.state, 'DEGRADED');
  });

  it('4. serves static assets and SPA fallback with dynamic SSR SEO metadata injection (?hood=, ?compare=, ?city=)', async () => {
    const env: WorkerEnv = {
      ENVIRONMENT: 'production',
      APP_URL: 'https://radartehran.ir',
      ASSETS: createMockAssetsBinding(),
    };

    // Static asset
    const jsRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/assets/index-a1b2c3d4.js'),
      env
    );
    assert.equal(jsRes.status, 200);
    assert.match(jsRes.headers.get('cache-control') || '', /immutable/);

    // A missing asset whose name resembles a hashed production bundle must never inherit
    // the one-year immutable cache policy.
    const missingHashedAssetRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/assets/missing-deadbeef.js'),
      env
    );
    assert.equal(missingHashedAssetRes.status, 404);
    assert.equal(missingHashedAssetRes.headers.get('cache-control'), 'no-store');

    // The no-ASSETS fallback must also opt out of heuristic Worker caching.
    const missingAssetWithoutBindingRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/assets/missing-deadbeef.js'),
      { ENVIRONMENT: 'production', APP_URL: 'https://radartehran.ir' }
    );
    assert.equal(missingAssetWithoutBindingRes.status, 404);
    assert.equal(missingAssetWithoutBindingRes.headers.get('cache-control'), 'no-store');

    // SPA navigation with ?hood=1
    const hoodHtmlRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/?hood=1'),
      env
    );
    assert.equal(hoodHtmlRes.status, 200);
    assert.match(hoodHtmlRes.headers.get('content-type') || '', /text\/html/);
    const hoodHtml = await hoodHtmlRes.text();
    assert.match(hoodHtml, /application\/ld\+json/);
    assert.match(hoodHtml, /رادار تهران/);

    // SPA navigation with ?compare=1-2
    const compareHtmlRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/?compare=1-2'),
      env
    );
    assert.equal(compareHtmlRes.status, 200);
    const compareHtml = await compareHtmlRes.text();
    assert.match(compareHtml, /مقایسه محله/);

    // SPA fallback on deep client route
    const clientRouteRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/explore/neighborhoods?city=shiraz'),
      env
    );
    assert.equal(clientRouteRes.status, 200);
    const clientRouteHtml = await clientRouteRes.text();
    assert.match(clientRouteHtml, /شیراز/);
  });

  it('5. strictly prevents /api/* from falling back to SPA HTML (returns 501 for unmigrated Express routes and 404 for unknown API paths)', async () => {
    const env: WorkerEnv = {
      ENVIRONMENT: 'production',
      APP_URL: 'https://radartehran.ir',
      ASSETS: createMockAssetsBinding(),
    };

    // Unmigrated Express route -> 501 JSON
    const unmigratedRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/market-pulse'),
      env
    );
    assert.equal(unmigratedRes.status, 501);
    assert.match(unmigratedRes.headers.get('content-type') || '', /application\/json/);
    const unmigratedBody = (await unmigratedRes.json()) as Record<string, unknown>;
    assert.equal(unmigratedBody.status, 'error');
    assert.equal(unmigratedBody.code, 'ROUTE_NOT_YET_MIGRATED_TO_WORKER');
    assert.equal(unmigratedBody.authoritativeRuntime, 'legacy_express_server');
    assert.equal(unmigratedBody.migrationGroup, 'GROUP_2_PUBLIC_MARKET_AND_GEO_READS');

    // Unknown API route -> 404 JSON (never HTML)
    const unknownApiRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v99/non-existent-endpoint'),
      env
    );
    assert.equal(unknownApiRes.status, 404);
    assert.match(unknownApiRes.headers.get('content-type') || '', /application\/json/);
    const unknownBody = (await unknownApiRes.json()) as Record<string, unknown>;
    assert.equal(unknownBody.status, 'error');
    assert.equal(unknownBody.code, 'API_ROUTE_NOT_FOUND');
  });
});

describe('Phase 2: Modular API & Strangler Migration Verification (Group 1A & Group 1B)', () => {
  it('6. verifies complete Route Inventory & Migration Control Register covering all Express routes + /api/health', () => {
    assert.equal(ROUTE_MIGRATION_CONTROL_REGISTER.length, REGISTERED_API_ROUTES.length + 1);
    const summary = getMigrationProgressSummary();
    assert.equal(summary.totalCatalogRoutes, REGISTERED_API_ROUTES.length + 1);
    // Group 1A (8) + Group 1B (12) + Group 4 Account USER_DB (7) + Group 5 Storage (9) = 36
    assert.equal(summary.verifiedWorkerRoutes, 36);
    assert.equal(summary.unmountedEnterpriseModules, 10);
    assert.equal(UNMOUNTED_ENTERPRISE_DOMAIN_MODULES.length, 10);

    // Parameterized route matching check
    const dossierMatch = findMigrationRegisterEntry(
      'GET',
      '/api/v1/commerce/neighborhood-dossier/12'
    );
    assert.ok(dossierMatch);
    assert.equal(dossierMatch.entry.status, 'VERIFIED');
    assert.equal(dossierMatch.params.hoodId, '12');
  });

  it('7. verifies Group 1A SEO and OpenAPI endpoints (/api/openapi.json, /manifest.json, /sitemap.xml, /robots.txt)', async () => {
    const env: WorkerEnv = { ENVIRONMENT: 'production', APP_URL: 'https://radartehran.ir' };

    const openApiRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/openapi.json?areaUnit=sqft&intlCurrency=EUR'),
      env
    );
    assert.equal(openApiRes.status, 200);
    const openApiBody = (await openApiRes.json()) as Record<string, unknown>;
    assert.equal(openApiBody.openapi, '3.1.0');

    const manifestRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/manifest.json'),
      env
    );
    assert.equal(manifestRes.status, 200);
    assert.match(manifestRes.headers.get('content-type') || '', /application\/manifest\+json/);
    const manifestBody = (await manifestRes.json()) as Record<string, unknown>;
    assert.equal(manifestBody.short_name, 'رادار تهران');
    assert.equal(manifestBody.dir, 'rtl');

    const sitemapRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/sitemap.xml'),
      env
    );
    assert.equal(sitemapRes.status, 200);
    assert.match(sitemapRes.headers.get('content-type') || '', /application\/xml/);
    const sitemapXml = await sitemapRes.text();
    assert.match(sitemapXml, /<urlset/);
    assert.match(sitemapXml, /https:\/\/radartehran\.ir\/tehran\/zaferanieh/);
    assert.match(sitemapXml, /https:\/\/radartehran\.ir\/tehran\/punak-vs-sadeghie/);
    assert.equal(sitemapXml.includes('?hood='), false);

    const robotsRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/robots.txt'),
      env
    );
    assert.equal(robotsRes.status, 200);
    const robotsTxt = await robotsRes.text();
    assert.match(robotsTxt, /Disallow: \/api\//);
    assert.match(robotsTxt, /Sitemap: https:\/\/radartehran\.ir\/sitemap\.xml/);
  });

  it('8. verifies Group 1B AI Intelligent Search & AI Gateway Inference contract parity', async () => {
    resetWorkerRateLimitWindowsForTests();
    const env: WorkerEnv = { ENVIRONMENT: 'production', APP_URL: 'https://radartehran.ir' };

    // Validation failure on short query
    const shortRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v1/ai/intelligent-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'اب' }),
      }),
      env
    );
    assert.equal(shortRes.status, 400);
    const shortBody = (await shortRes.json()) as Record<string, unknown>;
    assert.equal(shortBody.code, 'QUERY_TOO_SHORT');

    // Valid Persian natural language housing search
    const searchRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v1/ai/intelligent-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'آپارتمان در منطقه ۵ تهران تا متری ۱۸۰ میلیون',
          areaUnit: 'sqm',
          currency: 'USD',
        }),
      }),
      env
    );
    assert.equal(searchRes.status, 200);
    const searchBody = (await searchRes.json()) as {
      status: string;
      matchedCount: number;
      matchedNeighborhoods: Array<{ id: number; name: string; buyPerSqmIntlText: string }>;
    };
    assert.equal(searchBody.status, 'ok');
    assert.ok(searchBody.matchedCount > 0);
    assert.ok(Array.isArray(searchBody.matchedNeighborhoods));
    assert.equal(typeof searchBody.matchedNeighborhoods[0].buyPerSqmIntlText, 'string');

    // AI Gateway inference + v1 alias
    for (const inferPath of ['/api/ai/gateway/infer', '/api/v1/ai/gateway/infer']) {
      const inferRes = await workerEntrypoint.fetch(
        new Request(`https://radartehran.ir${inferPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflow: 'intelligent_search',
            prompt: 'رهن آپارتمان در کرج تا ۹۰۰ میلیون',
          }),
        }),
        env
      );
      assert.equal(inferRes.status, 200);
      const inferBody = (await inferRes.json()) as Record<string, unknown>;
      assert.equal(inferBody.status, 'ok');
      assert.equal(inferBody.workflow, 'intelligent_search');
      assert.equal(typeof inferBody.simulationBanner, 'string');
    }
  });

  it('9. verifies Group 1B Commerce, x402 challenge/simulation, MCP tools, Valuation Seal, and Telemetry Policy parity', async () => {
    resetWorkerRateLimitWindowsForTests();
    const env: WorkerEnv = { ENVIRONMENT: 'production', APP_URL: 'https://radartehran.ir', VALUATION_SEAL_SECRET: 'a'.repeat(64) };

    // Commerce Catalog
    const catalogRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v1/commerce/catalog'),
      env
    );
    assert.equal(catalogRes.status, 200);
    assert.match(catalogRes.headers.get('cache-control') || '', /public, max-age=300/, 'public catalog has an explicit bounded cache TTL');
    const catalogBody = (await catalogRes.json()) as { status: string; products: unknown[] };
    assert.equal(catalogBody.status, 'ok');
    assert.ok(catalogBody.products.length > 0);

    // Commerce Neighborhood Index: restricted dataset -> 403
    const forbiddenRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v1/commerce/neighborhood-index?dataset=buyer_leads_private'),
      env
    );
    assert.equal(forbiddenRes.status, 403);
    assert.equal(forbiddenRes.headers.get('cache-control'), 'no-store', 'restricted dataset errors must never be cached');

    // Commerce Neighborhood Index: simulate=1 -> 200
    const simRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v1/commerce/neighborhood-index?simulate=1&city=tehran'),
      env
    );
    assert.equal(simRes.status, 200);
    assert.equal(simRes.headers.get('cache-control'), 'no-store', 'simulated dataset responses must not enter shared cache');
    const simBody = (await simRes.json()) as { status: string; sampleRecords: unknown[] };
    assert.equal(simBody.status, 'ok');
    assert.equal(simBody.sampleRecords.length, 3);

    // Commerce Neighborhood Index: unauthenticated -> 402 Payment Required with PAYMENT-REQUIRED header
    const challengeRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v1/commerce/neighborhood-index'),
      env
    );
    assert.equal(challengeRes.status, 402);
    assert.equal(challengeRes.headers.get('cache-control'), 'no-store', 'payment challenges must not be cached');
    assert.ok(challengeRes.headers.get('payment-required'));

    // Commerce Neighborhood Dossier: simulate=1 -> 200
    const dossierSimRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v1/commerce/neighborhood-dossier/2?simulate=1'),
      env
    );
    assert.equal(dossierSimRes.status, 200);
    const dossierSimBody = (await dossierSimRes.json()) as {
      status: string;
      dossier: { id: number; simulationRedacted: boolean };
    };
    assert.equal(dossierSimBody.status, 'ok');
    assert.equal(dossierSimBody.dossier.id, 2);
    assert.equal(dossierSimBody.dossier.simulationRedacted, true);

    // MCP Tools & Execute
    for (const mcpToolsPath of ['/api/mcp/tools', '/api/v1/mcp/tools']) {
      const mcpToolsRes = await workerEntrypoint.fetch(
        new Request(`https://radartehran.ir${mcpToolsPath}`),
        env
      );
      assert.equal(mcpToolsRes.status, 200);
      assert.match(mcpToolsRes.headers.get('cache-control') || '', /public, max-age=300/, 'public MCP descriptors have a bounded cache TTL');
      const mcpToolsBody = (await mcpToolsRes.json()) as { zeroPiiEnforced: boolean; tools: unknown[] };
      assert.equal(mcpToolsBody.zeroPiiEnforced, true);
      assert.ok(mcpToolsBody.tools.length > 0);
    }

    const mcpExecRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v1/mcp/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: 'get_neighborhood_statistics',
          args: { city: 'tehran', hoodId: 1 },
        }),
      }),
      env
    );
    assert.equal(mcpExecRes.status, 200);
    const mcpExecBody = (await mcpExecRes.json()) as { ok: boolean; toolName: string };
    assert.equal(mcpExecBody.ok, true);
    assert.equal(mcpExecBody.toolName, 'get_neighborhood_statistics');

    // Valuation Seal verification
    const sealRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v1/valuation/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityId: 'tehran',
          hoodId: 1,
          sqm: 95,
          buildYear: 1401,
          renovationStatus: 'renovated',
          floor: 3,
          totalFloors: 5,
          hasElevator: true,
          hasParking: true,
          hasStorage: true,
        }),
      }),
      env
    );
    assert.equal(sealRes.status, 200);
    const sealBody = (await sealRes.json()) as {
      status: string;
      seal: {
        sealId: string;
        sealSignature: string;
        hedonicValuation: { hedonicTotalMillion: number };
      };
    };
    assert.equal(sealBody.status, 'ok');
    assert.equal(typeof sealBody.seal.sealSignature, 'string');
    assert.ok(sealBody.seal.sealSignature.length >= 32);
    assert.ok(sealBody.seal.hedonicValuation.hedonicTotalMillion > 0);

    // Public Telemetry Policy
    const policyRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v1/telemetry/policy'),
      env
    );
    assert.equal(policyRes.status, 200);
    assert.match(policyRes.headers.get('cache-control') || '', /public, max-age=60/, 'public telemetry policy has a bounded cache TTL');
    const policyBody = (await policyRes.json()) as {
      status: string;
      policy: { policyVersion: number; activeLevel: number };
    };
    assert.equal(policyBody.status, 'ok');
    assert.equal(typeof policyBody.policy.policyVersion, 'number');
  });

  it('10. enforces Worker security controls: Content-Type validation, payload size limit, rate limiting, and CORS', async () => {
    resetWorkerRateLimitWindowsForTests();
    const env: WorkerEnv = { ENVIRONMENT: 'production', APP_URL: 'https://radartehran.ir' };

    // Invalid Content-Type -> 415
    const badCtRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v1/ai/intelligent-search', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{"query":"تهران"}',
      }),
      env
    );
    assert.equal(badCtRes.status, 415);

    // Oversized JSON payload -> 413
    const hugeBody = JSON.stringify({ query: 'الف'.repeat(60_000) });
    const hugeRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v1/ai/intelligent-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: hugeBody,
      }),
      env
    );
    assert.equal(hugeRes.status, 413);

    // CORS preflight OPTIONS /api/* with trusted origin
    const corsRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v1/ai/intelligent-search', {
        method: 'OPTIONS',
        headers: { Origin: 'https://radartehran.ir' },
      }),
      env
    );
    assert.equal(corsRes.status, 204);
    assert.equal(corsRes.headers.get('access-control-allow-origin'), 'https://radartehran.ir');

    // Rate limit enforcement per CF-Connecting-IP
    for (let i = 0; i < 20; i++) {
      const okRes = await workerEntrypoint.fetch(
        new Request('https://radartehran.ir/api/v1/ai/intelligent-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '198.51.100.77',
          },
          body: JSON.stringify({ query: 'آپارتمان در منطقه ۲ تهران' }),
        }),
        env
      );
      assert.equal(okRes.status, 200);
    }
    const rateLimitedRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/v1/ai/intelligent-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.77',
        },
        body: JSON.stringify({ query: 'آپارتمان در منطقه ۲ تهران' }),
      }),
      env
    );
    assert.equal(rateLimitedRes.status, 429);
    assert.ok(rateLimitedRes.headers.get('retry-after'));
  });
});
