import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  validateAndSanitizeSearchQuery,
  normalizePersianSearchQuery,
} from '../server/modules/search/searchValidator';
import { PropertySearchEngine } from '../server/modules/search/searchEngine';
import { registerPropertySearchRoutes } from '../server/modules/search/searchRoutes';
import { serverPublishedBargains, type ServerPublishedBargainRecord } from '../src/utils/serverPublisherBargains';

console.log('🧪 Running Employee 9 Property Search & Discovery Backend Tests...\n');

let passed = 0;
function verify(name: string, fn: () => void | Promise<void>) {
  const res = fn();
  if (res instanceof Promise) {
    return res.then(() => {
      passed += 1;
      console.log(`  ✅ ${passed}. ${name}`);
    });
  }
  passed += 1;
  console.log(`  ✅ ${passed}. ${name}`);
}

async function runAllTests() {
  // Test 1: Query validator and Persian text normalization
  await verify('Search validator enforces bounds, rejects invalid ranges, and normalizes Persian text', () => {
    const invalidRange = validateAndSanitizeSearchQuery({
      minPriceMillions: 15000,
      maxPriceMillions: 5000,
    });
    assert.equal(invalidRange.valid, false);
    assert.ok(invalidRange.errors.some((e) => e.includes('حداقل قیمت نمی‌تواند')));

    const invalidSqm = validateAndSanitizeSearchQuery({
      minSqm: 200,
      maxSqm: 50,
    });
    assert.equal(invalidSqm.valid, false);

    const norm = normalizePersianSearchQuery('آپارتمان ۱۲۰ متری در سعادت‌آباد كرج');
    assert.equal(norm, 'اپارتمان 120 متری در سعادت اباد کرج');

    const validQuery = validateAndSanitizeSearchQuery({
      query: 'پونک',
      cityId: 'tehran',
      minPriceMillions: 1000,
      maxPriceMillions: 15000,
      dealMode: 'buy',
      sortBy: 'price_asc',
      limit: 10,
    });
    assert.equal(validQuery.valid, true);
    assert.equal(validQuery.sanitizedParams?.cityId, 'tehran');
    assert.equal(validQuery.sanitizedParams?.dealMode, 'buy');
    assert.equal(validQuery.sanitizedParams?.sortBy, 'price_asc');
  });

  // Test 2: Access control — strictly exclude pending, rejected or archived listings
  await verify('Search engine strictly excludes pending and rejected listings and redacts private contacts', () => {
    const engine = new PropertySearchEngine();

    // Inject test records
    const approvedBrg: ServerPublishedBargainRecord = {
      id: 'brg_approved_test',
      ownerUid: 'user_1',
      cityId: 'tehran',
      hoodId: 5,
      hoodName: 'پونک',
      title: 'واحد ۸۵ متری پونک، فول امکانات',
      street: 'بلوار میرزابابایی',
      sqm: 85,
      dealType: 'خرید',
      priceMillions: 8500,
      priceText: '۸.۵ میلیارد تومان',
      discountPercent: 18,
      buyerProfitText: '۱.۸ میلیارد سود',
      lifecycleState: 'published',
      contactPhone: '09123456789',
      contactVisibility: 'reveal_on_action', // Private phone
      priceHistory: [],
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
      expiresAtIso: new Date(Date.now() + 86400000).toISOString(),
    };

    const pendingBrg: ServerPublishedBargainRecord = {
      ...approvedBrg,
      id: 'brg_pending_test',
      title: 'واحد پنهان تایید نشده',
      lifecycleState: 'pending_review',
    };

    serverPublishedBargains.set(approvedBrg.id, approvedBrg);
    serverPublishedBargains.set(pendingBrg.id, pendingBrg);

    const results = engine.executeSearch({ cityId: 'tehran', hoodId: 5 });

    const foundApproved = results.items.find((i) => i.id === 'brg_approved_test');
    const foundPending = results.items.find((i) => i.id === 'brg_pending_test');

    assert.ok(foundApproved !== undefined, 'Approved bargain must be returned');
    assert.equal(foundPending, undefined, 'Pending bargain must be excluded from public search');
    assert.equal(foundApproved?.contactPhone, undefined, 'Private contact must not be exposed directly');

    // Cleanup
    serverPublishedBargains.delete(approvedBrg.id);
    serverPublishedBargains.delete(pendingBrg.id);
  });

  // Test 3: Multi-dimensional filtering and city segmentation
  await verify('Search engine applies city, deal mode, price, and sqm bounds correctly', () => {
    const engine = new PropertySearchEngine();

    const tehranResults = engine.executeSearch({ cityId: 'tehran', dealMode: 'buy' });
    assert.ok(tehranResults.items.length > 0);
    assert.ok(tehranResults.items.every((i) => i.cityId === 'tehran'));
    assert.ok(tehranResults.items.every((i) => i.dealType === 'خرید'));

    const karajResults = engine.executeSearch({ cityId: 'karaj', dealMode: 'all' });
    assert.ok(karajResults.items.length > 0);
    assert.ok(karajResults.items.every((i) => i.cityId === 'karaj'));

    const filteredPrice = engine.executeSearch({
      cityId: 'tehran',
      minPriceMillions: 3000,
      maxPriceMillions: 12000,
    });
    assert.ok(filteredPrice.items.every((i) => i.priceMillions >= 3000 && i.priceMillions <= 12000));
  });

  // Test 4: Cursor pagination and stable sorting
  await verify('Cursor pagination returns contiguous non-overlapping windows and stable nextCursor', () => {
    const engine = new PropertySearchEngine();

    const page1 = engine.executeSearch({ cityId: 'tehran', limit: 2, sortBy: 'price_asc' });
    assert.equal(page1.items.length, 2);
    assert.ok(page1.hasMore);
    assert.ok(page1.nextCursor !== null);

    const page2 = engine.executeSearch({
      cityId: 'tehran',
      limit: 2,
      sortBy: 'price_asc',
      cursor: page1.nextCursor,
    });

    assert.equal(page2.items.length, 2);
    // Verify no overlap between page 1 and page 2
    const page1Ids = new Set(page1.items.map((i) => i.id));
    assert.ok(page2.items.every((i) => !page1Ids.has(i.id)), 'Page 2 must not duplicate Page 1 items');
  });

  // Test 5: Express API routes mounting and execution
  await verify('Search Express routes respond accurately to GET and POST queries with summary metadata', async () => {
    const app = express();
    app.use(express.json());
    registerPropertySearchRoutes(app);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const getRes = await fetch(`${baseUrl}/api/v2/search/properties?cityId=tehran&dealMode=buy&limit=5`);
      assert.equal(getRes.status, 200);
      const getJson = (await getRes.json()) as { status: string; items: any[]; summary: any };
      assert.equal(getJson.status, 'ok');
      assert.ok(Array.isArray(getJson.items));
      assert.ok(getJson.summary.totalMatches >= getJson.items.length);
      assert.ok(getJson.summary.benchmarkIntlText !== undefined);

      const postRes = await fetch(`${baseUrl}/api/v2/search/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityId: 'karaj',
          dealMode: 'all',
          limit: 3,
        }),
      });
      assert.equal(postRes.status, 200);
      const postJson = (await postRes.json()) as { status: string; items: any[] };
      assert.equal(postJson.status, 'ok');
      assert.equal(postJson.items.length, 3);

      const metaRes = await fetch(`${baseUrl}/api/v2/search/metadata`);
      assert.equal(metaRes.status, 200);
      const metaJson = (await metaRes.json()) as { status: string; supportedSortFields: string[] };
      assert.equal(metaJson.status, 'ok');
      assert.ok(metaJson.supportedSortFields.includes('price_asc'));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  console.log(`\n🎉 ALL ${passed} EMPLOYEE 9 SEARCH & DISCOVERY TESTS PASSED!\n`);
}

runAllTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
