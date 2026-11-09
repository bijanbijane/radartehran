import assert from 'node:assert/strict';
import {
  parseCbiMonthlyHousingReport,
  parseTehranMunicipalityDistrictStats,
  calculateDealToAskingRatio,
  getAuthoritativeDistrictBenchmark,
  formatDistrictBenchmarkSummary,
  OFFICIAL_CBI_DISTRICT_BENCHMARKS_1403,
} from '../src/utils/reconnaissanceConnectors';

console.log('--- Running Project Black Box Reconnaissance Connectors Tests ---');

// 1. CBI Monthly Housing Market Connector
const cbiReport = parseCbiMonthlyHousingReport({
  reportMonth: 'مهر ۱۴۰۳',
  totalTransactions: 3162,
  cityWideAveragePricePerSqmMillion: 88.5,
  rentIndexYoYPct: 45.2,
  buildingAgeDistribution: {
    upTo5Years: 28.6,
    sixToTenYears: 21.4,
    elevenToFifteenYears: 14.8,
    sixteenToTwentyYears: 13.9,
    overTwentyYears: 21.3,
  },
});

assert.ok(cbiReport !== null, 'CBI Report must be parsed successfully');
assert.equal(cbiReport.reportMonthShamsi, 'مهر ۱۴۰۳');
assert.equal(cbiReport.totalTransactionsCount, 3162);
assert.equal(cbiReport.cityWideAveragePricePerSqmMillion, 88.5);
assert.equal(cbiReport.districtBenchmarks.length, 22, 'Must include all 22 Tehran districts');
assert.equal(cbiReport.districtBenchmarks[0].districtId, 1);
assert.equal(cbiReport.districtBenchmarks[0].avgPricePerSqmMillion, 179.8);
assert.equal(cbiReport.provenance.sourceId, 'cbi_monthly_housing');
assert.equal(cbiReport.provenance.qualityStatus, 'verified_authentic');

// 2. Outlier Clamping in CBI Connector
const clampedReport = parseCbiMonthlyHousingReport({
  cityWideAveragePricePerSqmMillion: 999999, // Should be clamped
  totalTransactions: -50,
});
assert.ok(clampedReport !== null);
assert.ok(clampedReport.cityWideAveragePricePerSqmMillion <= 500);
assert.ok(clampedReport.totalTransactionsCount >= 100);

// 3. Tehran Municipality Open Data Connector
const rawMunData = [
  { districtId: 1, districtNameFa: 'منطقه ۱', population: 485000, greenSpacePerCapitaSqm: 16.4, renovationPermitsAnnual: 420, dilapidatedFabricPct: 4.2 },
  { districtId: 2, districtNameFa: 'منطقه ۲', population: 710000, greenSpacePerCapitaSqm: 18.2, renovationPermitsAnnual: 680, dilapidatedFabricPct: 5.8 },
  { districtId: 99, districtNameFa: 'منطقه نامعتبر' }, // Invalid district ID, should be skipped
];
const munStats = parseTehranMunicipalityDistrictStats(rawMunData);
assert.equal(munStats.length, 2, 'Must filter out invalid district IDs');
assert.equal(munStats[0].districtId, 1);
assert.equal(munStats[0].greenSpacePerCapitaSqm, 16.4);
assert.equal(munStats[0].provenance.sourceId, 'data_tehran_yearbook');

// 4. Deal to Asking Ratio Verification
const normalDiscount = calculateDealToAskingRatio(93, 100);
assert.equal(normalDiscount, 0.93, 'Expected 7% negotiation spread');

const extremeDiscount = calculateDealToAskingRatio(10, 100); // 0.10, should clamp to 0.70
assert.equal(extremeDiscount, 0.70);

// 5. Authoritative CBI District Benchmark Lookups
const d1 = getAuthoritativeDistrictBenchmark(1);
assert.equal(d1.avgPricePerSqmMillion, 179.8);
assert.equal(d1.monthlyTransactions, 145);

const d5 = getAuthoritativeDistrictBenchmark(5);
assert.equal(d5.avgPricePerSqmMillion, 115.6);
assert.equal(d5.monthlyTransactions, 482);

const d18 = getAuthoritativeDistrictBenchmark(18);
assert.equal(d18.avgPricePerSqmMillion, 44.5);
assert.equal(d18.monthlyTransactions, 84);

// 6. Multi-Currency Summary Formatter (OP-DEC-001)
const summaryFa = formatDistrictBenchmarkSummary(1, 'IRT', 'fa');
assert.ok(summaryFa.includes('منطقه 1') || summaryFa.includes('منطقه ۱'));
assert.ok(summaryFa.includes('179.8') || summaryFa.includes('۱۷۹'));

const summaryUsd = formatDistrictBenchmarkSummary(1, 'USD', 'en');
assert.ok(summaryUsd.includes('$'));

console.log('[PASS] All Project Black Box Reconnaissance Connectors Tests Passed Successfully.');
