/** @file src/features/onboarding/tests/stage54BuiltEnvironmentArchitecture.test.ts — Stage 54 Architecture & Invariant Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateBuildingProfileAndPhysicalGuards,
  evaluatePhysicalChangeDemolitionAndAiGuard,
  evaluateUrbanFabricDensityAndValuationBridge,
  runBuildingQualityAndPrivacyCheck,
} from '../services/builtEnvironmentEngine';
import { INITIAL_STAGE54_BUILDINGS, INITIAL_STAGE54_CHANGES } from '../services/stage54BuiltEnvironmentFixtures';
import {
  STAGE54_BE_COMPONENT_IDS_50,
  STAGE54_BOUNDARIES_7,
  STAGE54_BUILT_ENTITIES_6,
  STAGE54_FORBIDDEN_ERRORS_25,
  STAGE54_UI_BE_TASK_IDS_46,
  STAGE54_UX_EVENTS_19,
  STAGE55_LIVABILITY_PREVIEW_AXES_25,
} from '../services/builtEnvironmentTypes';

test('Stage 54 exposes exact counts for boundaries, entities, BE-01..BE-50, UX events, UI-BE tasks and Stage 55 preview', () => {
  assert.equal(STAGE54_BOUNDARIES_7.length, 7);
  assert.equal(STAGE54_BUILT_ENTITIES_6.length, 6);
  assert.equal(STAGE54_BE_COMPONENT_IDS_50.length, 50);
  assert.equal(STAGE54_BE_COMPONENT_IDS_50[0], 'BE-01');
  assert.equal(STAGE54_BE_COMPONENT_IDS_50[49], 'BE-50');
  assert.equal(STAGE54_UX_EVENTS_19.length, 19);
  assert.equal(STAGE54_UI_BE_TASK_IDS_46.length, 46);
  assert.ok(STAGE54_FORBIDDEN_ERRORS_25.length >= 15);
  assert.ok(STAGE55_LIVABILITY_PREVIEW_AXES_25.length >= 8);
});

test('Stage 54 blocks deriving exact height from floors, separates declared vs official year, and forbids age-only dilapidation claims', () => {
  const b1 = INITIAL_STAGE54_BUILDINGS[0];
  const guard = evaluateBuildingProfileAndPhysicalGuards(b1, true, true);
  assert.equal(guard.isHeightEstimatedWarning, true);
  assert.ok(guard.heightEvaluationFa.includes('مسدودشدن تبدیل قطعی'));
  assert.ok(guard.uniqueBuildingsVsListingsFa.includes('تعداد ساختمان مستقل: ۱'));
  assert.ok(guard.yearProvenanceFa.includes('سال ساخت اعلام‌شده در آگهی'));
  assert.equal(guard.ageVsSafetyBlocked, true);
  assert.ok(guard.ageVsSafetyMessageFa.includes('مسدود'));
});

test('Stage 54 distinguishes catalog import from real construction, labels AI as needing review, and protects demolition historical IDs', () => {
  const chg = INITIAL_STAGE54_CHANGES[1];
  const catalogGuard = evaluatePhysicalChangeDemolitionAndAiGuard(chg, true, false, 'RT-BLD-0002');
  assert.equal(catalogGuard.isCatalogImportNotNewConstruction, true);
  assert.ok(catalogGuard.aiStatusBadgeFa.includes('نیازمند بررسی'));
  assert.ok(catalogGuard.demolitionLinkNoteFa.includes('بازاستفاده نشد'));

  const reuseErrorGuard = evaluatePhysicalChangeDemolitionAndAiGuard(chg, false, false, chg.buildingId);
  assert.ok(reuseErrorGuard.demolitionLinkNoteFa.includes('ممنوع'));
});

test('Stage 54 blocks density comparison across mismatched area denominators and delegates valuation to Stage 20', () => {
  const mismatch = evaluateUrbanFabricDensityAndValuationBridge(
    'مساحت کل محدوده (Gross Block Area)',
    'مساحت مجموع قطعات (Parcel Sum Area)',
    2.4,
    3.1,
  );
  assert.equal(mismatch.comparisonAllowed, false);
  assert.ok(mismatch.verdictFa.includes('مسدود شد'));
  assert.ok(mismatch.stage20ValuationBridgeFa.includes('hedonicPricingEngine'));

  const matched = evaluateUrbanFabricDensityAndValuationBridge(
    'مساحت خالص زمین ساختمانی (Net Plot Area)',
    'مساحت خالص زمین ساختمانی (Net Plot Area)',
    2.4,
    3.1,
  );
  assert.equal(matched.comparisonAllowed, true);
});

test('Stage 54 enforces PII masking, photo face/plate redaction gating, and 4-axis quality checks', () => {
  const b1 = INITIAL_STAGE54_BUILDINGS[0];
  const publicUnredacted = runBuildingQualityAndPrivacyCheck(b1, 'کاربر عمومی', false);
  assert.equal(publicUnredacted.ownerUnitPiiVisible, false);
  assert.equal(publicUnredacted.fieldPhotoPublishAllowed, false);
  assert.equal(publicUnredacted.qualityAxes.length, 4);

  const adminRedacted = runBuildingQualityAndPrivacyCheck(b1, 'مدیر داده و سامانه', true);
  assert.equal(adminRedacted.ownerUnitPiiVisible, true);
  assert.equal(adminRedacted.fieldPhotoPublishAllowed, true);
});
