import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDivarComparableProvenance } from '../src/utils/divarComparableListings.js';
import {
  parseListingNarrativeText,
  diagnoseListingDeal,
  getRemainingVerificationQuota,
  consumeVerificationQuota,
  FREE_QUOTA_MAX,
} from '../src/utils/listingVerifierEngine.js';

test('parseListingNarrativeText extracts key Iranian real-estate fields', () => {
  const sampleAd = `
    سعادت‌آباد ۱۲۰ متری نوساز
    قیمت کل: ۱۹ میلیارد و ۲۰۰ میلیون تومان
    طبقه ۴ با آسانسور و پارکینگ سندی و انباری
    سند تک برگ عرصه و اعیان، سالن پرده خور
  `;
  const parsed = parseListingNarrativeText(sampleAd, 'سعادت‌آباد');
  assert.equal(parsed.areaSqm, 120);
  assert.equal(parsed.askingPriceTotalMillion, 19200);
  assert.equal(parsed.askingPricePerSqm, 160);
  assert.equal(parsed.floor, 4);
  assert.equal(parsed.buildingAgeYears, 0);
  assert.equal(parsed.hasElevator, true);
  assert.equal(parsed.hasParking, true);
  assert.equal(parsed.hasStorage, true);
  assert.equal(parsed.deedCategory, 'PERSONAL_SINGLE');
});

test('diagnoseListingDeal flags bubble prices and generates discount script', () => {
  // Saadat Abad (ID 3 in Tehran has buyPerSqm 620). Asking 75 billion for 100m is 750M/sqm (bubble)
  const parsed = parseListingNarrativeText('آپارتمان ۱۰۰ متری در سعادت آباد قیمت ۷۵ میلیارد تومان', 'سعادت‌آباد');
  const result = diagnoseListingDeal(parsed, 'tehran', 3, {
    medianPerSqm: 200,
    comparables: [],
    insufficientSample: false,
    provenance: buildDivarComparableProvenance('verified_live', '2026-11-12T00:00:00.000Z'),
  });

  assert.equal(result.parsed.askingPricePerSqm, 750);
  assert.ok(result.referenceBenchmarkPerSqm > 0);
  assert.ok(result.fairDealPricePerSqm === result.referenceBenchmarkPerSqm);
  assert.ok(['LIVE_ASKING_MEDIAN', 'HEURISTIC_V64', 'UNAVAILABLE'].includes(result.benchmarkKind));
  assert.ok(result.benchmarkLabelFa.length > 4);
  assert.ok(result.bubbleGapPct > 0);
  assert.ok(result.totalBubbleMillion > 0);
  assert.ok(result.recommendedDiscountMillion > 0);
  assert.ok(['NEGOTIATION_REQUIRED', 'HEAVY_BUBBLE'].includes(result.dealVerdict));
  assert.ok(result.negotiationScript.closingMeetingTactic.length > 10);
  assert.ok(result.negotiationScript.firstCallQuestions.length >= 4);
});

test('diagnoseListingDeal withholds bubble verdict when today median is missing', () => {
  const parsed = parseListingNarrativeText('آپارتمان ۱۰۰ متری در سعادت آباد قیمت ۷۵ میلیارد تومان', 'سعادت‌آباد');
  const result = diagnoseListingDeal(parsed, 'tehran', 3);
  assert.equal(result.benchmarkKind, 'UNAVAILABLE');
  assert.equal(result.dealVerdict, 'EVIDENCE_UNAVAILABLE');
  assert.equal(result.bubbleGapPct, 0);
  assert.equal(result.recommendedDiscountMillion, 0);
  assert.equal(result.verdictLabelFa, 'میانهٔ امروز موجود نیست؛ جدول داخلی محله معیار معامله نیست.');
  assert.equal(result.benchmarkLabelFa, 'مرجع داخلی، آبان ۱۴۰۵');
  assert.equal(result.negotiationScript.openingOfferMillion, 0);
});

test('diagnoseListingDeal identifies walk-up red flag and parking penalty', () => {
  const parsed = parseListingNarrativeText('پونک ۸۵ متری طبقه ۴ بدون آسانسور و بدون پارکینگ قولنامه‌ای', 'پونک');
  const result = diagnoseListingDeal(parsed, 'tehran', 5);

  assert.equal(parsed.hasElevator, false);
  assert.equal(parsed.hasParking, false);
  const flagIds = result.redFlags.map((f) => f.id);
  assert.ok(flagIds.includes('rf_no_elevator'), 'Must flag 4th floor without elevator');
  assert.ok(flagIds.includes('rf_no_parking'), 'Must flag missing parking in 85m unit');
  assert.ok(flagIds.includes('rf_promissory'), 'Must flag promissory deed');
});

test('quota management properly decrements and limits free evaluations', () => {
  const store = new Map<string, string>();
  // @ts-expect-error test mock
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };

  assert.equal(FREE_QUOTA_MAX, 3);
  assert.equal(getRemainingVerificationQuota(), 3);

  const rem1 = consumeVerificationQuota();
  assert.equal(rem1, 2);

  const rem2 = consumeVerificationQuota();
  assert.equal(rem2, 1);

  const rem3 = consumeVerificationQuota();
  assert.equal(rem3, 0);

  const rem4 = consumeVerificationQuota();
  assert.equal(rem4, 0);
});

test('diagnoseListingDeal prioritizes SUSPICIOUS_BAIT over FAIR_OPPORTUNITY at <= -22% gap', () => {
  // 140M/sqm vs 200M/sqm live median = -30% gap, clean deed/elevator/parking
  const parsed = parseListingNarrativeText(
    'سعادت آباد ۱۰۰ متری طبقه ۲ با آسانسور و پارکینگ سندی و انباری سند تک برگ شخصی قیمت کل ۱۴ میلیارد تومان',
    'سعادت‌آباد',
  );
  const result = diagnoseListingDeal(parsed, 'tehran', 3, {
    medianPerSqm: 200,
    comparables: [],
    insufficientSample: false,
    provenance: buildDivarComparableProvenance('verified_live', '2026-11-12T00:00:00.000Z'),
  });
  assert.equal(result.bubbleGapPct, -30);
  assert.equal(result.dealVerdict, 'SUSPICIOUS_BAIT');
  assert.ok(result.redFlags.some((r) => r.id === 'rf_bait_price'));
});

