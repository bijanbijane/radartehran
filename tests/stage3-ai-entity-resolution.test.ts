import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  computeBuildingEntityFingerprint,
  getCanonicalBuildingById,
  mergeDuplicateCanonicalBuildings,
  resolveOrMergeCanonicalBuilding,
} from '../src/cells/ai-ingestion/entityResolutionEngine';
import {
  extractAndResolvePropertySignal,
  extractFastRegexPropertySpecs,
  resetAiSeedExtractionForTests,
} from '../src/cells/ai-ingestion/aiSeedExtractionService';
import { registerAiIngestionRoutes } from '../src/cells/ai-ingestion/aiIngestionRoutes';

console.log('🧪 Running Stage 3.1 AI Seed Ingestion & Entity Resolution Tests...\n');

let passed = 0;
function verify(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✅ ${passed}. ${name}`);
}

resetAiSeedExtractionForTests();

verify('Fast regex pass extracts Persian area, price, age, floors, street name, and amenities accurately', () => {
  const specs = extractFastRegexPropertySpecs(
    'آپارتمان ۱۱۵ متری در خیابان الوند، ۴ سال ساخت، طبقه ۳ از ۵، دارای پارکینگ و آسانسور و انباری، قیمت کل ۱۸.۴ میلیارد تومان',
  );
  assert.equal(specs.areaSqm, 115);
  assert.equal(specs.buildingAgeYears, 4);
  assert.equal(specs.floorNumber, 3);
  assert.equal(specs.totalFloors, 5);
  assert.equal(specs.totalPriceMillionToman, 18400);
  assert.equal(specs.streetNameNormalized, 'الوند');
  assert.equal(specs.hasParking, true);
  assert.equal(specs.hasElevator, true);
  assert.equal(specs.hasStorage, true);
  assert.equal(specs.dealMode, 'buy');
});

verify('computeBuildingEntityFingerprint quantizes spatial (35m) and attribute buckets deterministically', () => {
  const fp1 = computeBuildingEntityFingerprint({
    cityId: 'tehran',
    hoodId: 12,
    streetNameNormalized: 'خیابان الوند',
    areaSqm: 114,
    buildingAgeYears: 4,
    totalFloors: 5,
    lat: 35.7245,
    lng: 51.4102,
  });
  const fp2 = computeBuildingEntityFingerprint({
    cityId: 'tehran',
    hoodId: 12,
    streetNameNormalized: 'الوند',
    areaSqm: 116,
    buildingAgeYears: 4,
    totalFloors: 5,
    lat: 35.72452,
    lng: 51.41022,
  });
  assert.equal(fp1.areaBucket5Sqm, 115);
  assert.equal(fp2.areaBucket5Sqm, 115);
  assert.equal(fp1.buildingAgeBucket, 4);
  assert.equal(fp1.streetNameNormalized, 'الوند');
  assert.ok(fp1.spatialCell35m !== null);
  assert.equal(fp1.fingerprintHash, fp2.fingerprintHash);
});

verify('Duplicate listings of the same building (>=85% similarity within 35m radius) resolve to a single canonicalBuildingId', () => {
  resetAiSeedExtractionForTests();
  const firstListing = extractAndResolvePropertySignal({
    cityId: 'tehran',
    hoodId: 15,
    rawTextFa: 'فروش آپارتمان ۱۱۰ متر در خیابان گلستان، ۶ سال ساخت، طبقه ۲ از ۵، قیمت ۱۶.۵ میلیارد',
    lat: 35.7781,
    lng: 51.4215,
  });
  const secondListingSameBuilding = extractAndResolvePropertySignal({
    cityId: 'tehran',
    hoodId: 15,
    rawTextFa: 'واحد ۱۱۱ متری خیابان گلستان، ۶ سال ساخت، طبقه ۴ از ۵، فول امکانات ۱۷ میلیارد',
    lat: 35.77818,
    lng: 51.42158,
  });
  const differentBuildingListing = extractAndResolvePropertySignal({
    cityId: 'tehran',
    hoodId: 15,
    rawTextFa: 'آپارتمان ۱۸۵ متری بلوار کاوه، نوساز، طبقه ۱ از ۸، قیمت ۳۵ میلیارد',
    lat: 35.791,
    lng: 51.439,
  });

  assert.equal(firstListing.matchedExistingBuilding, false);
  assert.equal(secondListingSameBuilding.matchedExistingBuilding, true);
  assert.ok(secondListingSameBuilding.buildingSimilarityScore >= 0.85);
  assert.equal(
    firstListing.fact.canonicalBuildingId,
    secondListingSameBuilding.fact.canonicalBuildingId,
    'Expected both units in the same building to share canonicalBuildingId',
  );
  assert.notEqual(
    firstListing.fact.canonicalBuildingId,
    differentBuildingListing.fact.canonicalBuildingId,
  );
});

verify('MERGED_INTO alias redirect graph resolves old merged building IDs to the canonical target building', () => {
  const b1 = resolveOrMergeCanonicalBuilding({
    cityId: 'tehran',
    hoodId: 22,
    streetNameNormalized: 'فرشته',
    areaSqm: 200,
    buildingAgeYears: 2,
    totalFloors: 10,
    lat: 35.792,
    lng: 51.421,
  }, 'fact_a');
  const b2 = resolveOrMergeCanonicalBuilding({
    cityId: 'tehran',
    hoodId: 22,
    streetNameNormalized: 'الهیه مریم',
    areaSqm: 140,
    buildingAgeYears: 8,
    totalFloors: 6,
    lat: 35.798,
    lng: 51.428,
  }, 'fact_b');

  const mergeRes = mergeDuplicateCanonicalBuildings(b1.canonicalBuildingId, b2.canonicalBuildingId);
  assert.equal(mergeRes.merged, true);
  assert.equal(mergeRes.canonicalBuildingId, b2.canonicalBuildingId);

  const canonicalLookup = getCanonicalBuildingById(b1.canonicalBuildingId);
  assert.equal(canonicalLookup.found, true);
  assert.equal(canonicalLookup.wasRedirected, true);
  assert.equal(canonicalLookup.canonicalBuildingId, b2.canonicalBuildingId);
  assert.ok(canonicalLookup.record?.linkedFactIds.includes('fact_a'));
  assert.ok(canonicalLookup.record?.linkedFactIds.includes('fact_b'));
});

async function runRouteTests() {
  const app = express();
  app.use(express.json());
  registerAiIngestionRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    const extRes = await fetch(`${baseUrl}/api/v1/ai-ingestion/extract-and-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cityId: 'tehran',
        hoodId: 5,
        rawTextFa: 'آپارتمان ۹۵ متری خیابان سردار جنگل، نوساز، طبقه ۳ از ۶، قیمت ۱۱.۵ میلیارد',
        lat: 35.761,
        lng: 51.318,
      }),
    });
    assert.equal(extRes.status, 200);
    const extJson = (await extRes.json()) as {
      status: string;
      fact: { canonicalBuildingId: string; areaSqm: number; buildingAgeYears: number };
    };
    assert.equal(extJson.status, 'ok');
    assert.equal(extJson.fact.areaSqm, 95);
    assert.equal(extJson.fact.buildingAgeYears, 0);

    const getRes = await fetch(
      `${baseUrl}/api/v1/buildings/${extJson.fact.canonicalBuildingId}/canonical`,
    );
    assert.equal(getRes.status, 200);
    const getJson = (await getRes.json()) as { found: boolean; canonicalBuildingId: string };
    assert.equal(getJson.found, true);
    assert.equal(getJson.canonicalBuildingId, extJson.fact.canonicalBuildingId);
    passed += 1;
    console.log(`  ✅ ${passed}. AI ingestion & canonical building Express routes respond accurately`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

await runRouteTests();
console.log(`\n🎉 ALL ${passed} STAGE 3.1 AI INGESTION & ENTITY RESOLUTION TESTS PASSED!\n`);
