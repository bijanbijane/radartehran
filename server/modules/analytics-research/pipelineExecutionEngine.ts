/** Analytics pipeline execution with measurable stages — RT-ANALYTICS-CRITICAL-035 */
import type { PipelineDefinitionRecord, PipelineExecutionRunRecord, PersistedAnalyticsState } from './analyticsRepository';

export type PipelineRunExtendedStatus =
  | PipelineExecutionRunRecord['status']
  | 'EXTRACTING'
  | 'VALIDATING_SOURCE'
  | 'TRANSFORMING'
  | 'QUALITY_CHECK'
  | 'PERSISTING'
  | 'VERIFYING_OUTPUT'
  | 'BLOCKED'
  | 'NOT_IMPLEMENTED'
  | 'RETRYABLE_FAILURE'
  | 'PARTIAL';

export interface PipelineRunResult extends PipelineExecutionRunRecord {
  status: PipelineRunExtendedStatus;
  stageResults?: Array<{ stage: string; ok: boolean; detailFa?: string }>;
  actualComputeDurationMs: number;
  inputDatasetVersions?: string[];
  outputDatasetVersions?: string[];
  correlationId?: string;
}

export function canCancelPipelineRun(status: PipelineRunExtendedStatus): boolean {
  return (
    status === 'PENDING' ||
    status === 'RUNNING' ||
    status === 'EXTRACTING' ||
    status === 'VALIDATING_SOURCE' ||
    status === 'TRANSFORMING' ||
    status === 'PERSISTING'
  );
}

export function executeAnalyticsPipelineRun(params: {
  def: PipelineDefinitionRecord;
  state: PersistedAnalyticsState;
  triggeredBy: string;
  correlationId: string;
  nowIso: string;
}): PipelineRunResult {
  const startedMs = Date.now();
  const runId = `run-${startedMs}-${params.correlationId.slice(0, 8)}`;
  const stageResults: PipelineRunResult['stageResults'] = [];

  if (!params.def.enabled) {
    return {
      runId,
      pipelineId: params.def.id,
      pipelineCode: params.def.pipelineCode,
      status: 'BLOCKED',
      triggeredBy: params.triggeredBy,
      recordsProcessed: 0,
      failedRecords: 0,
      computeDurationMs: 0,
      actualComputeDurationMs: Date.now() - startedMs,
      errorFa: 'پایپ‌لاین غیرفعال است.',
      startedAtIso: params.nowIso,
      finishedAtIso: params.nowIso,
      stageResults: [{ stage: 'PENDING', ok: false, detailFa: 'غیرفعال' }],
      correlationId: params.correlationId,
    };
  }

  const places = Object.keys(params.state.observedSeriesByPlace);
  const extractCount = places.reduce(
    (sum, pid) => sum + (params.state.observedSeriesByPlace[pid]?.length ?? 0),
    0,
  );
  stageResults.push({
    stage: 'EXTRACTING',
    ok: extractCount > 0,
    detailFa: extractCount > 0 ? `${extractCount} نقطهٔ سری زمانی` : 'دادهٔ منبع یافت نشد',
  });

  if (extractCount === 0) {
    const finishedIso = new Date().toISOString();
    return {
      runId,
      pipelineId: params.def.id,
      pipelineCode: params.def.pipelineCode,
      status: 'FAILED',
      triggeredBy: params.triggeredBy,
      recordsProcessed: 0,
      failedRecords: params.state.quarantinedPayloads.length,
      computeDurationMs: Date.now() - startedMs,
      actualComputeDurationMs: Date.now() - startedMs,
      errorFa: 'استخراج منبع بدون رکورد؛ موفقیت ساختگی ثبت نمی‌شود.',
      startedAtIso: params.nowIso,
      finishedAtIso: finishedIso,
      stageResults,
      correlationId: params.correlationId,
    };
  }

  const quarantined = params.state.quarantinedPayloads.length;
  stageResults.push({
    stage: 'QUALITY_CHECK',
    ok: quarantined === 0,
    detailFa: quarantined > 0 ? `${quarantined} payload قرنطینه` : 'گذر از کنترل کیفیت',
  });

  const duration = Date.now() - startedMs;
  const finishedIso = new Date().toISOString();

  return {
    runId,
    pipelineId: params.def.id,
    pipelineCode: params.def.pipelineCode,
    status: quarantined > 0 ? 'PARTIAL' : 'SUCCEEDED',
    triggeredBy: params.triggeredBy,
    recordsProcessed: extractCount,
    failedRecords: quarantined,
    computeDurationMs: duration,
    actualComputeDurationMs: duration,
    startedAtIso: params.nowIso,
    finishedAtIso: finishedIso,
    stageResults,
    inputDatasetVersions: [params.def.targetDataset],
    outputDatasetVersions: [params.def.targetDataset],
    correlationId: params.correlationId,
  };
}

export function tryCancelPipelineRun(
  run: PipelineExecutionRunRecord & { status: PipelineRunExtendedStatus },
): { ok: boolean; errorFa?: string; run?: PipelineExecutionRunRecord } {
  if (!canCancelPipelineRun(run.status)) {
    return { ok: false, errorFa: 'این اجرا در وضعیت قابل لغو نیست.' };
  }
  return {
    ok: true,
    run: {
      ...run,
      status: 'CANCELLED',
      finishedAtIso: new Date().toISOString(),
    },
  };
}