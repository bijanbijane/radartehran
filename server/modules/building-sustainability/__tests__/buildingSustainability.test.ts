/**
 * Comprehensive Automated Tests for Building Sustainability Module
 * (`server/modules/building-sustainability/__tests__/buildingSustainability.test.ts`)
 * Exclusive ownership: `server/modules/building-sustainability/`
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBuildingSustainabilityService,
  InMemoryBuildingSustainabilityRepository,
  SustainabilityDomainEvent,
  SustainabilityEventOutboxPublisher
} from '../index.js';

describe('Building Sustainability Module - Comprehensive Test Suite', () => {
  const publishedEvents: SustainabilityDomainEvent[] = [];
  const testPublisher: SustainabilityEventOutboxPublisher = {
    publish: async (event) => {
      publishedEvents.push(event);
    }
  };

  function setup() {
    publishedEvents.length = 0;
    const repo = new InMemoryBuildingSustainabilityRepository();
    const service = createBuildingSustainabilityService({
      repository: repo,
      outboxPublisher: testPublisher
    });
    return { repo, service };
  }

  it('creates building energy profile with completeness scoring and validates area', async () => {
    const { service } = setup();

    const profile = await service.createProfile({
      propertyId: 'prop-tehran-green-1',
      buildingNameFa: 'برج مسکونی سرو سعادت‌آباد',
      buildingCategory: 'residential_apartment',
      constructionYear: 1398,
      grossFloorAreaM2: 2500,
      conditionedFloorAreaM2: 2100,
      numberOfFloors: 10,
      numberOfUnits: 20,
      envelopeInsulationRating: 'high_performance',
      windowGlazingType: 'double_glazing',
      heatingSystemType: 'موتورخانه مرکزی چگالشی',
      coolingSystemType: 'چیلر تراکمی'
    });

    assert.equal(profile.propertyId, 'prop-tehran-green-1');
    assert.equal(profile.grossFloorAreaM2, 2500);
    assert.equal(profile.dataCompletenessScorePercent, 100);
    assert.equal(publishedEvents.length, 1);
    assert.equal(publishedEvents[0].eventType, 'building_sustainability.energy_profile.created');

    // Reject non-positive floor area
    await assert.rejects(
      async () => {
        await service.createProfile({
          propertyId: 'prop-invalid',
          buildingCategory: 'residential_apartment',
          grossFloorAreaM2: 0
        });
      },
      /مساحت زیربنای کل ساختمان باید بزرگ‌تر از صفر باشد/
    );
  });

  it('records multi-fuel consumption, normalizes units to kWh, and prevents overlapping intervals', async () => {
    const { service } = setup();

    await service.createProfile({
      propertyId: 'prop-energy-test',
      buildingCategory: 'residential_apartment',
      grossFloorAreaM2: 1000
    });

    // 1. Record electricity: 3000 kWh
    const elecRecord = await service.recordConsumption({
      propertyId: 'prop-energy-test',
      sourceId: 'grid_electricity',
      periodStartIso: '2026-01-01T00:00:00.000Z',
      periodEndIso: '2026-01-31T00:00:00.000Z',
      rawAmount: 3000,
      rawUnit: 'kwh'
    });
    assert.equal(elecRecord.normalizedKwhDelivered, 3000);

    // 2. Record natural gas: 500 m³ (converted at 10.5 kWh/m³ = 5250 kWh)
    const gasRecord = await service.recordConsumption({
      propertyId: 'prop-energy-test',
      sourceId: 'natural_gas',
      periodStartIso: '2026-01-01T00:00:00.000Z',
      periodEndIso: '2026-01-31T00:00:00.000Z',
      rawAmount: 500,
      rawUnit: 'cubic_meters'
    });
    assert.equal(gasRecord.normalizedKwhDelivered, 5250);

    // 3. Reject overlapping consumption for same fuel (e.g. electricity starting mid-January)
    await assert.rejects(
      async () => {
        await service.recordConsumption({
          propertyId: 'prop-energy-test',
          sourceId: 'grid_electricity',
          periodStartIso: '2026-01-15T00:00:00.000Z',
          periodEndIso: '2026-02-15T00:00:00.000Z',
          rawAmount: 1500,
          rawUnit: 'kwh'
        });
      },
      /تداخل در بازه زمانی مصرف برای منبع grid_electricity/
    );
  });

  it('calculates Site EUI, Primary Energy EUI, and fuel breakdown accurately', async () => {
    const { service } = setup();

    await service.createProfile({
      propertyId: 'prop-eui-test',
      buildingCategory: 'commercial_office',
      grossFloorAreaM2: 1000,
      conditionedFloorAreaM2: 800
    });

    // 365 days of electricity: 60,000 kWh delivered
    await service.recordConsumption({
      propertyId: 'prop-eui-test',
      sourceId: 'grid_electricity',
      periodStartIso: '2025-01-01T00:00:00.000Z',
      periodEndIso: '2025-12-31T00:00:00.000Z', // 364/365 days
      rawAmount: 60000,
      rawUnit: 'kwh'
    });

    // 365 days of natural gas: 10,000 m³ (105,000 kWh delivered)
    await service.recordConsumption({
      propertyId: 'prop-eui-test',
      sourceId: 'natural_gas',
      periodStartIso: '2025-01-01T00:00:00.000Z',
      periodEndIso: '2025-12-31T00:00:00.000Z',
      rawAmount: 10000,
      rawUnit: 'cubic_meters'
    });

    const euiResult = await service.calculateEui('prop-eui-test');

    // Total delivered = ~165,000 kWh / 1000 m² = ~165 kWh/m²/year
    assert.ok(euiResult.siteEuiGrossKwhPerM2Year > 160 && euiResult.siteEuiGrossKwhPerM2Year < 170);
    // Conditioned area is 800 m² -> Site EUI Conditioned is higher
    assert.ok(euiResult.siteEuiConditionedKwhPerM2Year > euiResult.siteEuiGrossKwhPerM2Year);

    // Primary energy: (60,000 * 2.5) + (105,000 * 1.1) = 150,000 + 115,500 = 265,500 kWh primary / 1000 m² = ~265.5 kWh/m²
    assert.ok(euiResult.primaryEuiKwhPerM2Year > 260 && euiResult.primaryEuiKwhPerM2Year < 275);
    assert.equal(euiResult.dataConfidenceRating, 'high');
  });

  it('performs Scope 1 and Scope 2 operational carbon emissions accounting', async () => {
    const { service } = setup();

    await service.createProfile({
      propertyId: 'prop-carbon-test',
      buildingCategory: 'residential_apartment',
      grossFloorAreaM2: 500
    });

    // 10,000 kWh electricity (Scope 2) @ 0.52 kgCO2/kWh = 5,200 kg CO2
    await service.recordConsumption({
      propertyId: 'prop-carbon-test',
      sourceId: 'grid_electricity',
      periodStartIso: '2025-01-01T00:00:00.000Z',
      periodEndIso: '2025-12-31T00:00:00.000Z',
      rawAmount: 10000,
      rawUnit: 'kwh'
    });

    // 2,000 m³ gas = 21,000 kWh (Scope 1) @ 0.19 kgCO2/kWh = 3,990 kg CO2
    await service.recordConsumption({
      propertyId: 'prop-carbon-test',
      sourceId: 'natural_gas',
      periodStartIso: '2025-01-01T00:00:00.000Z',
      periodEndIso: '2025-12-31T00:00:00.000Z',
      rawAmount: 2000,
      rawUnit: 'cubic_meters'
    });

    const carbon = await service.calculateEmissions('prop-carbon-test');

    assert.ok(carbon.scope2IndirectElectricityEmissionsKgCo2 > 5000);
    assert.ok(carbon.scope1DirectFuelEmissionsKgCo2 > 3900);
    assert.equal(
      carbon.totalOperationalEmissionsKgCo2,
      carbon.scope1DirectFuelEmissionsKgCo2 + carbon.scope2IndirectElectricityEmissionsKgCo2
    );
    assert.ok(carbon.emissionsIntensityKgCo2PerM2Year > 15);
  });

  it('models solar photovoltaic scenario generation and avoided emissions', async () => {
    const { service } = setup();

    // 10 kWp system, 1750 kWh/m² irradiance, 80% PR, 95% derate
    // Generation = 10 * 1750 * 0.8 * 0.95 = 13,300 kWh/year
    const solar = await service.modelSolarPv({
      propertyId: 'prop-solar-test',
      proposedCapacityKwPeak: 10,
      annualSolarIrradianceKwhPerM2: 1750,
      performanceRatio: 0.80,
      estimatedSelfConsumptionPercent: 70
    });

    assert.equal(solar.proposedCapacityKwPeak, 10);
    assert.equal(solar.estimatedAnnualGenerationKwh, 13300);
    assert.equal(solar.estimatedOnSiteSelfConsumptionKwh, Math.round(13300 * 0.7));
    assert.equal(solar.estimatedGridExportKwh, 13300 - Math.round(13300 * 0.7));
    assert.ok(solar.estimatedAnnualCo2AvoidedKg > 6000); // 13,300 * 0.52 = ~6,916 kg CO2
    assert.ok(solar.disclaimerFa.includes('منوط به زاویه نصب نهایی'));
  });

  it('models retrofit interventions using compound interactions without overestimation', async () => {
    const { service } = setup();

    await service.createProfile({
      propertyId: 'prop-retrofit-test',
      buildingCategory: 'residential_apartment',
      grossFloorAreaM2: 1000
    });

    // Baseline EUI: 200 kWh/m²
    // Intervention 1: Wall insulation (20% reduction)
    // Intervention 2: Double glazing (15% reduction)
    // Compound remaining factor: (1 - 0.20) * (1 - 0.15) = 0.80 * 0.85 = 0.68 (32% reduction, NOT 35%)
    const retrofit = await service.modelRetrofit({
      propertyId: 'prop-retrofit-test',
      interventions: [
        {
          interventionKey: 'exterior_wall_insulation',
          nameFa: 'عایق‌کاری دیوارهای پیرامونی',
          estimatedEnergyReductionPercent: 20,
          indicativeCostPerM2: 500_000,
          estimatedLifespanYears: 30
        },
        {
          interventionKey: 'double_triple_glazing_retrofit',
          nameFa: 'تعویض پنجره‌ها با دوجداره استاندارد',
          estimatedEnergyReductionPercent: 15,
          indicativeCostPerM2: 300_000,
          estimatedLifespanYears: 25
        }
      ],
      blendedEnergyCostPerKwh: 500 // 500 IRR per kWh
    });

    // 180 baseline fallback * (1 - 0.32) = 180 * 0.68 = 122.4 kWh/m²
    assert.ok(retrofit.projectedSiteEuiKwhM2 < 130);
    assert.ok(retrofit.projectedAnnualKwhSaved > 50000);
    assert.ok(retrofit.totalEstimatedCapex && retrofit.totalEstimatedCapex === 800_000_000);
    assert.ok(retrofit.estimatedPaybackPeriodYears && retrofit.estimatedPaybackPeriodYears > 0);
  });

  it('records water consumption and normalizes daily intensity metrics', async () => {
    const { service } = setup();

    await service.createProfile({
      propertyId: 'prop-water-test',
      buildingCategory: 'residential_apartment',
      grossFloorAreaM2: 200
    });

    // 30 m³ water over 30 days = 30,000 liters / 30 = 1000 L/day
    const water = await service.recordWater({
      propertyId: 'prop-water-test',
      waterConsumptionM3: 30,
      periodStartIso: '2026-03-01T00:00:00.000Z',
      periodEndIso: '2026-03-31T00:00:00.000Z'
    });

    assert.equal(water.waterConsumptionM3, 30);
    assert.equal(water.normalizedLitersPerDay, 1000);
    assert.equal(water.litersPerDayPerM2, 5); // 1000 L / 200 m² = 5 L/m²/day
  });

  it('benchmarks building sustainability performance against regional peer thresholds', async () => {
    const { service } = setup();

    await service.createProfile({
      propertyId: 'prop-bench-test',
      buildingCategory: 'residential_apartment',
      grossFloorAreaM2: 1000
    });

    await service.registerBenchmark({
      benchmarkId: 'bench-tehran-res',
      propertyCategory: 'residential_apartment',
      jurisdiction: 'IR',
      climateZone: 'semi_arid_temperate',
      medianSiteEuiKwhPerM2Year: 180,
      topQuartileEuiKwhPerM2Year: 120, // Efficient threshold
      medianEmissionsIntensityKgM2Year: 45,
      sampleSize: 1500,
      effectiveYear: 1404,
      sourceAgencyFa: 'سازمان بهینه‌سازی مصرف سوخت و آمار شهرداری'
    });

    // Record low consumption (efficient): 100 kWh/m²
    await service.recordConsumption({
      propertyId: 'prop-bench-test',
      sourceId: 'grid_electricity',
      periodStartIso: '2025-01-01T00:00:00.000Z',
      periodEndIso: '2025-12-31T00:00:00.000Z',
      rawAmount: 100000,
      rawUnit: 'kwh'
    });

    await service.calculateEui('prop-bench-test');
    await service.calculateEmissions('prop-bench-test');

    const benchEval = await service.compareBenchmark('prop-bench-test', 'IR', 'semi_arid_temperate');
    assert.equal(benchEval.performanceTier, 'top_quartile_efficient');
    assert.ok(benchEval.euiPercentageRelativeToMedian < 0);
    assert.ok(benchEval.explanationFa.includes('چارک برتر'));
  });
});
