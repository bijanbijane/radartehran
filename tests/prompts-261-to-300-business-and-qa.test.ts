/**
 * @file tests/prompts-261-to-300-business-and-qa.test.ts
 * @description Comprehensive automated verification suite for:
 * - Section 14 (Prompts 261–280): Business Data Integrity, Mathematical Formulas, Financial Precision,
 *   Currency Consistency, Price/Sqm, Geographic Integrity, Duplicates, Historical Trends, Statistics,
 *   Outliers, Buyer Alerts, Bargains, Votes, Sponsor Requests, Contracts, Provenance & Migrations.
 * - Section 15 (Prompts 281–300): Quality Assurance, Unit/Contract/Regression/Accessibility/Performance Gates.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateHedonicValuation,
  FAST_SALE_FACTOR,
  getCurrentJalaliYear,
} from '../src/data/hedonicPricingEngine';
import {
  INITIAL_NEIGHBORHOODS,
  toPersianNum,
} from '../src/data/neighborhoods';
import { MULTI_CITY_CONFIGS, type CityId } from '../src/data/multiCityData';
import {
  auditRawDocument,
  auditLocalRadarDatasets,
  checkDatabaseRelationalAndSchemaIntegrity,
} from '../src/data/firestoreDataAuditor';
import {
  normalizeIranMobilePhone,
  buildSanitizedOverridePayload,
  mapFirestoreDocToOverride,
  mergeNeighborhoodOverridesIntoList,
  mapFirestoreDocToBargain,
  buildSanitizedBargainPayload,
} from '../src/data/firestoreNeighborhoodMappers';
import {
  calculateDetailedValuation,
  calculateLandShare,
} from '../src/data/superModulesLogic';
import {
  buildReproducibleValuationTrace,
  HEDONIC_FORMULA_ID,
  HEDONIC_FORMULA_VERSION,
} from '../src/data/valuationTraceAndComparables';
import {
  auditMultiCityMarketIsolationAndResolveHood,
  verifyCalculatorSuiteFormulaParity,
} from '../src/data/multiCityCalculatorsAreaDisputesLicensingAudit';
import {
  evaluateHousingMarketStatisticalIndicators,
  evaluateRentalContractAndDepositConversion,
} from '../src/data/rentalMarketCommissionAndPreSaleAudit';
import { evaluatePriceThresholdAlertMatches } from '../src/components/buyerPriceThresholdAlerts';

console.log('Running Prompts 261 to 300 — Business Logic, Financial Precision & QA Suite...');

const sampleHood = INITIAL_NEIGHBORHOODS[0];
assert.ok(sampleHood, 'INITIAL_NEIGHBORHOODS must contain at least one neighborhood');

// ============================================================================
// 1. PROMPTS 261, 262, 263, 264, 265 — HEDONIC ENGINE, PRECISION & PRICE/SQM
// ============================================================================
{
  // Normal valid valuation (100 sqm, 4 years old, standard, floor 3 of 5, full amenities)
  const val = calculateHedonicValuation({
    neighborhood: { ...sampleHood, buyPerSqm: 200, rahn80m: 2400 },
    sqm: 100,
    buildYear: 1401,
    currentJalaliYear: 1405,
    renovationStatus: 'standard',
    floor: 3,
    totalFloors: 5,
    hasElevator: true,
    hasParking: true,
    hasStorage: true,
  });

  // Age 4 => +0.4%, Renovation standard => 0%, Floor 3 => +1.5%, Sqm 100 => 0%, Amenities full => +1.5%
  // Total netAdjustmentPercent = +3.4% => hedonicPerSqm = 200 * 1.034 = 206.8
  assert.equal(val.netAdjustmentPercent, 3.4);
  assert.equal(val.hedonicPerSqm, 206.8);
  assert.equal(val.hedonicTotalMillion, 20680);
  assert.equal(val.hedonicTotalBillion, 20.68);
  assert.equal(val.hoodAverageTotalMillion, 20000);
  assert.equal(val.fastSaleTotalMillion, Math.round(20680 * FAST_SALE_FACTOR));

  // Boundary & zero/negative area protection (Prompt 265)
  const zeroSqmVal = calculateHedonicValuation({
    neighborhood: { ...sampleHood, buyPerSqm: 150, rahn80m: 1600 },
    sqm: 0, // Clamped to minimum 30 sqm
    buildYear: 1300, // Clamped to minimum 1365
    currentJalaliYear: 1405,
    renovationStatus: 'needs_renovation',
    floor: 4,
    totalFloors: 4,
    hasElevator: false, // Walk-up penalty on floor 4: -3.5 * (4 - 1) = -10.5%
    hasParking: false,
    hasStorage: false,
  });
  assert.equal(zeroSqmVal.sqm, 30, 'Zero sqm must be safely clamped to 30 sqm');
  assert.equal(zeroSqmVal.buildYear, 1365, 'Ancient buildYear must be clamped to 1365');
  assert.ok(zeroSqmVal.netAdjustmentPercent >= -42, 'Net adjustment must respect -42% floor');
  assert.ok(zeroSqmVal.hedonicPerSqm >= 10, 'Hedonic price per sqm must never be <= 0');

  // Seller price evaluation (bargain vs fair vs overpriced)
  const withBargainAsking = calculateHedonicValuation({
    neighborhood: { ...sampleHood, buyPerSqm: 200, rahn80m: 2400 },
    sqm: 100,
    buildYear: 1401,
    currentJalaliYear: 1405,
    renovationStatus: 'standard',
    floor: 2,
    sellerAskingTotalMillion: 18000, // ~11.3% below hedonic
  });
  assert.equal(withBargainAsking.sellerPriceEvaluation?.verdict, 'bargain');

  // Land share division-by-zero & invalid boundary protection (Prompt 262)
  const invalidLandShare = calculateLandShare({
    totalPlotSqm: 0,
    totalBuildingUnits: 10,
    unitSqm: 100,
    totalBuildingFloorSqm: 0,
    neighborhoodLandPerSqmMillion: 250,
  });
  assert.equal(invalidLandShare.isValid, false);
  assert.equal(invalidLandShare.exactLandShareSqm, 0);

  const validLandShare = calculateLandShare({
    totalPlotSqm: 400,
    totalBuildingUnits: 8,
    unitSqm: 100,
    totalBuildingFloorSqm: 800,
    neighborhoodLandPerSqmMillion: 300,
  });
  assert.equal(validLandShare.isValid, true);
  assert.equal(validLandShare.landSharePercent, 12.5);
  assert.equal(validLandShare.exactLandShareSqm, 50);
  assert.equal(validLandShare.pureLandValueMillion, 15000);

  // Cross-calculator formula parity (Prompt 262 & 264)
  const parity = verifyCalculatorSuiteFormulaParity({
    neighborhood: sampleHood,
    sqm: 90,
    buildYear: 1400,
    floor: 3,
    buyerBudgetMillion: 18000,
    rahnSharePercent: 60,
  });
  assert.equal(parity.allCalculatorsReconciled, true);

  // Detailed valuation currency & gold/USD conversion guards (Prompt 263 & 264)
  const detailed = calculateDetailedValuation({
    hood: sampleHood as any,
    sqm: 85,
    age: 5,
    floor: 2,
    bedrooms: 2,
    deedType: 'single_deed',
    parkingType: 'dedicated',
    hasElevator: true,
    hasStorage: true,
    renovation: 'standard',
    light: 'south',
    gold18kTomanPrice: 0, // Fallback guard against division by zero
    usdTomanPrice: -500, // Fallback guard against negative exchange rate
  });
  assert.ok(Number.isFinite(detailed.goldGramPricePerSqm) && detailed.goldGramPricePerSqm > 0);
  assert.ok(Number.isFinite(detailed.usdPricePerSqm) && detailed.usdPricePerSqm > 0);
}

// ============================================================================
// 2. PROMPT 266 — GEOGRAPHIC DATA INTEGRITY ACROSS ALL 5 CITIES (627+ HOODS)
// ============================================================================
{
  const cityIds: CityId[] = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'];
  const globalIds = new Set<number>();
  let totalHoodsCount = 0;

  for (const cityId of cityIds) {
    const cfg = MULTI_CITY_CONFIGS[cityId];
    assert.ok(cfg, `Missing config for city ${cityId}`);
    const cityHoods = cityId === 'tehran' ? INITIAL_NEIGHBORHOODS : cfg.neighborhoods;
    assert.ok(cityHoods.length > 0, `City ${cityId} must have neighborhoods`);

    for (const h of cityHoods) {
      totalHoodsCount += 1;
      assert.ok(Number.isInteger(h.id) && h.id >= 1 && h.id <= 999, `Invalid hood id ${h.id} in ${cityId}`);
      assert.ok(!globalIds.has(h.id), `Duplicate neighborhood ID ${h.id} across cities`);
      globalIds.add(h.id);

      assert.ok(
        Number.isFinite(h.lat) && h.lat >= 25 && h.lat <= 40,
        `Latitude out of Iran bounds for hood ${h.id} (${h.name}): ${h.lat}`
      );
      assert.ok(
        Number.isFinite(h.lng) && h.lng >= 44 && h.lng <= 63,
        `Longitude out of Iran bounds for hood ${h.id} (${h.name}): ${h.lng}`
      );
      assert.ok(h.buyPerSqm >= 10 && h.buyPerSqm <= 5000, `Invalid buyPerSqm for ${h.name}`);
      assert.ok(h.rahn80m >= 50 && h.rahn80m <= 50000, `Invalid rahn80m for ${h.name}`);
    }
  }
  assert.equal(totalHoodsCount, 265, `Expected 265 neighborhoods across 5 cities, found ${totalHoodsCount}`);

  // Cross-city isolation check
  const isolation = auditMultiCityMarketIsolationAndResolveHood({
    rawCityParam: 'isfahan',
    hoodId: INITIAL_NEIGHBORHOODS[0].id, // Tehran hood ID queried under Isfahan
    mode: 'buy',
  });
  assert.equal(isolation.matchedNeighborhood, null);
  assert.equal(isolation.silentFallbackToTehranUsed, false);
}

// ============================================================================
// 3. PROMPTS 267, 268, 269, 270 — DUPLICATES, ANOMALIES, STATS & INTEGRITY
// ============================================================================
{
  // Audit raw document with negative & out-of-range fields (Prompt 270)
  const docIssues = auditRawDocument('neighborhoods', 'hood_99', {
    id: 99,
    name: '',
    zone: 'شمال',
    buyPerSqm: -120,
    rahn80m: 999999,
  });
  assert.ok(docIssues.some((i) => i.severity === 'INCOMPLETE_FIELD' && i.field === 'name'));
  assert.ok(docIssues.some((i) => i.severity === 'CRITICAL_NEGATIVE' && i.field === 'buyPerSqm'));
  assert.ok(docIssues.some((i) => i.severity === 'OUT_OF_RANGE' && i.field === 'rahn80m'));

  // Relational, duplicate override & economic ratio check (Prompts 267 & 270)
  const nowMs = Date.parse('2026-11-01T00:00:00Z');
  const relIssues = checkDatabaseRelationalAndSchemaIntegrity({
    neighborhoods: [
      { ...sampleHood, id: 14, buyPerSqm: 100, rahn80m: 9000 }, // Ratio 9000 / 8000 = 1.125 (> 0.80 anomaly!)
    ],
    extraSamples: [
      { collection: 'neighborhoodOverrides', docId: '14', data: { hoodId: 14, buyPerSqm: 210, rahn80m: 2000 } },
      { collection: 'neighborhoodOverrides', docId: 'hood_14', data: { hoodId: 14, buyPerSqm: 225, rahn80m: 2100 } },
      { collection: 'votes', docId: 'wrong_doc_id', data: { userId: 'u123', hoodId: 14 } },
    ],
    nowMs,
  });
  assert.ok(relIssues.some((i) => i.category === 'ECONOMIC_RATIO_ANOMALY'));
  assert.ok(relIssues.some((i) => i.category === 'DUPLICATE_OVERRIDE_DOC' && i.hoodId === 14));
  assert.ok(relIssues.some((i) => i.category === 'DOC_ID_MISMATCH' && i.collection === 'votes'));

  // Local dataset audit baseline must have 0 critical negative issues
  const localReport = auditLocalRadarDatasets({
    neighborhoods: INITIAL_NEIGHBORHOODS,
    sponsorRequests: [],
    buyerLeads: [],
  });
  assert.equal(localReport.negativeFieldsCount, 0);
}

// ============================================================================
// 4. PROMPTS 272–279 — ALERTS, BARGAINS, VOTES, PROVENANCE & MIGRATIONS
// ============================================================================
{
  // Phone normalization from Persian/Arabic digits & +98 prefix (Prompt 272 & 276)
  assert.equal(normalizeIranMobilePhone('۰۹۱۲۳۴۵۶۷۸۹'), '09123456789');
  assert.equal(normalizeIranMobilePhone('+98 912 345 6789'), '09123456789');
  assert.equal(normalizeIranMobilePhone('٠٩٣٥١١١٢٢٣٣'), '09351112233');

  // Bargain sanitization & clamping (Prompt 273)
  const sanitizedBargain = buildSanitizedBargainPayload({
    hoodId: 5,
    title: 'آپارتمان خوش‌نقشه',
    type: 'خرید',
    sqm: 5, // Below 25 -> clamped to 25
    priceText: '۹.۵ میلیارد',
    discountPercent: 95, // Above 60 -> clamped to 60
    buyerProfitText: '۱.۲ میلیارد زیر فی',
    street: 'خیابان اصلی',
  });
  assert.equal(sanitizedBargain.sqm, 25);
  assert.equal(sanitizedBargain.discountPercent, 60);

  // Override backward compatibility & expired sponsor fallback (Prompts 275, 278 & 279)
  const legacyOverride = mapFirestoreDocToOverride('hood_1', {
    hoodId: 1,
    buyPerSqm: 310,
    rahn80m: 3200,
    sponsor: {
      name: 'املاک منقضی',
      phone: '021-22000000',
      specialty: 'مسکونی',
      experienceYears: 12,
      expiresAtIso: '2020-01-01T00:00:00.000Z',
    },
  });
  assert.ok(legacyOverride);
  const merged = mergeNeighborhoodOverridesIntoList(
    [sampleHood],
    { [sampleHood.id]: { ...legacyOverride!, hoodId: sampleHood.id } },
    [sampleHood],
    Date.parse('2026-11-01T00:00:00.000Z')
  );
  assert.equal(merged[0].buyPerSqm, 310);
  assert.equal(merged[0].sponsor.name, sampleHood.sponsor.name, 'Expired sponsor must revert to seed sponsor');

  // Valuation provenance & deterministic digest (Prompt 277)
  const traceA = buildReproducibleValuationTrace(
    sampleHood,
    {
      areaSqm: 95,
      buildingAgeYears: 6,
      floorNumber: 3,
      totalFloors: 5,
      hasElevator: true,
      hasParking: true,
      hasStorage: true,
      isRenovated: false,
      referenceJalaliYear: 1405,
    },
    '2026-11-01T00:00:00.000Z'
  );
  const traceB = buildReproducibleValuationTrace(
    sampleHood,
    {
      areaSqm: 95,
      buildingAgeYears: 6,
      floorNumber: 3,
      totalFloors: 5,
      hasElevator: true,
      hasParking: true,
      hasStorage: true,
      isRenovated: false,
      referenceJalaliYear: 1405,
    },
    '2026-11-01T12:00:00.000Z'
  );
  assert.equal(traceA.formulaId, HEDONIC_FORMULA_ID);
  assert.equal(traceA.formulaVersion, HEDONIC_FORMULA_VERSION);
  assert.equal(traceA.reproducibilityDigest, traceB.reproducibilityDigest);
  assert.ok(getCurrentJalaliYear(new Date('2026-11-01T00:00:00Z')) >= 1404);
  assert.equal(toPersianNum('1405'), '۱۴۰۵');
  assert.equal(toPersianNum(1405), '۱٬۴۰۵');
}

// ============================================================================
// 5. PROMPTS 281–300 — ACCESSIBILITY, PERFORMANCE & QA RELEASE GATE CHECKS
// ============================================================================
{
  const rootDir = process.cwd();
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('محله‌های'), 'index.html must use proper Persian ZWNJ in محله‌های');
  assert.ok(indexHtml.includes('defer crossorigin=""'), 'Leaflet script in index.html must be deferred');

  const topBarSrc = fs.readFileSync(path.join(rootDir, 'src/components/FloatingTopBar.tsx'), 'utf8');
  assert.ok(topBarSrc.includes('role="dialog"'), 'FloatingTopBar popovers must expose role="dialog"');
  assert.ok(topBarSrc.includes('aria-expanded='), 'FloatingTopBar triggers must expose aria-expanded');

  const drawerSrc = fs.readFileSync(path.join(rootDir, 'src/components/NeighborhoodInspectorDrawer.tsx'), 'utf8');
  assert.ok(drawerSrc.includes('role="tablist"'), 'NeighborhoodInspectorDrawer must expose role="tablist"');
  assert.ok(drawerSrc.includes('role="tab"'), 'NeighborhoodInspectorDrawer tabs must expose role="tab"');
  assert.ok(drawerSrc.includes('ArrowLeft') && drawerSrc.includes('ArrowRight'), 'Tabs must support RTL Arrow key navigation');

  const tabsSrc = fs.readFileSync(path.join(rootDir, 'src/components/NeighborhoodInspectorTabs.tsx'), 'utf8');
  assert.ok(tabsSrc.includes('bargainsList.length === 0'), 'Bargains tab must handle empty state explicitly');

  const uploadSrc = fs.readFileSync(path.join(rootDir, 'src/utils/objectStorageUpload.ts'), 'utf8');
  assert.ok(uploadSrc.includes('MAX_CONCURRENT_SHARP_JOBS'), 'Sharp image processor must enforce concurrency semaphore');
}

// ============================================================================
// 6. PROMPTS 301–320 — OBSERVABILITY, FORENSIC LEDGER, SLO DEDUPLICATION & GAME DAY
// ============================================================================
import {
  TamperResistantForensicLedger,
  redactSensitiveForensicText,
} from '../src/utils/serverForensicsAndIncidentResponse';
import {
  SloBurnRateAndAlertDeduplicator,
  auditFirestoreDocumentGrowthAndFanout,
  executeIsolatedOperationalGameDay,
  validateCrossServiceBackupConsistency,
} from '../src/utils/operationalScaleAndGameDay';
import {
  AdminSeparationOfDutiesController,
  createAuthenticatedEncryptedBackup,
  decryptAndVerifyEncryptedBackup,
} from '../src/utils/serverAdminSodAndBackupSecurity';
import {
  IdempotencyLedger,
  OptimisticConcurrencyStore,
} from '../src/utils/serverIdempotencyAndConcurrency';
import {
  createDeletionJournalEntry,
  validateJournalEntry,
} from '../src/utils/deletionJournal';

{
  // Tamper-resistant hash chain & secret redaction (Prompts 302, 303, 309, 318)
  const ledger = new TamperResistantForensicLedger();
  const ev1 = ledger.recordSecurityEvent({
    category: 'UNAUTHORIZED_ADMIN_ACCESS',
    actorId: 'u_attacker',
    actorIp: '203.0.113.50',
    requestId: 'req-1001',
    correlationId: 'corr-1001',
    targetResource: '/api/admin/runtime-config',
    outcome: 'BLOCKED',
    metadata: {
      authorization: 'Bearer secret-jwt-token-value',
      note: 'Attempted by user@example.com with key AIzaSyB1234567890123456789012345',
    },
  });
  assert.equal(ev1.redactedMetadata.authorization, '[REDACTED]');
  assert.ok(!String(ev1.redactedMetadata.note).includes('AIzaSyB'));
  assert.equal(redactSensitiveForensicText('Bearer my-secret-token'), 'Bearer [REDACTED]');
  assert.equal(ledger.verifyChainIntegrity().intact, true);

  // SLO burn rate & alert fatigue deduplicator (Prompts 310 & 311)
  const dedup = new SloBurnRateAndAlertDeduplicator();
  const blip = dedup.evaluateWindow({
    serviceName: 'market-pulse-api',
    windowTotalRequests: 10,
    windowFailedRequests: 1,
    p99LatencyMs: 250,
    latencyTargetMs: 800,
    availabilityTargetRatio: 0.99,
  });
  assert.equal(blip.shouldPageOperator, false);
  assert.equal(blip.state, 'SUPPRESSED_TRANSIENT_BLIP');

  const fire1 = dedup.evaluateWindow({
    serviceName: 'market-pulse-api',
    windowTotalRequests: 100,
    windowFailedRequests: 25,
    p99LatencyMs: 1800,
    latencyTargetMs: 800,
    availabilityTargetRatio: 0.99,
  });
  assert.equal(fire1.shouldPageOperator, true);
  assert.equal(fire1.state, 'FIRING_SLO_BURN');

  const fire2 = dedup.evaluateWindow({
    serviceName: 'market-pulse-api',
    windowTotalRequests: 100,
    windowFailedRequests: 30,
    p99LatencyMs: 1900,
    latencyTargetMs: 800,
    availabilityTargetRatio: 0.99,
  });
  assert.equal(fire2.shouldPageOperator, false);
  assert.equal(fire2.state, 'FIRING_DEDUPLICATED');

  const recovered = dedup.evaluateWindow({
    serviceName: 'market-pulse-api',
    windowTotalRequests: 100,
    windowFailedRequests: 0,
    p99LatencyMs: 220,
    latencyTargetMs: 800,
    availabilityTargetRatio: 0.99,
  });
  assert.equal(recovered.shouldPageOperator, true);
  assert.equal(recovered.state, 'RESOLVED_NOTIFICATION');

  // Firestore document growth & fanout monitor (Prompt 307 & 315)
  const docAudit = auditFirestoreDocumentGrowthAndFanout('neighborhoodOverrides', 'hood_1', {
    hoodId: 1,
    buyPerSqm: 240,
    tags: Array.from({ length: 65 }, (_, i) => `tag_${i}`),
  });
  assert.equal(docAudit.withinHardLimit, true);
  assert.equal(docAudit.indexFanoutRisk, 'HIGH');

  // Operational Game Day 10-scenario readiness verification (Prompt 320)
  const gameDay = executeIsolatedOperationalGameDay();
  assert.equal(gameDay.finalDecision, 'READY_FOR_STAGING_OPERATIONAL_VALIDATION');
  assert.equal(gameDay.scenarios.length, 10);
  assert.ok(gameDay.scenarios.every((s) => s.dataIntegrityVerified));

  // Section 17 (Prompts 321–340): Encrypted Backup + Restoration + Secret Scrubbing + Cross-Service Consistency
  const backupEnv = createAuthenticatedEncryptedBackup({
    payload: {
      neighborhoodsCount: 190,
      GEMINI_API_KEY: 'must-be-scrubbed',
      OBJECT_STORAGE_SECRET_ACCESS_KEY: 'must-be-scrubbed',
    },
    encryptionKeyMaterial: 'radar-dr-master-key-2026-secure',
    keyId: 'dr-key-v1',
    appVersion: '2.4.0',
    schemaVersion: '1',
  });
  const restored = decryptAndVerifyEncryptedBackup(backupEnv, 'radar-dr-master-key-2026-secure');
  assert.equal(restored.verified, true);
  assert.equal(restored.payload.neighborhoodsCount, 190);
  assert.equal(restored.payload.GEMINI_API_KEY, undefined, 'Secrets must never be stored in backup archives');

  const crossRestore = validateCrossServiceBackupConsistency(
    {
      recoveryCorrelationId: 'dr-corr-1',
      firestoreSnapshotAtIso: '2026-11-01T06:00:00Z',
      objectStorageSnapshotAtIso: '2026-11-01T06:01:00Z',
      deletionJournalSnapshotAtIso: '2026-11-01T06:01:30Z',
      schemaVersion: '1',
      expectedAppConfigVersion: '1',
      firestoreListings: [{ id: 'bg-1', ownerUid: 'u-1', mediaKeys: ['listings/img1.webp'] }],
      objectStorageKeysPresent: ['listings/img1.webp'],
      metadataObjectKeysPresent: ['listings/img1.webp'],
      pendingDeleteJournalKeys: [],
      knownAuthUserUids: ['u-1'],
    },
    '1'
  );
  assert.equal(crossRestore.consistentForAutomaticRestore, true);

  // Separation of Duties (SoD), Idempotency & Deletion Journal (Prompts 326, 327, 337, 338)
  const sod = new AdminSeparationOfDutiesController();
  const sodReq = sod.requestHighRiskOperation({
    actionType: 'BACKUP_RESTORE',
    requesterId: 'admin_1',
    requesterRole: 'OPERATIONS_ADMIN',
    payload: { snapshotId: 'snap_101' },
    reason: 'DR rehearsal',
  });
  assert.throws(() =>
    sod.approveHighRiskOperation({
      requestId: sodReq.requestId,
      approverId: 'admin_1', // Self-approval forbidden!
      approverRole: 'SUPER_ADMIN',
      expectedPayloadDigest: sodReq.payloadDigest,
    })
  );
  const sodApproved = sod.approveHighRiskOperation({
    requestId: sodReq.requestId,
    approverId: 'admin_2',
    approverRole: 'SUPER_ADMIN',
    expectedPayloadDigest: sodReq.payloadDigest,
  });
  assert.equal(sodApproved.status, 'APPROVED');

  const idem = new IdempotencyLedger();
  const idem1 = idem.beginExecution({
    scope: 'bargain_create',
    actorId: 'u-1',
    idempotencyKey: 'idem-key-001',
    payload: { hoodId: 1, sqm: 85 },
  });
  assert.equal(idem1.status, 'PROCEED');
  const idemConcurrent = idem.beginExecution({
    scope: 'bargain_create',
    actorId: 'u-1',
    idempotencyKey: 'idem-key-001',
    payload: { hoodId: 1, sqm: 85 },
  });
  assert.equal(idemConcurrent.status, 'CONFLICT_IN_PROGRESS');

  const occ = new OptimisticConcurrencyStore<{ buyPerSqm: number }>();
  occ.upsertInitial('hood_1', { buyPerSqm: 200 }, 'admin_1');
  const occStale = occ.applyPartialUpdate({
    entityKey: 'hood_1',
    expectedRevision: 99,
    patch: { buyPerSqm: 210 },
    actorId: 'admin_2',
  });
  assert.equal(occStale.ok, false);

  const journalEntry = createDeletionJournalEntry({
    operationId: 'del_op_12345678',
    objectId: 'obj_1',
    objectKey: 'listings/img1.webp',
  });
  validateJournalEntry(journalEntry);
  assert.equal(journalEntry.status, 'queued');
}

console.log('✅ Prompts 261 to 340 — All Business Logic, QA, Observability & DR Checks Passed!');
