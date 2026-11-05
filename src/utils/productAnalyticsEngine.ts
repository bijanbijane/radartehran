import crypto from 'node:crypto'; import { sanitizeInput } from './security';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type RadarEventTaxonomyName = | 'app.session.started' | 'nav.city.switched' | 'nav.mode.switched' | 'search.query.executed' | 'neighborhood.inspector.opened' | 'valuation.hedonic.completed' | 'comparison.shortlist.updated' | 'lead.buyer_alert.submitted' | 'crm.sponsor_request.submitted' | 'feedback.in_app.submitted' | 'system.error.observed'; export type EventPrivacyClassification = 'PUBLIC_AGGREGATE' | 'PSEUDONYMOUS_SESSION' | 'RESTRICTED_OPERATIONAL'; export interface EventTaxonomyDefinition { eventName: RadarEventTaxonomyName; businessPurpose: string; requiredParams: readonly string[]; optionalParams: readonly string[]; originLayer: 'frontend' | 'backend' | 'both'; identityScope: 'anonymous_or_authenticated' | 'authenticated_only'; privacyClassification: EventPrivacyClassification; }
function defEvent( eventName: RadarEventTaxonomyName, businessPurpose: string, requiredParams: readonly string[], optionalParams: readonly string[], originLayer: 'frontend' | 'backend' | 'both' = 'frontend', identityScope: 'anonymous_or_authenticated' | 'authenticated_only' = 'anonymous_or_authenticated', privacyClassification: EventPrivacyClassification = 'PUBLIC_AGGREGATE', ): EventTaxonomyDefinition { return { eventName, businessPurpose, requiredParams, optionalParams, originLayer, identityScope, privacyClassification }; }
export const RADAR_EVENT_TAXONOMY: Record<RadarEventTaxonomyName, EventTaxonomyDefinition> = { 'app.session.started': defEvent('app.session.started', 'Session entry & viewport bucket', ['cityId', 'viewportBucket'], ['entryRoute', 'isReturningSession'], 'frontend', 'anonymous_or_authenticated', 'PSEUDONYMOUS_SESSION'), 'nav.city.switched': defEvent('nav.city.switched', 'Multi-city market switching', ['fromCityId', 'toCityId'], ['activeMode']), 'nav.mode.switched': defEvent('nav.mode.switched', 'Buy vs Rahn/Rent mode switch', ['mode', 'cityId'], ['budgetBucket']), 'search.query.executed': defEvent('search.query.executed', 'Neighborhood search efficiency', ['cityId', 'queryCategory', 'resultsCount'], ['selectedHoodId', 'refinementCount', 'latencyMs']), 'neighborhood.inspector.opened': defEvent('neighborhood.inspector.opened', 'Neighborhood drawer engagement', ['hoodId', 'cityId', 'affordabilityStatus'], ['activeTab', 'sourceSurface']), 'valuation.hedonic.completed': defEvent('valuation.hedonic.completed', 'Core TTV hedonic valuation milestone', ['hoodId', 'sqmBucket', 'verdict'], ['netAdjustmentPercent', 'hasSellerAskingPrice'], 'both'), 'comparison.shortlist.updated': defEvent('comparison.shortlist.updated', 'Shortlist comparison adoption', ['action', 'shortlistSize'], ['hoodId', 'cityId']), 'lead.buyer_alert.submitted': defEvent('lead.buyer_alert.submitted', 'Buyer price-alert conversion', ['hoodId', 'operationSucceeded'], ['budgetBucket'], 'both', 'anonymous_or_authenticated', 'RESTRICTED_OPERATIONAL'), 'crm.sponsor_request.submitted': defEvent('crm.sponsor_request.submitted', 'B2B agency sponsorship conversion', ['hoodId', 'operationSucceeded'], ['experienceYearsBucket'], 'both', 'authenticated_only', 'RESTRICTED_OPERATIONAL'), 'feedback.in_app.submitted': defEvent('feedback.in_app.submitted', 'In-app feedback & rating', ['category', 'featureModule'], ['usefulnessScore'], 'both'), 'system.error.observed': defEvent('system.error.observed', 'Error correlation & recovery', ['errorCode', 'errorCategory', 'moduleName'], ['recoverable', 'retrySucceeded'], 'both', 'anonymous_or_authenticated', 'RESTRICTED_OPERATIONAL'), }; const FORBIDDEN_PARAM_KEY_PATTERN = /password|secret|token|id_token|access_token|authorization|cookie|phone|mobile|email|national_id|iban|card|exact_lat|exact_lng|raw_query|private_message/i; export interface AnalyticsEventEnvelope { eventId: string; eventName: RadarEventTaxonomyName; sessionId: string; actorType: 'anonymous' | 'authenticated'; timestampMs: number; tehranDateKey: string;
  params: Record<string, string | number | boolean>; } export function toTehranDateKey(timestampMs: number): string { const safeMs = Number.isFinite(timestampMs) && timestampMs > 0 && timestampMs < 8_640_000_000_000_000 ? timestampMs : Date.now(); return new Date(safeMs + (3 * 60 + 30) * 60_000).toISOString().slice(0, 10); } export class CentralizedRadarAnalyticsCollector { private enabled = true;
  private userConsentGranted = true; private readonly seenEventIds = new Set<string>(); private readonly committedEvents: AnalyticsEventEnvelope[] = []; private readonly pendingBatch: AnalyticsEventEnvelope[] = [];
  private rejectedInvalidCount = 0; private deduplicatedCount = 0; setAnalyticsEnabled(enabled: boolean): void { this.enabled = Boolean(enabled); }
  setUserConsent(granted: boolean): void { this.userConsentGranted = Boolean(granted); if (!this.userConsentGranted) this.pendingBatch.length = 0; }
  trackEvent(input: { eventId: string; eventName: string; sessionId: string; actorType?: 'anonymous' | 'authenticated'; timestampMs?: number;
    params: Record<string, unknown>; isBotOrSynthetic?: boolean; }): { recorded: boolean;
    reason: 'RECORDED' | 'DISABLED_OR_NO_CONSENT' | 'BOT_TRAFFIC_IGNORED' | 'UNKNOWN_EVENT_NAME' | 'MISSING_REQUIRED_PARAM' | 'DEDUPLICATED_EVENT_ID'; sanitizedEnvelope: AnalyticsEventEnvelope | null; } { try {
      if (!this.enabled || !this.userConsentGranted) return { recorded: false, reason: 'DISABLED_OR_NO_CONSENT', sanitizedEnvelope: null }; if (input.isBotOrSynthetic) return { recorded: false, reason: 'BOT_TRAFFIC_IGNORED', sanitizedEnvelope: null }; if (!Object.prototype.hasOwnProperty.call(RADAR_EVENT_TAXONOMY, input.eventName)) {
        this.rejectedInvalidCount += 1;
        return { recorded: false, reason: 'UNKNOWN_EVENT_NAME', sanitizedEnvelope: null };
      }
      const spec = RADAR_EVENT_TAXONOMY[input.eventName as RadarEventTaxonomyName];
      for (const reqKey of spec.requiredParams) {
        const val = input.params[reqKey];
        if (val === undefined || val === null || val === '') {
          this.rejectedInvalidCount += 1;
          return { recorded: false, reason: 'MISSING_REQUIRED_PARAM', sanitizedEnvelope: null };
        }
      }
      const cleanEventId = sanitizeInput(input.eventId, 64);
      if (!cleanEventId || this.seenEventIds.has(cleanEventId)) {
        this.deduplicatedCount += 1;
        return { recorded: false, reason: 'DEDUPLICATED_EVENT_ID', sanitizedEnvelope: null };
      }
      const allowedKeys = new Set([...spec.requiredParams, ...spec.optionalParams]);
      const cleanParams: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(input.params)) {
        if (FORBIDDEN_PARAM_KEY_PATTERN.test(k) || !allowedKeys.has(k)) continue;
        if (typeof v === 'boolean') cleanParams[k] = v;
        else if (typeof v === 'number' && Number.isFinite(v)) cleanParams[k] = Math.round(v * 100) / 100;
        else if (typeof v === 'string') cleanParams[k] = sanitizeInput(v, 80);
      }
      const nowMs = typeof input.timestampMs === 'number' && Number.isFinite(input.timestampMs) ? input.timestampMs : Date.now();
      const envelope: AnalyticsEventEnvelope = {
        eventId: cleanEventId, eventName: spec.eventName, sessionId: sanitizeInput(input.sessionId, 64),
        actorType: input.actorType === 'authenticated' ? 'authenticated' : 'anonymous', timestampMs: nowMs, tehranDateKey: toTehranDateKey(nowMs), params: cleanParams,
      };
      if (this.seenEventIds.size >= 5000) {
        const oldestId = this.seenEventIds.values().next().value;
        if (oldestId !== undefined) this.seenEventIds.delete(oldestId);
      }
      this.seenEventIds.add(cleanEventId);
      if (this.pendingBatch.length >= 1000) this.pendingBatch.shift();
      this.pendingBatch.push(envelope);
      return { recorded: true, reason: 'RECORDED', sanitizedEnvelope: envelope };
    } catch {
      return { recorded: false, reason: 'DISABLED_OR_NO_CONSENT', sanitizedEnvelope: null };
    }
  }
  flushBatch(): { flushedCount: number; totalCommitted: number } {
    const count = this.pendingBatch.length;
    while (this.pendingBatch.length > 0) {
      const ev = this.pendingBatch.shift();
      if (ev) {
        if (this.committedEvents.length >= 5000) this.committedEvents.shift();
        this.committedEvents.push(ev);
      }
    }
    return { flushedCount: count, totalCommitted: this.committedEvents.length };
  }
  getCommittedEvents(): readonly AnalyticsEventEnvelope[] { return [...this.committedEvents]; }
  getQualityDiagnostics(areaUnit: AreaUnit = getStoredAreaUnit(), intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()): { committedCount: number; rejectedInvalidCount: number; deduplicatedCount: number; displayAreaUnitLabel?: string; benchmarkValuationIntlText?: string } {
    return { committedCount: this.committedEvents.length, rejectedInvalidCount: this.rejectedInvalidCount, deduplicatedCount: this.deduplicatedCount, displayAreaUnitLabel: formatAreaUnitLabel(areaUnit), benchmarkValuationIntlText: formatMillionTomanAsIntlCurrency(8500, intlCurrency) };
  }
}
export interface TimeToValueSample {
  sessionId: string; milestone: 'NEIGHBORHOOD_INSIGHT_VIEWED' | 'HEDONIC_VALUATION_COMPLETED' | 'SHORTLIST_COMPARISON_SAVED' | 'BUYER_ALERT_REGISTERED';
  viewportBucket: 'mobile' | 'tablet' | 'desktop'; sessionStartMs: number; milestoneCompletedMs: number; activeInteractionMs: number; networkWaitMs: number; navigationMs: number; failedRequestWaitMs: number;
}
export function evaluateTimeToValueMetrics(sample: TimeToValueSample): {
  valid: boolean; elapsedTotalMs: number; productiveRatio: number; bottleneckCategory: 'NONE' | 'NETWORK_LATENCY' | 'NAVIGATION_FRICTION' | 'FAILED_REQUEST_DELAY';
} {
  const elapsedTotalMs = Math.max(0, sample.milestoneCompletedMs - sample.sessionStartMs);
  if (elapsedTotalMs === 0) return { valid: false, elapsedTotalMs: 0, productiveRatio: 0, bottleneckCategory: 'NONE' };
  const activeMs = Math.max(0, Math.min(elapsedTotalMs, sample.activeInteractionMs));
  const productiveRatio = Number((activeMs / elapsedTotalMs).toFixed(3));
  let bottleneckCategory: 'NONE' | 'NETWORK_LATENCY' | 'NAVIGATION_FRICTION' | 'FAILED_REQUEST_DELAY' = 'NONE';
  if (sample.failedRequestWaitMs > 1000) bottleneckCategory = 'FAILED_REQUEST_DELAY';
  else if (sample.networkWaitMs > elapsedTotalMs * 0.45 && sample.networkWaitMs > 1200) bottleneckCategory = 'NETWORK_LATENCY';
  else if (sample.navigationMs > elapsedTotalMs * 0.5 && elapsedTotalMs > 15_000) bottleneckCategory = 'NAVIGATION_FRICTION';
  return { valid: true, elapsedTotalMs, productiveRatio, bottleneckCategory };
}
export type RadarFeatureId = 'hedonic_valuator' | 'neighborhood_inspector' | 'shortlist_matrix' | 'buyer_price_alerts' | 'super_modules_suite' | 'commute_hubs_matrix';
export interface FeatureInteractionRecord { userId: string; featureId: RadarFeatureId; stage: 'VISIBLE' | 'DISCOVERED' | 'OPENED' | 'INTERACTED' | 'COMPLETED' | 'ERROR'; }
export interface FeatureAdoptionRow {
  featureId: RadarFeatureId; visibleUsers: number; discoveredUsers: number; openedUsers: number; interactedUsers: number; completedUsers: number; repeatCompletionUsers: number; errorCount: number; openToCompletionRatePercent: number;
  diagnosticClassification: 'HEALTHY_CORE_DRIVER' | 'HIGH_OPEN_LOW_COMPLETION_FRICTION' | 'LOW_DISCOVERY_HIGH_COMPLETION_HIDDEN_GEM' | 'HIGH_ERROR_RATE' | 'NORMAL';
}
export function computeFeatureAdoptionMatrix(records: readonly FeatureInteractionRecord[]): Record<RadarFeatureId, FeatureAdoptionRow> {
  const features: RadarFeatureId[] = ['hedonic_valuator', 'neighborhood_inspector', 'shortlist_matrix', 'buyer_price_alerts', 'super_modules_suite', 'commute_hubs_matrix'];
  const matrix = {} as Record<RadarFeatureId, FeatureAdoptionRow>;
  for (const fid of features) {
    const visible = new Set<string>(), discovered = new Set<string>(), opened = new Set<string>(), interacted = new Set<string>();
    const completedCounts = new Map<string, number>();
    let errorCount = 0;
    for (const r of records) {
      if (r.featureId !== fid) continue;
      if (r.stage === 'VISIBLE') visible.add(r.userId);
      if (r.stage === 'DISCOVERED') discovered.add(r.userId);
      if (r.stage === 'OPENED') opened.add(r.userId);
      if (r.stage === 'INTERACTED') interacted.add(r.userId);
      if (r.stage === 'COMPLETED') {
        opened.add(r.userId);
        interacted.add(r.userId);
        completedCounts.set(r.userId, (completedCounts.get(r.userId) ?? 0) + 1);
      }
      if (r.stage === 'ERROR') errorCount += 1;
    }
    const openedUsers = opened.size, completedUsers = completedCounts.size;
    let repeatCompletionUsers = 0;
    for (const c of completedCounts.values()) if (c >= 2) repeatCompletionUsers += 1;
    const openToCompletionRatePercent = openedUsers > 0 ? Number(((completedUsers / openedUsers) * 100).toFixed(2)) : 0;
    let diagnosticClassification: FeatureAdoptionRow['diagnosticClassification'] = 'NORMAL';
    if (errorCount > 0 && errorCount >= Math.max(2, openedUsers * 0.25)) diagnosticClassification = 'HIGH_ERROR_RATE';
    else if (openedUsers >= 5 && openToCompletionRatePercent < 30) diagnosticClassification = 'HIGH_OPEN_LOW_COMPLETION_FRICTION';
    else if (visible.size >= 10 && openedUsers <= visible.size * 0.15 && openToCompletionRatePercent >= 75) diagnosticClassification = 'LOW_DISCOVERY_HIGH_COMPLETION_HIDDEN_GEM';
    else if (completedUsers >= 3 && openToCompletionRatePercent >= 60) diagnosticClassification = 'HEALTHY_CORE_DRIVER';
    matrix[fid] = { featureId: fid, visibleUsers: visible.size, discoveredUsers: discovered.size, openedUsers, interactedUsers: interacted.size, completedUsers, repeatCompletionUsers, errorCount, openToCompletionRatePercent, diagnosticClassification };
  }
  return matrix;
}
export interface MeaningfulUserActivityEntry {
  actorId: string;
  timestampMs: number;
  isMeaningfulAction: boolean;
  isBot?: boolean;
}
export function computeCohortRetentionReport(entries: readonly MeaningfulUserActivityEntry[]): {
  cohortSize: number;
  day1RetainedCount: number;
  day7RetainedCount: number;
  day14RetainedCount: number;
  day30RetainedCount: number;
  day1RetentionPercent: number;
  day7RetentionPercent: number;
} {
  const activeDaysByActor = new Map<string, Set<number>>();
  for (const e of entries) {
    if (!e.isMeaningfulAction || e.isBot) continue;
    const dayIndex = Math.floor((e.timestampMs + (3 * 60 + 30) * 60_000) / 86_400_000);
    let set = activeDaysByActor.get(e.actorId);
    if (!set) {
      set = new Set<number>();
      activeDaysByActor.set(e.actorId, set);
    }
    set.add(dayIndex);
  }
  let cohortSize = 0, d1 = 0, d7 = 0, d14 = 0, d30 = 0;
  for (const daysSet of activeDaysByActor.values()) {
    const sorted = Array.from(daysSet).sort((a, b) => a - b);
    if (sorted.length === 0) continue;
    cohortSize += 1;
    const firstDay = sorted[0];
    if (daysSet.has(firstDay + 1)) d1 += 1;
    if (daysSet.has(firstDay + 7)) d7 += 1;
    if (daysSet.has(firstDay + 14)) d14 += 1;
    if (daysSet.has(firstDay + 30)) d30 += 1;
  }
  return {
    cohortSize,
    day1RetainedCount: d1,
    day7RetainedCount: d7,
    day14RetainedCount: d14,
    day30RetainedCount: d30,
    day1RetentionPercent: cohortSize > 0 ? Number(((d1 / cohortSize) * 100).toFixed(2)) : 0,
    day7RetentionPercent: cohortSize > 0 ? Number(((d7 / cohortSize) * 100).toFixed(2)) : 0,
  };
}
export type BehavioralSegmentCode = 'FIRST_TIME_VISITOR' | 'RETURNING_VISITOR' | 'VALUATION_FOCUSED_USER' | 'NEIGHBORHOOD_EXPLORER' | 'INCOMPLETE_WORKFLOW_USER' | 'REPEATED_ERROR_EXPERIENCER' | 'MULTI_FEATURE_POWER_USER';
export function classifyBehavioralSegments(profile: {
  distinctActiveDays: number;
  valuationsCompleted: number;
  neighborhoodsInspected: number;
  workflowsStarted: number;
  workflowsCompleted: number;
  errorsEncountered: number;
  distinctFeatureCategoriesUsed: number;
}): BehavioralSegmentCode[] {
  const segments: BehavioralSegmentCode[] = [profile.distinctActiveDays <= 1 ? 'FIRST_TIME_VISITOR' : 'RETURNING_VISITOR'];
  if (profile.valuationsCompleted >= 2) segments.push('VALUATION_FOCUSED_USER');
  if (profile.neighborhoodsInspected >= 4) segments.push('NEIGHBORHOOD_EXPLORER');
  if (profile.workflowsStarted >= 3 && profile.workflowsCompleted === 0) segments.push('INCOMPLETE_WORKFLOW_USER');
  if (profile.errorsEncountered >= 2) segments.push('REPEATED_ERROR_EXPERIENCER');
  if (profile.distinctFeatureCategoriesUsed >= 3 && profile.workflowsCompleted >= 2) segments.push('MULTI_FEATURE_POWER_USER');
  return segments;
}
export type FeedbackCategory = 'TECHNICAL_BUG' | 'INCORRECT_MARKET_DATA' | 'FEATURE_SUGGESTION' | 'CONFUSING_UX' | 'WORKFLOW_USEFULNESS_RATING';
export interface SanitizedFeedbackItem {
  feedbackId: string;
  actorKey: string;
  category: FeedbackCategory;
  featureModule: string;
  commentFa: string;
  usefulnessScore: number | null;
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
  createdAtMs: number;
}
export class InAppFeedbackManager {
  private readonly items = new Map<string, SanitizedFeedbackItem>();
  private readonly hourlySubmissionsByActor = new Map<string, number>();
  static readonly MAX_PER_HOUR = 5;
  submitFeedback(input: {
    feedbackId: string;
    actorKey: string;
    category: FeedbackCategory;
    featureModule: string;
    rawCommentFa?: string;
    usefulnessScore?: number;
    nowMs?: number;
  }): { accepted: boolean; rejectionReason: string | null; item: SanitizedFeedbackItem | null } {
    const used = this.hourlySubmissionsByActor.get(input.actorKey) ?? 0;
    if (used >= InAppFeedbackManager.MAX_PER_HOUR) return { accepted: false, rejectionReason: 'FEEDBACK_RATE_LIMIT_EXCEEDED', item: null };
    const cleanComment = sanitizeInput(input.rawCommentFa ?? '', 300)
      .replace(/(?:\+98|0098|0)?9\d{9}/g, '[PHONE_REDACTED]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL_REDACTED]')
      .replace(/\bIR\d{24}\b/gi, '[IBAN_REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(/AIza[0-9A-Za-z_-]{30,45}/g, '[REDACTED_API_KEY]');
    if (!cleanComment && input.usefulnessScore === undefined) return { accepted: false, rejectionReason: 'EMPTY_FEEDBACK_SUBMISSION', item: null };
    const score = typeof input.usefulnessScore === 'number' && Number.isFinite(input.usefulnessScore) ? Math.max(1, Math.min(5, Math.round(input.usefulnessScore))) : null;
    const item: SanitizedFeedbackItem = {
      feedbackId: sanitizeInput(input.feedbackId, 48),
      actorKey: sanitizeInput(input.actorKey, 48),
      category: input.category,
      featureModule: sanitizeInput(input.featureModule, 48),
      commentFa: cleanComment,
      usefulnessScore: score,
      status: 'OPEN',
      createdAtMs: input.nowMs ?? Date.now(),
    };
    if (!this.items.has(item.feedbackId) && this.items.size >= 2000) {
      const oldestKey = this.items.keys().next().value;
      if (oldestKey !== undefined) this.items.delete(oldestKey);
    }
    this.items.set(item.feedbackId, item);
    if (!this.hourlySubmissionsByActor.has(input.actorKey) && this.hourlySubmissionsByActor.size >= 2000) {
      const oldestActor = this.hourlySubmissionsByActor.keys().next().value;
      if (oldestActor !== undefined) this.hourlySubmissionsByActor.delete(oldestActor);
    }
    this.hourlySubmissionsByActor.set(input.actorKey, used + 1);
    return { accepted: true, rejectionReason: null, item };
  }
}
export function evaluateControlledAbExperiment(params: {
  experimentId: string;
  enabled: boolean;
  sessionSeed: string;
  controlConversions: number;
  controlExposures: number;
  treatmentConversions: number;
  treatmentExposures: number;
  minSampleSizePerVariant?: number;
}): {
  assignedVariant: 'CONTROL' | 'TREATMENT';
  hasMinimumSampleSize: boolean;
  decision: 'EXPERIMENT_DISABLED_CONTROL_ONLY' | 'INSUFFICIENT_SAMPLE_SIZE' | 'TREATMENT_LEADING' | 'NO_MEANINGFUL_LIFT';
} {
  if (!params.enabled) return { assignedVariant: 'CONTROL', hasMinimumSampleSize: false, decision: 'EXPERIMENT_DISABLED_CONTROL_ONLY' };
  const digest = crypto.createHash('sha256').update(`${params.experimentId}:${params.sessionSeed}`).digest();
  const assignedVariant = digest[0] < 128 ? 'CONTROL' : 'TREATMENT';
  const minSample = params.minSampleSizePerVariant ?? 100;
  const hasMinimumSampleSize = params.controlExposures >= minSample && params.treatmentExposures >= minSample;
  if (!hasMinimumSampleSize) return { assignedVariant, hasMinimumSampleSize: false, decision: 'INSUFFICIENT_SAMPLE_SIZE' };
  const cRate = params.controlConversions / params.controlExposures;
  const tRate = params.treatmentConversions / params.treatmentExposures;
  return { assignedVariant, hasMinimumSampleSize: true, decision: tRate - cRate >= 0.03 ? 'TREATMENT_LEADING' : 'NO_MEANINGFUL_LIFT' };
}
export function classifyPrivacyPreservingSearchQuery(rawQuery: string): { queryCategory: 'EMPTY_QUERY' | 'REDACTED_POTENTIAL_PII' | 'ZONE_LOOKUP' | 'METRO_OR_LANDMARK_LOOKUP' | 'NEIGHBORHOOD_NAME_LOOKUP'; normalizedLength: number; } { const trimmed = (rawQuery || '').trim(); if (!trimmed) return { queryCategory: 'EMPTY_QUERY', normalizedLength: 0 }; if (/09\d{9}|\d{10}|@/.test(trimmed)) return { queryCategory: 'REDACTED_POTENTIAL_PII', normalizedLength: trimmed.length }; if (/منطقه|شمال|جنوب|شرق|غرب|مرکز/.test(trimmed)) return { queryCategory: 'ZONE_LOOKUP', normalizedLength: trimmed.length }; if (/مترو|میدان|بلوار|خیابان|ایستگاه/.test(trimmed)) return { queryCategory: 'METRO_OR_LANDMARK_LOOKUP', normalizedLength: trimmed.length }; return { queryCategory: 'NEIGHBORHOOD_NAME_LOOKUP', normalizedLength: trimmed.length }; }