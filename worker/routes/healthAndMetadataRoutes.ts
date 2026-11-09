/**
 * @file worker/routes/healthAndMetadataRoutes.ts
 * @description Phase 1 & Phase 2 Group 1A Worker-native handlers for health probes, OpenAPI 3.1,
 * PWA manifest, XML sitemap, robots.txt, and SSR dynamic SEO metadata injection.
 * Zero dependency on `express`, `firebase-admin`, `sharp`, or filesystem persistence.
 */
import {
  MULTI_CITY_CONFIGS,
  type CityId,
  getAllMultiCityNeighborhoods,
  getValidatedCityConfig,
  resolveCityIdForNeighborhood,
} from '../../src/data/multiCityData';
import { INITIAL_NEIGHBORHOODS, toPersianNum } from '../../src/data/neighborhoods';
import {
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  type AreaUnit,
  type IntlCurrencyCode,
} from '../../src/utils/areaUnit';
import { validateCityParam } from '../../src/utils/security';
import { buildOpenApiSpecification } from '../../src/utils/serverConfigValidator';
import { resolveCanonicalBaseUrl } from '../../src/utils/serverDeliveryAndAbuseGuard';
import { buildWorkerJsonHeaders, jsonWorkerResponse } from '../contextAndSecurity';
import { getMigrationProgressSummary } from '../migrationRegister';
import type { WorkerRequestContext } from '../types';

const VALID_CITY_IDS: readonly CityId[] = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'];
const workerBootTimestampMs = Date.now();

export function resolveWorkerBaseUrl(ctx: WorkerRequestContext): string {
  return resolveCanonicalBaseUrl(ctx.env.APP_URL, ctx.environment);
}

export function escapeXml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function escapeHtmlText(raw: string): string {
  return String(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeHtmlAttribute(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function serializeSafeJsonLd(jsonLdObj: Record<string, unknown>): string {
  return JSON.stringify(jsonLdObj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function injectWorkerDynamicSeoHtml(
  html: string,
  url: URL,
  baseUrl: string,
  areaUnit: AreaUnit = 'sqm',
  intlCurrency: IntlCurrencyCode = 'USD'
): string {
  try {
    const allHoods = getAllMultiCityNeighborhoods();
    const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
    const compareParam = url.searchParams.get('compare') || '';
    const hoodParam = url.searchParams.has('hood') ? Number(url.searchParams.get('hood')) : 0;
    const rawCity = url.searchParams.get('city');
    const cityParam = rawCity ? validateCityParam(rawCity, 'tehran') : null;

    const applyMetaSwap = (
      title: string,
      desc: string,
      canonicalUrl: string,
      jsonLdObj?: Record<string, unknown>
    ): string => {
      const safeTitleText = escapeHtmlText(title);
      const safeTitleAttr = escapeHtmlAttribute(title);
      const safeDescAttr = escapeHtmlAttribute(desc);
      const safeUrlAttr = escapeHtmlAttribute(canonicalUrl);
      let updated = html
        .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${safeTitleText}</title>`)
        .replace(
          /property="og:title"\s+content="[^"]*"/,
          () => `property="og:title" content="${safeTitleAttr}"`
        )
        .replace(
          /name="description"\s+content="[^"]*"/,
          () => `name="description" content="${safeDescAttr}"`
        )
        .replace(
          /property="og:description"\s+content="[^"]*"/,
          () => `property="og:description" content="${safeDescAttr}"`
        )
        .replace(/rel="canonical"\s+href="[^"]*"/, () => `rel="canonical" href="${safeUrlAttr}"`)
        .replace(
          /property="og:url"\s+content="[^"]*"/,
          () => `property="og:url" content="${safeUrlAttr}"`
        );
      if (jsonLdObj) {
        const serializedJsonLd = serializeSafeJsonLd(jsonLdObj);
        updated = updated.replace(
          '</head>',
          () => `<script type="application/ld+json">${serializedJsonLd}</script>\n</head>`
        );
      }
      return updated;
    };

    if (/^\d{1,4}-\d{1,4}$/.test(compareParam)) {
      const [id1, id2] = compareParam.split('-').map((x) => Number(x.trim()));
      const h1 = allHoods.find((h) => h.id === id1);
      const h2 = allHoods.find((h) => h.id === id2);
      if (h1 && h2 && h1.id !== h2.id) {
        const resolvedCity = resolveCityIdForNeighborhood(h1.id) || cityParam || 'tehran';
        const cityPrefix = resolvedCity !== 'tehran' ? `city=${resolvedCity}&` : '';
        const canonicalUrl = `${baseUrl}/?${cityPrefix}compare=${h1.id}-${h2.id}`;
        const title = `مقایسه محله ${h1.name} و ${h2.name} | قیمت مسکن، رهن و کیفیت زندگی | رادار تهران`;
        const desc = `مقایسه تحلیلی محله ${h1.name} (متری ${toPersianNum(h1.buyPerSqm)} م، رهن ${toPersianNum(h1.rahn80m)} م) با محله ${h2.name} (متری ${toPersianNum(h2.buyPerSqm)} م، رهن ${toPersianNum(h2.rahn80m)} م) به همراه نمودار روند و ترافیک.`;
        return applyMetaSwap(title, desc, canonicalUrl, {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: title,
          description: desc,
          itemListElement: [
            {
              '@type': 'Place',
              position: 1,
              name: h1.name,
              geo: { '@type': 'GeoCoordinates', latitude: h1.lat, longitude: h1.lng },
            },
            {
              '@type': 'Place',
              position: 2,
              name: h2.name,
              geo: { '@type': 'GeoCoordinates', latitude: h2.lat, longitude: h2.lng },
            },
          ],
        });
      }
    }

    if (Number.isInteger(hoodParam) && hoodParam >= 1) {
      const h = allHoods.find((item) => item.id === hoodParam);
      if (h) {
        const resolvedCity = resolveCityIdForNeighborhood(h.id) || cityParam || 'tehran';
        const cityPrefix = resolvedCity !== 'tehran' ? `city=${resolvedCity}&` : '';
        const canonicalUrl = `${baseUrl}/?${cityPrefix}hood=${h.id}`;
        const title = `قیمت مسکن، رهن و کارنامه محله ${h.name} (${h.zone}) | رادار تهران`;
        const desc = `برآورد قیمت خرید آپارتمان در ${h.name}: متری ${toPersianNum(h.buyPerSqm)} میلیون تومان | رهن کامل ۸۰ متری: ${toPersianNum(h.rahn80m)} میلیون تومان | بررسی ترافیک، هوا، مدارس و فایل‌های زیر قیمت ${h.name}.`;
        return applyMetaSwap(title, desc, canonicalUrl, {
          '@context': 'https://schema.org',
          '@type': 'Place',
          name: `محله ${h.name} (${h.zone})`,
          description: desc,
          url: canonicalUrl,
          geo: { '@type': 'GeoCoordinates', latitude: h.lat, longitude: h.lng },
          additionalProperty: [
            {
              '@type': 'PropertyValue',
              name: `میانگین پایه خرید هر ${displayAreaUnitLabel} (میلیون تومان)`,
              value: h.buyPerSqm,
              alternateName: formatMillionTomanAsIntlCurrency(h.buyPerSqm, intlCurrency, 'en'),
            },
            {
              '@type': 'PropertyValue',
              name: 'میانگین پایه رهن کامل ۸۰ متری (میلیون تومان)',
              value: h.rahn80m,
            },
          ],
        });
      }
    }

    if (cityParam && cityParam !== 'tehran') {
      const cityCfg = getValidatedCityConfig(cityParam);
      const title = `رادار مسکن و اجاره ${cityCfg.nameFa} | نقشه قیمت و کیفیت زندگی محله‌ها`;
      const desc = `بررسی قیمت خرید، رهن و اجاره، کیفیت هوا، ترافیک و فایل‌های زیر قیمت در ${toPersianNum(cityCfg.neighborhoods.length)} محله شاخص ${cityCfg.nameFa}.`;
      return applyMetaSwap(title, desc, `${baseUrl}/?city=${cityParam}`, {
        '@context': 'https://schema.org',
        '@type': 'Place',
        name: cityCfg.nameFa,
        description: desc,
        url: `${baseUrl}/?city=${cityParam}`,
        geo: {
          '@type': 'GeoCoordinates',
          latitude: cityCfg.center[0],
          longitude: cityCfg.center[1],
        },
      });
    }
  } catch {
    // Preserve raw HTML on any unexpected parsing failure
  }
  return html;
}

export async function handleHealthAndMetadataRoute(
  ctx: WorkerRequestContext
): Promise<Response | null> {
  const { method, pathname, url } = ctx;
  if (method !== 'GET') return null;

  const uptimeSeconds = Math.max(0, Math.round((Date.now() - workerBootTimestampMs) / 1000));

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
      registeredRoutesCount: 88,
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
    if (ctx.env.DB) {
      const { inspectD1OperationalDiagnostics } = await import('../db/d1SchemaAndMigrations');
      const diag = await inspectD1OperationalDiagnostics(ctx.env.DB);
      if (!diag.allCanonicalMigrationsApplied) {
        return jsonWorkerResponse(ctx, 503, {
          ok: false,
          code: 'REQUIRED_D1_MIGRATION_PENDING',
          probe: 'readiness',
          state: 'DEGRADED',
          migrationReadiness: {
            allCanonicalMigrationsApplied: false,
            pendingMigrations: diag.pendingMigrations,
          },
        });
      }
      return jsonWorkerResponse(ctx, 200, {
        ok: true,
        probe: 'readiness',
        state: 'READY',
        activeRequests: 1,
        migrationReadiness: {
          allCanonicalMigrationsApplied: true,
          pendingMigrations: diag.pendingMigrations,
        },
      });
    }
    return jsonWorkerResponse(ctx, 200, {
      ok: true,
      probe: 'readiness',
      state: 'READY',
      activeRequests: 1,
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
    const urls: { loc: string; priority: string; changefreq: string }[] = [
      { loc: `${baseUrl}/`, priority: '1.0', changefreq: 'hourly' },
    ];
    for (const cId of VALID_CITY_IDS) {
      urls.push({
        loc: `${baseUrl}/?city=${cId}`,
        priority: cId === 'tehran' ? '0.95' : '0.9',
        changefreq: 'hourly',
      });
      const cityList =
        cId === 'tehran' ? INITIAL_NEIGHBORHOODS : MULTI_CITY_CONFIGS[cId]?.neighborhoods || [];
      const cityPrefix = cId !== 'tehran' ? `city=${cId}&` : '';
      for (const hood of cityList) {
        urls.push({
          loc: `${baseUrl}/?${cityPrefix}hood=${hood.id}`,
          priority: '0.9',
          changefreq: 'daily',
        });
      }
      for (let i = 0; i < cityList.length; i++) {
        for (let j = i + 1; j < cityList.length; j++) {
          urls.push({
            loc: `${baseUrl}/?${cityPrefix}compare=${cityList[i].id}-${cityList[j].id}`,
            priority: '0.8',
            changefreq: 'weekly',
          });
        }
      }
    }
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
