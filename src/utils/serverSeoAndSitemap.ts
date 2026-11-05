import type { Express, Request, Response } from 'express'; import { INITIAL_NEIGHBORHOODS, toPersianNum } from '../data/neighborhoods'; import { MULTI_CITY_CONFIGS, CityId, getAllMultiCityNeighborhoods, getValidatedCityConfig, resolveCityIdForNeighborhood, } from '../data/multiCityData'; import { validateCityParam } from './security';
import { getValidatedServerConfig, buildOpenApiSpecification } from './serverConfigValidator'; import { resolveCanonicalBaseUrl } from './serverDeliveryAndAbuseGuard'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; const VALID_CITY_IDS: readonly CityId[] = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']; const toPersianDigits = toPersianNum;
/**
 * Task 431: Resolves the canonical public base URL strictly from validated server configuration (`APP_URL`),
 * never from untrusted Host or X-Forwarded-Host headers.
 */
export function resolveBaseUrl(_req?: Request): string { try { const srvCfg = getValidatedServerConfig(process.env); return resolveCanonicalBaseUrl(srvCfg.appUrl, process.env.NODE_ENV); } catch { return resolveCanonicalBaseUrl(undefined, process.env.NODE_ENV); } }
/**
 * Escapes special XML characters for safe `<loc>` tags inside `sitemap.xml`.
 */
export function escapeXml(unsafe: string): string { return String(unsafe).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
/**
 * Task 446 & 508: Escapes HTML text nodes (`<title>`).
 */
export function escapeHtmlText(raw: string): string { return String(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
/**
 * Task 446 & 508: Escapes HTML attribute values (`content="..."`, `href="..."`).
 */
export function escapeHtmlAttribute(raw: string): string { return String(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
/**
 * Task 446 & 508: Safely serializes JSON-LD so `</script>`, `<!--`, and line separators
 * can never break out of `<script type="application/ld+json">`.
 */
export function serializeSafeJsonLd(jsonLdObj: Record<string, unknown>): string { return JSON.stringify(jsonLdObj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
/**
 * SSR Dynamic SEO Meta & OpenGraph Injector for `?city=`, `?hood=` and `?compare=` links.
 */
export function injectDynamicSeoMeta(html: string, req: Request, areaUnit: AreaUnit = 'sqm', intlCurrency: IntlCurrencyCode = 'USD'): string { try {
    const baseUrl = resolveBaseUrl(req); const allHoods = getAllMultiCityNeighborhoods(); const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
    const compareParam = typeof req.query.compare === 'string' ? req.query.compare : '';
    const hoodParam = typeof req.query.hood === 'string' ? Number(req.query.hood) : 0;
    const cityParam =
      typeof req.query.city === 'string' ? validateCityParam(req.query.city, 'tehran') : null;
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
        .replace(
          /rel="canonical"\s+href="[^"]*"/,
          () => `rel="canonical" href="${safeUrlAttr}"`
        )
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
        const desc = `مقایسه تحلیلی محله ${h1.name} (متری ${toPersianDigits(h1.buyPerSqm)} م، رهن ${toPersianDigits(h1.rahn80m)} م) با محله ${h2.name} (متری ${toPersianDigits(h2.buyPerSqm)} م، رهن ${toPersianDigits(h2.rahn80m)} م) به همراه نمودار روند و ترافیک.`;
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
        const desc = `برآورد قیمت خرید آپارتمان در ${h.name}: متری ${toPersianDigits(h.buyPerSqm)} میلیون تومان | رهن کامل ۸۰ متری: ${toPersianDigits(h.rahn80m)} میلیون تومان | بررسی ترافیک، هوا، مدارس و فایل‌های زیر قیمت ${h.name}.`;
        return applyMetaSwap(title, desc, canonicalUrl, {
          '@context': 'https://schema.org',
          '@type': 'Place',
          name: `محله ${h.name} (${h.zone})`,
          description: desc,
          url: canonicalUrl,
          geo: { '@type': 'GeoCoordinates', latitude: h.lat, longitude: h.lng },
          additionalProperty: [
            { '@type': 'PropertyValue', name: `میانگین پایه خرید هر ${displayAreaUnitLabel} (میلیون تومان)`, value: h.buyPerSqm, alternateName: formatMillionTomanAsIntlCurrency(h.buyPerSqm, intlCurrency, 'en') },
            { '@type': 'PropertyValue', name: 'میانگین پایه رهن کامل ۸۰ متری (میلیون تومان)', value: h.rahn80m },
          ],
        });
      }
    }
    if (cityParam && cityParam !== 'tehran') {
      const cityCfg = getValidatedCityConfig(cityParam);
      const title = `رادار مسکن و اجاره ${cityCfg.nameFa} | نقشه قیمت و کیفیت زندگی محله‌ها`;
      const desc = `بررسی قیمت خرید، رهن و اجاره، کیفیت هوا، ترافیک و فایل‌های زیر قیمت در ${toPersianDigits(cityCfg.neighborhoods.length)} محله شاخص ${cityCfg.nameFa}.`;
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
  }
  return html;
}
/**
 * Registers `/manifest.json`, `/sitemap.xml`, and `/robots.txt` on the Express app.
 */
const registeredSeoApps = new WeakSet<Express>(); export function registerSeoAndSitemapRoutes(app: Express): void { if (registeredSeoApps.has(app)) return; registeredSeoApps.add(app);
  app.get('/manifest.json', (_req: Request, res: Response) => {
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
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json(manifest);
  });
  app.get('/sitemap.xml', (req: Request, res: Response) => {
    try {
      const baseUrl = resolveBaseUrl(req);
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
          (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${todayIso}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
        )
        .join('\n');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlItems}
</urlset>`;
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.status(200).send(xml);
    } catch {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
    }
  });
  app.get('/robots.txt', (req: Request, res: Response) => {
    const baseUrl = resolveBaseUrl(req);
    const robotsTxt = `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${baseUrl}/sitemap.xml\n`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.status(200).send(robotsTxt);
  });
  app.get('/api/openapi.json', (req: Request, res: Response) => {
    const baseUrl = resolveBaseUrl(req);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json(buildOpenApiSpecification(baseUrl));
  });
}