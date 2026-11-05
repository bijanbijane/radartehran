/**
 * @file tests/assess-005-legal-and-tax-formulas.test.ts
 * @description Empirical statutory compliance audit for Workstream ASSESS-005:
 *   1. Article 53 / 54 / 131 rental income tax brackets, area exemptions (150m2 Tehran / 200m2 other),
 *      and Article 54 bis vacant homes tax multipliers (Year 1 = 6x, Year 2 = 12x, Year 3 = 18x).
 *   2. Islamic Civil Code inheritance shares (Articles 905, 906, 946) and post-1395 estate tax.
 *   3. Official real estate union commission stepped tariff (0.5% up to 500M, 0.25% excess + 10% VAT),
 *      seller transfer tax, and 50/50 notary fee division.
 *   4. Building charge allocation SaaS model (fixed, per-occupant, per-sqm shares).
 *   5. Chitgar cooperative housing cost overrun and Inter-City migration arbitrage.
 */

import assert from 'node:assert/strict';
import {
  calculatePropertyTaxes,
  calculateInheritanceShares,
  generateBuildingChargeBill,
  calculateChitgarCoopScore,
  calculateInterCityMigration,
  calculateLobbyUpgradeRoi,
  calculateMovingCost,
} from '../src/data/legalAndBuildingLogic';
import { calculateOfficialCommissionAndNotary } from '../src/data/multiCityData';

console.log('--- Starting ASSESS-005: 1405 Legal, Tax & Notary Formula Audit ---');

// ============================================================================
// 1. Property Rental Income & Vacant Homes Tax (Articles 53, 54, 54 bis, 131)
// ============================================================================
{
  // 1.1: Tehran Area Exemption (Article 53 Note 11: <= 150 sqm in Tehran)
  const tehranExempt = calculatePropertyTaxes({
    monthlyRentMillion: 25,
    rahnMillion: 500,
    sqm: 140,
    city: 'tehran',
    qualifiesForAreaExemption: true,
  });
  assert.equal(tehranExempt.isAreaExempt, true, '140 sqm in Tehran with area exemption flag must be exempt');
  assert.equal(tehranExempt.annualRentalTaxMillion, 0, 'Exempt property must have 0 rental tax');

  // 1.2: Non-Tehran Area Exemption (<= 200 sqm in other cities, e.g., Isfahan)
  const isfahanExempt = calculatePropertyTaxes({
    monthlyRentMillion: 25,
    rahnMillion: 500,
    sqm: 185,
    city: 'isfahan',
    qualifiesForAreaExemption: true,
  });
  assert.equal(isfahanExempt.isAreaExempt, true, '185 sqm in Isfahan (<= 200 sqm) must be exempt');

  const tehranNonExempt185 = calculatePropertyTaxes({
    monthlyRentMillion: 25,
    rahnMillion: 500,
    sqm: 185,
    city: 'tehran',
    qualifiesForAreaExemption: false,
  });
  assert.equal(tehranNonExempt185.isAreaExempt, false, '185 sqm in Tehran without exemption must be taxable');
  // Gross annual rent = 25*12 + 500*0.18 = 300 + 90 = 390M
  // Net taxable rent (75% after 25% statutory deduction) = 390 * 0.75 = 292.5M
  assert.equal(tehranNonExempt185.taxableRentalIncomeAnnualMillion, 293);
  // Bracket: First 200M at 15% = 30M; Remaining 92.5M at 20% = 18.5M; Total = 48.5M
  assert.equal(tehranNonExempt185.annualRentalTaxMillion, 48.5);

  // 1.3: Partial Sqm Exemption (e.g., 200 sqm in Tehran with qualifiesForAreaExemption = true)
  // Taxable ratio = (200 - 150) / 200 = 0.25
  const tehranPartial = calculatePropertyTaxes({
    monthlyRentMillion: 25,
    rahnMillion: 500,
    sqm: 200,
    city: 'tehran',
    qualifiesForAreaExemption: true,
  });
  assert.equal(tehranPartial.isAreaExempt, false);
  // Net taxable = 292.5M * 0.25 = 73.125M -> * 15% = 10.96875 -> rounded to 11.0M
  assert.equal(tehranPartial.annualRentalTaxMillion, 11);

  // 1.4: Article 54 bis Vacant Homes Tax Multipliers (Year 1 = 6x, Year 2 = 12x, Year 3 = 18x)
  const vacantY1 = calculatePropertyTaxes({
    monthlyRentMillion: 0,
    rahnMillion: 0,
    sqm: 100,
    city: 'tehran',
    vacantMonths: 10,
    vacantYear: 1,
    officialTaxableRentalBaseMillion: 20,
  });
  const vacantY2 = calculatePropertyTaxes({
    monthlyRentMillion: 0,
    rahnMillion: 0,
    sqm: 100,
    city: 'tehran',
    vacantMonths: 10,
    vacantYear: 2,
    officialTaxableRentalBaseMillion: 20,
  });
  const vacantY3 = calculatePropertyTaxes({
    monthlyRentMillion: 0,
    rahnMillion: 0,
    sqm: 100,
    city: 'tehran',
    vacantMonths: 10,
    vacantYear: 3,
    officialTaxableRentalBaseMillion: 20,
  });
  assert.ok(vacantY1.vacantHomeTaxAnnualMillion! > 0, 'Year 1 vacant > 4 months must incur tax');
  assert.equal(vacantY2.vacantHomeTaxAnnualMillion, vacantY1.vacantHomeTaxAnnualMillion! * 2, 'Year 2 multiplier (12x) must be 2x Year 1 (6x)');
  assert.equal(vacantY3.vacantHomeTaxAnnualMillion, vacantY1.vacantHomeTaxAnnualMillion! * 3, 'Year 3 multiplier (18x) must be 3x Year 1 (6x)');

  console.log('✓ 1. Article 53/54/54-bis rental & vacant home tax formulas verified');
}

// ============================================================================
// 2. Islamic Civil Code Inheritance Shares & Estate Tax (Articles 905, 906, 946)
// ============================================================================
{
  // 2.1: Standard First-Class Heirs: Wife (1/8), Mother (1/6), Father (1/6), 1 Son (2 units), 1 Daughter (1 unit)
  const estateValue = 24000; // 24 Billion Toman
  const standardHeirs = calculateInheritanceShares({
    propertyTotalValueMillion: estateValue,
    hasSpouse: true,
    spouseType: 'wife',
    hasMother: true,
    hasFather: true,
    sonsCount: 1,
    daughtersCount: 1,
    officialTaxableEstateValueMillion: 4000,
    estateTaxRatePercent: 7,
    deathAfter1395: true,
  });

  const wifeShare = standardHeirs.shares.find((s) => s.relation.includes('زوجه'));
  const motherShare = standardHeirs.shares.find((s) => s.relation.includes('مادر'));
  const fatherShare = standardHeirs.shares.find((s) => s.relation.includes('پدر'));
  const sonShare = standardHeirs.shares.find((s) => s.relation.includes('پسران'));
  const daughterShare = standardHeirs.shares.find((s) => s.relation.includes('دختران'));

  assert.ok(wifeShare && motherShare && fatherShare && sonShare && daughterShare);
  assert.equal(wifeShare.totalValueMillion, 3000, 'Wife with children receives 1/8 = 3,000M of 24,000M');
  assert.equal(motherShare.totalValueMillion, 4000, 'Mother with children receives 1/6 = 4,000M of 24,000M');
  assert.equal(fatherShare.totalValueMillion, 4000, 'Father with children receives 1/6 = 4,000M of 24,000M');
  // Remaining = 24000 - (3000 + 4000 + 4000) = 13000M. Divided 2:1 between son and daughter
  assert.equal(
    Math.round(sonShare.totalValueMillion + daughterShare.totalValueMillion),
    13000,
    'Children must receive exact remainder (13/24 = 13,000M)'
  );
  assert.ok(
    Math.abs(sonShare.perPersonValueMillion - daughterShare.perPersonValueMillion * 2) <= 0.2,
    'Son share must be 2x daughter share under Civil Code'
  );
  assert.equal(standardHeirs.estateTaxEstimateMillion, 280, '7% estate tax on 4,000M taxable value = 280M');

  // 2.2: Husband with No Children (1/2) + Father takes remainder by Qarabat (Article 906)
  const husbandAndFather = calculateInheritanceShares({
    propertyTotalValueMillion: 12000,
    hasSpouse: true,
    spouseType: 'husband',
    hasMother: false,
    hasFather: true,
    sonsCount: 0,
    daughtersCount: 0,
  });
  const husband = husbandAndFather.shares.find((s) => s.relation.includes('زوج'));
  const father = husbandAndFather.shares.find((s) => s.relation.includes('پدر'));
  assert.equal(husband?.totalValueMillion, 6000, 'Husband without children receives 1/2 = 6,000M');
  assert.equal(father?.totalValueMillion, 6000, 'Father takes 1/6 + remainder = 1/2 = 6,000M');

  console.log('✓ 2. Islamic Civil Code inheritance shares & Article 17 estate tax verified');
}

// ============================================================================
// 3. Official Real Estate Union Commission, VAT, Transfer Tax & Notary Fees
// ============================================================================
{
  // 3.1: Buy Transaction (10,000 Million = 10 Billion Toman)
  const buyComm = calculateOfficialCommissionAndNotary({
    dealType: 'buy',
    buyTotalMillion: 10000,
    depositMillion: 0,
    monthlyRentMillion: 0,
  });
  // Tier 1: 500M * 0.005 = 2,500,000 Toman
  // Tier 2: (10,000M - 500M) * 0.0025 = 9,500M * 0.0025 = 23,750,000 Toman
  // Base each side = 26,250,000 Toman
  assert.equal(buyComm.baseCommissionEachSideToman, 26_250_000, 'Stepped union commission for 10B Toman must be 26.25M Toman');
  assert.equal(buyComm.vatEachSideToman, 2_625_000, '10% VAT on 26.25M must be 2.625M Toman');
  assert.equal(buyComm.totalCommissionEachSideToman, 28_875_000);
  assert.equal(buyComm.buyerNotaryShareToman, buyComm.sellerNotaryShareToman, 'Notary fee must be split 50/50');
  assert.ok(buyComm.totalSellerPayableToman > buyComm.totalBuyerPayableToman, 'Seller total payable includes transfer tax');

  // 3.2: Rent Transaction (1,000M Deposit + 15M Monthly Rent)
  // Equivalent monthly rent = 15M + (1,000M * 0.03) = 45M Toman
  // Base commission each side = 25% of 45M = 11,250,000 Toman
  const rentComm = calculateOfficialCommissionAndNotary({
    dealType: 'rent',
    buyTotalMillion: 0,
    depositMillion: 1000,
    monthlyRentMillion: 15,
  });
  assert.equal(rentComm.baseCommissionEachSideToman, 11_250_000, 'Rent commission must be 1/4 of converted monthly rent');
  assert.equal(rentComm.vatEachSideToman, 1_125_000, '10% VAT on rent commission');
  assert.equal(rentComm.totalBuyerPayableToman, 12_375_000);
  assert.equal(rentComm.transferTaxSellerToman, 0, 'Rent transaction has 0 transfer tax');

  console.log('✓ 3. Official real estate union commission, 10% VAT, transfer tax & notary brackets verified');
}

// ============================================================================
// 4. Building Manager Charge Allocation & Ancillary Legal/PropTech Calculators
// ============================================================================
{
  const validBill = generateBuildingChargeBill({
    buildingName: 'برج سرو',
    monthName: 'آبان ۱۴۰۵',
    totalCleaningThousand: 4000,
    totalElevatorServiceThousand: 2000,
    totalSharedWaterPowerThousand: 3000,
    totalReserveFundThousand: 5000,
    totalUnits: 10,
    unitNumber: 4,
    unitOccupants: 3,
    totalBuildingOccupants: 30,
    unitSqm: 100,
    totalBuildingSqm: 1000,
  });
  assert.equal(validBill.isValid, true);
  assert.equal(validBill.unitFixedShareThousand, 600, '(4000+2000)/10 units = 600k');
  assert.equal(validBill.unitOccupantShareThousand, 300, '3000 * (3/30) = 300k');
  assert.equal(validBill.unitSqmShareThousand, 500, '5000 * (100/1000) = 500k');
  assert.equal(validBill.unitTotalBillThousand, 1400, '600 + 300 + 500 = 1400k');

  const invalidBill = generateBuildingChargeBill({
    buildingName: 'برج سرو',
    monthName: 'آبان ۱۴۰۵',
    totalCleaningThousand: 4000,
    totalElevatorServiceThousand: 2000,
    totalSharedWaterPowerThousand: 3000,
    totalReserveFundThousand: 5000,
    totalUnits: 10,
    unitNumber: 4,
    unitOccupants: 15,
    totalBuildingOccupants: 10, // Invalid: total < unit
    unitSqm: 100,
    totalBuildingSqm: 1000,
  });
  assert.equal(invalidBill.isValid, false, 'Must reject when totalBuildingOccupants < unitOccupants');

  const coopScore = calculateChitgarCoopScore({
    baseInstallmentsPaidMillion: 2000,
    transferRightFeeMillion: 1000,
    promisedRemainingCostPerSqmMillion: 30,
    unitSqm: 100,
    deliveryMonths: 42,
    costOverrunReservePercent: 25,
    benchmarkFinishedPricePerSqmMillion: 90,
  });
  // Cash today = 3000M; Remaining with 25% overrun = 30 * 1.25 * 100 = 3750M; Total = 6750M (67.5M/sqm -> 68M/sqm)
  assert.equal(coopScore.cashNeededTodayMillion, 3000);
  assert.equal(coopScore.estimatedTotalFinishedCostMillion, 6750);
  assert.equal(coopScore.estimatedFinishedPricePerSqmMillion, 68);
  assert.ok(coopScore.projectedProfitPercent! > 0);

  const migration = calculateInterCityMigration(150, 'karaj');
  assert.equal(migration.tehran80mUnitValueBillion, 12);
  assert.ok(migration.remainingCashBufferMillion > 0, 'Selling 80m at 150M/sqm in Tehran affords 120m in Karaj median with cash buffer');

  const lobbyRoi = calculateLobbyUpgradeRoi({
    totalBuildingUnits: 20,
    currentUnitAvgPriceBillion: 10,
    renovationBudgetMillion: 2000,
  });
  assert.equal(lobbyRoi.perUnitCostMillion, 100);
  assert.equal(lobbyRoi.perUnitValueGainMillion, 600);
  assert.equal(lobbyRoi.roiMultiple, 6);

  const moving = calculateMovingCost({
    truckType: 'khavar',
    workerCount: 4,
    hours: 4,
    heavyItemsCount: 2,
    hasElevatorOrigin: true,
    hasElevatorDest: false,
    floorsCount: 3,
  });
  assert.ok(moving.totalMovingCostThousand > 0);
  assert.equal(moving.housingRegistryChecklist.length, 4);

  console.log('✓ 4. Building charge SaaS, Chitgar coop overrun, Inter-City arbitrage & moving formulas verified');
}

console.log('--- ALL ASSESS-005 LEGAL, TAX & NOTARY FORMULA TESTS PASSED ---');
