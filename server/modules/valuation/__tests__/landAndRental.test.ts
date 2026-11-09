import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateLandValuationAdjustments,
  calculateRentalDepositEquivalence,
} from '../rentalAndLandEngine';
import { createValuationService } from '../service';
import type {
  PropertyValuationInput,
  ValuationDataConsumerAdapter,
} from '../types';
import { validateValuationInput } from '../validation';

class MockDataConsumer implements ValuationDataConsumerAdapter {
  async getNeighborhoodBenchmark(params: { cityId: string; hoodId: number }) {
    return {
      basePricePerSqmMillion: 120, // 120M Toman/sqm
      baseRahn80mMillion: 1200,   // 1.2B Toman Rahn
      baseLandPricePerSqmMillion: 200, // 200M Toman/sqm for land/plot
      hoodName: 'قیطریه',
      zone: '1',
      lastUpdatedIso: '2026-11-01T00:00:00.000Z',
    };
  }

  async queryComparableListings() {
    return [
      {
        id: 'comp_tx_1',
        sqm: 250,
        priceNumericMillion: 55000,
        buildYear: 1400,
        hoodId: 5,
        evidenceType: 'confirmed_transaction' as const, // Confirmed notary transaction
        approvedAtIso: '2026-10-15T00:00:00.000Z',
      },
      {
        id: 'comp_ask_2',
        sqm: 280,
        priceNumericMillion: 65000,
        buildYear: 1402,
        hoodId: 5,
        evidenceType: 'asking_listing' as const, // Unverified seller asking price
        approvedAtIso: '2026-11-02T00:00:00.000Z',
      },
    ];
  }
}

test('4. Land Property Valuation Strategy with zoning, frontage & corner plot multipliers', async () => {
  const consumer = new MockDataConsumer();
  const service = createValuationService({ dataConsumer: consumer });

  // 4a: Corner commercial plot with 16m frontage
  const landInput: PropertyValuationInput = {
    cityId: 'tehran',
    hoodId: 5,
    propertyCategory: 'land',
    transactionType: 'sale',
    sqm: 300,
    landZoning: 'commercial',
    isCornerPlot: true,
    frontageMeters: 16,
    densityPermitPercent: 300, // High density
  };

  const valResult = await service.estimatePropertyValue(landInput);

  assert.equal(valResult.propertyCategory, 'land');
  assert.equal(valResult.methodology, 'land_residual');
  assert.ok(valResult.estimatedTotalMillion > 60_000); // 300 * 200M base = 60B base, plus premiums

  // Verify specific factor adjustments
  const zoningAdj = valResult.adjustments.find((a) => a.factorId === 'zoning');
  assert.ok(zoningAdj && zoningAdj.impactPercent === 35.0);

  const cornerAdj = valResult.adjustments.find((a) => a.factorId === 'corner_plot');
  assert.ok(cornerAdj && cornerAdj.impactPercent === 8.5);

  const frontageAdj = valResult.adjustments.find((a) => a.factorId === 'frontage');
  assert.ok(frontageAdj && frontageAdj.impactPercent === 6.0);

  // 4b: Agricultural zoning severe penalty check
  const agriculturalAdjustments = calculateLandValuationAdjustments(
    {
      cityId: 'tehran',
      hoodId: 5,
      propertyCategory: 'land',
      transactionType: 'sale',
      sqm: 1000,
      landZoning: 'agricultural',
    },
    100,
  );
  const agriAdj = agriculturalAdjustments.adjustments.find((a) => a.factorId === 'zoning');
  assert.equal(agriAdj?.impactPercent, -50.0);
});

test('5. Rental Deposit & Monthly Rent Equivalence Analysis', () => {
  // 5a: Standard 3% monthly conversion (30,000 Toman per 1M Rahn)
  // Deposit: 500 Million, Monthly Rent: 15 Million
  // Equivalent Rahn: 500M + (15M / 0.03) = 500M + 500M = 1000 Million (1 Billion Toman)
  // Equivalent Rent: 15M + (500M * 0.03) = 15M + 15M = 30 Million Toman/month
  const analysis3pct = calculateRentalDepositEquivalence({
    originalDepositMillion: 500,
    originalMonthlyRentMillion: 15,
    monthlyConversionRatePercent: 3.0,
    nowIso: '2026-11-07T00:00:00.000Z',
  });

  assert.equal(analysis3pct.equivalentFullRahnMillion, 1000);
  assert.equal(analysis3pct.equivalentFullMonthlyRentMillion, 30);
  assert.equal(analysis3pct.monthlyConversionRatePercent, 3.0);
  assert.ok(analysis3pct.conversionConvention.includes('3٪ ماهانه') || analysis3pct.conversionConvention.includes('3%'));

  // 5b: Custom 2.5% rate (25,000 Toman per 1M Rahn)
  // Deposit: 400M, Rent: 20M
  // Equivalent Rahn: 400M + (20M / 0.025) = 400M + 800M = 1200 Million
  const analysis25pct = calculateRentalDepositEquivalence({
    originalDepositMillion: 400,
    originalMonthlyRentMillion: 20,
    monthlyConversionRatePercent: 2.5,
    nowIso: '2026-11-07T00:00:00.000Z',
  });

  assert.equal(analysis25pct.equivalentFullRahnMillion, 1200);
});

test('6. Asking price vs confirmed transaction distinction & data quality reporting', async () => {
  const consumer = new MockDataConsumer();
  const service = createValuationService({ dataConsumer: consumer });

  const result = await service.estimatePropertyValue({
    cityId: 'tehran',
    hoodId: 5,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 260,
  });

  // Verify that dataQuality reports confirmed transactions and asking prices distinctly
  assert.equal(result.dataQuality.evidenceCount, 2);
  assert.equal(result.dataQuality.confirmedTransactionCount, 1);
  assert.equal(result.dataQuality.askingPriceCount, 1);

  // Comparables distinguish evidenceType
  const confirmedComp = result.comparables.find((c) => c.listingId === 'comp_tx_1');
  assert.equal(confirmedComp?.evidenceType, 'confirmed_transaction');

  const askingComp = result.comparables.find((c) => c.listingId === 'comp_ask_2');
  assert.equal(askingComp?.evidenceType, 'asking_listing');
});

test('7. Validation constraints and bounds checking', () => {
  // 7a: Out of bounds sqm (> 100,000)
  const tooLarge = validateValuationInput({
    cityId: 'tehran',
    hoodId: 5,
    propertyCategory: 'residential',
    sqm: 150_000,
  });
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.issues[0]?.field, 'sqm');

  // 7b: Invalid property category
  const badCategory = validateValuationInput({
    cityId: 'tehran',
    hoodId: 5,
    propertyCategory: 'industrial_space', // Invalid category
    sqm: 120,
  });
  assert.equal(badCategory.ok, false);
  assert.equal(badCategory.issues[0]?.field, 'propertyCategory');

  // 7c: Negative deposit
  const negDeposit = validateValuationInput({
    cityId: 'tehran',
    hoodId: 5,
    propertyCategory: 'residential',
    sqm: 100,
    rentalDepositMillion: -50,
  });
  assert.equal(negDeposit.ok, false);
  assert.equal(negDeposit.issues[0]?.field, 'rentalDepositMillion');
});
