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

// 1. Real sqm <-> sqft conversion checks
assert.equal(sqmToSqft(60), 645.83, '60 m² must convert to 645.83 ft²');
assert.equal(sqmToSqft(80), 861.11, '80 m² must convert to 861.11 ft²');
assert.equal(sqmToSqft(100), 1076.39, '100 m² must convert to 1076.39 ft²');
assert.equal(sqftToSqm(1076.39), 100, '1076.39 ft² must convert back to 100 m²');
assert.equal(convertAreaFromSqm(80, 'sqm'), 80);
assert.equal(convertAreaFromSqm(80, 'sqft'), 861.11);

// 2. Price per unit checks (price per m² / 10.7639104 = price per ft²)
const pricePerSqm = 107.64;
assert.equal(convertPricePerSqmToUnit(pricePerSqm, 'sqm'), 107.6);
assert.equal(convertPricePerSqmToUnit(pricePerSqm, 'sqft'), 10);

// 3. Formatting helpers checks (bilingual FA/EN + m²/ft²)
assert.equal(formatAreaValue(80, 'sqm', false), '80 sq m (m²)');
assert.equal(formatAreaValue(80, 'sqft', false), '861.11 sq ft (ft²)');
assert.ok(formatAreaValue(80, 'sqm', true).includes('متر مربع'));
assert.ok(formatAreaValue(80, 'sqft', true).includes('فوت مربع'));
assert.equal(formatAreaValue(80, 'sqft', true).includes('(ft²)'), false);
assert.equal(formatAreaShort(80, 'sqm', false), '80 m²');
assert.equal(formatAreaShort(80, 'sqft', false), '861.11 ft²');
assert.equal(formatAreaUnitLabel('sqm', 'fa'), 'متر مربع');
assert.equal(formatAreaUnitLabel('sqft', 'fa'), 'فوت مربع');
assert.equal(formatAreaUnitLabel('sqft', 'en'), 'Square Feet (ft²)');
assert.equal(formatUnitBuyPriceTitle('sqm', 'fa'), 'میانگین خرید هر متر');
assert.equal(formatUnitBuyPriceTitle('sqft', 'fa'), 'میانگین خرید هر فوت مربع');
assert.equal(formatUnitBuyPriceTitle('sqft', 'en'), 'Avg Price / ft²');

// 4. Reactive state toggle between sqm and sqft
setStoredAreaUnit('sqm');
assert.equal(getStoredAreaUnit(), 'sqm');

let notifyCount = 0;
const unsubscribe = subscribeAreaUnit(() => {
  notifyCount += 1;
});

const toggledToSqft = toggleStoredAreaUnit();
assert.equal(toggledToSqft, 'sqft');
assert.equal(getStoredAreaUnit(), 'sqft');
assert.equal(notifyCount, 1);

const toggledToSqm = toggleStoredAreaUnit();
assert.equal(toggledToSqm, 'sqm');
assert.equal(getStoredAreaUnit(), 'sqm');
assert.equal(notifyCount, 2);

unsubscribe();
setStoredAreaUnit('sqft');
assert.equal(getStoredAreaUnit(), 'sqft');
assert.equal(notifyCount, 2, 'Unsubscribed listener must not be called');
setStoredAreaUnit('sqm');

// 5. UI component check (ft², USD, and locale controls rendered)
const rootDir = process.cwd();
const toggleSource = fs.readFileSync(path.join(rootDir, 'src/components/AreaUnitToggle.tsx'), 'utf8');
assert.ok(
  toggleSource.includes('ft²') && toggleSource.includes('USD') && toggleSource.includes('locale-en'),
  'AreaUnitToggle must render ft², USD, and FA/EN locale buttons'
);

console.log('✅ Real sqm/sqft & intl areaUnit tests passed.');
