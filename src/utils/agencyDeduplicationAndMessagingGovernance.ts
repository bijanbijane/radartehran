// Bundle 113 — Stalled Deal Detection, Duplicate Lead Resolution, Controlled CRM Merge & Messaging Idempotency (Prompts 1237-1243)
import { normalizeCrmSearchToken } from './agencyCrmWorkflowAndReportingEngine';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface DealInactivityCandidate { dealId: string; workspaceId: string; stage: 'NEW_INQUIRY' | 'VIEWING_SCHEDULED' | 'OFFER_NEGOTIATION' | 'CONTRACT_DRAFTING' | 'CLOSED_WON' | 'CLOSED_LOST'; lastInternalActivityAtMs: number; awaitingExternalCustomerReply: boolean; isExplicitlyPaused: boolean; }
export function detectStalledDealsExplainable(params: { workspaceId: string; deals: readonly DealInactivityCandidate[]; nowMs: number; stageThresholdsHours?: Partial<Record<DealInactivityCandidate['stage'], number>>; }): Array<{ dealId: string; inactiveHours: number;
  thresholdHours: number; waitingStateClassification: 'INTERNAL_INACTIVITY_STALLED' | 'WAITING_ON_CUSTOMER'; explanationFa: string; }> { const defaultThresholds: Record<DealInactivityCandidate['stage'], number> = { NEW_INQUIRY: 24, VIEWING_SCHEDULED: 72, OFFER_NEGOTIATION: 48,
    CONTRACT_DRAFTING: 96, CLOSED_WON: 999_999, CLOSED_LOST: 999_999, };
  const results: Array<{ dealId: string; inactiveHours: number; thresholdHours: number;
    waitingStateClassification: 'INTERNAL_INACTIVITY_STALLED' | 'WAITING_ON_CUSTOMER'; explanationFa: string; }> = []; for (const d of params.deals) {
    if (d.workspaceId !== params.workspaceId) continue;
    if (d.stage === 'CLOSED_WON' || d.stage === 'CLOSED_LOST' || d.isExplicitlyPaused) continue;
    const thresholdHours = params.stageThresholdsHours?.[d.stage] ?? defaultThresholds[d.stage];
    const inactiveHours = Math.max(0, Math.round((params.nowMs - d.lastInternalActivityAtMs) / 3_600_000));
    if (inactiveHours >= thresholdHours) {
      const waitingStateClassification = d.awaitingExternalCustomerReply
        ? 'WAITING_ON_CUSTOMER'
        : 'INTERNAL_INACTIVITY_STALLED';
      results.push({
        dealId: d.dealId,
        inactiveHours,
        thresholdHours,
        waitingStateClassification,
        explanationFa: d.awaitingExternalCustomerReply
          ? `پرونده «${d.dealId}» به مدت ${inactiveHours} ساعت در مرحله «${d.stage}» منتظر پاسخ مشتری است (آستانه: ${thresholdHours} ساعت).`
          : `هشدار رکود داخلی: پرونده «${d.dealId}» به مدت ${inactiveHours} ساعت بدون اقدام مشاور در مرحله «${d.stage}» متوقف مانده است.`,
      });
    }
  }
  return results;
}
export interface CrmMergeableRecord {
  recordId: string; workspaceId: string; fullName: string; phone: string; email: string | null; assignedAgentId: string | null;
  interestedListingIds: string[]; interactionIds: string[]; taskIds: string[]; visitIds: string[]; activeDealIds: string[];
}
export interface DuplicateCandidateSignal {
  primaryRecordId: string;
  secondaryRecordId: string;
  confidence: 'EXACT_IDENTIFIER_MATCH' | 'FUZZY_REVIEW_ONLY';
  matchedSignalsFa: string[];
  conflictingFields: string[];
  autoMergePermitted: false;
}
export function evaluateAgencyDuplicateLeadSignals(params: {
  workspaceId: string;
  records: readonly CrmMergeableRecord[];
}): DuplicateCandidateSignal[] {
  const scoped = params.records.filter((r) => r.workspaceId === params.workspaceId);
  const signals: DuplicateCandidateSignal[] = [];
  for (let i = 0; i < scoped.length; i++) {
    for (let j = i + 1; j < scoped.length; j++) {
      const a = scoped[i];
      const b = scoped[j];
      const phoneA = normalizeCrmSearchToken(a.phone).replace(/\D+/g, '');
      const phoneB = normalizeCrmSearchToken(b.phone).replace(/\D+/g, '');
      const emailA = a.email ? normalizeCrmSearchToken(a.email) : '';
      const emailB = b.email ? normalizeCrmSearchToken(b.email) : '';
      const nameA = normalizeCrmSearchToken(a.fullName);
      const nameB = normalizeCrmSearchToken(b.fullName);
      const matchedSignalsFa: string[] = [];
      let isExact = false;
      if (phoneA && phoneA === phoneB) {
        matchedSignalsFa.push('تطابق قطعی شماره تماس نرمال‌سازی‌شده');
        isExact = true;
      }
      if (emailA && emailA === emailB) {
        matchedSignalsFa.push('تطابق قطعی نشانی ایمیل');
        isExact = true;
      }
      if (nameA && nameB && (nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA))) {
        matchedSignalsFa.push('تشابه نام مخاطب (نیازمند بررسی انسانی)');
      }
      if (matchedSignalsFa.length > 0) {
        const conflictingFields: string[] = [];
        if (phoneA !== phoneB) conflictingFields.push('phone');
        if (emailA && emailB && emailA !== emailB) conflictingFields.push('email');
        if (a.assignedAgentId !== b.assignedAgentId) conflictingFields.push('assignedAgentId');
        signals.push({
          primaryRecordId: a.recordId,
          secondaryRecordId: b.recordId,
          confidence: isExact ? 'EXACT_IDENTIFIER_MATCH' : 'FUZZY_REVIEW_ONLY',
          matchedSignalsFa,
          conflictingFields,
          autoMergePermitted: false,
        });
      }
    }
  }
  return signals;
}
export function executeControlledCrmRecordMerge(
  params: {
    actorWorkspaceId: string;
    actorAuthorized: boolean;
    survivingRecord: CrmMergeableRecord;
    mergedRecord: CrmMergeableRecord;
    fieldResolutionOverrides?: Partial<Pick<CrmMergeableRecord, 'fullName' | 'phone' | 'email' | 'assignedAgentId'>>;
    nowMs: number;
  },
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
): {
  succeeded: boolean;
  errorCode: 'NONE' | 'UNAUTHORIZED_OR_CROSS_WORKSPACE' | 'SAME_RECORD_ERROR';
  canonicalRecord: CrmMergeableRecord | null;
  fieldProvenance: Record<string, string>;
  rollbackSnapshot: { survivingBefore: CrmMergeableRecord; mergedBefore: CrmMergeableRecord } | null;
} {
  const { actorWorkspaceId, actorAuthorized, survivingRecord, mergedRecord, fieldResolutionOverrides, nowMs } = params;
  if (
    !actorAuthorized ||
    survivingRecord.workspaceId !== actorWorkspaceId ||
    mergedRecord.workspaceId !== actorWorkspaceId
  ) {
    return {
      succeeded: false,
      errorCode: 'UNAUTHORIZED_OR_CROSS_WORKSPACE',
      canonicalRecord: null,
      fieldProvenance: {},
      rollbackSnapshot: null,
    };
  }
  if (survivingRecord.recordId === mergedRecord.recordId) {
    return {
      succeeded: false,
      errorCode: 'SAME_RECORD_ERROR',
      canonicalRecord: null,
      fieldProvenance: {},
      rollbackSnapshot: null,
    };
  }
  const dedupStrings = (arr1: string[], arr2: string[]) => Array.from(new Set([...arr1, ...arr2]));
  const canonicalRecord: CrmMergeableRecord = {
    recordId: survivingRecord.recordId,
    workspaceId: survivingRecord.workspaceId,
    fullName: fieldResolutionOverrides?.fullName ?? survivingRecord.fullName,
    phone: fieldResolutionOverrides?.phone ?? survivingRecord.phone,
    email: fieldResolutionOverrides?.email !== undefined ? fieldResolutionOverrides.email : survivingRecord.email ?? mergedRecord.email,
    assignedAgentId:
      fieldResolutionOverrides?.assignedAgentId !== undefined
        ? fieldResolutionOverrides.assignedAgentId
        : survivingRecord.assignedAgentId ?? mergedRecord.assignedAgentId,
    interestedListingIds: dedupStrings(survivingRecord.interestedListingIds, mergedRecord.interestedListingIds),
    interactionIds: dedupStrings(survivingRecord.interactionIds, mergedRecord.interactionIds),
    taskIds: dedupStrings(survivingRecord.taskIds, mergedRecord.taskIds),
    visitIds: dedupStrings(survivingRecord.visitIds, mergedRecord.visitIds),
    activeDealIds: dedupStrings(survivingRecord.activeDealIds, mergedRecord.activeDealIds),
  };
  return {
    succeeded: true,
    errorCode: 'NONE',
    canonicalRecord,
    fieldProvenance: {
      mergedFromRecordId: mergedRecord.recordId,
      mergedAtIso: new Date(nowMs).toISOString(),
      phoneSource: fieldResolutionOverrides?.phone ? 'EXPLICIT_OVERRIDE' : survivingRecord.recordId,
      preservedInteractionsCount: String(canonicalRecord.interactionIds.length),
      preservedDealsCount: String(canonicalRecord.activeDealIds.length),
      displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
      mergedDealBenchmarkIntlText: formatMillionTomanAsIntlCurrency(5000, intlCurrency),
    },
    rollbackSnapshot: {
      survivingBefore: { ...survivingRecord },
      mergedBefore: { ...mergedRecord },
    },
  };
}
/**
 * Prompts 1240, 1241, 1242 & 1243: Communication Channel Registry, Consent Management,
 * Idempotent Deduplication & Provider Callback Delivery State Tracking
 */
export type AgencyCommChannelType = 'SMS' | 'IN_APP' | 'EMAIL' | 'PHONE';
export interface AgencyChannelConfigRecord {
  channelId: string;
  workspaceId: string;
  channelType: AgencyCommChannelType;
  enabled: boolean;
  hasServerSideSecretReference: boolean;
  status: 'READY' | 'MISCONFIGURED' | 'DISABLED';
}
export interface CustomerChannelConsentRecord {
  customerId: string;
  workspaceId: string;
  channelType: AgencyCommChannelType;
  status: 'GRANTED' | 'WITHDRAWN' | 'UNKNOWN';
  source: 'EXPLICIT_FORM_OPT_IN' | 'CONTRACT_CLAUSE' | 'USER_WITHDRAWAL' | 'UNSPECIFIED';
  updatedAtMs: number;
}
export interface TrackedOutboundMessage {
  messageId: string;
  workspaceId: string;
  customerId: string;
  channelType: AgencyCommChannelType;
  idempotencyKey: string;
  providerMessageId: string | null;
  deliveryState: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'UNKNOWN';
  sentAtMs: number;
  updatedAtMs: number;
}
export function evaluateOutboundMessageEligibilityAndIdempotency(params: {
  workspaceId: string;
  customerId: string;
  channel: AgencyChannelConfigRecord;
  consent: CustomerChannelConsentRecord | null;
  idempotencyKey: string;
  existingMessages: readonly TrackedOutboundMessage[];
  nowMs: number;
}): {
  canDispatch: boolean;
  deduplicatedExistingMessage: TrackedOutboundMessage | null;
  blockReason:
    | 'ALLOWED'
    | 'DUPLICATE_IDEMPOTENCY_KEY'
    | 'CONSENT_NOT_GRANTED'
    | 'CHANNEL_UNAVAILABLE_OR_MISCONFIGURED'
    | 'CROSS_WORKSPACE_MISMATCH';
  explanationFa: string;
} {
  const { workspaceId, customerId, channel, consent, idempotencyKey, existingMessages } = params;
  if (channel.workspaceId !== workspaceId || (consent && consent.workspaceId !== workspaceId)) {
    return {
      canDispatch: false,
      deduplicatedExistingMessage: null,
      blockReason: 'CROSS_WORKSPACE_MISMATCH',
      explanationFa: 'عدم تطابق فضای کاری آژانس برای کانال یا پرونده رضایت مشتری.',
    };
  }
  const existing = existingMessages.find(
    (m) => m.workspaceId === workspaceId && m.idempotencyKey === idempotencyKey
  );
  if (existing) {
    return {
      canDispatch: false,
      deduplicatedExistingMessage: existing,
      blockReason: 'DUPLICATE_IDEMPOTENCY_KEY',
      explanationFa: `جلوگیری از ارسال تکراری: پیام با کلید یکتای «${idempotencyKey}» قبلاً در وضعیت «${existing.deliveryState}» ثبت شده است.`,
    };
  }
  if (!channel.enabled || channel.status !== 'READY' || !channel.hasServerSideSecretReference) {
    return {
      canDispatch: false,
      deduplicatedExistingMessage: null,
      blockReason: 'CHANNEL_UNAVAILABLE_OR_MISCONFIGURED',
      explanationFa: `کانال ارتباطی «${channel.channelType}» غیرفعال است یا تنظیمات امنیتی سرور آن تکمیل نشده است.`,
    };
  }
  if (!consent || consent.customerId !== customerId || consent.status !== 'GRANTED') {
    return {
      canDispatch: false,
      deduplicatedExistingMessage: null,
      blockReason: 'CONSENT_NOT_GRANTED',
      explanationFa: `ارسال مسدود شد: رضایت صریح و معتبر مشتری برای کانال «${channel.channelType}» ثبت نشده یا لغو شده است (${consent?.status || 'UNKNOWN'}).`,
    };
  }
  return {
    canDispatch: true,
    deduplicatedExistingMessage: null,
    blockReason: 'ALLOWED',
    explanationFa: 'مجوز کانال، رضایت مشتری و یکتایی پیام تأیید شد.',
  };
}
export function reconcileProviderDeliveryCallback(params: {
  message: TrackedOutboundMessage;
  providerMessageId: string;
  reportedState: TrackedOutboundMessage['deliveryState'];
  callbackTimestampMs: number;
}): TrackedOutboundMessage {
  const { message, providerMessageId, reportedState, callbackTimestampMs } = params;
  if (
    (message.deliveryState === 'DELIVERED' && (reportedState === 'SENT' || reportedState === 'QUEUED' || reportedState === 'UNKNOWN')) ||
    (message.deliveryState === 'SENT' && (reportedState === 'QUEUED' || reportedState === 'UNKNOWN'))
  ) {
    return message;
  }
  return {
    ...message,
    providerMessageId: message.providerMessageId || providerMessageId,
    deliveryState: reportedState,
    updatedAtMs: Number.isFinite(callbackTimestampMs) ? Math.max(message.updatedAtMs, callbackTimestampMs) : message.updatedAtMs,
  };
}