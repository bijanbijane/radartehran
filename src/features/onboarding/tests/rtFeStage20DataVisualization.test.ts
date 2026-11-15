import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RT_FE_DATA_VISUALIZATION_020_SPEC_ID,
  RT_FE_STAGE21_BRIDGE_SPEC_ID,
  RT_VIS_LAYERS_11,
  RT_VIS_CHART_REGISTRY_18,
  RT_VIS_METRIC_CATEGORIES_10,
  RT_VIS_DASHBOARD_TYPES_8,
  RT_VIS_CHOROPLETH_METHODS_5,
  RT_VIS_DELIVERABLES_33,
  validateChartSelectionAndSchema,
  evaluateTimeSeriesAndGapPolicy,
  evaluateCrossFilterGraph,
  evaluateSpatialChoroplethSpec,
  buildAccessibleChartSummary,
  sanitizeVisualizationExportAndTelemetry,
} from '../services/rtFeDataVisualization020Engine';

test('Stage 20 (RT-FE-DATA-VISUALIZATION-020): verifies 11 layers, 18 chart types, 10 metric domains, 8 dashboard types, 5 choropleth methods, 33 deliverables, and Stage 21 bridge', () => {
  assert.equal(RT_FE_DATA_VISUALIZATION_020_SPEC_ID, 'RT-FE-DATA-VISUALIZATION-020');
  assert.equal(RT_FE_STAGE21_BRIDGE_SPEC_ID, 'RT-FE-ENTITY-DETAIL-021');
  assert.equal(RT_VIS_LAYERS_11.length, 11);
  assert.equal(RT_VIS_CHART_REGISTRY_18.length, 18);
  assert.equal(RT_VIS_METRIC_CATEGORIES_10.length, 10);
  assert.equal(RT_VIS_DASHBOARD_TYPES_8.length, 8);
  assert.equal(RT_VIS_CHOROPLETH_METHODS_5.length, 5);
  assert.equal(RT_VIS_DELIVERABLES_33.length, 33);
  assert.equal(RT_VIS_DELIVERABLES_33[0]?.id, 'RT-FE-VIS-OUT-001');
  assert.equal(RT_VIS_DELIVERABLES_33[32]?.id, 'RT-FE-VIS-OUT-033');
});

test('Stage 20: prevents unsuitable charts, truncated bar axes, unlabelled dual axes, fake daily interpolation, and zero-base % division', () => {
  const pieTooMany = validateChartSelectionAndSchema({
    chartType: 'pie',
    categoryCount: 12,
    isTemporalOrdered: false,
    hasUnitLabel: true,
  });
  assert.equal(pieTooMany.valid, false);

  const lineUnordered = validateChartSelectionAndSchema({
    chartType: 'line',
    categoryCount: 5,
    isTemporalOrdered: false,
    hasUnitLabel: true,
  });
  assert.equal(lineUnordered.valid, false);

  const dualNoDisclaimer = validateChartSelectionAndSchema({
    chartType: 'line',
    categoryCount: 6,
    isTemporalOrdered: true,
    hasUnitLabel: true,
    isDualAxis: true,
    hasDualAxisLabelsAndDisclaimer: false,
  });
  assert.equal(dualNoDisclaimer.valid, false);

  const fakeDaily = evaluateTimeSeriesAndGapPolicy({
    sourceGranularity: 'monthly',
    requestedGranularity: 'daily',
    gapPolicy: 'break_line',
    points: [{ period: '1405-07', value: 120 }],
  });
  assert.equal(fakeDaily.valid, false);

  const zeroBaseGap = evaluateTimeSeriesAndGapPolicy({
    sourceGranularity: 'monthly',
    requestedGranularity: 'monthly',
    gapPolicy: 'break_line',
    points: [
      { period: '1405-06', value: 0 },
      { period: '1405-07', value: null },
      { period: '1405-08', value: 140, isEstimated: true },
    ],
  });
  assert.equal(zeroBaseGap.valid, true);
  assert.equal(zeroBaseGap.missingCount, 1);
  assert.equal(zeroBaseGap.estimatedCount, 1);
  assert.equal(zeroBaseGap.percentChange, null);
});

test('Stage 20: detects cross-filter cycles, enforces Choropleth missing style, builds AA summary, and blocks small-cell exports + telemetry PII', () => {
  const cycle = evaluateCrossFilterGraph([
    { fromWidgetId: 'chart-price', toWidgetId: 'table-props' },
    { fromWidgetId: 'table-props', toWidgetId: 'map-districts' },
    { fromWidgetId: 'map-districts', toWidgetId: 'chart-price' },
  ]);
  assert.equal(cycle.acyclic, false);

  const spatialBad = evaluateSpatialChoroplethSpec({
    method: 'Quantile',
    separatesMissingValueStyle: false,
    usesExistingLeafletAdapter: true,
  });
  assert.equal(spatialBad.valid, false);

  const summary = buildAccessibleChartSummary({
    metricTitleFa: 'میانه قیمت هر متر',
    unitFa: 'میلیون تومان',
    points: [
      { period: 'بهار ۱۴۰۵', value: 110 },
      { period: 'تابستان ۱۴۰۵', value: null },
      { period: 'آبان ۱۴۰۵', value: 124 },
    ],
  });
  assert.match(summary, /افزایش/);
  assert.match(summary, /1 دوره فاقد مقدار/);

  const smallCellBlocked = sanitizeVisualizationExportAndTelemetry({
    sampleSize: 3,
    hasExportPermission: true,
    extraTelemetryFields: { userId: 'u-1', exactAddress: 'tehran' },
  });
  assert.equal(smallCellBlocked.exportAllowed, false);
  assert.deepEqual(smallCellBlocked.strippedTelemetryFields, ['userId', 'exactAddress']);
});
