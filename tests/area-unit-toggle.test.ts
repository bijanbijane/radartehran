import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SQM_TO_SQFT,
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

// 1. Mathematical conversion checks
assert.equal(sqmToSqft(80), Math.round(80 * SQM_TO_SQFT), '80 m² should equal 861 ft²');
assert.equal(sqmToSqft(100), 1076, '100 m² should equal 1076 ft²');
assert.equal(sqftToSqm(1076), 100, '1076 ft² should round back to 100 m²');
assert.equal(convertAreaFromSqm(80, 'sqm'), 80);
assert.equal(convertAreaFromSqm(80, 'sqft'), 861);

// 2. Price per unit conversion checks
const pricePerSqm = 107.64; // ~10 million per sqft
assert.equal(convertPricePerSqmToUnit(pricePerSqm, 'sqm'), 107.6);
assert.equal(convertPricePerSqmToUnit(pricePerSqm, 'sqft'), 10);

// 3. Formatting helpers checks
assert.ok(formatAreaValue(80, 'sqm', false).includes('80 متر مربع'));
assert.ok(formatAreaValue(80, 'sqft', false).includes('861 فوت مربع (ft²)'));
assert.ok(formatAreaShort(80, 'sqm', false).includes('80 متری'));
assert.ok(formatAreaShort(80, 'sqft', false).includes('861 ft²'));
assert.equal(formatAreaUnitLabel('sqm'), 'متر مربع (m²)');
assert.equal(formatAreaUnitLabel('sqft'), 'فوت مربع (ft²)');
assert.equal(formatUnitBuyPriceTitle('sqm'), 'میانگین خرید هر متر');
assert.equal(formatUnitBuyPriceTitle('sqft'), 'میانگین خرید هر فوت مربع (ft²)');

// 4. Reactive state subscription & toggle checks
setStoredAreaUnit('sqm');
assert.equal(getStoredAreaUnit(), 'sqm');

let notifyCount = 0;
const unsubscribe = subscribeAreaUnit(() => {
  notifyCount += 1;
});

const toggled = toggleStoredAreaUnit();
assert.equal(toggled, 'sqft');
assert.equal(getStoredAreaUnit(), 'sqft');
assert.equal(notifyCount, 1);

const toggledBack = toggleStoredAreaUnit();
assert.equal(toggledBack, 'sqm');
assert.equal(getStoredAreaUnit(), 'sqm');
assert.equal(notifyCount, 2);

unsubscribe();
setStoredAreaUnit('sqft');
assert.equal(notifyCount, 2, 'Unsubscribed listener must not be called');
setStoredAreaUnit('sqm');

// 5. UI component wiring verification
const rootDir = process.cwd();
const toggleSource = fs.readFileSync(path.join(rootDir, 'src/components/AreaUnitToggle.tsx'), 'utf8');
assert.ok(toggleSource.includes('m²') && toggleSource.includes('ft²'), 'AreaUnitToggle must render m² and ft² buttons');

for (const relPath of [
  'src/components/FloatingTopBar.tsx',
  'src/components/NeighborhoodInspectorDrawer.tsx',
  'src/components/NeighborhoodInspectorTabs.tsx',
  'src/components/BuyingPowerSummaryCard.tsx',
]) {
  const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
  assert.ok(content.includes('useAreaUnit'), `${relPath} must integrate useAreaUnit()`);
}

console.log('✅ Area Unit Toggle (m² / ft²) tests passed.');
