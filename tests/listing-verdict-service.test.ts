import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildDivarComparableProvenance } from '../src/utils/divarComparableListings.js';
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

test('divar comparable provenance does not claim a seed fallback', () => {
  const thin = buildDivarComparableProvenance('insufficient_sample', '2026-11-12T00:00:00.000Z');
  assert.equal(thin.sourceId, 'divar_public_search');
  assert.equal(thin.qualityStatus, 'insufficient_sample');
  const down = buildDivarComparableProvenance('upstream_error', '2026-11-12T00:00:00.000Z');
  assert.equal(down.sourceId, 'upstream_unavailable');
  assert.equal(down.qualityStatus, 'upstream_error');
  const live = buildDivarComparableProvenance('verified_live', '2026-11-12T00:00:00.000Z');
  assert.equal(live.sourceId, 'divar_public_search');
  const root = process.cwd();
  const divarSrc = fs.readFileSync(path.join(root, 'src/utils/divarComparableListings.ts'), 'utf8');
  const verdictSrc = fs.readFileSync(path.join(root, 'src/utils/listingVerdictService.ts'), 'utf8');
  assert.equal(divarSrc.includes('seed_fallback'), false, 'comparable search must not label failures as seed fallback');
  assert.equal(verdictSrc.includes('seed_fallback'), false, 'listing verdict catch path must not label failures as seed fallback');
});

test('InstantListingVerifierModal and ListingVerdictHero share buildListingVerdict service path', () => {
  const root = path.join(process.cwd(), 'src/components');
  const modalSrc = fs.readFileSync(path.join(root, 'modals/InstantListingVerifierModal.tsx'), 'utf8');
  const heroSrc = fs.readFileSync(path.join(root, 'listing/ListingVerdictHero.tsx'), 'utf8');
  assert.ok(modalSrc.includes('buildListingVerdict'), 'modal must use unified listing verdict service');
  assert.ok(heroSrc.includes('buildListingVerdict'), 'hero must use unified listing verdict service');
  assert.equal(modalSrc.includes('diagnoseListingDeal(parsed'), false, 'modal must not bypass live sample path');
});
