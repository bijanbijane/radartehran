/** @file src/features/services/services/serviceWorkflowService.ts — Pure + Persisted Service Request, Proposal, Review, Complaint & Provider Onboarding Engine */
import { sanitizeInput } from '../../../utils/security';
import {
  isValidIranianContactPhone,
  parseLocalizedNumber,
} from '../../../utils/forms/formInputHelpers';
import { CANONICAL_SERVICE_DEFINITIONS, mapCanonicalToLegacyCategory } from './serviceTaxonomyAndVerification';
import type {
  ServiceCanonicalCategory,
  ServiceDeliveryMode,
  ServiceProposalRecord,
  ServiceRequestRecord,
  ServiceRequestStatus,
} from '../types/service.types';

const SERVICE_REQUESTS_KEY = 'radar_service_requests_v1';
const SERVICE_REQUEST_DRAFT_KEY = 'radar_service_request_draft_v1';
const SERVICE_PROPOSALS_KEY = 'radar_service_proposals_v1';

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore quota failures */ }
}

export interface ServiceRequestDraftPayload {
  canonicalCategory: ServiceCanonicalCategory;
  serviceId: string;
  neighborhoodName: string;
  propertyTypeFa: string;
  areaSqm: string;
  budgetRangeFa: string;
  preferredScheduleFa: string;
  deliveryMode: ServiceDeliveryMode;
  contactPolicy: 'platform_only' | 'shared_after_approval';
  requesterName: string;
  requesterPhone: string;
  projectSummary: string;
  categorySpecificDetails: Record<string, string>;
  contactConsentAccepted: boolean;
  savedAtIso?: string;
}

export function validateServiceWizardStep(
  draft: ServiceRequestDraftPayload,
  stepIndex: number,
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (stepIndex === 0 && !draft.canonicalCategory) {
    errors.canonicalCategory = 'لطفاً دسته خدمت موردنظر را انتخاب کنید.';
  }
  if (stepIndex === 1 && !draft.serviceId) {
    errors.serviceId = 'لطفاً خدمت دقیق موردنظر را انتخاب کنید.';
  }
  if (stepIndex === 2 && draft.neighborhoodName.trim().length < 2) {
    errors.neighborhoodName = 'لطفاً نام محله را با حداقل ۲ کاراکتر وارد کنید.';
  }
  if (stepIndex === 3 && draft.areaSqm.trim().length > 0) {
    const parsedArea = parseLocalizedNumber(draft.areaSqm);
    if (!Number.isFinite(parsedArea) || parsedArea < 10 || parsedArea > 50000) {
      errors.areaSqm = 'متراژ ملک باید عددی معتبر بین ۱۰ تا ۵۰٬۰۰۰ متر مربع باشد.';
    }
  }
  if (stepIndex === 4 && draft.projectSummary.trim().length < 8) {
    errors.projectSummary = 'لطفاً شرح نیاز را حداقل در ۸ کاراکتر توضیح دهید.';
  }
  if (stepIndex === 5 && draft.budgetRangeFa.trim().length === 0 && draft.preferredScheduleFa.trim().length === 0) {
    errors.budgetRangeFa = 'حداقل بازه بودجه یا زمان مطلوب را مشخص کنید.';
  }
  if (stepIndex === 6) {
    if (draft.requesterName.trim().length < 2) {
      errors.requesterName = 'لطفاً نام متقاضی را با حداقل ۲ کاراکتر وارد کنید.';
    }
    if (!isValidIranianContactPhone(draft.requesterPhone)) {
      errors.requesterPhone = 'شماره تماس معتبر موبایل (۰۹...) یا ثابت با کد شهر وارد کنید.';
    }
    if (!draft.contactConsentAccepted) {
      errors.contactConsentAccepted = 'تایید حریم خصوصی و ارسال اطلاعات تماس پیش از ثبت الزامی است.';
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateAllServiceWizardSteps(
  draft: ServiceRequestDraftPayload,
): { valid: boolean; firstInvalidStep: number | null; errors: Record<string, string> } {
  for (let idx = 0; idx <= 6; idx += 1) {
    const res = validateServiceWizardStep(draft, idx);
    if (!res.valid) {
      return { valid: false, firstInvalidStep: idx, errors: res.errors };
    }
  }
  return { valid: true, firstInvalidStep: null, errors: {} };
}

export function loadServiceRequestDraft(): ServiceRequestDraftPayload | null {
  return readJson<ServiceRequestDraftPayload | null>(SERVICE_REQUEST_DRAFT_KEY, null);
}

export function saveServiceRequestDraft(draft: ServiceRequestDraftPayload): ServiceRequestDraftPayload {
  const stamped = { ...draft, savedAtIso: new Date().toISOString() };
  writeJson(SERVICE_REQUEST_DRAFT_KEY, stamped);
  return stamped;
}

export function clearServiceRequestDraft(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(SERVICE_REQUEST_DRAFT_KEY);
}

export function assertServiceRequestOwnership(
  request: ServiceRequestRecord,
  callerUserId: string,
): { allowed: boolean; reasonFa?: string } {
  if (!callerUserId || request.ownerUserId !== callerUserId) {
    return { allowed: false, reasonFa: 'دسترسی غیرمجاز: این درخواست متعلق به کاربر دیگری است.' };
  }
  return { allowed: true };
}

export function loadServiceRequests(callerUserId?: string): ServiceRequestRecord[] {
  const all = readJson<ServiceRequestRecord[]>(SERVICE_REQUESTS_KEY, []);
  if (!callerUserId) return all;
  return all.filter((r) => r.ownerUserId === callerUserId);
}

export interface CreateServiceRequestInput {
  ownerUserId?: string;
  providerId: string;
  providerName: string;
  serviceId?: string;
  category?: ServiceRequestRecord['category'];
  canonicalCategory?: ServiceCanonicalCategory;
  neighborhoodName: string;
  propertyTypeFa?: string;
  areaSqm?: number;
  budgetRangeFa?: string;
  preferredScheduleFa?: string;
  deliveryMode?: ServiceDeliveryMode;
  contactPolicy?: 'platform_only' | 'shared_after_approval';
  requesterName: string;
  requesterPhone: string;
  projectSummary: string;
  categorySpecificDetails?: Record<string, string>;
  contactConsentAccepted: boolean;
}

export function submitServiceRequest(input: CreateServiceRequestInput): ServiceRequestRecord {
  const nowIso = new Date().toISOString();
  const canonicalCategory: ServiceCanonicalCategory = input.canonicalCategory || 'advisory';
  const def = CANONICAL_SERVICE_DEFINITIONS.find((d) => d.serviceId === input.serviceId)
    || CANONICAL_SERVICE_DEFINITIONS.find((d) => d.category === canonicalCategory)
    || CANONICAL_SERVICE_DEFINITIONS[0];

  const created: ServiceRequestRecord = {
    id: `srv-req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ownerUserId: input.ownerUserId || 'local-user',
    providerId: input.providerId,
    providerName: sanitizeInput(input.providerName, 80),
    serviceId: def.serviceId,
    category: input.category || mapCanonicalToLegacyCategory(canonicalCategory),
    canonicalCategory,
    neighborhoodName: sanitizeInput(input.neighborhoodName, 60),
    propertyTypeFa: sanitizeInput(input.propertyTypeFa || 'آپارتمان مسکونی', 40),
    areaSqm: typeof input.areaSqm === 'number' && input.areaSqm > 0 ? input.areaSqm : undefined,
    budgetRangeFa: sanitizeInput(input.budgetRangeFa || 'توافقی طبق تعرفه', 60),
    preferredScheduleFa: sanitizeInput(input.preferredScheduleFa || 'در اولین فرصت', 60),
    deliveryMode: input.deliveryMode || 'hybrid',
    contactPolicy: input.contactPolicy || 'shared_after_approval',
    requesterName: sanitizeInput(input.requesterName, 80),
    requesterPhone: sanitizeInput(input.requesterPhone, 20),
    projectSummary: sanitizeInput(input.projectSummary, 500),
    categorySpecificDetails: input.categorySpecificDetails,
    contactConsentAccepted: Boolean(input.contactConsentAccepted),
    status: 'submitted',
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const next = [created, ...loadServiceRequests()].slice(0, 40);
  writeJson(SERVICE_REQUESTS_KEY, next);
  clearServiceRequestDraft();
  return created;
}

const ALLOWED_TRANSITIONS: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['matching', 'proposals_received', 'cancelled'],
  matching: ['proposals_received', 'cancelled'],
  proposals_received: ['reviewing', 'provider_selected', 'cancelled'],
  reviewing: ['provider_selected', 'cancelled'],
  provider_selected: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['closed'],
  cancelled: ['closed'],
  closed: [],
};

export function transitionServiceRequestStatus(
  requestId: string,
  nextStatus: ServiceRequestStatus,
  callerUserId = 'local-user',
): { ok: boolean; request?: ServiceRequestRecord; errorFa?: string } {
  const all = loadServiceRequests();
  const idx = all.findIndex((r) => r.id === requestId);
  if (idx < 0) return { ok: false, errorFa: 'درخواست موردنظر یافت نشد.' };
  const target = all[idx];
  const own = assertServiceRequestOwnership(target, callerUserId);
  if (!own.allowed) return { ok: false, errorFa: own.reasonFa };
  if (!ALLOWED_TRANSITIONS[target.status].includes(nextStatus)) {
    return { ok: false, errorFa: `تغییر وضعیت از «${target.status}» به «${nextStatus}» مجاز نیست.` };
  }
  const updated: ServiceRequestRecord = {
    ...target,
    status: nextStatus,
    updatedAtIso: new Date().toISOString(),
  };
  all[idx] = updated;
  writeJson(SERVICE_REQUESTS_KEY, all);
  return { ok: true, request: updated };
}

export function loadServiceProposals(requestId?: string, callerUserId?: string): ServiceProposalRecord[] {
  const all = readJson<ServiceProposalRecord[]>(SERVICE_PROPOSALS_KEY, []);
  const byReq = requestId ? all.filter((p) => p.requestId === requestId) : all;
  if (!callerUserId) return byReq;
  const ownedReqIds = new Set(loadServiceRequests(callerUserId).map((r) => r.id));
  return byReq.filter((p) => ownedReqIds.has(p.requestId));
}

export function submitServiceProposal(proposal: Omit<ServiceProposalRecord, 'proposalId' | 'createdAtIso'>): ServiceProposalRecord {
  const created: ServiceProposalRecord = {
    ...proposal,
    proposalId: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAtIso: new Date().toISOString(),
  };
  const next = [created, ...loadServiceProposals()].slice(0, 80);
  writeJson(SERVICE_PROPOSALS_KEY, next);

  // Move request to proposals_received if still submitted/matching
  const allReqs = loadServiceRequests();
  const rIdx = allReqs.findIndex((r) => r.id === proposal.requestId);
  if (rIdx >= 0 && (allReqs[rIdx].status === 'submitted' || allReqs[rIdx].status === 'matching')) {
    allReqs[rIdx] = { ...allReqs[rIdx], status: 'proposals_received', updatedAtIso: new Date().toISOString() };
    writeJson(SERVICE_REQUESTS_KEY, allReqs);
  }
  return created;
}

export function updateServiceProposalStatus(
  proposalId: string,
  action: 'shortlisted' | 'accepted' | 'rejected',
  callerUserId = 'local-user',
): { ok: boolean; proposals: ServiceProposalRecord[]; errorFa?: string } {
  const proposals = loadServiceProposals();
  const target = proposals.find((p) => p.proposalId === proposalId);
  if (!target) return { ok: false, proposals, errorFa: 'پیشنهاد یافت نشد.' };

  const req = loadServiceRequests().find((r) => r.id === target.requestId);
  if (!req) return { ok: false, proposals, errorFa: 'درخواست مرتبط یافت نشد.' };
  const own = assertServiceRequestOwnership(req, callerUserId);
  if (!own.allowed) return { ok: false, proposals, errorFa: own.reasonFa };

  const next = proposals.map((p) => {
    if (p.proposalId === proposalId) return { ...p, status: action };
    if (action === 'accepted' && p.requestId === target.requestId && p.status !== 'rejected') {
      return { ...p, status: 'rejected' as const };
    }
    return p;
  });
  writeJson(SERVICE_PROPOSALS_KEY, next);

  if (action === 'accepted') {
    const allReqs = loadServiceRequests();
    const rIdx = allReqs.findIndex((r) => r.id === target.requestId);
    if (rIdx >= 0) {
      allReqs[rIdx] = {
        ...allReqs[rIdx],
        providerId: target.providerId,
        providerName: target.providerName,
        status: 'provider_selected',
        updatedAtIso: new Date().toISOString(),
      };
      writeJson(SERVICE_REQUESTS_KEY, allReqs);
    }
  }
  return { ok: true, proposals: next };
}

export {
  loadProviderReviews,
  submitVerifiedProviderReview,
  loadServiceComplaints,
  submitServiceComplaint,
  loadProviderSubmissions,
  submitProviderOnboarding,
  reviewProviderSubmission,
  trackServiceEvent,
} from './serviceReviewsAndOnboardingService';

