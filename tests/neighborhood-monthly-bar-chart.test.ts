import assert from 'node:assert/strict';
import { buildMonthlyPriceBarPoints } from '../src/components/NeighborhoodMonthlyBarChart';
import type { BubbleReport, Neighborhood } from '../src/data/neighborhoods';

console.log('--- Running Neighborhood Monthly Bar Chart Unit Tests ---');

const mockHood: Neighborhood = {
  id: 5,
  name: 'پونک',
  zone: 'غرب (منطقه ۵)',
  lat: 35.768,
  lng: 51.339,
  radius: 1200,
  buyPerSqm: 130,
  rahn80m: 1450,
  air: 7.8,
  powerWater: 8.5,
  internet: 8.0,
  metro: 8.9,
  security: 8.4,
  flatTerrain: 7.2,
  pros: 'دسترسی سریع',
  cons: 'شلوغی',
  sponsor: { name: 'املاک پونک', phone: '021-44445555', specialty: 'خرید و اجاره', experienceYears: 12 },
  bargains: [],
};

const mockReport: BubbleReport = {
  status: 'balanced',
  badgeText: '🟡 متعادل و همگام با بازار',
  hoodGrowth6mPercent: 12.5,
  tehranGrowth6mPercent: 10.0,
  prRatio: 7.1,
  summary: 'گزارش تحلیلی بازار',
  trendData: [
    { month: 'آبان', hoodPrice: 115, tehranAvg: 90 },
    { month: 'آذر', hoodPrice: 118, tehranAvg: 92 },
    { month: 'دی', hoodPrice: 120, tehranAvg: 94 },
    { month: 'بهمن', hoodPrice: 124, tehranAvg: 96 },
    { month: 'اسفند', hoodPrice: 127, tehranAvg: 98 },
    { month: 'فروردین', hoodPrice: 130, tehranAvg: 100 },
  ],
};

// 1. Verify 6-point length and data structure
const points = buildMonthlyPriceBarPoints(mockHood, mockReport);
assert.equal(points.length, 6, 'Should generate exactly 6 monthly points for the 6-month window');

// 2. Verify start and latest month
assert.equal(points[0].month, 'آبان');
assert.equal(points[0].price, 115);
assert.equal(points[0].changeAmount, 0, 'First month change amount should be 0');
assert.equal(points[0].isLatest, false);

assert.equal(points[5].month, 'فروردین');
assert.equal(points[5].price, 130);
assert.equal(points[5].isLatest, true, 'Last month must be marked as isLatest');

// 3. Verify month-over-month calculation
// From آبان (115) to آذر (118): diff = +3.0, pct = round((3 / 115) * 1000) / 10 = 2.6%
assert.equal(points[1].changeAmount, 3);
assert.equal(points[1].changePercent, 2.6);

// 4. Verify fallback when trendData is empty or missing
const fallbackPoints = buildMonthlyPriceBarPoints(mockHood, undefined);
assert.equal(fallbackPoints.length, 6, 'Fallback should generate 6 simulated points');
assert.equal(fallbackPoints[5].price, 130, 'Latest price in fallback should match hood price');
assert.equal(fallbackPoints[5].isLatest, true);

console.log('[PASS] All Neighborhood Monthly Bar Chart unit tests passed successfully.');
