import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildHoodMismatchWarningFa, buildListingVerdict } from '../src/utils/listingVerdictService.js';
import { parseListingNarrativeText } from '../src/utils/listingVerifierEngine.js';

test('buildHoodMismatchWarningFa flags different detected vs selected hood', () => {
  const msg = buildHoodMismatchWarningFa('سعادت‌آباد', 'پونک');
  assert.ok(msg);
  assert.match(msg!, /سعادت/);
  assert.match(msg!, /پونک/);
  assert.equal(buildHoodMismatchWarningFa('پونک', 'پونک'), null);
});

test('parseListingNarrativeText detects hood name from ad body', () => {
  const parsed = parseListingNarrativeText('سعادت آباد ۹۰ متری ۱۶ میلیارد', 'پونک');
  assert.equal(parsed.detectedHoodName, 'سعادت‌آباد');
  const warn = buildHoodMismatchWarningFa(parsed.detectedHoodName, 'پونک');
  assert.ok(warn);
});

test('buildListingVerdict returns ok disclaimer and mismatch when hoods diverge', async () => {
  const result = await buildListingVerdict({
    city: 'tehran',
    hoodName: 'پونک',
    listingText: 'سعادت آباد ۱۰۰ متری قیمت ۱۸ میلیارد تومان',
    mode: 'buy',
  });
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.ok(result.disclaimerFa.includes('آگهی'));
  assert.ok(result.hoodMismatchWarningFa);
  assert.match(result.hoodMismatchWarningFa!, /سعادت/);
});

test('buildListingVerdict returns ok with disclaimer for aligned hood', async () => {
  const result = await buildListingVerdict({
    city: 'tehran',
    hoodName: 'پونک',
    listingText: 'پونک ۸۵ متری ۱۲ میلیارد',
    mode: 'buy',
  });
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.ok(result.disclaimerFa.includes('آگهی'));
  assert.equal(result.hoodMismatchWarningFa, null);
});

test('InstantListingVerifierModal and ListingVerdictHero share buildListingVerdict service path', () => {
  const root = path.join(process.cwd(), 'src/components');
  const modalSrc = fs.readFileSync(path.join(root, 'modals/InstantListingVerifierModal.tsx'), 'utf8');
  const heroSrc = fs.readFileSync(path.join(root, 'listing/ListingVerdictHero.tsx'), 'utf8');
  assert.ok(modalSrc.includes('buildListingVerdict'), 'modal must use unified listing verdict service');
  assert.ok(heroSrc.includes('buildListingVerdict'), 'hero must use unified listing verdict service');
  assert.equal(modalSrc.includes('diagnoseListingDeal(parsed'), false, 'modal must not bypass live sample path');
});
