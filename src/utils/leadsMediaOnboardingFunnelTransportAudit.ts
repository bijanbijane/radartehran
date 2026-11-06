// Prompts 211–215: Real Estate Leads, Image Provenance, First-Run Onboarding, Conversion Funnel & TLS Transport Audit
import crypto from 'node:crypto'; import { cleanIranianMobile, sanitizeInput } from './security';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type InquiryStatus = 'NEW' | 'CONTACTED' | 'VIEWING_SCHEDULED' | 'CLOSED_COMPLETED' | 'WITHDRAWN'; export interface PropertyInquiryRecord {
  inquiryId: string; idempotencyKey: string; listingId: string; listingOwnerUid: string; inquirerUid: string; inquirerPhoneClean: string; messageFa: string; status: InquiryStatus; createdAtMs: number; }
export class RealEstateInquiryAndLeadGuard { private readonly inquiriesById = new Map<string, PropertyInquiryRecord>(); private readonly idempotencyIndex = new Map<string, string>(); private readonly hourlyCountByUser = new Map<string, number>();
  static readonly MAX_INQUIRIES_PER_HOUR = 8; submitInquiry(input: { inquiryId: string; idempotencyKey: string; inquirerUid: string | null; inquirerSuspended: boolean; inquirerPhone: string; messageFa: string;
    listingId: string; listingOwnerUid: string; listingStatus: 'PUBLISHED' | 'DRAFT' | 'PENDING_REVIEW' | 'EXPIRED' | 'SUSPENDED' | 'SOLD'; listingExpiresAtMs: number;
    nowMs: number; }): { accepted: boolean; deduplicated: boolean;
    rejectionReason: string | null; record: PropertyInquiryRecord | null; } { if (!input.inquirerUid || input.inquirerSuspended) {
      return { accepted: false,
        deduplicated: false,
        rejectionReason: 'UNAUTHORIZED_OR_SUSPENDED_INQUIRER',
        record: null,
      };
    }
    const existingId = this.idempotencyIndex.get(`${input.inquirerUid}:${input.idempotencyKey}`);
    if (existingId) {
      return { accepted: true, deduplicated: true, rejectionReason: null, record: this.inquiriesById.get(existingId) ?? null };
    }
    if (input.listingStatus !== 'PUBLISHED' || !Number.isFinite(input.listingExpiresAtMs) || !Number.isFinite(input.nowMs) || input.listingExpiresAtMs <= input.nowMs) {
      return { accepted: false, deduplicated: false, rejectionReason: `INQUIRY_REJECTED_LISTING_NOT_ACTIVE:${input.listingStatus}`, record: null };
    }
    const usedHour = this.hourlyCountByUser.get(input.inquirerUid) ?? 0;
    if (usedHour >= RealEstateInquiryAndLeadGuard.MAX_INQUIRIES_PER_HOUR) {
      return {
        accepted: false,
        deduplicated: false,
        rejectionReason: 'INQUIRY_RATE_LIMIT_EXCEEDED',
        record: null,
      };
    }
    const cleanPhone = cleanIranianMobile(input.inquirerPhone);
    if (!/^09\d{9}$/.test(cleanPhone)) {
      return {
        accepted: false,
        deduplicated: false,
        rejectionReason: 'INVALID_INQUIRER_PHONE',
        record: null,
      };
    }
    const record: PropertyInquiryRecord = {
      inquiryId: input.inquiryId,
      idempotencyKey: input.idempotencyKey,
      listingId: input.listingId,
      listingOwnerUid: input.listingOwnerUid,
      inquirerUid: input.inquirerUid,
      inquirerPhoneClean: cleanPhone,
      messageFa: sanitizeInput(input.messageFa, 400),
      status: 'NEW',
      createdAtMs: input.nowMs,
    };
    if (this.inquiriesById.size >= 2000) { const oldest = this.inquiriesById.keys().next().value; if (oldest !== undefined) this.inquiriesById.delete(oldest); }
    if (this.idempotencyIndex.size >= 2000) { const oldest = this.idempotencyIndex.keys().next().value; if (oldest !== undefined) this.idempotencyIndex.delete(oldest); }
    if (!this.hourlyCountByUser.has(input.inquirerUid) && this.hourlyCountByUser.size >= 5000) { const oldest = this.hourlyCountByUser.keys().next().value; if (oldest !== undefined) this.hourlyCountByUser.delete(oldest); }
    this.inquiriesById.set(record.inquiryId, record);
    this.idempotencyIndex.set(`${input.inquirerUid}:${input.idempotencyKey}`, record.inquiryId);
    this.hourlyCountByUser.set(input.inquirerUid, usedHour + 1);
    return {
      accepted: true,
      deduplicated: false,
      rejectionReason: null,
      record,
    };
  }
  readInquiryForActor(inquiryId: string, actorUid: string): {
    authorized: boolean;
    record: PropertyInquiryRecord | null;
  } {
    const rec = this.inquiriesById.get(inquiryId);
    if (!rec) return { authorized: false, record: null };
    if (rec.listingOwnerUid !== actorUid && rec.inquirerUid !== actorUid) {
      return { authorized: false, record: null };
    }
    return { authorized: true, record: { ...rec } };
  }
}
export interface ListingMediaProvenanceRecord {
  mediaId: string;
  listingId: string;
  uploaderUid: string;
  sha256Hex: string;
  originalObjectKey: string;
  derivativeWebpKey: string;
  uploadedAtMs: number;
  active: boolean;
}
export class MediaProvenanceAndReuseRegistry {
  private readonly mediaById = new Map<string, ListingMediaProvenanceRecord>();
  registerListingImage(input: {
    mediaId: string;
    listingId: string;
    listingOwnerUid: string;
    actorUid: string;
    imageBuffer: Buffer;
    originalObjectKey: string;
    derivativeWebpKey: string;
    existingStorageKeys: ReadonlySet<string>;
    nowMs: number;
  }): {
    registered: boolean;
    rejectionReason: string | null;
    sha256Hex: string;
    reusedAcrossOtherListingIds: string[];
    flaggedForHumanReviewOnly: boolean;
  } {
    const sha256Hex = crypto.createHash('sha256').update(input.imageBuffer).digest('hex');
    if (input.actorUid !== input.listingOwnerUid) {
      return {
        registered: false,
        rejectionReason: 'UNAUTHORIZED_MEDIA_UPLOAD_NOT_LISTING_OWNER',
        sha256Hex,
        reusedAcrossOtherListingIds: [],
        flaggedForHumanReviewOnly: false,
      };
    }
    if (
      !input.existingStorageKeys.has(input.originalObjectKey) ||
      !input.existingStorageKeys.has(input.derivativeWebpKey)
    ) {
      return {
        registered: false,
        rejectionReason: 'MISSING_BACKING_STORAGE_OBJECT_OR_DERIVATIVE',
        sha256Hex,
        reusedAcrossOtherListingIds: [],
        flaggedForHumanReviewOnly: false,
      };
    }
    const reusedAcrossOtherListingIds: string[] = [];
    for (const existing of this.mediaById.values()) {
      if (existing.active && existing.sha256Hex === sha256Hex && existing.listingId !== input.listingId) {
        reusedAcrossOtherListingIds.push(existing.listingId);
      }
    }
    if (!this.mediaById.has(input.mediaId) && this.mediaById.size >= 2000) { const oldest = this.mediaById.keys().next().value; if (oldest !== undefined) this.mediaById.delete(oldest); }
    this.mediaById.set(input.mediaId, {
      mediaId: input.mediaId,
      listingId: input.listingId,
      uploaderUid: input.actorUid,
      sha256Hex,
      originalObjectKey: input.originalObjectKey,
      derivativeWebpKey: input.derivativeWebpKey,
      uploadedAtMs: input.nowMs,
      active: true,
    });
    return {
      registered: true,
      rejectionReason: null,
      sha256Hex,
      reusedAcrossOtherListingIds,
      flaggedForHumanReviewOnly: reusedAcrossOtherListingIds.length > 0,
    };
  }
}
export type ActivationMilestoneCode =
  | 'COMPLETED_FIRST_NEIGHBORHOOD_SEARCH'
  | 'COMPLETED_FIRST_HEDONIC_VALUATION'
  | 'COMPLETED_FIRST_NEIGHBORHOOD_COMPARISON';
export interface FirstRunOnboardingEvaluation {
  requiresRegistrationForPublicExploration: false;
  sampleDataClearlyLabeled: boolean;
  canDismissGuidanceWithoutBlockingUse: true;
  completedActivationMilestones: ActivationMilestoneCode[];
  isUserActivated: boolean;
  displayAreaUnitLabel?: string;
  sampleValuationBenchmarkIntlText?: string;
}
export function evaluateFirstRunOnboardingAndActivation(
  input: {
    completedBackendVerifiedMilestones: ActivationMilestoneCode[];
    rawButtonClicksWithoutCompletion: string[];
    isDemoModeActive: boolean;
    demoBannerVisible: boolean;
  },
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
): FirstRunOnboardingEvaluation {
  const uniqueMilestones = Array.from(new Set(input.completedBackendVerifiedMilestones));
  return {
    requiresRegistrationForPublicExploration: false,
    sampleDataClearlyLabeled: !input.isDemoModeActive || input.demoBannerVisible,
    canDismissGuidanceWithoutBlockingUse: true,
    completedActivationMilestones: uniqueMilestones,
    isUserActivated: uniqueMilestones.length > 0,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    sampleValuationBenchmarkIntlText: formatMillionTomanAsIntlCurrency(8500, intlCurrency),
  };
}
export type FunnelStepName =
  | 'STEP_1_SEARCH'
  | 'STEP_2_VIEW_NEIGHBORHOOD'
  | 'STEP_3_RUN_VALUATION'
  | 'STEP_4_SUBMIT_INQUIRY';
const FUNNEL_STEP_ORDER: Record<FunnelStepName, number> = {
  STEP_1_SEARCH: 1,
  STEP_2_VIEW_NEIGHBORHOOD: 2,
  STEP_3_RUN_VALUATION: 3,
  STEP_4_SUBMIT_INQUIRY: 4,
};
export class AuthoritativeConversionFunnelTracker {
  private readonly recordedEventIds = new Set<string>();
  private readonly userMaxStepReached = new Map<string, number>();
  recordAuthoritativeOutcomeEvent(input: {
    eventId: string;
    actorId: string;
    step: FunnelStepName;
    operationSucceededOnBackend: boolean;
    isSyntheticTestOrBot: boolean;
  }): {
    countedInFunnel: boolean;
    skipReason: string | null;
  } {
    if (input.isSyntheticTestOrBot) {
      return { countedInFunnel: false, skipReason: 'EXCLUDED_SYNTHETIC_OR_BOT_TRAFFIC' };
    }
    if (!input.operationSucceededOnBackend) {
      return { countedInFunnel: false, skipReason: 'IGNORED_FAILED_OPERATION_ATTEMPT' };
    }
    if (this.recordedEventIds.has(input.eventId)) {
      return { countedInFunnel: false, skipReason: 'DEDUPLICATED_RETRY_OR_RERENDER_EVENT' };
    }
    const stepNum = FUNNEL_STEP_ORDER[input.step];
    const currentMax = this.userMaxStepReached.get(input.actorId) ?? 0;
    if (stepNum > 1 && currentMax < stepNum - 1) {
      return { countedInFunnel: false, skipReason: 'OUT_OF_SEQUENCE_FUNNEL_STEP' };
    }
    if (this.recordedEventIds.size >= 5000) { const oldest = this.recordedEventIds.keys().next().value; if (oldest !== undefined) this.recordedEventIds.delete(oldest); }
    this.recordedEventIds.add(input.eventId);
    if (stepNum > currentMax) {
      if (!this.userMaxStepReached.has(input.actorId) && this.userMaxStepReached.size >= 5000) { const oldest = this.userMaxStepReached.keys().next().value; if (oldest !== undefined) this.userMaxStepReached.delete(oldest); }
      this.userMaxStepReached.set(input.actorId, stepNum);
    }
    return { countedInFunnel: true, skipReason: null };
  }
  computeFunnelConversionSummary(): {
    uniqueUsersSearched: number;
    uniqueUsersValuated: number;
    uniqueUsersInquired: number;
    searchToValuationRatePercent: number;
    searchToInquiryRatePercent: number;
  } {
    let searched = 0;
    let valuated = 0;
    let inquired = 0;
    for (const maxStep of this.userMaxStepReached.values()) {
      if (maxStep >= 1) searched += 1;
      if (maxStep >= 3) valuated += 1;
      if (maxStep >= 4) inquired += 1;
    }
    return {
      uniqueUsersSearched: searched,
      uniqueUsersValuated: valuated,
      uniqueUsersInquired: inquired,
      searchToValuationRatePercent: searched > 0 ? Number(((valuated / searched) * 100).toFixed(2)) : 0,
      searchToInquiryRatePercent: searched > 0 ? Number(((inquired / searched) * 100).toFixed(2)) : 0,
    };
  }
}
export interface NetworkTransportInspectionInput {
  configuredExternalEndpoints: readonly string[];
  nodeTlsRejectUnauthorizedEnv?: string;
  cookieSecureFlagEnabledInProd: boolean;
  hstsHeaderValue: string;
}
export interface NetworkTransportAuditReport {
  tlsVerificationStrict: boolean;
  insecureHttpEndpoints: string[];
  hstsProperlyConfigured: boolean;
  cookieTransportSecure: boolean;
  repositoryTransportSafe: boolean;
  externalConsoleChecksRequired: string[];
}
export function auditNetworkTransportAndTlsPosture(
  input: NetworkTransportInspectionInput,
): NetworkTransportAuditReport {
  const tlsVerificationStrict = input.nodeTlsRejectUnauthorizedEnv !== '0';
  const insecureHttpEndpoints = input.configuredExternalEndpoints.filter((url) =>
    url.trim().toLowerCase().startsWith('http://'),
  );
  const hstsProperlyConfigured =
    /max-age=\d+/i.test(input.hstsHeaderValue) &&
    Number((input.hstsHeaderValue.match(/max-age=(\d+)/i)?.[1] ?? '0')) >= 31536000;
  return {
    tlsVerificationStrict, insecureHttpEndpoints, hstsProperlyConfigured, cookieTransportSecure: input.cookieSecureFlagEnabledInProd, repositoryTransportSafe:
      tlsVerificationStrict &&
      insecureHttpEndpoints.length === 0 &&
      hstsProperlyConfigured &&
      input.cookieSecureFlagEnabledInProd, externalConsoleChecksRequired: [
      'Verify Google Cloud Run / custom-domain managed TLS certificate auto-renewal status', 'Verify DNS CAA and DNSSEC records in domain registrar console', ], }; }