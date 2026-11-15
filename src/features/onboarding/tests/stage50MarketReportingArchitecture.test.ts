import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAMPLE_COMPOSITION_WARNING_FA,
  calculateSupplyCompositionShares,
  evaluateMarketReportPeriodComparison,
  evaluateMultiNeighborhoodReportComparison,
  evaluatePersonalReportAccessAndExport,
  evaluateTrendSeriesAndAdjustment,
  issueReportErrataAndValidateAiNarrative,
} from '../services/marketReportingEngine';
import {
  STAGE50_BOUNDARIES_7,
  STAGE50_FORBIDDEN_ERRORS_20,
  STAGE50_MR_COMPONENT_IDS_50,
  STAGE50_STANDARD_REPORT_SECTIONS_16,
  STAGE50_UI_MR_TASKS_39,
  STAGE50_UX_EVENTS_17,
  STAGE51_GEOSPATIAL_AXES_20,
} from '../services/marketReportingTypes';
import {
  INITIAL_STAGE50_NARRATIVE,
  INITIAL_STAGE50_REPORTS,
} from '../services/stage50ReportingFixtures';

describe('Stage 50 (RT-UI-MARKET-REPORTING-001) Acceptance & Architecture Suite', () => {
  it('T50-00: enforces 7 boundaries, 16 standard report sections, 50 MR components, 39 UI-MR tasks, 17 UX events, 20 forbidden errors, and 20 Stage 51 preview axes', () => {
    assert.equal(STAGE50_BOUNDARIES_7.length, 7);
    assert.equal(STAGE50_STANDARD_REPORT_SECTIONS_16.length, 16);
    assert.equal(STAGE50_MR_COMPONENT_IDS_50.length, 50);
    assert.equal(STAGE50_UI_MR_TASKS_39.length, 39);
    assert.equal(STAGE50_UX_EVENTS_17.length, 17);
    assert.equal(STAGE50_FORBIDDEN_ERRORS_20.length, 20);
    assert.equal(STAGE51_GEOSPATIAL_AXES_20.length, 20);
  });

  it('T50-01, T50-02, T50-03 & §8.5 (Acceptance Tests 1, 2, 3): separates asking vs deal price, surfaces sample composition warning, and guards zero/invalid base period', () => {
    const rpt = INITIAL_STAGE50_REPORTS[0];
    const validCmp = evaluateMarketReportPeriodComparison({
      report: rpt,
      previousValue: 200,
      currentValue: 212,
      askingPriceChartSeparateFromDealPrice: true,
    });
    assert.equal(validCmp.askingAndDealChartsSeparated, true);
    assert.equal(validCmp.mergedAsGenericRealMarketPrice, false);
    assert.equal(validCmp.changeRateCalculable, true);
    assert.equal(validCmp.changeRatePercent, 6);
    assert.equal(validCmp.compositionShiftBannerFa, SAMPLE_COMPOSITION_WARNING_FA);

    const zeroBaseCmp = evaluateMarketReportPeriodComparison({
      report: rpt,
      previousValue: 0,
      currentValue: 212,
      askingPriceChartSeparateFromDealPrice: true,
    });
    assert.equal(zeroBaseCmp.changeRateCalculable, false);
    assert.equal(zeroBaseCmp.changeRatePercent, null);
    assert.ok(zeroBaseCmp.changeRateDisplayFa.includes('قابل محاسبه نیست'));
  });

  it('T50-03b & §13.3: preserves unclassified records in supply composition denominator and never claims real housing stock', () => {
    const supply = calculateSupplyCompositionShares({
      classifiedCounts: [
        { categoryFa: 'آپارتمان', count: 70 },
        { categoryFa: 'ویلایی', count: 20 },
      ],
      unclassifiedCount: 10,
    });
    assert.equal(supply.totalRecords, 100);
    assert.equal(supply.unclassifiedPreservedInDenominator, true);
    assert.equal(supply.claimedAsRealHousingStockOrDeals, false);
    const unclassifiedRow = supply.shares.find((s) => s.categoryFa.includes('نامشخص'));
    assert.ok(unclassifiedRow);
    assert.equal(unclassifiedRow.sharePercent, 10);
  });

  it('T50-04 & T50-05 (Acceptance Tests 4 & 5): checks period alignment across neighborhoods and never treats missing data as low value on map', () => {
    const cmp = evaluateMultiNeighborhoodReportComparison({
      neighborhoods: [
        {
          hoodNameFa: 'محله الف',
          periodFa: 'آبان ۱۴۰۵',
          propertyTypeFa: 'آپارتمان مسکونی',
          dataType: 'قیمت آگهی',
          medianPricePerSqmM: 210,
          observationCount: 150,
        },
        {
          hoodNameFa: 'محله ب (کم‌نمونه)',
          periodFa: 'پاییز ۱۴۰۵',
          propertyTypeFa: 'آپارتمان مسکونی',
          dataType: 'قیمت آگهی',
          medianPricePerSqmM: 195,
          observationCount: 8,
        },
        {
          hoodNameFa: 'محله ج (فاقد داده)',
          periodFa: 'آبان ۱۴۰۵',
          propertyTypeFa: 'آپارتمان مسکونی',
          dataType: 'قیمت آگهی',
          medianPricePerSqmM: null,
          observationCount: 0,
        },
      ],
      minSufficientSample: 30,
    });
    assert.equal(cmp.periodsAligned, false);
    assert.equal(cmp.rows[0].mapZoneState, 'پوشش کافی');
    assert.equal(cmp.rows[1].mapZoneState, 'پوشش کم داده');
    assert.equal(cmp.rows[2].mapZoneState, 'فاقد داده (غیرقابل تفسیر به‌عنوان ارزان)');
    assert.equal(cmp.rows[2].treatedAsLowValueZoneOnMap, false);
  });

  it('T50-06, T50-10 & T50-11 (Acceptance Tests 6, 10, 11): marks method changes without artificial continuity and separates nominal vs adjusted trends', () => {
    const trend = evaluateTrendSeriesAndAdjustment({
      nominalSeries: [
        { periodFa: 'مهر ۱۴۰۵', valueM: 200, methodVersion: 'v2.3' },
        { periodFa: 'آبان ۱۴۰۵', valueM: 220, methodVersion: 'v2.4' },
      ],
      referenceIndexAvailable: true,
      referenceIndexNameFa: 'شاخص مرجع قیمت مصرف‌کننده',
      basePeriodFa: 'مهر ۱۴۰۵',
      referenceDeflators: [1.0, 1.1],
    });
    assert.equal(trend.hasMethodChangeMarker, true);
    assert.equal(trend.artificialHistoricalContinuityCreated, false);
    assert.equal(trend.usesHiddenArbitraryAdjustment, false);
    assert.ok(trend.adjustedSeries);
    assert.equal(trend.adjustedSeries[1].adjustedValueM, 200);

    const nominalOnly = evaluateTrendSeriesAndAdjustment({
      nominalSeries: [{ periodFa: 'آبان ۱۴۰۵', valueM: 220, methodVersion: 'v2.4' }],
      referenceIndexAvailable: false,
    });
    assert.equal(nominalOnly.adjustedSeries, null);
  });

  it('T50-07, T50-09 & T50-12 (Acceptance Tests 7, 9, 12): preserves previous version on errata, enforces 6-axis quality profile, and blocks unverified AI causal claims', () => {
    const rpt = INITIAL_STAGE50_REPORTS[0];
    assert.equal(rpt.qualityAxes.usesSingleOpaqueScore, false);
    assert.equal(INITIAL_STAGE50_NARRATIVE.claimsDefinitiveCausationFromCooccurrence, false);
    assert.equal(INITIAL_STAGE50_NARRATIVE.statements.length, 5);

    const blockedAi = issueReportErrataAndValidateAiNarrative({
      report: rpt,
      errataInput: {
        affectedSectionFa: 'بخش خلاصه',
        previousValueFa: '۲۱۴',
        correctedValueFa: '۲۱۲.۵',
        reasonFa: 'حذف آگهی تکراری',
        impactOnConclusionFa: 'کاهش جزئی نرخ رشد',
        correctedAtFa: '۱۴۰۵/۰۸/۱۶',
      },
      aiDraftClaimsDefinitiveCausation: true,
      aiDraftMatchesComputedTable: true,
      humanReviewed: true,
    });
    assert.equal(blockedAi.errata.previousVersionPreserved, true);
    assert.equal(blockedAi.aiDraftApprovedForPublication, false);
  });

  it('T50-08, T50-13, T50-14 & T50-15 (Acceptance Tests 8, 13, 14, 15): isolates personal reports, blocks unauthorized internal report access, and preserves metadata on export', () => {
    const internalReport = INITIAL_STAGE50_REPORTS[2];
    const denied = evaluatePersonalReportAccessAndExport({
      report: internalReport,
      userRole: 'logged_in_user',
      monitoredHoodsFa: ['سعادت‌آباد'],
      candidateEventHoodFa: 'تهرانپارس',
      narrative: INITIAL_STAGE50_NARRATIVE,
    });
    assert.equal(denied.accessGranted, false);
    assert.equal(denied.includedInPersonalReport, false);
    assert.equal(denied.personalReportPresentedAsCitywideMarket, false);
    assert.equal(denied.exportMetadataBundle.rawPrivatePiiExportedByDefault, false);
    assert.equal(denied.exportMetadataBundle.methodVersion, 'v1.9');
  });
});
