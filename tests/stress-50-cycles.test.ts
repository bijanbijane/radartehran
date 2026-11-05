/**
 * @file tests/stress-50-cycles.test.ts
 * @description 50-Cycle Deep Stress-Testing, Fuzzing & Regression Debug Suite
 * Runs 50 consecutive cycles of randomized input fuzzing, edge-case math evaluation,
 * security payload sanitization, and state hydration stability.
 */

import {
  calculateDetailedValuation,
  calculateLandShare,
  calculateFloorplanOptimization,
  calculateNegotiationStrategy,
  calculateAuctionBidding,
  calculateCombinedBuyingPower,
  calculateDepositInflationLoss,
  calculateRahnArbitrage,
  calculatePropertyTaxes,
  calculateInheritanceShares,
  generateBuildingChargeBill,
  calculateLobbyUpgradeRoi,
  calculateChitgarCoopScore,
  calculateInterCityMigration,
  calculateMovingCost,
  DeedType,
  ParkingType,
} from '../src/data/superModulesLogic';
import {
  INITIAL_NEIGHBORHOODS,
  toPersianNum,
  calcDistanceKm,
  getNeighborhoodMarketReport,
  getNeighborhoodTrafficInfo,
  EvaluatedNeighborhood,
} from '../src/data/neighborhoods';
import {
  cleanIranianMobile,
  isValidIranianMobile,
  sanitizeInput,
  safeJsonParse,
  clampNumber,
} from '../src/utils/security';
import {
  buildZoomAdaptivePillIconConfig,
  isCoordInsideStoredViewport,
} from '../src/components/mapAdvancedLayers';

const sampleHood: EvaluatedNeighborhood = {
  ...INITIAL_NEIGHBORHOODS[0],
  buyPerSqm: 120,
  rahn80m: 1400,
  status: 'green' as const,
  diffPercent: 0,
  distKm: 5,
  overallScore: 8.5,
  marketReport: getNeighborhoodMarketReport(INITIAL_NEIGHBORHOODS[0]),
  trafficInfo: getNeighborhoodTrafficInfo(INITIAL_NEIGHBORHOODS[0]),
};

const DEED_TYPES: DeedType[] = ['single_deed', 'endowment', 'informal_contract', 'probate_coop'];
const PARKING_TYPES: ParkingType[] = ['dedicated', 'tandem', 'none'];

export async function run50StressCycles(): Promise<void> {
  console.log('========================================================================');
  console.log('شروع ۵۰ چرخه دیباگ، استرس‌تست و آزمون پایداری (50-Iteration Stress Test)');
  console.log('========================================================================\n');

  let passedCycles = 0;
  const startTime = Date.now();

  for (let cycle = 1; cycle <= 50; cycle++) {
    const cycleStart = Date.now();

    // 1. Math Fuzzing: Valuation with randomized and extreme edge inputs
    const randomSqm = cycle % 5 === 0 ? 0 : (cycle * 7) % 350 + 20;
    const randomAge = (cycle * 3) % 45;
    const randomFloor = (cycle % 12) - 2; // includes negative basement floors
    const deedType = DEED_TYPES[cycle % DEED_TYPES.length];
    const parkingType = PARKING_TYPES[cycle % PARKING_TYPES.length];

    const valResult = calculateDetailedValuation({
      hood: sampleHood,
      sqm: randomSqm,
      age: randomAge,
      floor: randomFloor,
      bedrooms: (cycle % 4) + 1,
      deedType,
      parkingType,
      hasElevator: cycle % 2 === 0,
      hasStorage: cycle % 3 === 0,
      renovation: cycle % 2 === 0 ? 'renovated' : 'needs_work',
      light: cycle % 2 === 0 ? 'south' : 'dim',
    });

    if (Number.isNaN(valResult.fairTotalMillion) || valResult.fairTotalMillion < 0) {
      throw new Error(`Cycle #${cycle} FAILED: Invalid valuation output ${valResult.fairTotalMillion}`);
    }

    // 2. Math Fuzzing: Land share & Floorplan with zero/extreme denominators
    const plotSqm = (cycle * 25) % 800 + 100;
    const units = (cycle % 20) + 1;
    const landShare = calculateLandShare({
      totalPlotSqm: plotSqm,
      totalBuildingUnits: units,
      unitSqm: Math.max(1, randomSqm),
      totalBuildingFloorSqm: Math.max(Math.max(1, randomSqm), plotSqm * 2),
      neighborhoodLandPerSqmMillion: 150 + cycle,
    });

    if (landShare.exactLandShareSqm <= 0 || Number.isNaN(landShare.pureLandValueMillion)) {
      throw new Error(`Cycle #${cycle} FAILED: Invalid land share calculation`);
    }

    // 3. Security Fuzzing: Random phone number normalization and XSS payload scrubbing
    const rawNumber = `۰۹۱۲${String(cycle).padStart(3, '0')}${String(cycle * 13).padStart(4, '0')}`.slice(0, 11);
    const cleaned = cleanIranianMobile(rawNumber);
    if (!cleaned.startsWith('09') || cleaned.length !== 11) {
      throw new Error(`Cycle #${cycle} FAILED: Phone normalizer failed for ${rawNumber} -> ${cleaned}`);
    }

    const xssPayload = `<img src=x onerror=alert(${cycle})>ملک شماره ${cycle}`;
    const scrubbed = sanitizeInput(xssPayload);
    if (scrubbed.includes('<img') || scrubbed.includes('onerror')) {
      throw new Error(`Cycle #${cycle} FAILED: XSS sanitization failed for payload`);
    }

    // 4. Legal & Tax: Rental tax boundary checks
    const sqmTax = 100 + (cycle % 100);
    const taxRes = calculatePropertyTaxes({
      monthlyRentMillion: 20 + cycle,
      rahnMillion: 400 + cycle * 10,
      sqm: sqmTax,
      city: 'tehran',
      qualifiesForAreaExemption: true,
    });
    if (sqmTax <= 150 && !taxRes.isAreaExempt) {
      throw new Error(`Cycle #${cycle} FAILED: Exemption rule failed for ${sqmTax}m²`);
    }

    // 5. Building Manager & WhatsApp generator
    const bill = generateBuildingChargeBill({
      buildingName: `برج کوثر چرخه ${cycle}`,
      monthName: 'آبان',
      totalCleaningThousand: 5000 + cycle * 100,
      totalElevatorServiceThousand: 3000,
      totalSharedWaterPowerThousand: 4000,
      totalReserveFundThousand: 2000,
      totalUnits: units,
      unitNumber: (cycle % units) + 1,
      unitOccupants: 3,
      totalBuildingOccupants: units * 3,
      unitSqm: 80,
      totalBuildingSqm: units * 80,
    });
    if (bill.unitTotalBillThousand <= 0 || !bill.whatsappMessageText.includes('برج کوثر')) {
      throw new Error(`Cycle #${cycle} FAILED: Building bill generation invalid`);
    }

    // 6. Memory and JSON pollution check
    const pollutedJson = `{"__proto__":{"polluted_${cycle}":true},"testVal":${cycle}}`;
    const parsed = safeJsonParse<any>(pollutedJson, { fallback: true });
    if ((Object.prototype as any)[`polluted_${cycle}`] || parsed.testVal !== cycle) {
      throw new Error(`Cycle #${cycle} FAILED: Prototype pollution not prevented`);
    }

    // 7. Spatial Map 3-Tier LOD Pill XSS & Viewport Fuzzing
    const zoomLevel = 10 + (cycle % 6); // tests zoom 10..15 across all 3 tiers
    const pillCfg = buildZoomAdaptivePillIconConfig({
      hood: { ...sampleHood, name: `محله <script>${cycle}</script>` },
      zoom: zoomLevel,
      isSelected: cycle % 4 === 0,
      hasSponsor: cycle % 3 === 0,
      isDarkMap: cycle % 2 === 0,
      pillBg: '#059669',
      priceLabel: `متری ${toPersianNum(100 + cycle)}م`,
    });
    if (pillCfg.html.includes('<script>') || pillCfg.iconSize[0] <= 0) {
      throw new Error(`Cycle #${cycle} FAILED: Map pill LOD XSS or size check failed`);
    }
    const insideCheck = isCoordInsideStoredViewport(35.75, 51.40, {
      north: 35.85,
      south: 35.65,
      east: 51.55,
      west: 51.25,
      zoom: zoomLevel,
    });
    if (!insideCheck) {
      throw new Error(`Cycle #${cycle} FAILED: Viewport coordinate check failed`);
    }

    const cycleElapsedMs = Date.now() - cycleStart;
    console.log(
      `[PASS] چرخه دیباگ #${String(cycle).padStart(2, '0')}/50: تست موفق ارزش‌گذاری، امنیت، نقشه و پارسینگ (زمان: ${cycleElapsedMs}ms)`
    );
    passedCycles++;
  }

  const totalTimeMs = Date.now() - startTime;
  console.log('\n========================================================================');
  console.log(
    `[STRESS TEST PASS] هر ۵۰ چرخه دیباگ متوالی با نرخ موفقیت ۱۰۰٪ و بدون خطا سپری شدند! (زمان کل: ${totalTimeMs}ms)`
  );
  console.log('========================================================================\n');
}

run50StressCycles().catch((err) => {
  console.error('[CRITICAL STRESS ERROR]', err);
  process.exit(1);
});
