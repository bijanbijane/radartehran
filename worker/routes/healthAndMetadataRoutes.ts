/**
 * @file worker/routes/healthAndMetadataRoutes.ts
 * @description Phase 1 & Phase 2 Group 1A Worker-native handlers for health probes, OpenAPI 3.1,
 * PWA manifest, XML sitemap, robots.txt, and SSR dynamic SEO metadata injection.
 * Zero dependency on `express`, `firebase-admin`, `sharp`, or filesystem persistence.
 */
import { tehranSitemapEntries } from '../../src/data/neighborhoodListingSamples';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../../src/utils/areaUnit';
import { buildOpenApiSpecification } from '../../src/utils/serverConfigValidator';
import { buildWorkerJsonHeaders, jsonWorkerResponse } from '../contextAndSecurity';
import { getMigrationProgressSummary } from '../migrationRegister';
import { getTriadDomainBindingDiagnostics, requireNeighborhoodDb, requireResearchDb, requireUserDb } from '../db/bindingResolver';
import type { D1Database, WorkerRequestContext } from '../types';
import { createIrniGeographicRpcV2ClientFromEnv } from '../irni/irniGeographicRpcV2Client';
import { escapeXml, resolveWorkerBaseUrl } from './workerSeoHtml';

let workerBootTimestampMs: number | null = null;

async function probeD1Database(db: D1Database): Promise<{ ok: boolean; migrationsApplied: number }> {
  try {
    const ping = await db.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    const ledger = await db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>();
    return {
      ok: ping?.ok === 1,
      migrationsApplied: Number(ledger?.count ?? 0),
    };
  } catch {
    return { ok: false, migrationsApplied: 0 };
  }
}


export { escapeXml, escapeHtmlText, escapeHtmlAttribute, serializeSafeJsonLd, injectWorkerDynamicSeoHtml, resolveWorkerBaseUrl } from './workerSeoHtml';

export async function handleHealthAndMetadataRoute(
  ctx: WorkerRequestContext
): Promise<Response | null> {
  const { method, pathname, url } = ctx;
  if (method !== 'GET') return null;

  const requestNowMs = Date.now();
  // Cloudflare may evaluate module top-level code in a deterministic startup context.
  // Capture the first real request timestamp lazily, inside the Worker request lifecycle.
  if (workerBootTimestampMs === null || workerBootTimestampMs > requestNowMs) {
    workerBootTimestampMs = requestNowMs;
  }
  const uptimeSeconds = Math.max(0, Math.floor((requestNowMs - workerBootTimestampMs) / 1000));

  if (pathname === '/api/health/database-triad') {
    const bindings = getTriadDomainBindingDiagnostics(ctx.env);
    const user = requireUserDb(ctx.env);
    const research = requireResearchDb(ctx.env);
    const irniClient = createIrniGeographicRpcV2ClientFromEnv(ctx.env);
    const legacyDirectDbBindingPresent = Boolean(ctx.env.NEIGHBORHOOD_DB);
    if (!user.ok || !research.ok || bindings.isolationViolation) {
      return jsonWorkerResponse(ctx, 503, {
        status: 'degraded',
        code: 'D1_TRIAD_BINDING_NOT_READY',
        bindings: {
          ...bindings,
          irniServiceBindingConfigured: irniClient.isConfigured(),
          irniDirectDbBindingPresent: legacyDirectDbBindingPresent,
        },
        missing: {
          user: user.ok === false ? user.code : null,
          research: research.ok === false ? research.code : null,
          irniRpc: null,
        },
        timestampIso: new Date().toISOString(),
      });
    }

    const [userProbe, researchProbe, irniMetadata] = await Promise.all([
      probeD1Database(user.db),
      probeD1Database(research.db),
      irniClient.getApprovedRegistryMetadata(),
    ]);
    const registryReady = irniMetadata.ok &&
      irniMetadata.value.contractVersion === '2.0.0' &&
      irniMetadata.value.contractState === 'ACTIVE' &&
      irniMetadata.value.integrityVerified === true &&
      irniMetadata.value.registryRevision > 0;
    const ready = userProbe.ok && researchProbe.ok && registryReady &&
      !legacyDirectDbBindingPresent && irniClient.isConfigured() &&
      userProbe.migrationsApplied >= 6 && researchProbe.migrationsApplied >= 2;

    return jsonWorkerResponse(ctx, ready ? 200 : 503, {
      status: ready ? 'ok' : 'degraded',
      service: 'radartehran-storage-and-irni-rpc',
      bindings: {
        userDbBound: bindings.userDbBound,
        userDbSource: bindings.userDbSource,
        researchDbBound: bindings.researchDbBound,
        irniServiceBindingConfigured: irniClient.isConfigured(),
        legacyNeighborhoodDbBindingPresent: legacyDirectDbBindingPresent,
        irniDirectDbBindingPresent: legacyDirectDbBindingPresent,
        isolationViolation: bindings.isolationViolation,
      },
      probes: {
        userDb: userProbe.ok ? 'ok' : 'failed',
        researchDb: researchProbe.ok ? 'ok' : 'failed',
        irniRpc: irniMetadata.ok ? 'ok' : 'failed',
      },
      migrationLedgers: {
        userDb: { applied: userProbe.migrationsApplied, requiredAtLeast: 6 },
        researchDb: { applied: researchProbe.migrationsApplied, requiredAtLeast: 2 },
        neighborhoodDb: { status: 'RETIRED_DIRECT_D1_ACCESS' },
      },
      geographicRegistry: irniMetadata.ok === true ? {
        status: registryReady ? 'ready' : 'degraded',
        revision: irniMetadata.value.registryRevision,
        checksum: irniMetadata.value.registryChecksum,
        canonicalEntityCount: irniMetadata.value.canonicalEntityCount,
        relationshipCount: irniMetadata.value.relationshipCount,
        identityAnchorCount: irniMetadata.value.identityAnchorCount,
        sourceMappingCount: irniMetadata.value.sourceMappingCount,
        legacyAliasCount: irniMetadata.value.legacyAliasCount,
        integrityVerified: irniMetadata.value.integrityVerified,
      } : {
        status: 'unavailable',
        errorCode: irniMetadata.error.code,
      },
      missing: {
        user: userProbe.ok ? null : 'USER_DB_PROBE_FAILED',
        research: researchProbe.ok ? null : 'RESEARCH_DB_PROBE_FAILED',
        irniRpc: irniMetadata.ok === true ? null : irniMetadata.error.code,
        legacyDirectDbBinding: legacyDirectDbBindingPresent ? 'REMOVE_AFTER_RPC_CUTOVER' : null,
      },
      timestampIso: new Date().toISOString(),
    });
  }

  if (pathname === '/api/health') {
    const migration = getMigrationProgressSummary();
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      service: 'radartehran-cloudflare-worker',
      runtime: 'cloudflare_workers',
      environment: ctx.environment,
      timestampIso: new Date().toISOString(),
      uptimeSeconds,
      migrationProgress: migration,
    });
  }

  if (pathname === '/api/healthz') {
    return jsonWorkerResponse(ctx, 200, {
      ok: true,
      status: 'ok',
      runtime: 'cloudflare-workers',
      registeredRoutesCount: getMigrationProgressSummary().totalCatalogRoutes,
      uptimeSeconds,
      timestampIso: new Date().toISOString(),
      displayAreaUnitLabel: formatAreaUnitLabel('sqm'),
      referenceValuationIntlText: formatMillionTomanAsIntlCurrency(100, 'USD'),
    });
  }

  if (pathname === '/api/health/liveness') {
    return jsonWorkerResponse(ctx, 200, {
      ok: true,
      probe: 'liveness',
      state: 'READY',
      uptimeSeconds,
    });
  }

  if (pathname === '/api/health/readiness') {
    const userDb = ctx.env.USER_DB;
    let appOriginConfigured = false;
    try {
      const appUrl = new URL(String(ctx.env.APP_URL || ''));
      appOriginConfigured = appUrl.protocol === 'https:'
        && !appUrl.hostname.endsWith('.invalid')
        && appUrl.hostname !== 'localhost'
        && !appUrl.username
        && !appUrl.password
        && appUrl.pathname === '/'
        && !appUrl.search
        && !appUrl.hash;
    } catch {
      appOriginConfigured = false;
    }
    const googleOidcConfigured = Boolean(
      String(ctx.env.GOOGLE_OAUTH_CLIENT_ID || '').trim()
      && String(ctx.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim()
      && String(ctx.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim(),
    );
    const expressBridgeSecretConfigured =
      new TextEncoder().encode(String(ctx.env.AUTH_INTERNAL_HMAC_SECRET || '')).byteLength >= 32;
    const phoneOtpConfigured = Boolean(
      String(ctx.env.KAVENEGAR_API_KEY || '').trim()
      && String(ctx.env.KAVENEGAR_VERIFY_TEMPLATE || '').trim(),
    );
    const authPiiHmacConfigured =
      new TextEncoder().encode(String(ctx.env.AUTH_PII_HMAC_SECRET || '')).byteLength >= 32;

    if (!userDb) {
      return jsonWorkerResponse(ctx, 503, {
        ok: false,
        code: 'USER_DB_NOT_BOUND',
        probe: 'readiness',
        state: 'DEGRADED',
        dependencies: {
          userDb: { bound: false, ready: false },
          appOrigin: { configured: appOriginConfigured },
          googleOidc: { configured: googleOidcConfigured },
          expressSessionBridge: { configured: expressBridgeSecretConfigured },
          phoneOtp: { configured: phoneOtpConfigured },
          authPiiHmac: { configured: authPiiHmacConfigured },
        },
      });
    }

    const userDbProbe = await probeD1Database(userDb);
    const requiredTables = [
      'auth_identities',
      'auth_oauth_states',
      'auth_phone_challenges',
      'user_sessions',
      'bargains',
      'sponsor_requests',
      'buyer_alerts',
      'neighborhood_votes',
    ];
    const missingTables: string[] = [];
    for (const table of requiredTables) {
      try {
        const row = await userDb.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
        ).bind(table).first<{ name: string }>();
        if (!row?.name) missingTables.push(table);
      } catch {
        missingTables.push(table);
      }
    }

    const userDbReady = userDbProbe.ok && missingTables.length === 0;
    const pendingMigrations = [
      ...(!userDbProbe.ok ? ['d1_migrations_or_d1_connectivity'] : []),
      ...missingTables,
    ];
    const ready = userDbReady
      && appOriginConfigured
      && googleOidcConfigured
      && expressBridgeSecretConfigured
      && phoneOtpConfigured
      && authPiiHmacConfigured;
    const failureCode = !userDbReady
      ? 'REQUIRED_D1_MIGRATION_PENDING'
      : !appOriginConfigured
        ? 'APP_ORIGIN_NOT_CONFIGURED'
        : !googleOidcConfigured
          ? 'GOOGLE_OIDC_NOT_CONFIGURED'
          : !expressBridgeSecretConfigured
            ? 'AUTH_INTERNAL_HMAC_SECRET_NOT_CONFIGURED'
            : !phoneOtpConfigured
              ? 'PHONE_OTP_PROVIDER_NOT_CONFIGURED'
              : !authPiiHmacConfigured
                ? 'AUTH_PII_HMAC_SECRET_NOT_CONFIGURED'
                : null;

    return jsonWorkerResponse(ctx, ready ? 200 : 503, {
      ok: ready,
      code: failureCode,
      probe: 'readiness',
      state: ready ? 'READY' : 'DEGRADED',
      activeRequests: 1,
      migrationReadiness: {
        allCanonicalMigrationsApplied: userDbReady,
        migrationsApplied: userDbProbe.migrationsApplied,
        pendingMigrations,
      },
      dependencies: {
        userDb: {
          bound: true,
          ready: userDbReady,
          migrationsApplied: userDbProbe.migrationsApplied,
          missingTables,
        },
        appOrigin: { configured: appOriginConfigured },
        googleOidc: { configured: googleOidcConfigured },
        expressSessionBridge: { configured: expressBridgeSecretConfigured },
        phoneOtp: { configured: phoneOtpConfigured },
        authPiiHmac: { configured: authPiiHmacConfigured },
        researchDb: { bound: Boolean(ctx.env.RESEARCH_DB), requiredForResearchFeatures: true },
        neighborhoodDb: { bound: Boolean(ctx.env.NEIGHBORHOOD_DB), requiredForGeographicReplicaFeatures: true },
        mediaBucket: { bound: Boolean(ctx.env.MEDIA_BUCKET), requiredForMediaFeatures: true },
      },
    });
  }

  if (pathname === '/api/openapi.json') {
    const baseUrl = resolveWorkerBaseUrl(ctx);
    const areaUnit: AreaUnit = url.searchParams.get('areaUnit') === 'sqft' ? 'sqft' : 'sqm';
    const rawCurr = String(url.searchParams.get('intlCurrency') || '');
    const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED', 'GBP'].includes(rawCurr)
      ? (rawCurr as IntlCurrencyCode)
      : 'USD';
    return jsonWorkerResponse(
      ctx,
      200,
      buildOpenApiSpecification(baseUrl, areaUnit, intlCurrency),
      { cacheControl: 'public, max-age=300' }
    );
  }

  if (pathname === '/manifest.json') {
    const iconSvgDataUri =
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#020617"/><circle cx="256" cy="256" r="168" fill="none" stroke="#10b981" stroke-width="28"/><circle cx="256" cy="256" r="96" fill="none" stroke="#34d399" stroke-width="18" stroke-dasharray="32 20"/><circle cx="256" cy="256" r="36" fill="#10b981"/><circle cx="340" cy="180" r="22" fill="#facc15"/></svg>`
      );
    const manifest = {
      id: '/',
      name: 'رادار محله‌های تهران | ابزار تحلیل قیمت مسکن و کیفیت زندگی',
      short_name: 'رادار تهران',
      description:
        'مقایسهٔ محله‌ها، بررسی داده‌های موجود بازار مسکن و استفاده از محاسبه‌گرهای مقدماتی خرید، اجاره و هزینه‌های ملکی.',
      dir: 'rtl',
      lang: 'fa-IR',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#020617',
      theme_color: '#10b981',
      categories: ['finance', 'lifestyle', 'navigation'],
      icons: [
        { src: iconSvgDataUri, sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
        { src: iconSvgDataUri, sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
      ],
    };
    const headers = buildWorkerJsonHeaders(ctx, {
      cacheControl: 'public, max-age=3600',
      extraHeaders: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
    });
    return new Response(JSON.stringify(manifest), { status: 200, headers });
  }

  if (pathname === '/sitemap.xml') {
    const baseUrl = resolveWorkerBaseUrl(ctx);
    const todayIso = new Date().toISOString().split('T')[0];
    const urls = tehranSitemapEntries(baseUrl);
    const xmlItems = urls
      .map(
        (u) => `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${todayIso}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
      )
      .join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xmlItems}\n</urlset>`;
    const headers = buildWorkerJsonHeaders(ctx, {
      cacheControl: 'public, max-age=3600',
      extraHeaders: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
    return new Response(xml, { status: 200, headers });
  }

  if (pathname === '/robots.txt') {
    const baseUrl = resolveWorkerBaseUrl(ctx);
    const robotsTxt = `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${baseUrl}/sitemap.xml\n`;
    const headers = buildWorkerJsonHeaders(ctx, {
      cacheControl: 'public, max-age=3600, stale-while-revalidate=86400',
      extraHeaders: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
    return new Response(robotsTxt, { status: 200, headers });
  }

  return null;
}
