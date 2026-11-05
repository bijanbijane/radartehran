import assert from 'node:assert/strict';
import {
  normalizePersianText,
  hasAffirmativeMatch,
  resolveAmenityStatus,
  resolveBuildingAge,
  extractListingSpecsFromText,
  parseIranianPriceToMillionToman,
  computeQualityMultiplier,
  aggregateNeighborhoodMarketMetrics,
  applySpatialGrowthFallback,
  verifyPricingEngineIntegrity,
} from '../src/data/realMarketPriceAggregator';

console.log('🧪 Running Iran-Native Hedonic Real Market Price Aggregator Test Suite (v6.2)...\n');

// 1. Persian NLP Normalization & Word-Number Context Guard
const t1 = normalizePersianText('قیمت ۱۲.۵۰۰.۰۰۰.۰۰۰ تومان در طبقه ۲/۵ با متراژ ۸۵ متر');
assert.ok(t1.includes('12500000000'), 'Multi-thousands separators stripped safely');
assert.ok(t1.includes('طبقه 2/5'), 'Fractional floor notation preserved without slash corruption');

const t2 = normalizePersianText('ساخت ۱۳۸۵ در تاریخ 1403/05/12 با قیمت ۱۲٫۵ میلیارد');
assert.ok(t2.includes('12.5 میلیارد'), 'Persian decimal separator converted to dot');

const t3 = normalizePersianText('واحد صفر تا صد بازسازی شده با قیمت یازده میلیارد و پانصد');
assert.ok(t3.includes('صفر تا صد'), 'Idiom صفر تا صد preserved');
assert.ok(t3.includes('11500 میلیون'), 'Compound word-number price folded to 11500 میلیون');

// 2. Sub-clause Isolated Negation & Strict و-Conjoined Pre-Negation
assert.equal(hasAffirmativeMatch('دارای پارکینگ و انباری سندی', 'پارکینگ'), true, 'Affirmative parking match');
assert.equal(hasAffirmativeMatch('واحد فاقد پارکینگ سندی می‌باشد', 'پارکینگ'), false, 'Pre-negation detected');
assert.equal(hasAffirmativeMatch('پارکینگ اختصاصی ندارد', 'پارکینگ'), false, 'Post-negation detected');
assert.equal(hasAffirmativeMatch('بدون آسانسور اما دارای پارکینگ سندی', 'پارکینگ'), true, 'Sub-clause isolation preserves positive switch');
assert.equal(hasAffirmativeMatch('بدون آسانسور اما دارای پارکینگ سندی', 'آسانسور'), false, 'Sub-clause isolation detects negative clause');
assert.equal(hasAffirmativeMatch('بدون پارکینگ و انباری', 'انباری'), false, 'Conjoined و pre-negation negates second noun');
assert.equal(hasAffirmativeMatch('بدون پارکینگ آسانسور دارد', 'آسانسور'), true, 'Unconjoined second noun with دارد is affirmative');

// 3. Amenity Status Resolution
assert.equal(resolveAmenityStatus('واحد بسیار نورگیر و تمیز', /پارکینگ/, true), true, 'Default value respected when absent');
assert.equal(resolveAmenityStatus('بدون پارکینگ', /پارکینگ/, true), false, 'Affirmative check overrides default');

// 4. Building Age Resolution & Fake Brand-New Guard
assert.equal(resolveBuildingAge(null, 'قبل از 1370'), 36, 'Pre-1370 mapped to 36');
assert.equal(resolveBuildingAge(null, 'متراژ سال ساخت اتاق\n95 1395 2'), 10, 'Divar header table parsed');
assert.equal(resolveBuildingAge(null, 'واحد نوساز کلید نخورده'), 0, 'Brand-new key-unturned is age 0');
assert.equal(resolveBuildingAge(1398, 'نوساز کلید نخورده'), 7, 'Direct numeric solar year takes priority over stale text');
assert.equal(resolveBuildingAge(null, 'نوساز بازسازی شده کامل'), 8, 'Fake brand-new guard sets age to 8');

// 5. Windowed Spec Extractor & Nullish-Safe Floor
const specs = extractListingSpecsFromText('زمین ۲۰۰ متری، بنای مفید ۹۰ متری طبقه ۳ از ۶ فول امکانات با پارکینگ و آسانسور');
assert.equal(specs.sqm, 90, 'Apartment area extracted ignoring land area');
assert.equal(specs.floor, 3, 'Floor extracted');
assert.equal(specs.totalFloors, 6, 'Total floors extracted');
assert.equal(specs.hasParking, true, 'Parking confirmed');
assert.equal(specs.hasElevator, true, 'Elevator confirmed');

const groundSpecs = extractListingSpecsFromText('آپارتمان ۸۰ متر طبقه همکف');
assert.equal(groundSpecs.floor, 0, 'Ground floor (همکف) preserved as 0');

// 6. Iranian Price Parsing
const netCashPrice = parseIranianPriceToMillionToman('نقدینگی ۱.۵ میلیارد + وام ۸۰۰ میلیون + رهن مستاجر ۴۰۰ میلیون');
assert.equal(netCashPrice.totalMillion, 2700, 'Net-cash composite price summed accurately without double-counting');

const bnPrice = parseIranianPriceToMillionToman('قیمت کل ۱۲ میلیارد و ۵۰۰ میلیون تومان');
assert.equal(bnPrice.totalMillion, 12500, 'Billion and million parsed together');

// 7. Quality Multiplier
const mult5yr = computeQualityMultiplier({ age: 5, floor: 2, hasParking: true, hasElevator: true, hasStorage: true });
assert.ok(Math.abs(mult5yr - 1.0) <= 0.03, `5-year standard unit multiplier centered near 1.0 (got ${mult5yr})`);

const multNew = computeQualityMultiplier({ age: 0, renovationStatus: 'luxury_renovated', floor: 4 });
assert.ok(multNew > 1.05, `Brand-new luxury unit has premium (got ${multNew})`);

const multOld = computeQualityMultiplier({ age: 35, floor: 4, hasElevator: false, hasParking: false });
assert.ok(multOld >= 0.68 && multOld <= 0.85, `Old unit without elevator/parking clamped safely (got ${multOld})`);

// 8. Market Aggregator with EMA velocity cap & Spatial Growth Fallback
const aggCold = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 150, []);
assert.equal(aggCold.isBootstrapped, true, 'Zero samples yields bootstrapped cold-start');
assert.notEqual(aggCold.marketRegime, 'FROZEN', 'Cold-start never defaults to FROZEN');
assert.ok(aggCold.autoBargainIds.length >= 2, 'Cold-start bootstrap preserves pre-IQR bargains');

const samples = [
  { askingTotalMillion: 14000, description: '۱۰۰ متر طبقه ۳ با پارکینگ ساخت ۱۴۰۰', yearOrAge: 1400 },
  { askingTotalMillion: 14500, description: '۱۰۰ متر طبقه ۲ ساخت ۱۳۹۸ با آسانسور', yearOrAge: 1398 },
  { askingTotalMillion: 13800, description: '۱۰۰ متر طبقه ۴ با پارکینگ ساخت ۱۴۰۱', yearOrAge: 1401 },
  { askingTotalMillion: 14200, description: '۱۰۰ متر طبقه ۲ ساخت ۱۳۹۹', yearOrAge: 1399 },
];
const aggWarm = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 140, samples, 140);
assert.equal(aggWarm.isBootstrapped, false, 'Sufficient samples is not bootstrapped');
assert.ok(Math.abs(aggWarm.hedonicAdjustedPerSqm - 140) / 140 <= 0.031, 'Daily velocity cap (+-3%) enforced');
assert.equal(aggWarm.marketRegime, 'BALANCED', '4 samples classified as BALANCED');

const spatialGrowth = applySpatialGrowthFallback(
  { id: 1, lat: 35.78, lng: 51.37, buyPerSqm: 150 },
  [
    { id: 2, lat: 35.79, lng: 51.38, buyPerSqm: 155, growthPct: 14.0 },
    { id: 3, lat: 35.77, lng: 51.36, buyPerSqm: 145, growthPct: 12.0 },
  ]
);
assert.ok(spatialGrowth > 11 && spatialGrowth < 15, `Spatial growth fallback interpolated (got ${spatialGrowth})`);

// 9. Full 11-case self-verification check
const selfCheck = verifyPricingEngineIntegrity();
assert.equal(selfCheck.passed, true, `Self-verification failed: ${selfCheck.failures.join('; ')}`);

console.log('✅ All Persian NLP & Real Market Price Aggregator v6.2 tests passed successfully!');
