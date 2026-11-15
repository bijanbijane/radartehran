import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  convertAreaFromSqm,
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatAreaUnitLabel,
  formatAreaValue,
  formatUnitBuyPriceTitle,
  getStoredAreaUnit,
  setStoredAreaUnit,
  sqftToSqm,
  sqmToSqft,
  subscribeAreaUnit,
  toggleStoredAreaUnit,
} from '../src/utils/areaUnit';

// 1. Metric-only (sqm) behavior checks
assert.equal(sqmToSqft(80), 80, 'Metric-only mode must preserve 80 m² without converting to ft²');
assert.equal(sqmToSqft(100), 100, 'Metric-only mode must preserve 100 m²');
assert.equal(sqftToSqm(1076), 1076, 'sqftToSqm must preserve metric m² value cleanly');
assert.equal(convertAreaFromSqm(80, 'sqm'), 80);
assert.equal(convertAreaFromSqm(80, 'sqft'), 80);

// 2. Price per sqm metric checks
const pricePerSqm = 107.64;
assert.equal(convertPricePerSqmToUnit(pricePerSqm, 'sqm'), 107.6);
assert.equal(convertPricePerSqmToUnit(pricePerSqm, 'sqft'), 107.6);

// 3. Formatting helpers checks (Persian + m² only)
assert.ok(formatAreaValue(80, 'sqm', false).includes('80 متر مربع'));
assert.ok(formatAreaValue(80, 'sqft', false).includes('80 متر مربع'));
assert.ok(formatAreaShort(80, 'sqm', false).includes('80 متری'));
assert.ok(formatAreaShort(80, 'sqft', false).includes('80 متری'));
assert.equal(formatAreaUnitLabel('sqm'), 'متر مربع (m²)');
assert.equal(formatAreaUnitLabel('sqft'), 'متر مربع (m²)');
assert.equal(formatUnitBuyPriceTitle('sqm'), 'میانگین خرید هر متر');
assert.equal(formatUnitBuyPriceTitle('sqft'), 'میانگین خرید هر متر');

// 4. Reactive state lock to sqm
setStoredAreaUnit('sqm');
assert.equal(getStoredAreaUnit(), 'sqm');

let notifyCount = 0;
const unsubscribe = subscribeAreaUnit(() => {
  notifyCount += 1;
});

const toggled = toggleStoredAreaUnit();
assert.equal(toggled, 'sqm');
assert.equal(getStoredAreaUnit(), 'sqm');
assert.equal(notifyCount, 1);

unsubscribe();
setStoredAreaUnit('sqft');
assert.equal(getStoredAreaUnit(), 'sqm');
assert.equal(notifyCount, 1, 'Unsubscribed listener must not be called');

// 5. UI component check (ft² controls removed)
const rootDir = process.cwd();
const toggleSource = fs.readFileSync(path.join(rootDir, 'src/components/AreaUnitToggle.tsx'), 'utf8');
assert.ok(!toggleSource.includes('ft²') && !toggleSource.includes('USD'), 'AreaUnitToggle must not render ft² or non-Toman currency buttons');

console.log('✅ Metric-only (m²) areaUnit tests passed.');
