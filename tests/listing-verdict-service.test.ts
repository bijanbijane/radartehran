import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildDivarComparableProvenance } from '../src/utils/divarComparableListings.js';
import { buildHoodMismatchWarningFa, buildListingVerdict } from '../src/utils/listingVerdictService.js';
import { parseListingNarrativeText } from '../src/utils/listingVerifierEngine.js';

import { resolveDivarCityId } from '../src/data/iranProvincesDirectory.js';
import { validateUpstreamDivarWidgetItem } from '../src/utils/freeLiveMarketScraper.js';
import { chunkHoodIdsForInQuery } from '../src/utils/publicSponsorSync.js';

test('buildHoodMismatchWarningFa flags different detected vs selected hood', () => {
  const msg = buildHoodMismatchWarningFa('سعادت‌آباد', 'پونک');
  assert.ok(msg);
  assert.match(msg!, /سعادت/);
  assert.match(msg!, /پونک/);
  assert.equal(buildHoodMismatchWarningFa('پونک', 'پونک'), null);
});

test('parseListingNarrativeText detects hood name and prioritizes per-sqm pricing', () => {
  const parsed = parseListingNarrativeText('سعادت آباد ۹۰ متری ۱۶ میلیارد', 'پونک');
  assert.equal(parsed.detectedHoodName, 'سعادت‌آباد');
  const warn = buildHoodMismatchWarningFa(parsed.detectedHoodName, 'پونک');
  assert.ok(warn);
  const perSqmParsed = parseListingNarrativeText('پونک سردار جنگل ۹۰ متر نوساز متری ۳۹۵ میلیون تومان', 'پونک');
  assert.equal(perSqmParsed.areaSqm, 90);
  assert.equal(perSqmParsed.askingPricePerSqm, 395);
  assert.equal(perSqmParsed.askingPriceTotalMillion, 35550);
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

test('buildListingVerdict resolves cross-province Tabriz hood under karaj bucket without HOOD_NOT_FOUND', async () => {
  const result = await buildListingVerdict({
    city: 'karaj',
    hoodName: 'ولیعصر تبریز',
    listingText: 'ولیعصر تبریز ۱۱۰ متری ۱۲ میلیارد و ۵۰۰ میلیون تومان',
    mode: 'buy',
  });
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.equal(result.diagnosis.hoodName, 'ولیعصر تبریز');
});

test('validateUpstreamDivarWidgetItem supports optional/null seedBuyPerSqm and keeps seed band guard when seeded', () => {
  const validWidget = {
    data: {
      title: 'آپارتمان ۹۰ متری نوساز در پونک',
      top_description_text: '۱۱,۲۵۰,۰۰۰,۰۰۰ تومان',
      middle_description_text: '۹۰ متر',
      bottom_description_text: 'دقایقی پیش در پونک',
      action: { payload: { token: 'wZabc123' } },
    },
  };
  const unseeded = validateUpstreamDivarWidgetItem(validWidget, null);
  assert.ok(unseeded);
  assert.equal(unseeded!.sqm, 90);
  assert.equal(unseeded!.perSqmMillion, 125);
  assert.equal(unseeded!.token, 'wZabc123');
  assert.equal(validateUpstreamDivarWidgetItem(validWidget, 40), null);
  assert.ok(validateUpstreamDivarWidgetItem(validWidget, 130));
});

test('resolveDivarCityId maps all major provinces accurately via hoodId and city key', () => {
  assert.equal(resolveDivarCityId('tehran', 5), '1');
  assert.equal(resolveDivarCityId('karaj', 101), '2');
  assert.equal(resolveDivarCityId('karaj', 126), '5'); // Tabriz
  assert.equal(resolveDivarCityId('karaj', 131), '12'); // Rasht
  assert.equal(resolveDivarCityId('karaj', 136), '22'); // Sari
  assert.equal(resolveDivarCityId('mashhad', 201), '3');
  assert.equal(resolveDivarCityId('isfahan', 301), '4');
  assert.equal(resolveDivarCityId('isfahan', 326), '8'); // Qom
  assert.equal(resolveDivarCityId('isfahan', 329), '16'); // Yazd
  assert.equal(resolveDivarCityId('shiraz', 401), '6');
  assert.equal(resolveDivarCityId('shiraz', 426), '7'); // Ahvaz
});

test('chunkHoodIdsForInQuery splits bounded hood IDs into <=30 item chunks', () => {
  const chunks = chunkHoodIdsForInQuery(Array.from({ length: 80 }, (_, i) => i + 1));
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 30);
  assert.equal(chunks[2].length, 20);
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
  assert.equal(divarSrc.includes('Buffer.byteLength'), false, 'browser-shared divarComparableListings must not call Node Buffer');
});

test('useAppUrlAndTitleSync resets stale tehran slug path and InstantListingVerifierModal/ListingVerdictHero share buildListingVerdict', () => {
  const root = path.join(process.cwd(), 'src/components');
  const modalSrc = fs.readFileSync(path.join(root, 'modals/InstantListingVerifierModal.tsx'), 'utf8');
  const heroSrc = fs.readFileSync(path.join(root, 'listing/ListingVerdictHero.tsx'), 'utf8');
  const urlSyncSrc = fs.readFileSync(path.join(root, 'useAppUrlAndTitleSync.ts'), 'utf8');
  assert.ok(modalSrc.includes('buildListingVerdict'), 'modal must use unified listing verdict service');
  assert.ok(heroSrc.includes('buildListingVerdict'), 'hero must use unified listing verdict service');
  assert.equal(modalSrc.includes('diagnoseListingDeal(parsed'), false, 'modal must not bypass live sample path');
  assert.ok(urlSyncSrc.includes('findProvinceForHood'), 'URL/title sync resolves province capital name');
  assert.ok(urlSyncSrc.includes('`/${canonicalQuery}${budgetSuffix}`'), 'URL sync clears stale dated path on non-dated routes');
});
