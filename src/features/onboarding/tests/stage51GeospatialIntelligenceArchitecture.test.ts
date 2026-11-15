import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDensityClustersAndAutocorrelation,
  evaluateIntraNeighborhoodLandUseAndServiceGap,
  evaluateMultiCriteriaTemporalAndUrbanSignals,
  evaluateSpatialAccessAndCoverage,
  manageSpatialArtifactVersioningAndPrivacy,
} from '../services/geospatialIntelligenceEngine';
import {
  STAGE51_BOUNDARIES_8,
  STAGE51_FORBIDDEN_ERRORS_20,
  STAGE51_GI_COMPONENT_IDS_50,
  STAGE51_UI_GI_TASKS_40,
  STAGE51_UX_EVENTS_19,
  STAGE52_URBAN_ATLAS_AXES_24,
} from '../services/geospatialIntelligenceTypes';
import {
  INITIAL_STAGE51_DESTINATIONS,
  INITIAL_STAGE51_GRID_CELLS,
  INITIAL_STAGE51_SAVED_ARTIFACTS,
} from '../services/stage51GeospatialFixtures';

describe('Stage 51 (RT-UI-GEOSPATIAL-INTELLIGENCE-001) Acceptance & Architecture Suite', () => {
  it('T51-00: enforces 8 boundaries, 50 GI components, 40 UI-GI tasks, 19 UX events, 20 forbidden errors, and 24 Stage 52 preview axes', () => {
    assert.equal(STAGE51_BOUNDARIES_8.length, 8);
    assert.equal(STAGE51_GI_COMPONENT_IDS_50.length, 50);
    assert.equal(STAGE51_UI_GI_TASKS_40.length, 40);
    assert.equal(STAGE51_UX_EVENTS_19.length, 19);
    assert.equal(STAGE51_FORBIDDEN_ERRORS_20.length, 20);
    assert.equal(STAGE52_URBAN_ATLAS_AXES_24.length, 24);
  });

  it('T51-01..04 & T51-16 (Acceptance Tests 1, 2, 3, 4, 16): separates straight-line distance from network route, reports geometric coverage when population data is absent, and warns on approximate coordinates', () => {
    const res = evaluateSpatialAccessAndCoverage({
      destinations: INITIAL_STAGE51_DESTINATIONS,
      thresholdMinutes: 15,
      populationDataAvailable: false,
      areaCoveredSqKm: 2.4,
      populationCoveredCount: 30000,
    });
    assert.equal(res.straightLineConflatedWithTravelTime, false);
    assert.equal(res.coverageScopeKindFa, 'صرفاً پوشش هندسی (مساحتی)');
    assert.equal(res.populationCoveredCount, null);

    const straightOnly = res.evaluatedDestinations.find((d) => d.destinationId === 'DST-51-03');
    assert.ok(straightOnly);
    assert.equal(straightOnly.claimedAsClosestRealRouteWhenOnlyStraightLine, false);
    assert.ok(straightOnly.positionalWarningFa);
  });

  it('T51-05..09 & T51-17 (Acceptance Tests 5, 6, 7, 8, 9, 17): separates visual vs statistical clusters, warns on insufficient sample, and reports autocorrelation without claiming causation', () => {
    const lowSample = evaluateDensityClustersAndAutocorrelation({
      pointCount: 12,
      minSampleForStatisticalCluster: 30,
      bandwidthMeters: 400,
      cellSizeMeters: 250,
      areaSqKm: 2.0,
      clusterMode: 'خوشه‌بندی آماری (الگوریتم و معیار آماری مشخص)',
      neighborhoodRule: 'مرز مشترک (Contiguity)',
      moranIValue: 0.35,
      pValue: 0.02,
    });
    assert.equal(lowSample.visualClusterPresentedAsStatisticalCluster, false);
    assert.ok(lowSample.insufficientSampleNoticeFa);
    assert.equal(lowSample.autocorrelation.statisticallySignificant, false);
    assert.equal(lowSample.autocorrelation.claimsDirectCausationFromSpatialCorrelation, false);
  });

  it('T51-10..12 (Acceptance Tests 10, 11, 12): masks low-sample grid cells for privacy, separates missing data from zero, separates listing land-use from official zoning, and separates service density from adequacy', () => {
    const grid = evaluateIntraNeighborhoodLandUseAndServiceGap({
      cells: INITIAL_STAGE51_GRID_CELLS,
      minCellPrivacyCount: 5,
      serviceCentersCount: 7,
      hasCapacityAndPopulationDemandData: false,
    });
    assert.equal(grid.missingDataTreatedAsZero, false);
    assert.equal(grid.evaluatedCells[1].privacyMasked, true);
    assert.ok(grid.evaluatedCells[1].displayedMedianPriceFa.includes('حریم خصوصی'));
    assert.ok(grid.evaluatedCells[2].displayedMedianPriceFa.includes('فاقد داده'));
    assert.equal(grid.evaluatedCells[0].listingLandUseConflatedWithOfficialZoning, false);
    assert.equal(grid.serviceEvaluation.reportedConcept, 'تراکم خدمت');
    assert.equal(grid.serviceEvaluation.claimsServiceAdequacyWithoutDemandData, false);
  });

  it('T51-13..15 & T51-18 (Acceptance Tests 13, 14, 15, 18): disqualifies mandatory filter violations in MCDA, tracks weight sensitivity delta, warns on source expansion across periods, and blocks forbidden promotional urban phrases', () => {
    const mcda = evaluateMultiCriteriaTemporalAndUrbanSignals({
      candidates: [
        {
          zoneId: 'Z1',
          nameFa: 'محدوده مجاز',
          passesMandatoryFilter: true,
          scoresByCriterion: { transit: 80, medical: 70 },
        },
        {
          zoneId: 'Z2',
          nameFa: 'محدوده فاقد شرط الزامی',
          passesMandatoryFilter: false,
          scoresByCriterion: { transit: 100, medical: 100 },
        },
      ],
      weights: { transit: 60, medical: 40 },
      previousWeights: { transit: 20, medical: 80 },
      period1SourceCount: 2,
      period2SourceCount: 5,
      lockColorScaleAcrossFrames: true,
      urbanSignalKind: 'نشانه تحول',
      proposedBannerTitleFa: 'منطقه قطعی رشد قیمت در سال آینده',
    });
    assert.equal(mcda.mandatoryViolationDisqualifiedFromTopRank, true);
    assert.equal(mcda.rankedZones[1].eligibleForTopRecommendation, false);
    assert.equal(mcda.rankedZones[1].currentScore, 0);
    assert.notEqual(mcda.rankedZones[0].scoreDeltaFromWeightChange, 0);
    assert.equal(mcda.temporalCheck.sourceExpansionDetected, true);
    assert.equal(mcda.temporalCheck.colorScaleLockedAcrossFrames, true);
    assert.equal(mcda.urbanTransformation.hasForbiddenPromotionalPhrase, true);
    assert.equal(
      mcda.urbanTransformation.sanitizedTitleFa,
      'محدوده دارای نشانه‌های تغییر کالبدی و نیازمند بررسی بیشتر',
    );
  });

  it('T51-19..24 (Acceptance Tests 19, 20, 21, 22, 23, 24): preserves previous analysis version on parameter change, isolates stored analysis from map layer toggle, strips private coordinates on external share, and separates positional accuracy from analytical confidence', () => {
    const res = manageSpatialArtifactVersioningAndPrivacy({
      artifact: INITIAL_STAGE51_SAVED_ARTIFACTS[0],
      parameterUpdatedSummaryFa: 'شعاع جدید: ۶۰۰ متر',
      newMethodVersion: 'v1.5',
      toggledMapLayerVisibilityOnly: true,
      shareWithExternalUser: true,
    });
    assert.equal(res.previousArtifactPreserved, true);
    assert.equal(res.storedAnalysisMutatedByLayerToggle, false);
    assert.equal(res.updatedArtifact.methodVersion, 'v1.5');
    assert.equal(res.separatePositionalAndAnalyticalConfidence.mergedIntoSingleOpaqueScore, false);
    assert.equal(res.sharedExportPayload.exactPrivateCoordinatesStripped, true);
    assert.equal(res.sharedExportPayload.fakePercentageProgressBarUsed, false);
  });
});
