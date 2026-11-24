/**
 * @file tests/assess-009-010-seo-deeplink-and-crm-funnel.test.ts
 * @description Empirical validation for Campaign PROD-04 (Discoverability, Viral Sharing & Conversion):
 *   - ASSESS-009: SSR Dynamic SEO Meta & OpenGraph injection (`injectDynamicSeoMeta`),
 *     cross-city comparison deep-links (`?compare=5-101`), JSON-LD script breakout prevention,
 *     and XML escaping.
 *   - ASSESS-010: Single-flight bargain submission lock (`acquireBargainSubmissionLock`),
 *     independent media attachment retry (`attachMediaToPublishedBargain`), and Express/Firestore
 *     dual-write reconciliation (`syncPublishedBargainToExpressServer`).
 */

import assert from 'node:assert/strict';
import {
  injectDynamicSeoMeta,
  serializeSafeJsonLd,
  escapeXml,
} from '../src/utils/serverSeoAndSitemap';
import { handleFrontendSpaOrStaticAssetRequest } from '../apps/frontend/worker/spaDelivery';
import {
  acquireBargainSubmissionLock,
  isBargainSubmissionLocked,
  releaseBargainSubmissionLock,
  resetBargainSubmissionLockForTests,
  attachMediaToPublishedBargain,
  syncPublishedBargainToExpressServer,
} from '../src/utils/bargainSubmissionEngine';

console.log('--- Starting ASSESS-009 & ASSESS-010: SEO Deep-Link & CRM Conversion Funnel Audit ---');

const SAMPLE_INDEX_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <title>Placeholder Title</title>
  <meta name="description" content="Placeholder Description" />
  <meta property="og:title" content="Placeholder OG Title" />
  <meta property="og:description" content="Placeholder OG Desc" />
  <meta property="og:url" content="https://tehranradar.ir/" />
  <link rel="canonical" href="https://tehranradar.ir/" />
</head>
<body><div id="root"></div></body>
</html>`;

// ============================================================================
// 1. ASSESS-009: Cross-City Comparison Deep-Link (`?compare=5-101`) & Hood SSR Meta
// ============================================================================
{
  // 1.1: Cross-city comparison between Punak (5, Tehran) and Azimiyeh (101, Karaj)
  const compareHtml = injectDynamicSeoMeta(SAMPLE_INDEX_HTML, {
    query: { compare: '5-101' },
  } as any);

  assert.ok(compareHtml.includes('پونک'), 'Comparison SSR meta must include first neighborhood name (پونک)');
  assert.ok(compareHtml.includes('عظیمیه'), 'Comparison SSR meta must include cross-city second neighborhood name (عظیمیه)');
  assert.ok(compareHtml.includes('compare=5-101'), 'Canonical URL must preserve compare=5-101');
  assert.ok(compareHtml.includes('"@type":"ItemList"'), 'Comparison page must inject Schema.org ItemList JSON-LD');

  // 1.2: Non-Tehran Single Neighborhood Deep-Link (`?hood=304` -> Sheikh Sadoogh, Isfahan)
  const hoodHtml = injectDynamicSeoMeta(SAMPLE_INDEX_HTML, {
    query: { hood: '304' },
  } as any);

  assert.ok(hoodHtml.includes('شیخ صدوق'), 'Single hood SSR meta must resolve hood 304 (شیخ صدوق)');
  assert.ok(hoodHtml.includes('city=isfahan&amp;hood=304'), 'Canonical URL for non-Tehran hood must include city=isfahan prefix');
  assert.ok(hoodHtml.includes('"@type":"Place"'), 'Single hood page must inject Schema.org Place JSON-LD');

  // 1.3: JSON-LD Script Breakout Defense (`serializeSafeJsonLd`)
  const unsafeJsonLd = serializeSafeJsonLd({
    '@context': 'https://schema.org',
    name: 'Test </script><script>alert(1)</script> <!-- comment -->',
  });
  assert.ok(!unsafeJsonLd.includes('</script>'), 'JSON-LD serializer must escape </script> sequences');
  assert.ok(unsafeJsonLd.includes('\\u003c/script\\u003e'), 'JSON-LD must unicode-escape < and >');

  // 1.4: XML Sitemap Escaping
  const escapedLoc = escapeXml('https://tehranradar.ir/?city=karaj&hood=101');
  assert.equal(escapedLoc, 'https://tehranradar.ir/?city=karaj&amp;hood=101');

  console.log('✓ 1. ASSESS-009: SSR SEO meta, cross-city comparison deep-links & JSON-LD safety verified');
}

// ============================================================================
// 2. ASSESS-010: Single-Flight Bargain Lock, Media Retry & Dual-Write Sync
// ============================================================================
await (async () => {
  resetBargainSubmissionLockForTests();
  assert.equal(isBargainSubmissionLocked(), false);

  const firstLock = acquireBargainSubmissionLock('idem-001');
  const duplicateLock = acquireBargainSubmissionLock('idem-002');
  assert.equal(firstLock, true, 'First submission lock acquisition must succeed');
  assert.equal(duplicateLock, false, 'Concurrent double-click submission must be rejected by single-flight lock');

  releaseBargainSubmissionLock();
  assert.equal(isBargainSubmissionLocked(), false, 'Lock must release cleanly after completion');

  // 2.2: Independent Media Attachment Retry (Simulated Transient Failure -> Retry Success)
  let attachCalls = 0;
  const mockFetchAttach = (async () => {
    attachCalls++;
    if (attachCalls === 1) {
      return {
        ok: false,
        json: async () => ({ error: 'خطای موقت شبکه در اتصال رسانه' }),
      } as any;
    }
    return {
      ok: true,
      json: async () => ({ ok: true }),
    } as any;
  }) as unknown as typeof fetch;

  const attempt1 = await attachMediaToPublishedBargain({
    bargainId: 'brg-test-900',
    objectIds: ['obj-1', 'obj-2'],
    getIdToken: async () => 'mock-jwt-token',
    fetchImpl: mockFetchAttach,
  });
  assert.equal(attempt1.ok, false, 'First media attach fails gracefully without throwing');
  assert.ok(attempt1.errorMessageFa?.includes('خطای موقت'));

  const attempt2 = await attachMediaToPublishedBargain({
    bargainId: 'brg-test-900',
    objectIds: ['obj-1', 'obj-2'],
    getIdToken: async () => 'mock-jwt-token',
    fetchImpl: mockFetchAttach,
  });
  assert.equal(attempt2.ok, true, 'Second retry succeeds independently without duplicating bargain');
  assert.deepEqual(attempt2.attachedObjectIds, ['obj-1', 'obj-2']);

  // 2.3: Dual-Write Reconciliation (`syncPublishedBargainToExpressServer`)
  const syncSuccess = await syncPublishedBargainToExpressServer({
    id: 'brg-test-900',
    city: 'tehran',
    hoodId: 5,
    title: '۸۵ متری خوش‌نقشه پونک',
    type: 'خرید',
    sqm: 85,
    priceText: 'متری ۱۱۵ میلیون',
    discountPercent: 14,
    buyerProfitText: '۱.۲ میلیارد زیر قیمت',
    street: 'همیلا',
    createdAtIso: new Date().toISOString(),
    fetchImpl: (async () => ({ ok: true })) as unknown as typeof fetch,
  });
  assert.equal(syncSuccess.ok, true);
  assert.equal(syncSuccess.consistencyState, 'reconciled');

  const syncOfflineFallback = await syncPublishedBargainToExpressServer({
    id: 'brg-test-901',
    city: 'tehran',
    hoodId: 5,
    title: '۸۵ متری خوش‌نقشه پونک',
    type: 'خرید',
    sqm: 85,
    priceText: 'متری ۱۱۵ میلیون',
    discountPercent: 14,
    buyerProfitText: '۱.۲ میلیارد زیر قیمت',
    street: 'همیلا',
    createdAtIso: new Date().toISOString(),
    fetchImpl: (async () => {
      throw new Error('Network offline');
    }) as unknown as typeof fetch,
  });
  assert.equal(syncOfflineFallback.ok, false);
  assert.equal(
    syncOfflineFallback.consistencyState,
    'partially_persisted',
    'Server cache sync failure must degrade gracefully to partially_persisted'
  );

  console.log('✓ 2. ASSESS-010: Single-flight bargain lock, independent media retry & dual-write sync verified');
})();

// ============================================================================
// 3. FRONTEND WORKER SEO FOUNDATION: clean URLs, scoped 404s, and noindex
// ============================================================================
{
  const edgeShell = SAMPLE_INDEX_HTML.replace(
    '<meta name="description"',
    '<meta name="robots" content="index, follow" />\n  <meta name="description"',
  );
  const makeEnv = () => ({
    ASSETS: {
      fetch: async () => new Response(edgeShell, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    },
  });

  const cleanUrl = new URL('https://radartehran.ir/tehran/punak');
  const cleanResponse = await handleFrontendSpaOrStaticAssetRequest(
    new Request(cleanUrl), makeEnv() as any, cleanUrl, 'seo-clean-route', 'https://radartehran.ir',
  );
  const cleanHtml = await cleanResponse.text();
  assert.equal(cleanResponse.status, 200, 'Known clean neighborhood routes must return HTML 200');
  assert.ok(cleanHtml.includes('https://radartehran.ir/tehran/punak'), 'Clean neighborhood route must receive its own canonical URL');
  assert.ok(cleanHtml.includes('پونک'), 'Clean neighborhood route must receive its server-side title/metadata');

  const invalidUrl = new URL('https://radartehran.ir/tehran/not-a-real-neighborhood');
  const invalidResponse = await handleFrontendSpaOrStaticAssetRequest(
    new Request(invalidUrl), makeEnv() as any, invalidUrl, 'seo-invalid-route', 'https://radartehran.ir',
  );
  assert.equal(invalidResponse.status, 404, 'Unknown /tehran/* SEO slugs must not become SPA soft-404 pages');

  const accountUrl = new URL('https://radartehran.ir/account/profile');
  const accountResponse = await handleFrontendSpaOrStaticAssetRequest(
    new Request(accountUrl), makeEnv() as any, accountUrl, 'seo-private-route', 'https://radartehran.ir',
  );
  const accountHtml = await accountResponse.text();
  assert.equal(accountResponse.status, 200);
  assert.ok(accountHtml.includes('name="robots" content="noindex, nofollow"'), 'Account routes must override the global index policy');
  assert.equal((accountHtml.match(/name="robots"/g) || []).length, 1, 'Private route must contain exactly one robots directive');

  const homeUrl = new URL('https://radartehran.ir/');
  const homeResponse = await handleFrontendSpaOrStaticAssetRequest(
    new Request(homeUrl), makeEnv() as any, homeUrl, 'seo-public-route', 'https://radartehran.ir',
  );
  const homeHtml = await homeResponse.text();
  assert.ok(homeHtml.includes('name="robots" content="index, follow"'), 'Public homepage must preserve its global index policy');
  console.log('✓ Frontend Worker clean-path SEO, invalid Tehran slug 404, and private-route noindex verified');
}

console.log('--- ALL ASSESS-009 & ASSESS-010 SEO & CRM FUNNEL TESTS PASSED ---');
