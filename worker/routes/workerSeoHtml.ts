/** Worker-only SEO HTML transformations. Kept separate from health probes to keep each module cohesive. */
import { getAllMultiCityNeighborhoods, getValidatedCityConfig, resolveCityIdForNeighborhood } from '../../src/data/multiCityData';
import { toPersianNum } from '../../src/data/neighborhoods';
import { seoForDatedCompare, seoForDatedHood, seoFromPublicPath } from '../../src/data/neighborhoodListingSamples';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../../src/utils/areaUnit';
import { validateCityParam } from '../../src/utils/security';
import { resolveCanonicalBaseUrl } from '../../src/utils/serverDeliveryAndAbuseGuard';
import type { WorkerRequestContext } from '../types';

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
    const pathCard = seoFromPublicPath(url.pathname);
    if (pathCard) {
      const canonicalUrl = `${baseUrl}${pathCard.path}`;
      return applyMetaSwap(pathCard.title, pathCard.description, canonicalUrl, {
        '@context': 'https://schema.org', '@type': 'WebPage', name: pathCard.title, description: pathCard.description, url: canonicalUrl,
      });
    }

    if (/^\d{1,4}-\d{1,4}$/.test(compareParam)) {
      const [id1, id2] = compareParam.split('-').map((x) => Number(x.trim()));
      const h1 = allHoods.find((h) => h.id === id1);
      const h2 = allHoods.find((h) => h.id === id2);
      if (h1 && h2 && h1.id !== h2.id) {
        const resolvedCity = resolveCityIdForNeighborhood(h1.id) || cityParam || 'tehran';
        const cityPrefix = resolvedCity !== 'tehran' ? `city=${resolvedCity}&` : '';
        const dated = resolvedCity === 'tehran' ? seoForDatedCompare(h1.id, h2.id) : null;
        const canonicalUrl = dated ? `${baseUrl}${dated.path}` : `${baseUrl}/?${cityPrefix}compare=${h1.id}-${h2.id}`;
        const title = dated?.title ?? `مقایسه محله ${h1.name} و ${h2.name} | قیمت مسکن، رهن و کیفیت زندگی | رادار تهران`;
        const desc = dated?.description ?? `مقایسه تحلیلی محله ${h1.name} (متری ${toPersianNum(h1.buyPerSqm)} م، رهن ${toPersianNum(h1.rahn80m)} م) با محله ${h2.name} (متری ${toPersianNum(h2.buyPerSqm)} م، رهن ${toPersianNum(h2.rahn80m)} م) به همراه نمودار روند و ترافیک.`;
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
        const dated = resolvedCity === 'tehran' ? seoForDatedHood(h.id) : null;
        const canonicalUrl = dated ? `${baseUrl}${dated.path}` : `${baseUrl}/?${cityPrefix}hood=${h.id}`;
        const title = dated?.title ?? `قیمت مسکن، رهن و کارنامه محله ${h.name} (${h.zone}) | رادار تهران`;
        const desc = dated?.description ?? `برآورد قیمت خرید آپارتمان در ${h.name}: متری ${toPersianNum(h.buyPerSqm)} میلیون تومان | رهن کامل ۸۰ متری: ${toPersianNum(h.rahn80m)} میلیون تومان | بررسی ترافیک، هوا و مدارس ${h.name}.`;
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
      const desc = `بررسی قیمت خرید، رهن و اجاره، کیفیت هوا و ترافیک در ${toPersianNum(cityCfg.neighborhoods.length)} محله شاخص ${cityCfg.nameFa}.`;
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
