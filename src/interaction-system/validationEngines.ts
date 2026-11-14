/** @file src/interaction-system/validationEngines.ts — Pure Stage 10 QA Gate, Web Vitals, Rollout Flags & Non-PII UX Health */
import {
  DEFAULT_UI_ROLLOUT_FLAGS,
  PERFORMANCE_BUDGETS,
  type DesignQaIssue,
  type UiRolloutFlagConfig,
  type UiRolloutFlagKey,
} from './contracts/validationAndImplementContract';

export function calculateIssuePriorityScore(impact: number, frequency: number, recoveryDifficulty: number): number {
  const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(Number.isFinite(n) ? n : 1)));
  return clamp(impact) * clamp(frequency) * clamp(recoveryDifficulty);
}

export function canPassValidationGate(issues: readonly DesignQaIssue[]): {
  allowed: boolean;
  blockingIssues: readonly DesignQaIssue[];
  statusLabelFa: string;
} {
  const blockingIssues = issues.filter(
    (issue) => issue.status === 'open' && (issue.severity === 'S0' || issue.severity === 'S1'),
  );
  return {
    allowed: blockingIssues.length === 0,
    blockingIssues,
    statusLabelFa:
      blockingIssues.length === 0
        ? 'آماده عبور از دروازه پذیرش و تثبیت طراحی (Design Freeze Ready)'
        : `توقف پذیرش: ${blockingIssues.length} مورد Blocker/Critical باز وجود دارد`,
  };
}

export function evaluatePerformanceBudget(sample: {
  lcpMs: number;
  inpMs: number;
  cls: number;
  selectionLatencyMs: number;
}) {
  const cwv = PERFORMANCE_BUDGETS.coreWebVitals;
  const lcpOk = sample.lcpMs <= cwv.lcpMaxMs;
  const inpOk = sample.inpMs <= cwv.inpMaxMs;
  const clsOk = sample.cls <= cwv.clsMax;
  const selectionOk = sample.selectionLatencyMs <= 300;
  return {
    passedAll: lcpOk && inpOk && clsOk && selectionOk,
    lcpOk,
    inpOk,
    clsOk,
    selectionOk,
  };
}

export interface UxHealthCounterBucket {
  taskCompletions: number;
  searchQueries: number;
  zeroResultSearches: number;
  filterApplications: number;
  mapSelections: number;
  layerSwitches: number;
  valuationCompletions: number;
  uiErrors: number;
  avgSelectionLatencyMs: number;
}

export function createEmptyUxHealthBucket(): UxHealthCounterBucket {
  return {
    taskCompletions: 0,
    searchQueries: 0,
    zeroResultSearches: 0,
    filterApplications: 0,
    mapSelections: 0,
    layerSwitches: 0,
    valuationCompletions: 0,
    uiErrors: 0,
    avgSelectionLatencyMs: 0,
  };
}

export function aggregatePrivacySafeUxHealth(
  bucket: UxHealthCounterBucket,
  event: {
    kind: 'task_complete' | 'search' | 'search_empty' | 'filter' | 'map_select' | 'layer_switch' | 'valuation' | 'ui_error';
    latencyMs?: number;
  },
): UxHealthCounterBucket {
  const next = { ...bucket };
  if (event.kind === 'task_complete') next.taskCompletions += 1;
  else if (event.kind === 'search') next.searchQueries += 1;
  else if (event.kind === 'search_empty') {
    next.searchQueries += 1;
    next.zeroResultSearches += 1;
  } else if (event.kind === 'filter') next.filterApplications += 1;
  else if (event.kind === 'map_select') {
    const prevCount = next.mapSelections;
    next.mapSelections += 1;
    if (typeof event.latencyMs === 'number' && Number.isFinite(event.latencyMs) && event.latencyMs >= 0) {
      next.avgSelectionLatencyMs = Math.round(
        (next.avgSelectionLatencyMs * prevCount + event.latencyMs) / next.mapSelections,
      );
    }
  } else if (event.kind === 'layer_switch') next.layerSwitches += 1;
  else if (event.kind === 'valuation') next.valuationCompletions += 1;
  else if (event.kind === 'ui_error') next.uiErrors += 1;
  return next;
}

export function toggleRolloutFlagSafe(
  flags: readonly UiRolloutFlagConfig[],
  key: UiRolloutFlagKey,
  enabled: boolean,
): UiRolloutFlagConfig[] {
  return flags.map((item) => (item.key === key ? { ...item, enabled } : item));
}

export function rollbackAllControlledFlags(flags: readonly UiRolloutFlagConfig[]): UiRolloutFlagConfig[] {
  return flags.map((item) =>
    item.rolloutPhase === 'Release 03 (Public)' ? item : { ...item, enabled: false },
  );
}

export function getDefaultUiRolloutFlags(): UiRolloutFlagConfig[] {
  return DEFAULT_UI_ROLLOUT_FLAGS.map((item) => ({ ...item }));
}
