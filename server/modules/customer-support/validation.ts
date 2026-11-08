/**
 * Employee 66 — Customer Support Validation, State Machine & SLA Calculators
 * (`server/modules/customer-support/validation.ts`)
 *
 * Exclusive ownership: `server/modules/customer-support/`
 */

import {
  CoreApiError,
  sanitizeTextInput,
  UNTRUSTED_REQUEST_IDENTITY_FIELDS,
} from '../core';
import type {
  CaseEvidenceClassification,
  CaseRelatedEntityReferences,
  CaseResolutionRecord,
  ComplaintSeverity,
  SlaExecutionState,
  SlaPolicyRecord,
  SupportCaseCategory,
  SupportCasePriority,
  SupportCaseStatus,
} from './types';

export const ALLOWED_CASE_CATEGORIES: readonly SupportCaseCategory[] = [
  'ACCOUNT_AND_PROFILE',
  'PROPERTY_AND_LISTING',
  'SEARCH_AND_VALUATION',
  'BUYER_AND_SELLER_SUPPORT',
  'RENTAL_AND_TENANCY_SUPPORT',
  'BROKERAGE_AND_AGENT_SUPPORT',
  'PROPERTY_MANAGEMENT_SUPPORT',
  'PAYMENT_AND_TRANSACTION_ASSISTANCE',
  'DOCUMENT_AND_VERIFICATION_ASSISTANCE',
  'PRIVACY_AND_DATA_RIGHTS',
  'PLATFORM_TECHNICAL_ISSUES',
  'ABUSE_AND_SAFETY_REPORTS',
  'GENERAL_CUSTOMER_INQUIRIES',
];

export const RESTRICTED_SENSITIVE_CATEGORIES: ReadonlySet<SupportCaseCategory> = new Set([
  'PRIVACY_AND_DATA_RIGHTS',
  'ABUSE_AND_SAFETY_REPORTS',
  'PAYMENT_AND_TRANSACTION_ASSISTANCE',
  'DOCUMENT_AND_VERIFICATION_ASSISTANCE',
]);

export const ALLOWED_CASE_PRIORITIES: readonly SupportCasePriority[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
  'CRITICAL',
];

export const ALLOWED_CASE_STATUSES: readonly SupportCaseStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_CUSTOMER',
  'WAITING_FOR_INTERNAL_TEAM',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELED',
];

/**
 * Central state machine governing allowed transitions between `SupportCaseStatus` values.
 */
export const VALID_CASE_STATUS_TRANSITIONS: Readonly<
  Record<SupportCaseStatus, readonly SupportCaseStatus[]>
> = {
  DRAFT: ['SUBMITTED', 'CANCELED'],
  SUBMITTED: ['OPEN', 'ASSIGNED', 'CANCELED'],
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_INTERNAL_TEAM', 'ESCALATED', 'CANCELED'],
  ASSIGNED: ['IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_INTERNAL_TEAM', 'ESCALATED', 'OPEN', 'CANCELED'],
  IN_PROGRESS: ['WAITING_FOR_CUSTOMER', 'WAITING_FOR_INTERNAL_TEAM', 'ESCALATED', 'RESOLVED', 'ASSIGNED'],
  WAITING_FOR_CUSTOMER: ['IN_PROGRESS', 'OPEN', 'RESOLVED', 'CLOSED', 'CANCELED'],
  WAITING_FOR_INTERNAL_TEAM: ['IN_PROGRESS', 'ASSIGNED', 'ESCALATED', 'RESOLVED'],
  ESCALATED: ['ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_INTERNAL_TEAM', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'ESCALATED', 'RESOLVED'],
  CANCELED: [],
};

const SAFE_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

const FORBIDDEN_CASE_MASS_ASSIGNMENT_KEYS: ReadonlySet<string> = new Set([
  ...UNTRUSTED_REQUEST_IDENTITY_FIELDS,
  'caseId',
  'caseNumber',
  'requesterUid',
  'status',
  'assignedTeamId',
  'assignedAgentUid',
  'sla',
  'resolution',
  'closedByUid',
  'closedAtIso',
  'reopenCount',
  'satisfactionSubmitted',
  'revision',
  'createdAtIso',
  'updatedAtIso',
  'isRestrictedSensitiveCase',
]);

export function assertPlainObject(
  raw: unknown,
  contextName = 'Request payload',
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${contextName} must be a JSON object.`);
  }
  return raw as Record<string, unknown>;
}

export function rejectUnknownOrMassAssignedKeys(
  obj: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): void {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_CASE_MASS_ASSIGNMENT_KEYS.has(key) && !allowedKeys.has(key)) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `Protected field "${key}" cannot be directly assigned by client.`,
      );
    }
    if (!allowedKeys.has(key)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Unknown field "${key}" is not allowed.`);
    }
  }
}

export function validateSafeId(raw: unknown, fieldName = 'id'): string {
  if (typeof raw !== 'string') {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${fieldName} must be a string.`);
  }
  const trimmed = raw.trim();
  if (!SAFE_ID_REGEX.test(trimmed) || trimmed === '.' || trimmed === '..' || trimmed.startsWith('__')) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${fieldName} has an invalid ID format.`);
  }
  return trimmed;
}

/**
 * Redacts accidental sensitive credentials/financial numbers from support descriptions
 * and rejects explicit raw secret fields.
 */
export function sanitizeAndMinimizeSupportText(raw: string, maxLength = 2000): string {
  const cleaned = sanitizeTextInput(raw);
  return cleaned
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_CARD_NUMBER]')
    .replace(/(password|cvv|pin|secret_key|private_key)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .slice(0, maxLength);
}

export function validateRelatedEntityReferences(raw: unknown): CaseRelatedEntityReferences {
  if (raw === undefined || raw === null) return {};
  const obj = assertPlainObject(raw, 'relatedEntities');
  const allowedKeys = new Set([
    'propertyId',
    'listingId',
    'agentUid',
    'brokerageId',
    'transactionId',
    'tenancyId',
    'documentId',
    'reviewId',
    'dataRightsRequestId',
  ]);
  rejectUnknownOrMassAssignedKeys(obj, allowedKeys);

  const out: CaseRelatedEntityReferences = {};
  for (const key of allowedKeys) {
    const val = obj[key];
    if (val !== undefined && val !== null && val !== '') {
      (out as Record<string, string | null>)[key] = validateSafeId(val, `relatedEntities.${key}`);
    }
  }
  return out;
}

export function validateCreateCaseInput(raw: unknown): {
  category: SupportCaseCategory;
  subcategory: string;
  subject: string;
  structuredDescription: {
    summary: string;
    stepsOrContext?: string;
    expectedOutcome?: string;
  };
  relatedEntities: CaseRelatedEntityReferences;
  priority: SupportCasePriority;
  submitImmediately: boolean;
} {
  const obj = assertPlainObject(raw, 'Create support case');
  if ('password' in obj || 'cardNumber' in obj || 'cvv' in obj) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'Sensitive authentication credentials or payment card secrets must never be submitted in support cases.',
    );
  }
  rejectUnknownOrMassAssignedKeys(
    obj,
    new Set([
      'category',
      'subcategory',
      'subject',
      'structuredDescription',
      'description',
      'relatedEntities',
      'priority',
      'submitImmediately',
    ]),
  );

  if (typeof obj.category !== 'string' || !ALLOWED_CASE_CATEGORIES.includes(obj.category as SupportCaseCategory)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid support case category.');
  }
  const category = obj.category as SupportCaseCategory;

  const subcategory =
    typeof obj.subcategory === 'string' && sanitizeTextInput(obj.subcategory)
      ? sanitizeTextInput(obj.subcategory).slice(0, 80)
      : 'GENERAL';

  if (typeof obj.subject !== 'string') {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'subject is required.');
  }
  const subject = sanitizeAndMinimizeSupportText(obj.subject, 160);
  if (subject.length < 4) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'subject must be at least 4 characters.');
  }

  let summary = '';
  let stepsOrContext: string | undefined;
  let expectedOutcome: string | undefined;

  if (obj.structuredDescription !== undefined) {
    const descObj = assertPlainObject(obj.structuredDescription, 'structuredDescription');
    rejectUnknownOrMassAssignedKeys(descObj, new Set(['summary', 'stepsOrContext', 'expectedOutcome']));
    if (typeof descObj.summary !== 'string') {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'structuredDescription.summary is required.');
    }
    summary = sanitizeAndMinimizeSupportText(descObj.summary, 2000);
    if (typeof descObj.stepsOrContext === 'string') {
      stepsOrContext = sanitizeAndMinimizeSupportText(descObj.stepsOrContext, 1500);
    }
    if (typeof descObj.expectedOutcome === 'string') {
      expectedOutcome = sanitizeAndMinimizeSupportText(descObj.expectedOutcome, 800);
    }
  } else if (typeof obj.description === 'string') {
    summary = sanitizeAndMinimizeSupportText(obj.description, 2000);
  }

  if (summary.length < 5) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Case description summary must be at least 5 characters.');
  }

  let priority: SupportCasePriority = 'MEDIUM';
  if (obj.priority !== undefined) {
    if (typeof obj.priority !== 'string' || !ALLOWED_CASE_PRIORITIES.includes(obj.priority as SupportCasePriority)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid case priority.');
    }
    priority = obj.priority as SupportCasePriority;
  } else if (category === 'ABUSE_AND_SAFETY_REPORTS') {
    priority = 'HIGH';
  }

  const relatedEntities = validateRelatedEntityReferences(obj.relatedEntities);
  const submitImmediately = obj.submitImmediately !== false;

  return {
    category,
    subcategory,
    subject,
    structuredDescription: {
      summary,
      ...(stepsOrContext ? { stepsOrContext } : {}),
      ...(expectedOutcome ? { expectedOutcome } : {}),
    },
    relatedEntities,
    priority,
    submitImmediately,
  };
}

/**
 * Validates whether a transition from `fromStatus` to `toStatus` is permitted
 * by the state machine and the actor's role.
 */
export function validateCaseStateTransition(params: {
  fromStatus: SupportCaseStatus;
  toStatus: SupportCaseStatus;
  actorRole: 'CUSTOMER' | 'SUPPORT_AGENT' | 'SUPPORT_LEAD' | 'ADMIN' | 'SYSTEM';
  resolution?: CaseResolutionRecord | null;
  closureReason?: string | null;
  reason?: string;
}): void {
  const { fromStatus, toStatus, actorRole, resolution, closureReason, reason } = params;

  if (fromStatus === toStatus) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Case is already in status "${toStatus}".`);
  }

  if (fromStatus === 'CANCELED') {
    throw new CoreApiError('CONFLICT', 409, 'Canceled cases cannot be modified or transitioned.');
  }

  if (fromStatus === 'CLOSED' && toStatus !== 'REOPENED') {
    throw new CoreApiError(
      'CONFLICT',
      409,
      'Closed cases cannot be modified through ordinary workflows; they must go through controlled REOPENED transition first.',
    );
  }

  const allowedNext = VALID_CASE_STATUS_TRANSITIONS[fromStatus] ?? [];
  if (!allowedNext.includes(toStatus)) {
    if (actorRole === 'CUSTOMER') {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        `Customers are not authorized to transition a case from "${fromStatus}" to "${toStatus}".`,
      );
    }
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Invalid case state transition from "${fromStatus}" to "${toStatus}".`,
    );
  }

  if (actorRole === 'CUSTOMER') {
    const customerAllowed =
      (fromStatus === 'DRAFT' && toStatus === 'SUBMITTED') ||
      ((fromStatus === 'DRAFT' || fromStatus === 'SUBMITTED' || fromStatus === 'OPEN') &&
        toStatus === 'CANCELED') ||
      (fromStatus === 'WAITING_FOR_CUSTOMER' && toStatus === 'IN_PROGRESS') ||
      ((fromStatus === 'RESOLVED' || fromStatus === 'CLOSED') && toStatus === 'REOPENED');

    if (!customerAllowed) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        `Customers are not authorized to transition a case from "${fromStatus}" to "${toStatus}".`,
      );
    }
  }

  if (toStatus === 'RESOLVED' && (!resolution || !resolution.resolutionSummary.trim())) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'Transitioning a case to RESOLVED requires a non-empty resolutionSummary and resolutionCategory.',
    );
  }

  if (toStatus === 'CLOSED' && (!closureReason || closureReason.trim().length < 3)) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'Transitioning a case to CLOSED requires a closureReason.',
    );
  }

  if (toStatus === 'REOPENED' && (!reason || reason.trim().length < 3)) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'Reopening a case requires a valid reason.',
    );
  }
}

/**
 * Calculates SLA target minutes and deadlines using the active SLA policy,
 * priority, category overrides, and business-hours calendar configuration.
 */
export function computeInitialSlaExecutionState(
  policy: SlaPolicyRecord,
  category: SupportCaseCategory,
  priority: SupportCasePriority,
  createdAtIso: string,
): SlaExecutionState {
  const baseTargets = policy.priorityTargetsMinutes[priority];
  const categoryOverride = policy.categoryOverridesMinutes[category]?.[priority];

  const firstResponseTargetMinutes =
    categoryOverride?.firstResponseMinutes ?? baseTargets.firstResponseMinutes;
  const resolutionTargetMinutes =
    categoryOverride?.resolutionMinutes ?? baseTargets.resolutionMinutes;

  const firstResponseDeadlineIso = addSlaMinutesWithCalendar(
    createdAtIso,
    firstResponseTargetMinutes,
    policy.calendar,
  );
  const resolutionDeadlineIso = addSlaMinutesWithCalendar(
    createdAtIso,
    resolutionTargetMinutes,
    policy.calendar,
  );

  return {
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    firstResponseTargetMinutes,
    resolutionTargetMinutes,
    firstResponseDeadlineIso,
    resolutionDeadlineIso,
    firstRespondedAtIso: null,
    resolvedAtIso: null,
    isPaused: false,
    pausedAtIso: null,
    totalPausedDurationMs: 0,
    pauseHistory: [],
    warningTriggered: false,
    warningTriggeredAtIso: null,
    firstResponseBreached: false,
    firstResponseBreachedAtIso: null,
    resolutionBreached: false,
    resolutionBreachedAtIso: null,
    lastEvaluatedAtIso: createdAtIso,
  };
}

export function addSlaMinutesWithCalendar(
  startIso: string,
  targetMinutes: number,
  calendar: SlaPolicyRecord['calendar'],
): string {
  const startMs = Date.parse(startIso);
  if (!calendar.countOnlyBusinessHours) {
    return new Date(startMs + targetMinutes * 60_000).toISOString();
  }

  const holidaySet = new Set(calendar.holidaysIsoDates);
  const workingDaysSet = new Set(calendar.workingDaysOfWeek);
  const startHour = Math.max(0, Math.min(23, calendar.startHourUtc));
  const endHour = Math.max(startHour + 1, Math.min(24, calendar.endHourUtc));

  let remainingMinutes = Math.max(1, targetMinutes);
  let cursor = new Date(startMs);
  let safetySteps = 0;

  while (remainingMinutes > 0 && safetySteps < 60_000) {
    safetySteps += 1;
    const dateStr = cursor.toISOString().slice(0, 10);
    const dayOfWeek = cursor.getUTCDay();
    const hour = cursor.getUTCHours();

    const isWorkingDay = workingDaysSet.has(dayOfWeek) && !holidaySet.has(dateStr);
    const isWithinWorkingHours = hour >= startHour && hour < endHour;

    if (isWorkingDay && isWithinWorkingHours) {
      const minutesLeftInHour = 60 - cursor.getUTCMinutes();
      const consume = Math.min(remainingMinutes, minutesLeftInHour);
      cursor = new Date(cursor.getTime() + consume * 60_000);
      remainingMinutes -= consume;
    } else {
      // Advance to the next hour boundary
      cursor = new Date(
        Date.UTC(
          cursor.getUTCFullYear(),
          cursor.getUTCMonth(),
          cursor.getUTCDate(),
          cursor.getUTCHours() + 1,
          0,
          0,
          0,
        ),
      );
    }
  }

  return cursor.toISOString();
}

export function applySlaPauseOrResumeOnStatusChange(
  sla: SlaExecutionState,
  newStatus: SupportCaseStatus,
  pauseOnStatuses: readonly SupportCaseStatus[],
  nowIso: string,
): SlaExecutionState {
  const next = structuredClone(sla);
  const shouldPause = pauseOnStatuses.includes(newStatus);

  if (shouldPause && !next.isPaused) {
    next.isPaused = true;
    next.pausedAtIso = nowIso;
    next.pauseHistory.push({
      pausedAtIso: nowIso,
      resumedAtIso: null,
      reasonStatus: newStatus,
      durationMs: 0,
    });
  } else if (!shouldPause && next.isPaused && next.pausedAtIso) {
    const pausedMs = Math.max(0, Date.parse(nowIso) - Date.parse(next.pausedAtIso));
    next.isPaused = false;
    next.pausedAtIso = null;
    next.totalPausedDurationMs += pausedMs;

    const lastInterval = next.pauseHistory[next.pauseHistory.length - 1];
    if (lastInterval && !lastInterval.resumedAtIso) {
      lastInterval.resumedAtIso = nowIso;
      lastInterval.durationMs = pausedMs;
    }

    if (!next.firstRespondedAtIso) {
      next.firstResponseDeadlineIso = new Date(
        Date.parse(next.firstResponseDeadlineIso) + pausedMs,
      ).toISOString();
    }
    if (!next.resolvedAtIso) {
      next.resolutionDeadlineIso = new Date(
        Date.parse(next.resolutionDeadlineIso) + pausedMs,
      ).toISOString();
    }
  }

  if (newStatus === 'RESOLVED' && !next.resolvedAtIso) {
    next.resolvedAtIso = nowIso;
  }

  next.lastEvaluatedAtIso = nowIso;
  return next;
}

export function validateAttachmentClassification(raw: unknown): CaseEvidenceClassification {
  const allowed: readonly CaseEvidenceClassification[] = [
    'CUSTOMER_UPLOAD',
    'AGENT_ATTACHMENT',
    'RESTRICTED_INVESTIGATION_EVIDENCE',
    'LEGAL_COMPLIANCE_ARTIFACT',
  ];
  if (typeof raw !== 'string' || !allowed.includes(raw as CaseEvidenceClassification)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid attachment evidence classification.');
  }
  return raw as CaseEvidenceClassification;
}

export function validateComplaintSeverity(raw: unknown): ComplaintSeverity {
  const allowed: readonly ComplaintSeverity[] = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
  if (typeof raw !== 'string' || !allowed.includes(raw as ComplaintSeverity)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid complaint severity.');
  }
  return raw as ComplaintSeverity;
}
