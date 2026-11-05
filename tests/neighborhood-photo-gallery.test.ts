import assert from 'node:assert/strict';
import { buildNeighborhoodSvg } from '../src/components/NeighborhoodPhotoGallery';

console.log('--- Running Neighborhood Photo Gallery Unit Tests ---');

// 1. Residential SVG generation
const resSvg = buildNeighborhoodSvg('سعادت‌آباد', 'residential', 9.2);
assert.ok(resSvg.startsWith('data:image/svg+xml;utf8,'), 'Must return a data:image/svg+xml URI');
assert.ok(decodeURIComponent(resSvg).includes('سعادت‌آباد'), 'SVG must include neighborhood name');
assert.ok(decodeURIComponent(resSvg).includes('بافت مسکونی'), 'SVG must include residential badge');

// 2. Metro SVG generation
const metroSvg = buildNeighborhoodSvg('پونک', 'metro', 8.5);
assert.ok(metroSvg.startsWith('data:image/svg+xml;utf8,'));
assert.ok(decodeURIComponent(metroSvg).includes('پونک'));
assert.ok(decodeURIComponent(metroSvg).includes('مترو'));

// 3. Park SVG generation
const parkSvg = buildNeighborhoodSvg('نیاوران', 'park', 9.5);
assert.ok(parkSvg.startsWith('data:image/svg+xml;utf8,'));
assert.ok(decodeURIComponent(parkSvg).includes('نیاوران'));
assert.ok(decodeURIComponent(parkSvg).includes('بوستان و فضای سبز'));

// 4. Shopping SVG generation
const shopSvg = buildNeighborhoodSvg('شهرک غرب', 'shopping', 9.0);
assert.ok(shopSvg.startsWith('data:image/svg+xml;utf8,'));
assert.ok(decodeURIComponent(shopSvg).includes('شهرک غرب'));
assert.ok(decodeURIComponent(shopSvg).includes('مرکز خرید'));

// 5. Health SVG generation
const healthSvg = buildNeighborhoodSvg('تهران‌پارس', 'health', 8.0);
assert.ok(healthSvg.startsWith('data:image/svg+xml;utf8,'));
assert.ok(decodeURIComponent(healthSvg).includes('تهران‌پارس'));
assert.ok(decodeURIComponent(healthSvg).includes('مرکز درمانی'));

// 6. Sanitization of brackets in hood names
const safeSvg = buildNeighborhoodSvg('<Script>ونک</Script>', 'residential', 7.5);
assert.ok(!decodeURIComponent(safeSvg).includes('<Script>'), 'Must strip dangerous tags');

console.log('[PASS] All Neighborhood Photo Gallery unit tests passed.');
