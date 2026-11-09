import crypto from 'crypto';
import { CoreApiError } from '../../core';
import type { NormalizedTimestamp } from '../contracts/externalAdapters';
import type {
  ForecastEvaluationMetrics,
  ForecastModelIdentifier,
  ForecastPointOutput,
  HypotheticalScenarioResultRecord,
  ImmutableMarketSnapshotRecord,
  MarketForecastRecord,
} from '../domain/types';
import {
  CURRENT_MARKET_METHODOLOGY_VERSION,
  round2,
} from '../segmentation/segmentationAndSupplyDemandEngine';

export const MINIMUM_CHRONOLOGICAL_PERIODS_FOR_FORECAST = 6;

export const FORECAST_MODEL_REGISTRY: Readonly<
  Record<
    ForecastModelIdentifier,
    {
      modelId: ForecastModelIdentifier;
      version: string;
      deprecated: boolean;
      description: string;
    }
  >
> = {
  DAMPED_LINEAR_TREND_V1: {
    modelId: 'DAMPED_LINEAR_TREND_V1',
    version: '1.0.0',
    deprecated: false,
    description: 'OLS linear trend with 0.85 per-step horizon damping and out-of-sample residual intervals.',
  },
  NAIVE_RANDOM_WALK_BASELINE_V1: {
    modelId: 'NAIVE_RANDOM_WALK_BASELINE_V1',
    version: '1.0.0',
    deprecated: false,
    description: 'Random-walk baseline (y_{t+h} = y_t) for benchmark comparison.',
  },
  MOVING_AVERAGE_3P_BASELINE_V1: {
    modelId: 'MOVING_AVERAGE_3P_BASELINE_V1',
    version: '1.0.0',
    deprecated: false,
    description: '3-period trailing moving average baseline.',
  },
};

export interface ChronologicalTimeSeriesPoint {
  periodKey: string;
  observedAtIso: string;
  value: number;
}

function fitLinearRegression(values: number[]): { intercept: number; slope: number } {
  const n = values.length;
  if (n === 0) return { intercept: 0, slope: 0 };
  if (n === 1) return { intercept: values[0]!, slope: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const y = values[i]!;
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  return { intercept, slope };
}

function predictSingleStep(
  modelId: ForecastModelIdentifier,
  trainValues: number[],
  stepsAhead: number,
): number {
  const n = trainValues.length;
  const lastVal = trainValues[n - 1]!;
  if (modelId === 'NAIVE_RANDOM_WALK_BASELINE_V1') {
    return round2(lastVal);
  }
  if (modelId === 'MOVING_AVERAGE_3P_BASELINE_V1') {
    const slice = trainValues.slice(Math.max(0, n - 3));
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    return round2(avg);
  }
  // DAMPED_LINEAR_TREND_V1: y_{n-1} + slope * sum_{k=1..h} (0.85^k)
  const { slope } = fitLinearRegression(trainValues);
  let dampedMultiplier = 0;
  for (let k = 1; k <= stepsAhead; k++) {
    dampedMultiplier += Math.pow(0.85, k);
  }
  return round2(Math.max(0, lastVal + slope * dampedMultiplier));
}

/**
 * Section 16: Chronological Forecasting Engine with Data Leakage Prevention,
 * Out-of-Sample Validation, Baseline Comparison, and Uncertainty Intervals.
 */
export function generateChronologicalMarketForecast(params: {
  geographicEntityId: string;
  segmentId: string;
  targetMetric: MarketForecastRecord['targetMetric'];
  modelId?: ForecastModelIdentifier;
  historicalSeries: ChronologicalTimeSeriesPoint[];
  trainingCutoffPeriodKey: string;
  horizonPeriods: number;
  nowTs: NormalizedTimestamp;
}): MarketForecastRecord {
  const modelId = params.modelId ?? 'DAMPED_LINEAR_TREND_V1';
  const modelMeta = FORECAST_MODEL_REGISTRY[modelId];
  if (!modelMeta) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Unsupported forecast model "${modelId}".`);
  }
  if (params.horizonPeriods < 1 || params.horizonPeriods > 12) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'horizonPeriods must be between 1 and 12.');
  }

  // Section 16: Prevent future data leakage — reject if any input point exceeds trainingCutoffPeriodKey
  for (const pt of params.historicalSeries) {
    if (pt.periodKey > params.trainingCutoffPeriodKey) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `FUTURE_DATA_LEAKAGE_DETECTED: Input observation period "${pt.periodKey}" is after trainingCutoffPeriodKey "${params.trainingCutoffPeriodKey}".`,
      );
    }
  }

  const sorted = [...params.historicalSeries]
    .filter((p) => Number.isFinite(p.value) && p.value > 0)
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));

  const forecastId = `mktfc_${crypto.randomBytes(6).toString('hex')}`;
  const disclaimer =
    'STATISTICAL_FORECAST_DISCLAIMER: Probabilistic time-series projection subject to macroeconomic and market uncertainty. Never constitutes a guaranteed future price or investment advice.';

  if (sorted.length < MINIMUM_CHRONOLOGICAL_PERIODS_FOR_FORECAST) {
    return {
      forecastId,
      outputClassification: 'STATISTICAL_FORECAST_WITH_UNCERTAINTY',
      geographicEntityId: params.geographicEntityId,
      segmentId: params.segmentId,
      targetMetric: params.targetMetric,
      modelId,
      modelVersion: modelMeta.version,
      modelDeprecated: modelMeta.deprecated,
      trainingStartPeriodKey: sorted[0]?.periodKey ?? params.trainingCutoffPeriodKey,
      trainingCutoffPeriodKey: params.trainingCutoffPeriodKey,
      horizonPeriods: params.horizonPeriods,
      status: 'INSUFFICIENT_HISTORICAL_DATA',
      insufficientDataReason: `Requires at least ${MINIMUM_CHRONOLOGICAL_PERIODS_FOR_FORECAST} valid chronological periods prior to cutoff; found ${sorted.length}.`,
      forecasts: [],
      evaluation: null,
      nonGuaranteeDisclaimer: disclaimer,
      createdAt: params.nowTs,
    };
  }

  // Chronological split: first (N - 2) periods for training, last 2 periods for out-of-sample chronological validation
  const valCount = 2;
  const trainCount = sorted.length - valCount;
  const trainSlice = sorted.slice(0, trainCount).map((p) => p.value);
  const valSlice = sorted.slice(trainCount).map((p) => p.value);

  const modelErrors: number[] = [];
  const naiveErrors: number[] = [];
  const pctErrors: number[] = [];

  for (let i = 0; i < valCount; i++) {
    const actual = valSlice[i]!;
    const predModel = predictSingleStep(modelId, trainSlice, i + 1);
    const predNaive = predictSingleStep('NAIVE_RANDOM_WALK_BASELINE_V1', trainSlice, i + 1);
    modelErrors.push(actual - predModel);
    naiveErrors.push(actual - predNaive);
    pctErrors.push(Math.abs((actual - predModel) / actual) * 100);
  }

  const mae = round2(
    modelErrors.reduce((acc, e) => acc + Math.abs(e), 0) / modelErrors.length,
  );
  const rmse = round2(
    Math.sqrt(modelErrors.reduce((acc, e) => acc + e * e, 0) / modelErrors.length),
  );
  const baselineNaiveRmse = round2(
    Math.sqrt(naiveErrors.reduce((acc, e) => acc + e * e, 0) / naiveErrors.length),
  );
  const mapePct = round2(pctErrors.reduce((acc, p) => acc + p, 0) / pctErrors.length);

  const beatsOrMatchesBaseline = rmse <= baselineNaiveRmse * 1.05;
  const degradationFlagged = rmse > baselineNaiveRmse * 1.25 || mapePct > 25;

  const evaluation: ForecastEvaluationMetrics = {
    chronologicalTrainCount: trainCount,
    chronologicalValidationCount: valCount,
    mae,
    rmse,
    mapePct,
    baselineNaiveRmse,
    beatsOrMatchesBaseline,
    degradationFlagged,
    ...(degradationFlagged
      ? {
          degradationReason: `Out-of-sample RMSE (${rmse}) degraded relative to naive baseline (${baselineNaiveRmse}) or exceeded MAPE threshold (${mapePct}%).`,
        }
      : {}),
  };

  // Fit on full pre-cutoff series for forward horizon projection
  const fullValues = sorted.map((p) => p.value);
  const residualStdError = Math.max(rmse, fullValues[fullValues.length - 1]! * 0.03);

  const forecasts: ForecastPointOutput[] = [];
  for (let h = 1; h <= params.horizonPeriods; h++) {
    const point = predictSingleStep(modelId, fullValues, h);
    const horizonSpread = residualStdError * Math.sqrt(h);
    // Empirical normal quantile multipliers: 1.2816 for 80% interval, 1.96 for 95% interval
    const halfWidth80 = round2(1.2816 * horizonSpread);
    const halfWidth95 = round2(1.96 * horizonSpread);

    forecasts.push({
      horizonStep: h,
      targetPeriodKey: `${params.trainingCutoffPeriodKey}+H${h}`,
      pointEstimate: point,
      interval80Lower: round2(Math.max(0, point - halfWidth80)),
      interval80Upper: round2(point + halfWidth80),
      interval95Lower: round2(Math.max(0, point - halfWidth95)),
      interval95Upper: round2(point + halfWidth95),
    });
  }

  return {
    forecastId,
    outputClassification: 'STATISTICAL_FORECAST_WITH_UNCERTAINTY',
    geographicEntityId: params.geographicEntityId,
    segmentId: params.segmentId,
    targetMetric: params.targetMetric,
    modelId,
    modelVersion: modelMeta.version,
    modelDeprecated: modelMeta.deprecated,
    trainingStartPeriodKey: sorted[0]!.periodKey,
    trainingCutoffPeriodKey: params.trainingCutoffPeriodKey,
    horizonPeriods: params.horizonPeriods,
    status: 'COMPLETED',
    forecasts,
    evaluation,
    nonGuaranteeDisclaimer: disclaimer,
    createdAt: params.nowTs,
  };
}

/**
 * Section 17: Hypothetical Scenario Analysis.
 * Explicitly separated from statistical forecasts (`HYPOTHETICAL_SCENARIO_NOT_A_FORECAST`).
 */
export function evaluateHypotheticalMarketScenario(params: {
  baselineSnapshot: ImmutableMarketSnapshotRecord;
  scenarioName: string;
  supplyShockPct: number;
  demandInquiryShockPct: number;
  constructionCostShockPct: number;
  financingRateDeltaBps: number;
  nowTs: NormalizedTimestamp;
}): HypotheticalScenarioResultRecord {
  const scenarioId = `mktscn_${crypto.randomBytes(6).toString('hex')}`;
  const baseSupply = params.baselineSnapshot.supply.deduplicatedActiveInventoryCount;
  const baseMos = params.baselineSnapshot.absorption.monthsOfSupply;
  const basePriceSqm =
    params.baselineSnapshot.saleMarket?.askingPricePerSqmDistribution.median ??
    params.baselineSnapshot.rentalMarket?.askingMonthlyRentPerSqmDistribution.median ??
    null;

  const projectedSupply = Math.max(
    0,
    Math.round(baseSupply * (1 + params.supplyShockPct / 100)),
  );

  // Documented scenario sensitivity formula:
  // NetDemandFactor = (1 + demandInquiryShockPct/100) * (1 - financingRateDeltaBps/10000)
  const netDemandMultiplier = Math.max(
    0.2,
    (1 + params.demandInquiryShockPct / 100) * (1 - params.financingRateDeltaBps / 10000),
  );
  const projectedMos =
    baseMos !== null && netDemandMultiplier > 0
      ? round2(( baseMos * (1 + params.supplyShockPct / 100) ) / netDemandMultiplier)
      : null;

  const modeledElasticityPct = round2(
    0.35 * params.demandInquiryShockPct -
      0.25 * params.supplyShockPct +
      0.4 * params.constructionCostShockPct -
      0.015 * params.financingRateDeltaBps,
  );

  const directionalPressure: HypotheticalScenarioResultRecord['projectedScenarioMetrics']['projectedDirectionalPressure'] =
    modeledElasticityPct > 1
      ? 'UPWARD_PRESSURE'
      : modeledElasticityPct < -1
        ? 'DOWNWARD_PRESSURE'
        : 'NEUTRAL';

  return {
    scenarioId,
    outputClassification: 'HYPOTHETICAL_SCENARIO_NOT_A_FORECAST',
    geographicEntityId: params.baselineSnapshot.geographicEntityId,
    segmentId: params.baselineSnapshot.segment.segmentId,
    baselinePeriodKey: params.baselineSnapshot.reportingPeriodKey,
    scenarioName: params.scenarioName,
    explicitAssumptions: {
      supplyShockPct: params.supplyShockPct,
      demandInquiryShockPct: params.demandInquiryShockPct,
      constructionCostShockPct: params.constructionCostShockPct,
      financingRateDeltaBps: params.financingRateDeltaBps,
    },
    baselineMetrics: {
      activeSupply: baseSupply,
      monthsOfSupply: baseMos,
      medianPricePerSqm: basePriceSqm,
    },
    projectedScenarioMetrics: {
      projectedActiveSupply: projectedSupply,
      projectedMonthsOfSupply: projectedMos,
      projectedDirectionalPressure: directionalPressure,
      modeledPriceElasticityImpactPct: modeledElasticityPct,
    },
    methodologyVersion: CURRENT_MARKET_METHODOLOGY_VERSION,
    nonForecastAndNonInvestmentGuaranteeDisclaimer:
      'HYPOTHETICAL_SCENARIO_SIMULATION_ONLY: Evaluates user-specified shock parameters under fixed structural assumptions. Does not predict likelihood of occurrence or provide investment guarantees.',
    createdAt: params.nowTs,
  };
}
