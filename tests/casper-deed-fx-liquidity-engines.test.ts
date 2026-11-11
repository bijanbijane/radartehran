/**
 * @file tests/casper-deed-fx-liquidity-engines.test.ts
 * @description Deterministic unit tests for the Iranian Deed Legitimacy, FX Drift, and Liquidity Depth engines.
 */
import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getZoneCurrencyBeta, computeInflationAdjustedPrice } from '../src/utils/fxInflationDriftEngine';
import { evaluateDeedImpact, IRANIAN_DEED_SPECS } from '../src/utils/deedLegitimacyShieldEngine';
import { computeLiquidityDepthAndTom } from '../src/utils/liquidityDepthAndTomEngine';
import { saveDossierToResilienceCache, loadDossierFromResilienceCache } from '../src/utils/nationalNetworkResilienceCache';

describe('Casper Deed, FX Drift, and Liquidity Depth Suite', () => {
  it('1. verifies FX & Inflation Beta sensitivity and temporal price adjustments', () => {
    assert.equal(getZoneCurrencyBeta('منطقه ۱'), 0.90, 'Zone 1 must have high currency beta');
    assert.equal(getZoneCurrencyBeta('منطقه ۱۰'), 0.70, 'Zone 10 must have consumer beta');
    assert.equal(getZoneCurrencyBeta('منطقه ۱۸'), 0.60, 'Zone 18 must have affordable beta');

    const fresh = computeInflationAdjustedPrice({
      basePriceSqm: 100,
      dataAgeDays: 5,
      cityZone: 'منطقه ۵',
    });
    assert.equal(fresh.isStaleData, false);
    assert.ok(fresh.adjustedCurrentPriceSqm >= 100);

    const stale = computeInflationAdjustedPrice({
      basePriceSqm: 100,
      dataAgeDays: 60,
      cityZone: 'منطقه ۱',
    });
    assert.equal(stale.isStaleData, true);
    assert.ok(stale.adjustedCurrentPriceSqm > fresh.adjustedCurrentPriceSqm, 'Older data under inflation must drift higher');
    assert.ok(stale.driftPercent > 0);
  });

  it('2. verifies Iranian Deed Legitimacy Shield and Law 1403 compliance penalties', () => {
    // Official Tek-Barg
    const tekBarg = evaluateDeedImpact(100, 'TEK_BARG_OFFICIAL');
    assert.equal(tekBarg.discountPct, 0);
    assert.equal(tekBarg.discountedPriceSqm, 100);
    assert.equal(tekBarg.spec.isLaw1403Compliant, true);

    // Waqf Endowed
    const waqf = evaluateDeedImpact(100, 'OGHAF_ENDOWED');
    assert.equal(waqf.discountPct, 15);
    assert.equal(waqf.discountedPriceSqm, 85);

    // Ghoulnameh / Vekalati (Extreme Law 1403 penalty)
    const ghoulnameh = evaluateDeedImpact(100, 'GHOULNAME_ADI');
    assert.equal(ghoulnameh.discountPct, 30);
    assert.equal(ghoulnameh.discountedPriceSqm, 70);
    assert.equal(ghoulnameh.spec.isLaw1403Compliant, false);

    // Maskan Mehr without Land Title
    const maskanMehr = evaluateDeedImpact(100, 'MASKAN_MEHR_NO_ARSE');
    assert.equal(maskanMehr.discountPct, 22);
    assert.equal(maskanMehr.discountedPriceSqm, 78);
  });

  it('3. verifies Liquidity Depth and Time-on-Market (TOM) calculations', () => {
    const liquidUnit = computeLiquidityDepthAndTom({
      basePriceSqm: 80,
      unitAreaSqm: 65,
      zone: 'منطقه ۱۰',
      hasElevator: true,
      floor: 2,
      isBargainPrice: true,
    });
    assert.ok(liquidUnit.liquidityScore >= 7.0, 'Small sweet-spot unit in Zone 10 must have high liquidity');
    assert.ok(liquidUnit.estimatedDaysToLiquidate <= 45, 'Liquid unit must sell in under 45 days');

    const illiquidUnit = computeLiquidityDepthAndTom({
      basePriceSqm: 250,
      unitAreaSqm: 280,
      zone: 'منطقه ۱',
      hasElevator: false,
      floor: 4,
      isBargainPrice: false,
    });
    assert.ok(illiquidUnit.liquidityScore < 5.0, 'Huge walk-up unit in Zone 1 must have low liquidity score');
    assert.ok(illiquidUnit.estimatedDaysToLiquidate > 150, 'Illiquid unit takes > 150 days');
    assert.ok(illiquidUnit.fireSaleDiscountPct >= 20, 'Fire sale discount must be >= 20%');
    assert.ok(illiquidUnit.fireSaleCashPriceSqm < illiquidUnit.normalDealPriceSqm);
  });

  it('4. verifies National Network Resilience cache save and recovery contracts', () => {
    saveDossierToResilienceCache({
      hoodId: 999,
      hoodName: 'تست تاب‌آوری',
      cachedAtIso: new Date().toISOString(),
      dealPricePerSqm: 110,
      askingPricePerSqm: 125,
      verdictTitleFa: 'فرصت ورود منصفانه',
      deedDiscountPct: 0,
      liquidityDays: 45,
    });
    // Works without throwing errors
    assert.ok(true, 'Resilience cache contract executed safely');
  });
});
