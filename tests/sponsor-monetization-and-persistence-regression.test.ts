import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { calculateCanonicalSponsorPricing, computeCanonicalSponsorPricing, sanitizeSponsorRecord } from '../src/utils/domainSecurityValidators';
import { getHoodMonthlySponsorTariff, INITIAL_NEIGHBORHOODS } from '../src/data/neighborhoods';
import {
  deepSyncedOverrides,
  getDeepSyncedOverride,
  loadDiskPersistedCache,
  saveDiskPersistedCache,
  setDeepSyncedOverride,
} from '../src/utils/serverMarketPulseEngine';
import { serverDataCorrections, serverPublishedBargains } from '../src/utils/serverPublisherBargains';
import { buildTelegramDigestPost } from '../src/utils/serverUtilityRoutes';

test('Crisis 1: computeCanonicalSponsorPricing preserves decimal tenths, zero-tariff 100% discount, and matches firestore.rules 3-month tolerance', () => {
  assert.equal(calculateCanonicalSponsorPricing(1, 3).totalPayableMillion, 36);
  assert.equal(computeCanonicalSponsorPricing(1, 3).totalPayableMillion, 2.4);
  assert.equal(computeCanonicalSponsorPricing(15, 3).totalPayableMillion, 36);
  assert.equal(computeCanonicalSponsorPricing(7.5, 3).totalPayableMillion, 18);
  assert.equal(computeCanonicalSponsorPricing(11.9, 3).totalPayableMillion, 28.6);
  assert.equal(computeCanonicalSponsorPricing(0, 1).totalPayableMillion, 0);
  assert.equal(computeCanonicalSponsorPricing(0, 3).totalPayableMillion, 0);

  for (const discount of [0, 15, 25, 33, 50, 75, 100]) {
    for (const hood of INITIAL_NEIGHBORHOODS.slice(0, 12)) {
      const monthly = getHoodMonthlySponsorTariff(hood, discount);
      const calc3m = computeCanonicalSponsorPricing(monthly, 3);
      assert.equal(calc3m.monthlyTariffMillion, monthly);
      // Matches firestore.rules: totalPayableMillion * 10 >= monthlyTariffMillion * 24 - 1 && <= + 1
      assert.ok(
        calc3m.totalPayableMillion * 10 >= calc3m.monthlyTariffMillion * 24 - 1 &&
          calc3m.totalPayableMillion * 10 <= calc3m.monthlyTariffMillion * 24 + 1,
        `Discount ${discount}% for ${hood.name}: monthly=${monthly}, total=${calc3m.totalPayableMillion} failed rules tolerance`,
      );
    }
  }

  const freeSponsor = sanitizeSponsorRecord({
    name: 'تست رایگان',
    phone: '09121112233',
    monthlyTariffMillion: 0,
    totalPayableMillion: 0,
  });
  assert.equal(freeSponsor.monthlyTariffMillion, 0);
  assert.equal(freeSponsor.totalPayableMillion, 0);
});

test('Crisis 4: serverUtilityRoutes.buildTelegramDigestPost consumes deepSyncedOverrides prices and liveBargains', () => {
  const prevOv = deepSyncedOverrides.tehran ? { ...deepSyncedOverrides.tehran } : {};
  try {
    setDeepSyncedOverride('tehran', 1, {
      buyPerSqm: 222,
      rahn80m: 1999,
      liveBargains: [
        {
          id: 'live-divar-test-digest-1',
          title: 'شکار تست دیجیست',
          type: 'خرید',
          sqm: 95,
          priceText: 'متری ۱۹۰ م.ت',
          discountPercent: 49,
          buyerProfitText: 'سود تست',
          street: 'بلوار تست زنده',
        },
      ],
      updatedAtIso: new Date().toISOString(),
    });
    const post = buildTelegramDigestPost('tehran');
    assert.ok(post.includes('live-divar') || post.includes('شکار تست دیجیست'), 'Digest should include live-divar bargain from deepSyncedOverrides');
    assert.ok(post.includes('شکار تست دیجیست'));
    assert.ok(post.includes('بلوار تست زنده'));
    assert.ok(getDeepSyncedOverride('tehran', 1)?.buyPerSqm === 222);
  } finally {
    deepSyncedOverrides.tehran = prevOv;
  }
});

test('Crisis 4: serverPublisherBargains persists to .cache-data.json without phone PII and restores on loadDiskPersistedCache', async () => {
  const cachePath = path.join(process.cwd(), '.cache-data.json');
  const hadCache = fs.existsSync(cachePath);
  const origCache = hadCache ? fs.readFileSync(cachePath, 'utf-8') : null;
  const testId = 'brg_persist_regression_test';
  const testCorrId = 'corr_persist_regression_test';

  try {
    serverPublishedBargains.set(testId, {
      id: testId,
      ownerUid: 'uid-test-persist',
      cityId: 'tehran',
      hoodId: 1,
      hoodName: 'ولنجک',
      title: 'آپارتمان تست پایداری دیسک',
      street: 'خیابان گلستان',
      sqm: 110,
      dealType: 'خرید',
      priceMillions: 18000,
      priceText: '۱۸ میلیارد',
      discountPercent: 15,
      buyerProfitText: 'تخفیف مناسب',
      lifecycleState: 'published',
      contactPhone: '09123456789',
      contactVisibility: 'reveal_on_action',
      priceHistory: [],
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
      expiresAtIso: new Date(Date.now() + 86400000).toISOString(),
    });
    serverDataCorrections.unshift({
      id: testCorrId,
      cityId: 'tehran',
      neighborhoodId: 1,
      neighborhoodName: 'ولنجک',
      category: 'buyPerSqm',
      currentDisplayedValue: '200',
      proposedCorrectedValue: '215',
      evidenceNote: 'تست پایداری اصلاح داده',
      reporterUid: 'uid-test-persist',
      status: 'pending_review',
      createdAtIso: new Date().toISOString(),
      reviewedAtIso: null,
    });

    saveDiskPersistedCache();
    await new Promise((r) => setTimeout(r, 600));

    assert.ok(fs.existsSync(cachePath), 'Expected .cache-data.json to be written');
    const diskText = fs.readFileSync(cachePath, 'utf-8');
    assert.ok(diskText.includes(testId), 'Expected publishedBargains record in .cache-data.json');
    assert.ok(diskText.includes(testCorrId), 'Expected dataCorrections record in .cache-data.json');
    assert.equal(diskText.includes('09123456789'), false, 'Phone PII must NEVER be persisted to .cache-data.json');

    serverPublishedBargains.delete(testId);
    const corrIdx = serverDataCorrections.findIndex((c) => c.id === testCorrId);
    if (corrIdx >= 0) serverDataCorrections.splice(corrIdx, 1);

    loadDiskPersistedCache();
    const restored = serverPublishedBargains.get(testId);
    assert.ok(restored, 'Expected loadDiskPersistedCache() to restore serverPublishedBargains');
    assert.equal(restored?.contactPhone, undefined);
    assert.equal(restored?.contactVisibility, 'not_available');
    assert.ok(serverDataCorrections.some((c) => c.id === testCorrId), 'Expected loadDiskPersistedCache() to restore serverDataCorrections');
  } finally {
    serverPublishedBargains.delete(testId);
    const idx = serverDataCorrections.findIndex((c) => c.id === testCorrId);
    if (idx >= 0) serverDataCorrections.splice(idx, 1);
    if (origCache !== null) fs.writeFileSync(cachePath, origCache, 'utf-8');
    else if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
  }
});
