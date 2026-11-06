import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type BusinessEventCategory = | 'LEAD_LIFECYCLE' | 'CUSTOMER_INTERACTION' | 'PROPERTY_LISTING_CHANGE'
  | 'APPOINTMENT_SCHEDULING' | 'DEAL_TRANSITION' | 'DOCUMENT_WORKFLOW'
  | 'MEMBERSHIP_CHANGE' | 'FINANCIAL_OPERATION'; export interface StandardizedBusinessEvent { eventId: string; workspaceId: string; actorId: string; category: BusinessEventCategory; entityType: string; entityId: string; occurredAtMs: number; eventVersion: number; idempotencyKey: string; sanitizedPayload: Record<string, string | number | boolean | null>; }
export function processBusinessEventDeterministic(params: { event: StandardizedBusinessEvent; consumerWorkspaceId: string; processedEventIds: ReadonlySet<string>; }): { accepted: boolean; duplicate: boolean; reasonCode: 'PROCESSED' | 'DUPLICATE_EVENT_IGNORED' | 'CROSS_WORKSPACE_BLOCKED' | 'INVALID_ENVELOPE';
  nextProcessedIds: string[]; } { const { event, consumerWorkspaceId, processedEventIds } = params; if (!event.eventId || !event.workspaceId || !event.entityId || event.eventVersion < 1) { return { accepted: false, duplicate: false, reasonCode: 'INVALID_ENVELOPE', nextProcessedIds: Array.from(processedEventIds) }; }
  if (event.workspaceId !== consumerWorkspaceId) { return { accepted: false, duplicate: false, reasonCode: 'CROSS_WORKSPACE_BLOCKED', nextProcessedIds: Array.from(processedEventIds) }; }
  const dedupToken = `${event.workspaceId}:${event.idempotencyKey || event.eventId}`;
  if (processedEventIds.has(dedupToken) || processedEventIds.has(event.eventId)) { return { accepted: false, duplicate: true, reasonCode: 'DUPLICATE_EVENT_IGNORED', nextProcessedIds: Array.from(processedEventIds) }; }
  const next = new Set(processedEventIds); next.add(dedupToken); next.add(event.eventId);
  const nextArr = Array.from(next);
  return { accepted: true, duplicate: false, reasonCode: 'PROCESSED', nextProcessedIds: nextArr.length > 5000 ? nextArr.slice(-5000) : nextArr }; }
export interface TransactionalOutboxRecord { outboxId: string; workspaceId: string; eventId: string; idempotencyKey: string; status: 'PENDING' | 'PROCESSED' | 'FAILED'; attemptCount: number; maxAttempts: number;
  createdAtMs: number; lastAttemptAtMs: number | null; lockedByWorkerId: string | null; lastError: string | null;
}
export function transitionOutboxDispatchAttempt(params: { record: TransactionalOutboxRecord; workerId: string; nowMs: number;
  dispatchSucceeded: boolean; ackSucceeded: boolean; downstreamAlreadyProcessedKeys: ReadonlySet<string>;
  errorMessage?: string; }): {
  updatedRecord: TransactionalOutboxRecord;
  downstreamSideEffectApplied: boolean;
  outcome: 'DISPATCHED_AND_ACKED' | 'IDEMPOTENT_ACK_RECOVERED' | 'RETRY_SCHEDULED' | 'PERMANENT_FAILURE' | 'LOCKED_BY_OTHER_WORKER';
} {
  const { record, workerId, nowMs, dispatchSucceeded, ackSucceeded, downstreamAlreadyProcessedKeys, errorMessage } = params;
  if (record.status === 'PROCESSED') {
    return { updatedRecord: record, downstreamSideEffectApplied: false, outcome: 'IDEMPOTENT_ACK_RECOVERED' };
  }
  if (record.lockedByWorkerId && record.lockedByWorkerId !== workerId) {
    return { updatedRecord: record, downstreamSideEffectApplied: false, outcome: 'LOCKED_BY_OTHER_WORKER' };
  }
  const alreadyExecutedDownstream = downstreamAlreadyProcessedKeys.has(record.idempotencyKey);
  const nextAttempts = record.attemptCount + 1;
  if (alreadyExecutedDownstream || (dispatchSucceeded && ackSucceeded)) {
    return {
      updatedRecord: { ...record, status: 'PROCESSED', attemptCount: nextAttempts, lastAttemptAtMs: nowMs, lockedByWorkerId: null, lastError: null },
      downstreamSideEffectApplied: !alreadyExecutedDownstream && dispatchSucceeded,
      outcome: alreadyExecutedDownstream ? 'IDEMPOTENT_ACK_RECOVERED' : 'DISPATCHED_AND_ACKED',
    };
  }
  const exhausted = nextAttempts >= record.maxAttempts;
  return {
    updatedRecord: {
      ...record,
      status: exhausted ? 'FAILED' : 'PENDING',
      attemptCount: nextAttempts,
      lastAttemptAtMs: nowMs,
      lockedByWorkerId: null,
      lastError: errorMessage || (dispatchSucceeded && !ackSucceeded ? 'ACK_TIMEOUT_AFTER_DISPATCH' : 'DISPATCH_ERROR'),
    },
    downstreamSideEffectApplied: dispatchSucceeded && !alreadyExecutedDownstream,
    outcome: exhausted ? 'PERMANENT_FAILURE' : 'RETRY_SCHEDULED',
  };
}
export interface DeclarativeRuleCondition {
  ruleId: string; version: number; field: 'leadPriority' | 'dealAmountToman' | 'missingDocsCount' | 'daysInactive';
  operator: 'EQ' | 'GT' | 'GTE' | 'LT' | 'LTE'; expectedValue: string | number; dependsOnRuleId?: string | null;
}
export interface ConfigurableWorkflowStep {
  stepId: string; titleFa: string; assignedRole: string; requiresApproval: boolean; dueOffsetHours: number; conditionRuleId?: string | null;
}
export interface ConfigurableWorkflowDefinition {
  workflowId: string; workspaceId: string; version: number; isSystemTemplate: boolean; sourceTemplateId: string | null;
  nameFa: string; triggerCategory: BusinessEventCategory; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; activeExecutionCount: number; steps: ConfigurableWorkflowStep[];
}
export function evaluateDeclarativeBusinessRules(
  params: { rules: readonly DeclarativeRuleCondition[]; context: Record<string, string | number | undefined> },
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
) {
  const { rules, context } = params;
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const dealThresholdBenchmarkIntlText = formatMillionTomanAsIntlCurrency(Number(context.dealAmountToman ?? 0) / 1_000_000, intlCurrency);
  const errorsFa: string[] = [];
  const ruleMap = new Map(rules.map((r) => [r.ruleId, r]));
  for (const r of rules) {
    const visited = new Set<string>([r.ruleId]);
    let curr = r.dependsOnRuleId;
    while (curr) {
      if (visited.has(curr)) {
        return { validSyntax: false, hasCircularDependency: true, matchedRuleIds: [] as string[], appliedRuleVersions: {} as Record<string, number>, errorsFa: [`وابستگی حلقوی (${r.ruleId} -> ${curr}).`], displayAreaUnitLabel, dealThresholdBenchmarkIntlText };
      }
      visited.add(curr);
      curr = ruleMap.get(curr)?.dependsOnRuleId || null;
    }
  }
  const rawMatched = new Set<string>();
  const appliedRuleVersions: Record<string, number> = {};
  for (const r of rules) {
    const actual = context[r.field];
    if (actual === undefined) {
      errorsFa.push(`فیلد «${r.field}» برای قاعده «${r.ruleId}» موجود نیست.`);
      continue;
    }
    let matched = false;
    if (r.operator === 'EQ') matched = actual === r.expectedValue;
    else if (typeof actual === 'number' && typeof r.expectedValue === 'number' && Number.isFinite(actual) && Number.isFinite(r.expectedValue)) {
      if (r.operator === 'GT') matched = actual > r.expectedValue;
      else if (r.operator === 'GTE') matched = actual >= r.expectedValue;
      else if (r.operator === 'LT') matched = actual < r.expectedValue;
      else if (r.operator === 'LTE') matched = actual <= r.expectedValue;
    }
    appliedRuleVersions[r.ruleId] = r.version;
    if (matched) rawMatched.add(r.ruleId);
  }
  const matchedRuleIds = rules.filter((r) => {
    let curr: DeclarativeRuleCondition | undefined = r;
    while (curr) {
      if (!rawMatched.has(curr.ruleId)) return false;
      curr = curr.dependsOnRuleId ? ruleMap.get(curr.dependsOnRuleId) : undefined;
    }
    return true;
  }).map((r) => r.ruleId);
  return { validSyntax: errorsFa.length === 0, hasCircularDependency: false, matchedRuleIds, appliedRuleVersions, errorsFa, displayAreaUnitLabel, dealThresholdBenchmarkIntlText };
}
export function instantiateWorkflowFromTemplate(params: {
  template: ConfigurableWorkflowDefinition;
  targetWorkspaceId: string;
  customNameFa?: string;
}): ConfigurableWorkflowDefinition {
  const { template, targetWorkspaceId, customNameFa } = params;
  return {
    ...template,
    workflowId: `wf-${targetWorkspaceId}-${template.workflowId}-v${template.version}`,
    workspaceId: targetWorkspaceId,
    isSystemTemplate: false,
    sourceTemplateId: template.workflowId,
    nameFa: customNameFa?.trim() || `${template.nameFa} (نسخه اختصاصی آژانس)`,
    status: 'DRAFT',
    activeExecutionCount: 0,
    steps: template.steps.map((s) => ({ ...s })),
  };
}
export interface ApprovalRequestRecord {
  approvalId: string;
  workspaceId: string;
  operationType: 'COMMISSION_OVERRIDE' | 'FINANCIAL_ADJUSTMENT' | 'DEAL_CANCELLATION' | 'SENSITIVE_DOCUMENT_RELEASE' | 'LEAD_OWNERSHIP_OVERRIDE' | 'BULK_DATA_EXPORT';
  targetResourceId: string;
  makerUserId: string;
  requiredLevels: number;
  currentLevel: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  justificationFa: string;
  beforeSummaryFa: string;
  afterSummaryFa: string;
  decisions: Array<{ level: number; checkerUserId: string; decision: 'APPROVED' | 'REJECTED'; reasonFa: string; decidedAtMs: number }>;
  expiresAtMs: number;
}
export function evaluateMultiLevelApprovalDecision(params: {
  request: ApprovalRequestRecord;
  actorUserId: string;
  actorIsActiveMember: boolean;
  actorHasApprovePermission: boolean;
  decision: 'APPROVED' | 'REJECTED';
  reasonFa: string;
  nowMs: number;
}) {
  const { request, actorUserId, actorIsActiveMember, actorHasApprovePermission, decision, reasonFa, nowMs } = params;
  if (request.status !== 'PENDING' || !Number.isFinite(nowMs) || !Number.isFinite(request.expiresAtMs) || nowMs >= request.expiresAtMs) {
    return { allowed: false, violationCode: 'REQUEST_ALREADY_FINALIZED_OR_EXPIRED' as const, updatedRequest: (!Number.isFinite(nowMs) || nowMs >= request.expiresAtMs) && request.status === 'PENDING' ? { ...request, status: 'EXPIRED' as const } : request, explanationFa: 'این درخواست قبلاً نهایی یا منقضی شده است.' };
  }
  if (!actorIsActiveMember || !actorHasApprovePermission) {
    return { allowed: false, violationCode: 'ACTOR_INACTIVE_OR_UNAUTHORIZED' as const, updatedRequest: request, explanationFa: 'کاربر فعلی دارای مجوز تأیید سازمانی نیست.' };
  }
  if (request.makerUserId === actorUserId) {
    return { allowed: false, violationCode: 'SOD_SELF_APPROVAL_FORBIDDEN' as const, updatedRequest: request, explanationFa: 'خطای تفکیک وظایف (SoD): ایجادکننده درخواست (Maker) مجاز به تأیید درخواست خود نیست.' };
  }
  if (request.decisions.some((d) => d.checkerUserId === actorUserId)) {
    return { allowed: false, violationCode: 'DUPLICATE_APPROVER_DECISION' as const, updatedRequest: request, explanationFa: 'شما قبلاً در این درخواست رأی ثبت کرده‌اید.' };
  }
  if (decision === 'REJECTED' && !reasonFa.trim()) {
    return { allowed: false, violationCode: 'REJECTION_REASON_REQUIRED' as const, updatedRequest: request, explanationFa: 'ثبت علت صریح برای رد درخواست الزامی است.' };
  }
  const nextLevel = request.currentLevel + 1;
  const nextDecisions = [...request.decisions, { level: nextLevel, checkerUserId: actorUserId, decision, reasonFa: reasonFa.trim() || 'تأیید مطابق ضوابط آژانس', decidedAtMs: nowMs }];
  const nextStatus: ApprovalRequestRecord['status'] = decision === 'REJECTED' ? 'REJECTED' : nextLevel >= request.requiredLevels ? 'APPROVED' : 'PENDING';
  return {
    allowed: true,
    violationCode: 'NONE' as const,
    updatedRequest: { ...request, currentLevel: nextLevel, status: nextStatus, decisions: nextDecisions },
    explanationFa: nextStatus === 'APPROVED' ? 'تمامی مراحل تأیید چندمرحله‌ای با رعایت تفکیک وظایف تکمیل شد.' : nextStatus === 'REJECTED' ? 'درخواست با ثبت علت رد شد.' : `مرحله ${nextLevel} تأیید شد.`,
  };
}
export interface AgencyBusinessCalendarConfig {
  calendarId: string;
  workspaceId: string;
  version: number;
  timezone: string;
  workingDaysOfWeek: readonly number[];
  workStartHour: number;
  workEndHour: number;
  holidayDatesIso: readonly string[];
  exceptionalWorkingDatesIso: readonly string[];
}
export function computeBusinessHoursElapsed(params: { startMs: number; endMs: number; calendar: AgencyBusinessCalendarConfig }) {
  const { startMs, endMs, calendar } = params;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return { elapsedWallClockMinutes: 0, elapsedBusinessMinutes: 0, calendarVersion: calendar.version };
  const boundedEndMs = Math.min(endMs, startMs + 366 * 24 * 60 * 60_000);
  const elapsedWallClockMinutes = Math.round((boundedEndMs - startMs) / 60_000);
  let businessMinutes = 0;
  const stepMs = 15 * 60_000;
  for (let t = startMs; t < boundedEndMs; t += stepMs) {
    const dt = new Date(t);
    const dateIso = dt.toISOString().slice(0, 10);
    const isWorkingDay = calendar.exceptionalWorkingDatesIso.includes(dateIso) || (!calendar.holidayDatesIso.includes(dateIso) && calendar.workingDaysOfWeek.includes(dt.getUTCDay()));
    const hour = dt.getUTCHours();
    if (isWorkingDay && hour >= calendar.workStartHour && hour < calendar.workEndHour) {
      businessMinutes += Math.max(0, Math.min(15, Math.round((boundedEndMs - t) / 60_000)));
    }
  }
  return { elapsedWallClockMinutes, elapsedBusinessMinutes: businessMinutes, calendarVersion: calendar.version };
}
export function evaluateSlaAndEscalationState(params: {
  taskId: string;
  workspaceId: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  createdAtMs: number;
  nowMs: number;
  pausedDurationMinutes: number;
  calendar: AgencyBusinessCalendarConfig;
  supervisorMemberId: string | null;
  supervisorIsActive: boolean;
  alreadyEscalatedLevels: readonly ('WARNING' | 'BREACH_ESCALATED')[];
}) {
  const targetBusinessMinutes = ({ HIGH: 60, MEDIUM: 180, LOW: 360 } as const)[params.priority];
  const calc = computeBusinessHoursElapsed({ startMs: params.createdAtMs, endMs: params.nowMs, calendar: params.calendar });
  const netBusinessMinutes = Math.max(0, calc.elapsedBusinessMinutes - Math.max(0, params.pausedDurationMinutes));
  let slaStatus: 'ACHIEVED_OR_ON_TRACK' | 'AT_RISK_WARNING' | 'BREACHED' = 'ACHIEVED_OR_ON_TRACK';
  let triggerEscalation: 'NONE' | 'WARNING' | 'BREACH_ESCALATED' = 'NONE';
  if (netBusinessMinutes >= targetBusinessMinutes) {
    slaStatus = 'BREACHED';
    if (!params.alreadyEscalatedLevels.includes('BREACH_ESCALATED')) triggerEscalation = 'BREACH_ESCALATED';
  } else if (netBusinessMinutes >= Math.round(targetBusinessMinutes * 0.75)) {
    slaStatus = 'AT_RISK_WARNING';
    if (!params.alreadyEscalatedLevels.includes('WARNING')) triggerEscalation = 'WARNING';
  }
  return {
    targetBusinessMinutes,
    netBusinessMinutes,
    slaStatus,
    triggerEscalation,
    escalateToSupervisorId: triggerEscalation !== 'NONE' && params.supervisorIsActive ? params.supervisorMemberId : null,
    policyVersion: params.calendar.version,
  };
}
export interface AgentWorkloadSummary {
  agentId: string;
  availability: 'AVAILABLE' | 'BUSY' | 'OFFLINE';
  activeLeadsCount: number;
  overdueTasksCount: number;
  upcomingVisitsCount: number;
  weightedWorkloadScore: number;
  capacityUtilizationPercent: number;
  statusLabelFa: string;
}
export function computeAgentWorkloadCapacity(params: {
  agentId: string; availability: 'AVAILABLE' | 'BUSY' | 'OFFLINE';
  activeLeadsCount: number; overdueTasksCount: number; upcomingVisitsCount: number; maxWeightedScoreCap: number;
}): AgentWorkloadSummary {
  const leads = Number.isFinite(params.activeLeadsCount) && params.activeLeadsCount >= 0 ? params.activeLeadsCount : 0;
  const visits = Number.isFinite(params.upcomingVisitsCount) && params.upcomingVisitsCount >= 0 ? params.upcomingVisitsCount : 0;
  const tasks = Number.isFinite(params.overdueTasksCount) && params.overdueTasksCount >= 0 ? params.overdueTasksCount : 0;
  const cap = Number.isFinite(params.maxWeightedScoreCap) && params.maxWeightedScoreCap > 0 ? params.maxWeightedScoreCap : 10;
  const weightedWorkloadScore = leads * 2 + visits * 3 + tasks * 4;
  const capacityUtilizationPercent = Math.min(100, Math.round((weightedWorkloadScore / Math.max(10, cap)) * 100));
  const statusLabelFa = params.availability === 'OFFLINE' ? 'خارج از دسترس' : capacityUtilizationPercent >= 85 ? 'ظرفیت تکمیل' : capacityUtilizationPercent >= 50 ? 'ظرفیت متعادل' : 'ظرفیت آزاد';
  return { ...params, weightedWorkloadScore, capacityUtilizationPercent, statusLabelFa };
}
export interface OperationsQueueItem {
  queueItemId: string;
  workspaceId: string;
  category: 'UNASSIGNED_LEAD' | 'PENDING_APPROVAL' | 'OVERDUE_FOLLOW_UP' | 'UNCONFIRMED_VISIT' | 'EXPIRING_DOCUMENT' | 'STALLED_TRANSACTION' | 'FAILED_AUTOMATION_JOB' | 'DATA_CONFLICT';
  sourceEntityId: string;
  sourceExistsAndUnresolved: boolean;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL';
  titleFa: string;
  assignedOwnerId: string | null;
  ageHours: number;
}
export function synchronizeOperationsQueue(params: { workspaceId: string; items: readonly OperationsQueueItem[] }): OperationsQueueItem[] {
  const seenSourceKeys = new Set<string>();
  const validItems: OperationsQueueItem[] = [];
  for (const item of params.items) {
    if (item.workspaceId !== params.workspaceId || !item.sourceExistsAndUnresolved) continue;
    const dedupKey = `${item.category}:${item.sourceEntityId}`;
    if (seenSourceKeys.has(dedupKey)) continue;
    seenSourceKeys.add(dedupKey);
    validItems.push(item);
  }
  const rank = { CRITICAL: 3, HIGH: 2, NORMAL: 1 } as const; return validItems.sort((a, b) => rank[b.priority] - rank[a.priority] || b.ageHours - a.ageHours); }