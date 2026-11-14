/** @file src/interaction-system/interactionEngines.ts — Pure Runtime Interaction Logic (RT-UI-INTERACTION-001) */
import { COMPARISON_LIMITS } from './contracts/interactionContract';

// 1. Race Condition & Stale Request Guard (§7.2, §14.2)
export interface LatestRequestToken {
  seq: number;
  key: string;
}

export function createLatestRequestGuard() {
  let latestSeq = 0;
  let latestKey = '';
  let activeController: AbortController | null = null;

  return {
    issue(key: string): LatestRequestToken & { signal?: AbortSignal } {
      latestSeq += 1;
      latestKey = key;
      if (activeController) {
        try { activeController.abort(); } catch { /* ignore */ }
      }
      activeController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      return { seq: latestSeq, key, signal: activeController?.signal };
    },
    isCurrent(token: LatestRequestToken): boolean {
      return token.seq === latestSeq && token.key === latestKey;
    },
    cancelAll(): void {
      latestSeq += 1;
      if (activeController) {
        try { activeController.abort(); } catch { /* ignore */ }
        activeController = null;
      }
    },
  };
}

// 2. Draft vs Applied Filters & Active Chips (§4.1 - §4.3)
export interface PropertyFilterCriteria {
  dealType: 'buy' | 'rent';
  minPriceMillion: number | null;
  maxPriceMillion: number | null;
  minSqm: number | null;
  maxSqm: number | null;
  hasParking: boolean;
  hasElevator: boolean;
  hasStorage: boolean;
  selectedAreaLabel: string | null;
}

export const DEFAULT_PROPERTY_FILTER_CRITERIA: PropertyFilterCriteria = {
  dealType: 'buy',
  minPriceMillion: null,
  maxPriceMillion: null,
  minSqm: null,
  maxSqm: null,
  hasParking: false,
  hasElevator: false,
  hasStorage: false,
  selectedAreaLabel: null,
};

export interface DualFilterState {
  draft: PropertyFilterCriteria;
  applied: PropertyFilterCriteria;
}

export function createDualFilterState(initial?: Partial<PropertyFilterCriteria>): DualFilterState {
  const base = { ...DEFAULT_PROPERTY_FILTER_CRITERIA, ...initial };
  return { draft: { ...base }, applied: { ...base } };
}

export function applyDraftFilters(state: DualFilterState): DualFilterState {
  return { draft: { ...state.draft }, applied: { ...state.draft } };
}

export function discardDraftFilters(state: DualFilterState): DualFilterState {
  return { draft: { ...state.applied }, applied: { ...state.applied } };
}

export interface ActiveFilterChip {
  key: keyof PropertyFilterCriteria | 'priceRange' | 'sqmRange';
  labelFa: string;
}

export function getActiveFilterChips(criteria: PropertyFilterCriteria): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [{ key: 'dealType', labelFa: criteria.dealType === 'rent' ? 'رهن و اجاره' : 'خرید و فروش' }];
  if (criteria.minPriceMillion !== null || criteria.maxPriceMillion !== null) {
    chips.push({ key: 'priceRange', labelFa: `قیمت: ${criteria.minPriceMillion ?? '۰'} تا ${criteria.maxPriceMillion ?? 'نامحدود'} م` });
  }
  if (criteria.minSqm !== null || criteria.maxSqm !== null) {
    chips.push({ key: 'sqmRange', labelFa: `${criteria.minSqm ?? 'حداقل'} تا ${criteria.maxSqm ?? 'حداکثر'} متر` });
  }
  if (criteria.hasParking) chips.push({ key: 'hasParking', labelFa: 'پارکینگ' });
  if (criteria.hasElevator) chips.push({ key: 'hasElevator', labelFa: 'آسانسور' });
  if (criteria.hasStorage) chips.push({ key: 'hasStorage', labelFa: 'انباری' });
  if (criteria.selectedAreaLabel) chips.push({ key: 'selectedAreaLabel', labelFa: `محدوده: ${criteria.selectedAreaLabel}` });
  return chips;
}

export function removeAppliedFilterChip(state: DualFilterState, chipKey: ActiveFilterChip['key']): DualFilterState {
  const next = { ...state.applied };
  if (chipKey === 'priceRange') { next.minPriceMillion = null; next.maxPriceMillion = null; }
  else if (chipKey === 'sqmRange') { next.minSqm = null; next.maxSqm = null; }
  else if (chipKey === 'hasParking' || chipKey === 'hasElevator' || chipKey === 'hasStorage') next[chipKey] = false;
  else if (chipKey === 'selectedAreaLabel') next.selectedAreaLabel = null;
  else if (chipKey === 'dealType') next.dealType = 'buy';
  return { draft: { ...next }, applied: next };
}

// 3. Map Bounds Change Detection (§4.4)
export interface SimpleBounds {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
}

export function hasMapViewportMovedSignificantly(searched: SimpleBounds | null, current: SimpleBounds | null): boolean {
  if (!searched || !current) return false;
  const eps = 0.008;
  return (
    Math.abs(searched.north - current.north) > eps ||
    Math.abs(searched.south - current.south) > eps ||
    Math.abs(searched.east - current.east) > eps ||
    Math.abs(searched.west - current.west) > eps ||
    Math.abs(searched.zoom - current.zoom) >= 1
  );
}

// 4. Context Transition Between Modules (§11.1 - §11.2)
export function transitionModuleContext(
  fromView: string,
  toView: string,
  ctx: { hoodId: number; dealMode: 'buy' | 'rent'; targetDealMode?: 'buy' | 'rent'; buyBudgetMillion?: number | null; lens?: string }
) {
  const nextDealMode = ctx.targetDealMode || ctx.dealMode;
  const strippedIncompatibleFilters: string[] = [];
  let preservedBuyBudget = ctx.buyBudgetMillion ?? null;
  if (ctx.dealMode === 'buy' && nextDealMode === 'rent' && preservedBuyBudget !== null) {
    preservedBuyBudget = null;
    strippedIncompatibleFilters.push('buyBudgetMillion');
  }
  return {
    fromView,
    toView,
    preservedHoodId: ctx.hoodId,
    preservedLens: ctx.lens || 'budget',
    dealMode: nextDealMode,
    preservedBuyBudget,
    strippedIncompatibleFilters,
    userNoticeFa: strippedIncompatibleFilters.length > 0 ? 'فیلتر سقف قیمت خرید در حالت اجاره اعمال نشد.' : undefined,
  };
}

// 5. Structured 4-Part Error Feedback (§12.3 & §13)
export interface StructuredInteractionError {
  whatHappened: string;
  affectedModule: string;
  previousStatePreserved: boolean;
  retryActionLabel: string;
  formattedMessageFa: string;
}

export function buildFourPartInteractionError(input: {
  whatHappened: string;
  affectedModule: string;
  unaffectedModulesNote: string;
  previousStatePreserved: boolean;
  retryActionLabel: string;
}): StructuredInteractionError {
  return {
    whatHappened: input.whatHappened,
    affectedModule: input.affectedModule,
    previousStatePreserved: input.previousStatePreserved,
    retryActionLabel: input.retryActionLabel,
    formattedMessageFa: `${input.whatHappened} ${input.unaffectedModulesNote} می‌توانید ${input.retryActionLabel}.`,
  };
}

// 6. Comparison Capacity & Unit Parity (§8.3)
export function validateComparisonSelection(
  kind: 'neighborhood' | 'property' | 'area',
  items: ReadonlyArray<{ id: string | number; unit: string; period: string; metricType: string }>
) {
  const maxAllowed =
    kind === 'property' ? COMPARISON_LIMITS.maxProperties : kind === 'area' ? COMPARISON_LIMITS.maxDrawnAreas : COMPARISON_LIMITS.maxNeighborhoods;
  if (items.length > maxAllowed) {
    return { valid: false, reasonFa: `حداکثر ${maxAllowed} مورد برای مقایسه مجاز است.` };
  }
  if (items.length >= 2) {
    const first = items[0];
    const parityOk = items.every((x) => x.unit === first.unit && x.period === first.period && x.metricType === first.metricType);
    if (!parityOk) {
      return { valid: false, reasonFa: 'برای مقایسه معتبر، واحد، دوره زمانی و نوع شاخص باید یکسان باشند.' };
    }
  }
  return { valid: true, reasonFa: null };
}

// 7. Valuation Idempotency & Privacy-Safe Telemetry (§9.5, §19.2)
export function createIdempotentRequestKey(payload: { hoodId: number; sqm: number; buildYear: number; attemptNonce?: string }): string {
  return `val-${payload.hoodId}-${payload.sqm}-${payload.buildYear}-${payload.attemptNonce || 'stable'}`;
}

const SENSITIVE_TELEMETRY_KEYS = ['password', 'phone', 'email', 'payment', 'card', 'rawInput', 'exactLatLng', 'token', 'secret'];

export function buildPrivacySafeInteractionEvent(input: {
  eventId: string;
  eventType: string;
  module: string;
  outcome: 'success' | 'error' | 'cancelled';
  durationMs?: number;
  metadata?: Record<string, unknown>;
}) {
  const cleanMeta: Record<string, string | number | boolean> = {};
  if (input.metadata) {
    for (const [k, v] of Object.entries(input.metadata)) {
      if (SENSITIVE_TELEMETRY_KEYS.some((bad) => k.toLowerCase().includes(bad.toLowerCase()))) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') cleanMeta[k] = v;
    }
  }
  return {
    eventId: input.eventId,
    eventType: input.eventType,
    module: input.module,
    timestamp: new Date().toISOString(),
    sessionScope: 'aggregated_session',
    outcome: input.outcome,
    durationMs: input.durationMs ?? 0,
    aggregation: 'count_and_latency',
    privacyClassification: 'non_pii',
    metadata: cleanMeta,
  };
}
