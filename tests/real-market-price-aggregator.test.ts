import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  normalizePersianText,
  hasAffirmativeMatch,
  resolveAmenityStatus,
  resolveBuildingAge,
  extractListingSpecsFromText,
  parseIranianPriceToMillionToman,
  computeQualityMultiplier,
  aggregateNeighborhoodMarketMetrics,
  aggregateMarketMetricsForHood,
  buildNeighborhoodListingSamples,
  formatNeighborhoodPriceTruthFa,
  TEHRAN_DATED_REFERENCE_PRICES,
  applySpatialGrowthFallback,
  verifyPricingEngineIntegrity,
} from '../src/data/realMarketPriceAggregator';
import {
  buildBudgetFitVerdict,
  formatBudgetVerdictShareText,
  parseTehranPublicPath,
  seoForDatedHood,
  seoFromPublicPath,
  tehranSitemapEntries,
} from '../src/data/neighborhoodListingSamples';
import { INITIAL_NEIGHBORHOODS } from '../src/data/neighborhoods';

console.log('🧪 Running Iran-Native Hedonic Real Market Price Aggregator Test Suite (v6.4 + WS-A1-R)...\n');

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

// 5. Windowed Spec Extractor & Explicit Area Tracking
const specs = extractListingSpecsFromText('زمین ۲۰۰ متری، بنای مفید ۹۰ متری طبقه ۳ از ۶ فول امکانات با پارکینگ و آسانسور');
assert.equal(specs.sqm, 90, 'Apartment area extracted ignoring land area');
assert.equal(specs.hasExplicitSqm, true, 'Explicit area extraction flagged true');
assert.equal(specs.extractedSqm, 90, 'extractedSqm matches 90');
assert.equal(specs.floor, 3, 'Floor extracted');
assert.equal(specs.totalFloors, 6, 'Total floors extracted');
assert.equal(specs.hasParking, true, 'Parking confirmed');
assert.equal(specs.hasElevator, true, 'Elevator confirmed');

const missingSqmSpecs = extractListingSpecsFromText('آپارتمان خوش نقشه در پونک طبقه سوم با پارکینگ');
assert.equal(missingSqmSpecs.hasExplicitSqm, false, 'Missing area in text sets hasExplicitSqm to false');
assert.equal(missingSqmSpecs.extractedSqm, null, 'Missing area in text sets extractedSqm to null');

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

// 8. WS-A1-R Section 8.1: 15 Required Aggregator Regression Cases
// Case 8.1.1: Zero observed samples (no synthetic fabrication)
const aggCold = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 150, []);
assert.equal(aggCold.isBootstrapped, true, 'Zero samples yields bootstrapped reference state');
assert.equal(aggCold.rawInputCount, 0, 'rawInputCount is 0');
assert.equal(aggCold.observedSampleCount, 0, 'Zero observed samples never inflated by synthetic rows');
assert.equal(aggCold.eligibleObservedCount, 0, 'Zero eligible observed samples when input is empty');
assert.equal(aggCold.sampleCount, 0, 'sampleCount is 0 when no observed listings exist');
assert.equal(aggCold.validSampleCount, 0, 'validSampleCount is 0 when no observed listings exist');
assert.equal(aggCold.syntheticSampleCount, 0, 'Zero synthetic samples generated (no PRNG fabrication)');
assert.equal(aggCold.provenance, 'REFERENCE_BASELINE', 'Zero samples marked as REFERENCE_BASELINE');
assert.equal(aggCold.epistemicStatus, 'ESTIMATED', 'Cold-start epistemic status is ESTIMATED (not SYNTHETIC)');
assert.equal(aggCold.dataMode, 'ILLUSTRATIVE_BOOTSTRAP', 'Cold-start dataMode is ILLUSTRATIVE_BOOTSTRAP');
assert.equal(aggCold.calibratedConfidencePct, null, 'Bootstrap result never exposes arbitrary numeric percentage as calibrated statistical confidence');
assert.equal(aggCold.observedMeanPerSqm, null, 'Zero samples observedMeanPerSqm is null');
assert.equal(aggCold.observedMedianPerSqm, null, 'Zero samples observedMedianPerSqm is null');
assert.equal(aggCold.observedIqrLowPerSqm, null, 'Zero samples observedIqrLowPerSqm is null');
assert.equal(aggCold.observedIqrHighPerSqm, null, 'Zero samples observedIqrHighPerSqm is null');
assert.equal(aggCold.hasSufficientIqrEvidence, false, 'Zero samples hasSufficientIqrEvidence is false');
assert.equal(aggCold.iqrLowPerSqm, 0, 'Zero samples iqrLowPerSqm is 0 (no PRNG IQR bounds)');
assert.equal(aggCold.iqrHighPerSqm, 0, 'Zero samples iqrHighPerSqm is 0 (no PRNG IQR bounds)');
assert.equal(aggCold.fraudReviewState, 'NONE', 'Zero samples has NONE fraudReviewState');
assert.equal(aggCold.dealPriceProvenance, 'HEURISTIC_ESTIMATE', 'Deal price explicitly marked as HEURISTIC_ESTIMATE');
assert.equal(aggCold.evidenceQuality, 'INSUFFICIENT_OBSERVATIONS', 'Zero samples marked as INSUFFICIENT_OBSERVATIONS');
assert.equal(aggCold.evidenceSufficiency, 'NONE', 'Zero samples marked as NONE evidenceSufficiency');
assert.equal(aggCold.evidenceIndexScore, 0, 'Zero observed samples yields 0 evidence index score');
assert.equal(aggCold.confidenceScore, 0, 'Zero observed samples yields 0 confidenceScore (never 74)');
assert.equal(aggCold.autoBargains.length, 0, 'Zero observed samples never fabricates synthetic bargains');
assert.equal(aggCold.isDealPriceDisplayableAsFact, false, 'Zero samples must not display deal price as verified transaction fact');

// Case 8.1.2: 1 observed sample
const aggOne = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 150, [
  { id: 'obs-1', askingTotalMillion: 12800, description: '۱۰۰ متر طبقه ۲ ساخت ۱۴۰۰ با پارکینگ و آسانسور', yearOrAge: 1400 },
]);
assert.equal(aggOne.observedSampleCount, 1, '1 observed sample reported accurately');
assert.equal(aggOne.eligibleObservedCount, 1, '1 eligible observed sample preserved');
assert.equal(aggOne.sampleCount, 1, 'sampleCount equals 1');
assert.equal(aggOne.validSampleCount, 1, 'validSampleCount equals 1');
assert.equal(aggOne.syntheticSampleCount, 0, 'syntheticSampleCount is 0');
assert.equal(aggOne.observedIqrLowPerSqm, null, '1 sample keeps observedIqrLowPerSqm null');
assert.equal(aggOne.hasSufficientIqrEvidence, false, '1 sample hasSufficientIqrEvidence is false');
assert.equal(aggOne.evidenceQuality, 'LIMITED_OBSERVATIONS', '1 sample marked as LIMITED_OBSERVATIONS');
assert.equal(aggOne.evidenceSufficiency, 'INSUFFICIENT', '1 sample marked as INSUFFICIENT evidenceSufficiency');
assert.equal(aggOne.evidenceIndexScore, 35, '1 sample yields 35 evidence index score');
assert.equal(aggOne.confidenceScore, 35, '1 sample yields 35 confidenceScore');
assert.deepEqual(aggOne.autoBargainIds, ['obs-1'], 'Only real observed bargain is included in autoBargainIds');

// Case 8.1.3: 2 observed samples
const aggTwo = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 150, [
  { id: 'obs-1', askingTotalMillion: 13500, description: '۱۰۰ متر طبقه ۲ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 },
  { id: 'obs-2', askingTotalMillion: 14000, description: '۱۰۰ متر طبقه ۳ ساخت ۱۴۰۱ با پارکینگ', yearOrAge: 1401 },
]);
assert.equal(aggTwo.observedSampleCount, 2, '2 observed samples reported accurately');
assert.equal(aggTwo.eligibleObservedCount, 2, '2 eligible observed samples preserved');
assert.equal(aggTwo.observedIqrLowPerSqm, null, '2 samples keeps observedIqrLowPerSqm null');
assert.equal(aggTwo.hasSufficientIqrEvidence, false, '2 samples hasSufficientIqrEvidence is false');
assert.equal(aggTwo.evidenceIndexScore, 52, '2 samples yields 52 evidence index score');
assert.equal(aggTwo.confidenceScore, 52, '2 samples yields 52 confidenceScore');

// Case 8.1.4: 3 observed samples (monotonicity check: 0 < 35 < 52 < 71)
const aggThree = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 140, [
  { id: 's-1', askingTotalMillion: 14000, description: '۱۰۰ متر طبقه ۳ با پارکینگ ساخت ۱۴۰۰', yearOrAge: 1400 },
  { id: 's-2', askingTotalMillion: 14500, description: '۱۰۰ متر طبقه ۲ ساخت ۱۳۹۸ با آسانسور', yearOrAge: 1398 },
  { id: 's-3', askingTotalMillion: 13800, description: '۱۰۰ متر طبقه ۴ با پارکینگ ساخت ۱۴۰۱', yearOrAge: 1401 },
], 140);
assert.equal(aggThree.observedSampleCount, 3, '3 observed samples tracked');
assert.equal(aggThree.eligibleObservedCount, 3, '3 eligible observed samples tracked');
assert.equal(aggThree.hasSufficientIqrEvidence, true, '3 valid samples enables IQR calculation');
assert.ok(aggThree.observedIqrLowPerSqm !== null && aggThree.observedIqrHighPerSqm !== null, '3 samples populate observed IQR');
assert.equal(aggThree.evidenceIndexScore, 71, '3 samples yields 71 evidence index score');
assert.equal(aggThree.confidenceScore, 71, '3 samples yields 71 confidenceScore (> 52 > 35 > 0)');
assert.ok(aggCold.confidenceScore < aggOne.confidenceScore && aggOne.confidenceScore < aggTwo.confidenceScore && aggTwo.confidenceScore < aggThree.confidenceScore, 'Strict monotonicity of confidenceScore across N=0,1,2,3');

// Case 8.1.5: 5 observed samples
const fiveSamples = [
  { id: 'f-1', askingTotalMillion: 14000, description: '۱۰۰ متر طبقه ۳ با پارکینگ ساخت ۱۴۰۰', yearOrAge: 1400 },
  { id: 'f-2', askingTotalMillion: 14500, description: '۱۰۵ متر طبقه ۲ ساخت ۱۳۹۸ با آسانسور', yearOrAge: 1398 },
  { id: 'f-3', askingTotalMillion: 13800, description: '۹۸ متر طبقه ۴ با پارکینگ ساخت ۱۴۰۱', yearOrAge: 1401 },
  { id: 'f-4', askingTotalMillion: 14200, description: '۱۰۲ متر طبقه ۲ ساخت ۱۳۹۹', yearOrAge: 1399 },
  { id: 'f-5', askingTotalMillion: 14100, description: '۱۰۰ متر طبقه ۱ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 },
];
const aggFive = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 140, fiveSamples, 140);
assert.equal(aggFive.observedSampleCount, 5, '5 observed samples tracked');
assert.equal(aggFive.eligibleObservedCount, 5, '5 eligible samples tracked');
assert.equal(aggFive.evidenceSufficiency, 'MODERATE', '5 samples marked as MODERATE evidenceSufficiency');
assert.equal(aggFive.evidenceIndexScore, 77, '5 samples yields 77 evidence index score');

// Case 8.1.6: 10 distinct observed samples -> ADEQUATE_OBSERVATIONS & HOT regime
const tenSamples = Array.from({ length: 10 }, (_, idx) => ({
  id: `hot-${idx + 1}`,
  askingTotalMillion: 13600 + idx * 110,
  description: `${95 + idx} متر طبقه ${(idx % 5) + 1} با پارکینگ و آسانسور ساخت ۱۴۰۰`,
  yearOrAge: 1400,
}));
const aggHot = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 140, tenSamples, 140);
assert.equal(aggHot.evidenceQuality, 'ADEQUATE_OBSERVATIONS', '10 samples marked as ADEQUATE_OBSERVATIONS');
assert.equal(aggHot.evidenceSufficiency, 'SUFFICIENT', '10 samples marked as SUFFICIENT');
assert.equal(aggHot.marketRegime, 'HOT', '10 active samples classified as HOT');
assert.equal(aggHot.askToDealRatio, 0.975, 'HOT regime uses 0.975 askToDealRatio');

// Case 8.1.7: Duplicate listings with same ID
const dupByIdSample = { id: 'dup-id-1', askingTotalMillion: 13500, description: '۱۰۰ متر طبقه ۲ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 };
const aggDupId = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 140, [dupByIdSample, dupByIdSample, dupByIdSample, dupByIdSample, dupByIdSample]);
assert.equal(aggDupId.rawInputCount, 5, 'rawInputCount tracks 5 raw inputs');
assert.equal(aggDupId.duplicateSampleCount, 4, '4 duplicate records excluded by ID');
assert.equal(aggDupId.observedSampleCount, 1, 'Unique observedSampleCount is 1');
assert.equal(aggDupId.eligibleObservedCount, 1, 'eligibleObservedCount is 1 (no evidence inflation)');
assert.equal(aggDupId.evidenceIndexScore, 35, 'Duplicate records do not inflate evidenceIndexScore beyond 1 sample (35)');

// Case 8.1.8: Duplicate listings with same normalized fingerprint and different IDs
const aggDupFp = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 140, [
  { id: 'id-a', askingTotalMillion: 13500, description: '۱۰۰ متر طبقه ۲ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 },
  { id: 'id-b', askingTotalMillion: 13500, description: '100 متر طبقه 2 ساخت 1400 با پارکینگ', yearOrAge: 1400 },
]);
assert.equal(aggDupFp.duplicateSampleCount, 1, 'Normalized text+price fingerprint deduplicates reposted listing');
assert.equal(aggDupFp.observedSampleCount, 1, 'observedSampleCount is 1 after fingerprint deduplication');

// Case 8.1.9: Similar but distinct listings (same specs/price, different IDs and different descriptions)
const aggSimilarDistinct = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 140, [
  { id: 'unit-north', askingTotalMillion: 14000, description: '۱۰۰ متر طبقه ۲ واحد شمالی رو به حیاط ساخت ۱۴۰۰', yearOrAge: 1400 },
  { id: 'unit-south', askingTotalMillion: 14000, description: '۱۰۰ متر طبقه ۲ واحد جنوبی غرق نور آفتاب ساخت ۱۴۰۰', yearOrAge: 1400 },
]);
assert.equal(aggSimilarDistinct.duplicateSampleCount, 0, 'Distinct units with different IDs and descriptions are not dropped as exact duplicates');
assert.equal(aggSimilarDistinct.probableDuplicateCount, 1, 'probableDuplicateCount flags spec collision transparently');
assert.equal(aggSimilarDistinct.observedSampleCount, 2, 'Both distinct units preserved in observedSampleCount');
assert.equal(aggSimilarDistinct.eligibleObservedCount, 2, 'Both distinct units preserved in eligibleObservedCount');

// Case 8.1.10: Missing area (no meterage in description or sample) -> rejected, never imputed as 85 sqm
const aggMissingArea = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 140, [
  { id: 'no-sqm', askingTotalMillion: 14000, description: 'آپارتمان خوش نقشه در سعادت‌آباد طبقه سوم با پارکینگ و آسانسور', yearOrAge: 1400 },
]);
assert.equal(aggMissingArea.malformedSampleCount, 1, 'Missing area sample counted as malformed');
assert.equal(aggMissingArea.missingAreaSampleCount, 1, 'missingAreaSampleCount incremented when sqm is absent');
assert.equal(aggMissingArea.eligibleObservedCount, 0, 'Listing without area is excluded from eligibleObservedCount');
assert.equal(aggMissingArea.observedMeanPerSqm, null, 'Listing without area never fabricates an 85-sqm per-sqm price');

// Case 8.1.11: Zero or negative area -> rejected
const aggZeroNegArea = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 140, [
  { id: 'zero-sqm', sqm: 0, askingTotalMillion: 14000, description: '۱۰۰ متر طبقه ۲ ساخت ۱۴۰۰', yearOrAge: 1400 },
  { id: 'neg-sqm', sqm: -50, askingTotalMillion: 14000, description: '۱۰۰ متر طبقه ۲ ساخت ۱۴۰۰', yearOrAge: 1400 },
]);
assert.equal(aggZeroNegArea.malformedSampleCount, 2, 'Zero and negative explicit sqm rejected as malformed');
assert.equal(aggZeroNegArea.missingAreaSampleCount, 2, 'Zero and negative explicit sqm counted in missingAreaSampleCount');
assert.equal(aggZeroNegArea.eligibleObservedCount, 0, 'Zero/negative sqm excluded from eligibleObservedCount');

// Case 8.1.12: Extreme high statistical outlier (IQR exclusion without fraud conflation)
const pureStatOutlierSamples = [
  { id: 'p-1', askingTotalMillion: 14000, description: '۱۰۰ متر طبقه ۱ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 },
  { id: 'p-2', askingTotalMillion: 14100, description: '۱۰۰ متر طبقه ۲ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 },
  { id: 'p-3', askingTotalMillion: 13900, description: '۱۰۰ متر طبقه ۳ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 },
  { id: 'p-4', askingTotalMillion: 14050, description: '۱۰۰ متر طبقه ۴ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 },
  { id: 'p-5', askingTotalMillion: 14020, description: '۱۰۰ متر طبقه ۵ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 },
  { id: 'p-6', askingTotalMillion: 19500, description: '۱۰۰ متر طبقه ۶ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 },
];
const aggStatOnly = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 140, pureStatOutlierSamples, 140);
assert.equal(aggStatOnly.excludedOutlierCount, 1, 'High IQR outlier counted in excludedOutlierCount');
assert.equal(aggStatOnly.suspectedFraudCount, 0, 'Statistical outlier alone is never counted as suspected fraud');
assert.equal(aggStatOnly.rejectedFraudCount, 0, 'Statistical outlier is never summed into rejectedFraudCount');
assert.equal(aggStatOnly.fraudReviewState, 'STATISTICAL_OUTLIER', 'Pure IQR exclusion sets STATISTICAL_OUTLIER state, not fraud');

// Case 8.1.13 & 8.1.14: Extreme low price anomaly & malformed record (never labeled FRAUD_SUSPECTED from price alone)
const mixedOutlierSamples = [
  ...pureStatOutlierSamples,
  { id: 'low-anom', askingTotalMillion: 4000, description: '۱۰۰ متر طبقه ۲ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 }, // 40/140 = 0.28x < 0.42x
  { id: 'bad-rec', askingTotalMillion: -500, description: '۱۰ متر نامعتبر', yearOrAge: 1400 },
];
const aggOutlier = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 140, mixedOutlierSamples, 140);
assert.equal(aggOutlier.observedSampleCount, 8, 'Total unique raw samples counted in observedSampleCount');
assert.equal(aggOutlier.malformedSampleCount, 1, 'Malformed sample counted separately');
assert.equal(aggOutlier.extremePriceAnomalyCount, 1, 'Extreme low price ratio counted in extremePriceAnomalyCount');
assert.equal(aggOutlier.suspectedFraudCount, 0, 'Unusual price alone never increments suspectedFraudCount');
assert.equal(aggOutlier.rejectedFraudCount, 0, 'Outliers and price anomalies never increment rejectedFraudCount');
assert.equal(aggOutlier.fraudReviewState, 'UNVERIFIED_PRICE_ANOMALY', 'Extreme price ratio sets UNVERIFIED_PRICE_ANOMALY, never FRAUD_SUSPECTED');
assert.equal(aggOutlier.excludedOutlierCount, 2, 'Both IQR outlier and extreme price anomaly counted in excludedOutlierCount');

// Case 8.1.15: Deterministic repeatability (zero PRNG / Date.now drift)
const aggRepeatA = aggregateNeighborhoodMarketMetrics(5, 'پونک', 142, []);
const aggRepeatB = aggregateNeighborhoodMarketMetrics(5, 'پونک', 142, []);
assert.deepEqual(aggRepeatA, aggRepeatB, 'Repeated aggregation calls produce bit-for-bit identical output');

// Reachable FROZEN regime & Anchor Clamping transparency
const stagnantSamples = [
  { id: 'st-1', askingTotalMillion: 16500, description: '۱۰۰ متر طبقه ۲ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 },
  { id: 'st-2', askingTotalMillion: 17200, description: '۱۰۰ متر طبقه ۳ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 },
  { id: 'st-3', askingTotalMillion: 18000, description: '۱۰۰ متر طبقه ۴ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 },
  { id: 'st-4', askingTotalMillion: 16800, description: '۱۰۰ متر طبقه ۱ ساخت ۱۴۰۰ با پارکینگ', yearOrAge: 1400 },
];
const aggFrozen = aggregateNeighborhoodMarketMetrics(1, 'سعادت‌آباد', 140, stagnantSamples, 140);
assert.equal(aggFrozen.marketRegime, 'FROZEN', 'High-ask stagnant samples reach FROZEN regime');
assert.equal(aggFrozen.askToDealRatio, 0.9, 'FROZEN regime uses 0.90 askToDealRatio');
assert.equal(aggFrozen.isAnchorClamped, true, 'Anchor clamping is flagged when raw average exceeds +-3% daily band');
assert.ok(aggFrozen.unclampedAveragePerSqm > aggFrozen.hedonicAdjustedPerSqm, 'Unclamped average preserved alongside clamped anchor');

// 9. WS-A1-R Section 8.3: Cross-View Sample Consistency & Product Language Verification
const punakHood = INITIAL_NEIGHBORHOODS.find((h) => h.id === 5)!;
const punakSamples = buildNeighborhoodListingSamples(punakHood);
assert.equal(punakSamples.length, 0, 'Punak seed catalog is excluded from market samples when no live-divar row exists');
const punakAgg = aggregateNeighborhoodMarketMetrics(punakHood.id, punakHood.name, punakHood.buyPerSqm, punakSamples);
const punakUiAgg = aggregateMarketMetricsForHood(punakHood);
assert.equal(punakUiAgg.observedSampleCount, punakAgg.observedSampleCount, 'aggregateMarketMetricsForHood matches canonical sample path observedSampleCount');
assert.equal(punakAgg.observedSampleCount, 0, 'Catalog bargains do not inflate observedSampleCount');
assert.equal(punakAgg.evidenceIndexScore, 0, 'Catalog bargains do not raise the coverage index');
assert.equal(punakAgg.estimatedDealPricePerSqm, punakHood.buyPerSqm, 'With zero live samples the shown price is the reference baseline');
assert.equal(punakAgg.askToDealRatio, 1, 'Zero live samples do not apply a fake negotiation haircut');
assert.equal(aggCold.estimatedDealPricePerSqm, 150, 'Empty sample set keeps the reference price');
assert.equal(aggCold.askToDealRatio, 1, 'Empty sample set askToDealRatio is 1');

const punakLiveFixture = {
  ...punakHood,
  bargains: [
    ...(punakHood.bargains || []).map((b) => ({ ...b, id: `live-divar-${b.id}` })),
  ],
};
const liveSamples = buildNeighborhoodListingSamples(punakLiveFixture);
assert.ok(liveSamples.length >= 2, 'live-divar prefixed bargains feed the canonical sample builder');
const liveAgg = aggregateNeighborhoodMarketMetrics(punakHood.id, punakHood.name, punakHood.buyPerSqm, liveSamples);
assert.equal(liveAgg.observedSampleCount, liveSamples.length, 'Live sample path observedSampleCount tracks builder length');
assert.equal(liveAgg.eligibleObservedCount, liveSamples.length, 'Live sample path eligibleObservedCount tracks builder length');
assert.equal(liveAgg.observedIqrLowPerSqm, null, 'Punak (<3 samples) has null observedIqrLowPerSqm');
assert.equal(liveAgg.hasSufficientIqrEvidence, false, 'Punak (<3 samples) hasSufficientIqrEvidence is false');

assert.equal(TEHRAN_DATED_REFERENCE_PRICES.length, 20, 'Dated Tehran reference covers twenty neighborhoods');
for (const row of TEHRAN_DATED_REFERENCE_PRICES) {
  const seed = INITIAL_NEIGHBORHOODS.find((h) => h.id === row.hoodId);
  assert.ok(seed, `Reference row ${row.hoodId} exists in the seed`);
  assert.equal(seed?.buyPerSqm, row.millionTomanPerSqm, `${row.nameFa} reference matches seed buyPerSqm`);
  assert.equal(row.asOfJalali, '۱۴۰۵/۰۸', `${row.nameFa} carries Aban 1405 date`);
  assert.match(row.sourceFa, /آمار رسمی معاملات نیست/);
}
const punakTruth = formatNeighborhoodPriceTruthFa(5, 0);
assert.match(punakTruth, /مرجع داخلی/);
assert.match(punakTruth, /به‌روزرسانی ۱۴۰۵\/۰۸/);
assert.match(punakTruth, /۰ آگهی زنده/);
assert.match(punakTruth, /۰ معامله ثبت‌شده/);
const undatedTruth = formatNeighborhoodPriceTruthFa(999, 0);
assert.match(undatedTruth, /بدون تاریخ به‌روزرسانی/);
assert.equal(fs.readFileSync(path.join(process.cwd(), 'src/cells/decision-epistemology/epistemicDecisionEngine.ts'), 'utf8').includes('تخمین قیمت قطعی معامله'), false, 'Epistemic dossier must not claim a definitive closing price');

const piSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/views/ProductIntelligenceView.tsx'), 'utf-8');
const cmSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CompareModal.tsx'), 'utf-8');
const drSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodInspectorDrawer.tsx'), 'utf-8');
const tbSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodInspectorTabs.tsx'), 'utf-8');
assert.ok(piSrc.includes('buildNeighborhoodListingSamples(p.selectedHood)'), 'ProductIntelligenceView uses canonical buildNeighborhoodListingSamples');
assert.ok(cmSrc.includes('buildNeighborhoodListingSamples(compHood1)') && cmSrc.includes('buildNeighborhoodListingSamples(compHood2)'), 'CompareModal uses canonical buildNeighborhoodListingSamples');
assert.ok(drSrc.includes('buildNeighborhoodListingSamples(selectedHood)'), 'NeighborhoodInspectorDrawer uses canonical buildNeighborhoodListingSamples');
assert.ok(tbSrc.includes('buildNeighborhoodListingSamples(selectedHood)'), 'NeighborhoodInspectorTabs uses canonical buildNeighborhoodListingSamples');
assert.ok(cmSrc.includes('EpistemicMarketDisclaimer'), 'CompareModal surfaces epistemic disclaimer');
assert.ok(piSrc.includes('EpistemicMarketDisclaimer'), 'ProductIntelligenceView surfaces epistemic disclaimer');
assert.ok(tbSrc.includes('EpistemicMarketDisclaimer'), 'NeighborhoodInspectorTabs surfaces epistemic disclaimer');
const discoverSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/views/ProductDiscoverView.tsx'), 'utf-8');
assert.ok(discoverSrc.includes('DiscoverSelectedHoodEpistemicBanner'), 'ProductDiscoverView surfaces epistemic disclaimer for selected hood');
assert.ok(fs.readFileSync(path.join(process.cwd(), 'src/components/views/DiscoverSelectedHoodEpistemicBanner.tsx'), 'utf8').includes('EpistemicMarketDisclaimer'), 'Discover epistemic banner module');
assert.ok(fs.readFileSync(path.join(process.cwd(), 'src/components/useDealPriceByHoodIdMap.ts'), 'utf8').includes('buildNeighborhoodListingSamples(hood)'), 'useDealPriceByHoodIdMap centralizes canonical samples');
assert.ok(!piSrc.includes('تخمین قیمت قطعی معاملات'), 'ProductIntelligenceView does not claim definitive closing transaction estimates');
assert.ok(!piSrc.includes('همگرایی قیمت اعلامی با نرخ معامله'), 'ProductIntelligenceView does not claim convergence with closing transaction rates');
assert.ok(!piSrc.includes('جایگاه معامله قطعی'), 'ProductIntelligenceView does not claim definitive transaction percentile position');

const spatialGrowth = applySpatialGrowthFallback(
  { id: 1, lat: 35.78, lng: 51.37, buyPerSqm: 150 },
  [
    { id: 2, lat: 35.79, lng: 51.38, buyPerSqm: 155, growthPct: 14.0 },
    { id: 3, lat: 35.77, lng: 51.36, buyPerSqm: 145, growthPct: 12.0 },
  ]
);
assert.ok(spatialGrowth > 11 && spatialGrowth < 15, `Spatial growth fallback interpolated (got ${spatialGrowth})`);

// 10. Full 15-case self-verification check
const selfCheck = verifyPricingEngineIntegrity();
assert.equal(selfCheck.passed, true, `Self-verification failed: ${selfCheck.failures.join('; ')}`);

const verdict = buildBudgetFitVerdict(INITIAL_NEIGHBORHOODS.map((hood) => ({ id: hood.id, rahn80m: hood.rahn80m })), 'buy', 32000, 80);
assert.equal(verdict.length, 3);
assert.equal(verdict[0]?.nameFa, 'پونک');
assert.equal(verdict[0]?.fit, 'fits');
const shareText = formatBudgetVerdictShareText(verdict, 'buy', 32000, 80);
assert.ok(shareText.includes('۰ معامله ثبت‌شده'));
assert.ok(shareText.includes('https://radartehran.ir/tehran/punak'));
assert.equal(parseTehranPublicPath('/tehran/punak')?.kind, 'hood');
assert.equal(parseTehranPublicPath('/tehran/punak-vs-sadeghie')?.kind, 'compare');
assert.equal(seoForDatedHood(5)?.path, '/tehran/punak');
assert.ok(seoForDatedHood(5)?.title.includes('قیمت خرید خانه در پونک'));
assert.equal(seoForDatedHood(5)?.description.includes('فایل زیر قیمت'), false);
assert.equal(seoFromPublicPath('/tehran/punak')?.title, seoForDatedHood(5)?.title);
assert.equal(tehranSitemapEntries('https://radartehran.ir').length, 24);
assert.equal(tehranSitemapEntries('https://radartehran.ir').some((row) => row.loc.includes('?hood=')), false);

console.log('✅ All Persian NLP & Real Market Price Aggregator v6.4 + WS-A1-R tests passed successfully!');
