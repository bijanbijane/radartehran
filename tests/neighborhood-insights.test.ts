/**
 * @file tests/neighborhood-insights.test.ts
 * @description Unit tests for core data normalization and market evaluation functions
 * in src/data/neighborhoodInsights.ts using Vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  COMPLETE_INSIGHTS_BY_ID,
  checkDirectMetroCommute,
  evaluateRentVsBuyInNeighborhood,
  evaluateTradeUpOptions,
  getNeighborhoodDeepInsight,
  getTrafficZoneStatus,
} from '../src/data/neighborhoodInsights';
import {
  EvaluatedNeighborhood,
  INITIAL_NEIGHBORHOODS,
  Neighborhood,
  getNeighborhoodMarketReport,
  getNeighborhoodTrafficInfo,
} from '../src/data/neighborhoods';

describe('neighborhoodInsights - getNeighborhoodDeepInsight', () => {
  it('loads explicit deep insight metadata for known neighborhoods', () => {
    const zafaraniyeh = INITIAL_NEIGHBORHOODS.find((h) => h.id === 1)!;
    expect(zafaraniyeh).toBeDefined();

    const insight = getNeighborhoodDeepInsight(zafaraniyeh);

    expect(insight.hoodId).toBe(1);
    expect(insight.winterSnowRisk).toBe('HIGH');
    expect(insight.futureGrowthScore).toBe(8.4);
    expect(insight.monthlyChargeEstimateThousand).toBe(6500);
    expect(insight.costOfLivingLevel).toBe('بالا و لوکس');
    expect(insight.microHoods.length).toBe(3);

    const luxuryTier = insight.microHoods.find((m) => m.tier === 'luxury');
    const economicTier = insight.microHoods.find((m) => m.tier === 'economic');
    expect(luxuryTier?.priceMultiplier).toBe(1.18);
    expect(economicTier?.priceMultiplier).toBe(0.86);
  });

  it('normalizes fallback insights cleanly for synthetic or extension neighborhoods', () => {
    const syntheticHood: Neighborhood = {
      id: 999,
      name: 'محله آزمایشی پیرامونی',
      zone: 'غرب تهران',
      lat: 35.72,
      lng: 51.25,
      radius: 900,
      buyPerSqm: 85,
      rahn80m: 950,
      air: 8.8,
      powerWater: 7.5,
      internet: 7.0,
      metro: 4.5,
      security: 7.8,
      flatTerrain: 9.0,
      pros: 'مسطح و دنج',
      cons: 'دسترسی ضعیف به مترو',
      sponsor: { name: 'املاک نمونه', phone: '021-12345678', specialty: 'فروش', experienceYears: 10 },
      bargains: [],
    };

    const insight = getNeighborhoodDeepInsight(syntheticHood);

    expect(insight.hoodId).toBe(999);
    expect(insight.costOfLivingLevel).toBe('اقتصادی و به‌صرفه');
    expect(insight.monthlyChargeEstimateThousand).toBe(950);
    expect(insight.nightParkingScore).toBe(6.5);
    expect(insight.winterSnowRisk).toBe('LOW');
    expect(insight.microHoods.length).toBe(3);
    expect(insight.vibeTags[0]).toContain('خوش‌آب‌وهوا');
  });
});

describe('neighborhoodInsights - checkDirectMetroCommute', () => {
  it('returns empty commute badge when workHubId is none or missing', () => {
    const hood = INITIAL_NEIGHBORHOODS[0];
    const res = checkDirectMetroCommute(hood, 'none');
    expect(res.hasDirectLine).toBe(false);
    expect(res.sharedLineNumber).toBeNull();
    expect(res.badgeText).toBe('');
  });

  it('detects direct metro line when neighborhood and hub share line and metro >= 7.0', () => {
    const tehranpars = INITIAL_NEIGHBORHOODS.find((h) => h.id === 14)!;
    expect(tehranpars).toBeDefined();

    // Tehranpars (line 2) commuting to Azadi (lines 2, 4, 5)
    const commute = checkDirectMetroCommute(tehranpars, 'azadi');
    expect(commute.hasDirectLine).toBe(true);
    expect(commute.sharedLineNumber).toBe(2);
    expect(commute.badgeText).toContain('مترو مستقیم خط ۲');
  });

  it('reports transfer required when lines differ or metro score is low', () => {
    const lowMetroHood: Neighborhood = {
      ...INITIAL_NEIGHBORHOODS[0],
      metro: 5.0,
    };
    const commute = checkDirectMetroCommute(lowMetroHood, 'bazaar');
    expect(commute.hasDirectLine).toBe(false);
    expect(commute.badgeText).toContain('تعویض خط');
  });
});

describe('neighborhoodInsights - evaluateRentVsBuyInNeighborhood', () => {
  it('recommends BUY_NOW when P/R ratio is low or neighborhood is undervalued', () => {
    const baseHood = INITIAL_NEIGHBORHOODS[4]; // Punak
    const undervaluedHood: EvaluatedNeighborhood = {
      ...baseHood,
      buyPerSqm: 120,
      rahn80m: 2200,
      marketReport: {
        ...getNeighborhoodMarketReport(baseHood),
        status: 'undervalued',
      },
      status: 'green',
      distKm: null,
      diffPercent: 0,
      overallScore: 8.5,
      trafficInfo: getNeighborhoodTrafficInfo(baseHood),
    };

    const verdict = evaluateRentVsBuyInNeighborhood(undervaluedHood);

    expect(verdict.recommendation).toBe('BUY_NOW');
    expect(verdict.capitalRequired80mMillion).toBe(120 * 80);
    expect(verdict.rahn80mMillion).toBe(2200);
    expect(verdict.prRatio).toBeCloseTo((120 * 80) / 2200, 1);
    expect(verdict.annualRentYieldPercent).toBeGreaterThan(0);
    expect(verdict.buy3YrWealthBillion).toBeGreaterThan(0);
    expect(verdict.title).toContain('خرید ملک');
  });

  it('recommends RENT_AND_INVEST when P/R ratio is high or neighborhood is in bubble', () => {
    const baseHood = INITIAL_NEIGHBORHOODS[0];
    const bubbleHood: EvaluatedNeighborhood = {
      ...baseHood,
      buyPerSqm: 300,
      rahn80m: 3000,
      marketReport: {
        ...getNeighborhoodMarketReport(baseHood),
        status: 'bubble',
      },
      status: 'yellow',
      distKm: null,
      diffPercent: 0,
      overallScore: 7.9,
      trafficInfo: getNeighborhoodTrafficInfo(baseHood),
    };

    const verdict = evaluateRentVsBuyInNeighborhood(bubbleHood);

    expect(verdict.recommendation).toBe('RENT_AND_INVEST');
    expect(verdict.prRatio).toBe(8.0);
    expect(verdict.freedCapitalForGoldMillion).toBe(300 * 80 - 3000);
    expect(verdict.rentInvest3YrWealthBillion).toBeGreaterThan(verdict.rahn80mMillion / 1000);
    expect(verdict.title).toContain('اجاره‌نشینی');
  });

  it('recommends BALANCED when P/R ratio is between 6.2 and 6.8 in fair market', () => {
    const baseHood = INITIAL_NEIGHBORHOODS[1];
    const balancedHood: EvaluatedNeighborhood = {
      ...baseHood,
      buyPerSqm: 130,
      rahn80m: 1600, // 130*80 = 10400 / 1600 = 6.5
      marketReport: {
        ...getNeighborhoodMarketReport(baseHood),
        status: 'balanced',
      },
      status: 'green',
      distKm: null,
      diffPercent: 0,
      overallScore: 8.0,
      trafficInfo: getNeighborhoodTrafficInfo(baseHood),
    };

    const verdict = evaluateRentVsBuyInNeighborhood(balancedHood);

    expect(verdict.recommendation).toBe('BALANCED');
    expect(verdict.prRatio).toBe(6.5);
    expect(verdict.title).toContain('تعادل');
  });
});

describe('neighborhoodInsights - evaluateTradeUpOptions', () => {
  it('computes net proceeds with 1% selling friction and loan booster addition', () => {
    const punak = INITIAL_NEIGHBORHOODS[4];
    const tehranpars = INITIAL_NEIGHBORHOODS[13];
    const currentHood: EvaluatedNeighborhood = {
      ...punak,
      buyPerSqm: 140,
      rahn80m: 1800,
      status: 'green',
      distKm: null,
      diffPercent: 0,
      overallScore: 8.4,
      trafficInfo: getNeighborhoodTrafficInfo(punak),
      marketReport: getNeighborhoodMarketReport(punak),
    };

    const evaluatedHoods: EvaluatedNeighborhood[] = [
      currentHood,
      {
        ...tehranpars,
        buyPerSqm: 110,
        rahn80m: 1400,
        status: 'green',
        distKm: null,
        diffPercent: 0,
        overallScore: 7.8,
        trafficInfo: getNeighborhoodTrafficInfo(tehranpars),
        marketReport: getNeighborhoodMarketReport(tehranpars),
      },
    ];

    const result = evaluateTradeUpOptions({
      currentHood,
      currentSqm: 80,
      currentAgeYears: 5,
      extraCashMillion: 500,
      useLoanBooster: true, // +1200M
      useTenantRahnDeduction: false,
      targetNewSqm: 100,
      targetAgeSegment: 'mid', // 0.88 multiplier
      allNeighborhoods: evaluatedHoods,
    });

    // currentAgeFactor = 1 - 5 * 0.012 = 0.94
    // Home value = 140 * 80 * 0.94 = 10528
    // Net proceeds = round(10528 * 0.99) = 10423
    // Total capital = 10423 + 500 + 1200 = 12123
    expect(result.currentHomeSaleValueMillion).toBe(10528);
    expect(result.netProceedsFromSaleMillion).toBe(10423);
    expect(result.totalBaseCapitalMillion).toBe(12123);
    expect(Array.isArray(result.matchingHoods)).toBe(true);
  });
});

describe('neighborhoodInsights - getTrafficZoneStatus', () => {
  it('correctly classifies main traffic, air control, and free zones', () => {
    // Main traffic scheme
    expect(getTrafficZoneStatus(18).zoneType).toBe('main_traffic');
    expect(getTrafficZoneStatus(19).zoneType).toBe('main_traffic');
    expect(getTrafficZoneStatus(20).zoneType).toBe('main_traffic');
    expect(getTrafficZoneStatus(86).zoneType).toBe('main_traffic');
    expect(getTrafficZoneStatus(87).zoneType).toBe('main_traffic');
    expect(getTrafficZoneStatus(18).label).toContain('طرح ترافیک اصلی');

    // Air control (even/odd) scheme
    expect(getTrafficZoneStatus(8).zoneType).toBe('air_control');
    expect(getTrafficZoneStatus(28).zoneType).toBe('air_control');
    expect(getTrafficZoneStatus(41).zoneType).toBe('air_control');
    expect(getTrafficZoneStatus(88).zoneType).toBe('air_control');
    expect(getTrafficZoneStatus(94).zoneType).toBe('air_control');
    expect(getTrafficZoneStatus(98).zoneType).toBe('air_control');
    expect(getTrafficZoneStatus(8).label).toContain('کنترل آلودگی');

    // Free zones
    expect(getTrafficZoneStatus(1).zoneType).toBe('free');
    expect(getTrafficZoneStatus(5).zoneType).toBe('free');
    expect(getTrafficZoneStatus(14).zoneType).toBe('free');
    expect(getTrafficZoneStatus(30).zoneType).toBe('free');
    expect(getTrafficZoneStatus(1).label).toContain('خارج از طرح ترافیک');
  });

  it('guarantees 100% neighborhood-to-insight alignment, valid Persian digits, and unique city names', async () => {
    const { MULTI_CITY_CONFIGS } = await import('../src/data/multiCityData');
    for (const hood of INITIAL_NEIGHBORHOODS) {
      const insight = getNeighborhoodDeepInsight(hood);
      expect(insight.hoodId).toBe(hood.id);
      expect(insight.microHoods.length).toBe(3);
      expect(/[\u0980-\u09FF\uFFFD]/.test(JSON.stringify(hood) + JSON.stringify(insight))).toBe(false);
    }
    const expectedLabels: Array<[number, number, string]> = [
      [6, 0, 'جنت‌آباد'], [7, 1, 'صادقیه'], [11, 1, 'پاسداران'], [12, 1, 'هروی'],
      [13, 1, 'نارمک'], [15, 1, 'پیروزی'], [16, 0, 'نیروهوایی'], [17, 1, 'هفت‌حوض'],
      [18, 1, 'انقلاب'], [19, 1, 'نواب'], [20, 1, 'جمهوری'], [21, 1, 'یافت‌آباد'],
      [22, 1, 'نازی‌آباد'], [23, 1, 'شهرری'], [24, 1, 'افسریه'], [25, 0, 'دریاچه'],
      [26, 1, 'گیشا'], [27, 1, 'مرزداران'], [28, 1, 'ستارخان'], [29, 1, 'میرداماد'],
      [30, 0, 'قیطریه'], [31, 0, 'فرمانیه'], [32, 1, 'ولنجک'], [34, 1, 'مجیدیه'],
      [35, 1, 'دهکده المپیک'],
    ];
    for (const [id, tierIdx, label] of expectedLabels) {
      expect(COMPLETE_INSIGHTS_BY_ID[id].microHoods[tierIdx].label).toContain(label);
    }
    for (const cfg of Object.values(MULTI_CITY_CONFIGS)) {
      const names = new Set<string>();
      for (const h of cfg.neighborhoods) {
        expect(names.has(h.name)).toBe(false);
        names.add(h.name);
        expect(/[\u0980-\u09FF\uFFFD]/.test(JSON.stringify(h))).toBe(false);
      }
    }
  });
});

