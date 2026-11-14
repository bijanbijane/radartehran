/** @file src/features/services/services/serviceReviewsAndOnboardingService.ts — Service Reviews, Complaints, Onboarding & Analytics */
import { sanitizeInput } from '../../../utils/security';
import type {
  ProviderOnboardingSubmission,
  ProviderReviewRecord,
  ServiceComplaintRecord,
  ServiceRequestRecord,
  ServiceRequestStatus,
} from '../types/service.types';

const SERVICE_REQUESTS_KEY = 'radar_service_requests_v1';
const SERVICE_REVIEWS_KEY = 'radar_service_reviews_v1';
const SERVICE_DISPUTES_KEY = 'radar_service_disputes_v1';
const PROVIDER_SUBMISSIONS_KEY = 'radar_service_provider_submissions_v1';

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

export function loadProviderReviews(providerId?: string): ProviderReviewRecord[] {
  const all = readJson<ProviderReviewRecord[]>(SERVICE_REVIEWS_KEY, []);
  return providerId ? all.filter((r) => r.providerId === providerId) : all;
}

export function submitVerifiedProviderReview(input: {
  requestId: string;
  reviewerUid: string;
  reviewerLabelFa: string;
  overallScore: 1 | 2 | 3 | 4 | 5;
  qualityScore: number;
  timelineScore: number;
  transparencyScore: number;
  commentFa: string;
}): { ok: boolean; review?: ProviderReviewRecord; errorFa?: string } {
  const req = readJson<ServiceRequestRecord[]>(SERVICE_REQUESTS_KEY, []).find((r) => r.id === input.requestId);
  if (!req) return { ok: false, errorFa: 'درخواست معتبر برای ثبت نظر یافت نشد.' };
  if (!input.reviewerUid || req.ownerUserId !== input.reviewerUid) {
    return { ok: false, errorFa: 'دسترسی غیرمجاز: این درخواست متعلق به کاربر دیگری است.' };
  }

  const eligibleStatuses: ServiceRequestStatus[] = ['provider_selected', 'in_progress', 'completed', 'closed'];
  if (!eligibleStatuses.includes(req.status)) {
    return { ok: false, errorFa: 'ثبت نظر تنها پس از انتخاب متخصص یا انجام خدمت ممکن است.' };
  }
  if (input.commentFa.trim().length < 8) {
    return { ok: false, errorFa: 'متن بازخورد باید حداقل ۸ کاراکتر باشد.' };
  }

  const review: ProviderReviewRecord = {
    reviewId: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    requestId: req.id,
    providerId: req.providerId,
    reviewerUid: input.reviewerUid,
    reviewerLabelFa: sanitizeInput(input.reviewerLabelFa || 'کاربر رادار', 50),
    overallScore: input.overallScore,
    qualityScore: Math.min(5, Math.max(1, input.qualityScore)),
    timelineScore: Math.min(5, Math.max(1, input.timelineScore)),
    transparencyScore: Math.min(5, Math.max(1, input.transparencyScore)),
    commentFa: sanitizeInput(input.commentFa, 500),
    verifiedRequestTied: true,
    status: 'published',
    createdAtIso: new Date().toISOString(),
  };

  const next = [review, ...loadProviderReviews()].slice(0, 100);
  writeJson(SERVICE_REVIEWS_KEY, next);
  return { ok: true, review };
}

export function loadServiceComplaints(): ServiceComplaintRecord[] {
  return readJson<ServiceComplaintRecord[]>(SERVICE_DISPUTES_KEY, []);
}

export function submitServiceComplaint(input: {
  providerId: string;
  requestId?: string;
  complainantUid: string;
  reason: ServiceComplaintRecord['reason'];
  details: string;
}): ServiceComplaintRecord {
  const created: ServiceComplaintRecord = {
    complaintId: `srv-disp-${Date.now()}`,
    requestId: input.requestId,
    providerId: input.providerId,
    complainantUid: input.complainantUid || 'local-user',
    reason: input.reason,
    details: sanitizeInput(input.details, 500),
    status: 'submitted',
    createdAtIso: new Date().toISOString(),
  };
  const next = [created, ...loadServiceComplaints()].slice(0, 40);
  writeJson(SERVICE_DISPUTES_KEY, next);
  return created;
}

export function loadProviderSubmissions(): ProviderOnboardingSubmission[] {
  return readJson<ProviderOnboardingSubmission[]>(PROVIDER_SUBMISSIONS_KEY, []);
}

export function submitProviderOnboarding(
  input: Omit<ProviderOnboardingSubmission, 'submissionId' | 'moderationStatus' | 'moderatorNoteFa' | 'createdAtIso'>,
): ProviderOnboardingSubmission {
  const created: ProviderOnboardingSubmission = {
    ...input,
    displayName: sanitizeInput(input.displayName, 80),
    phone: sanitizeInput(input.phone, 20),
    specialtyFa: sanitizeInput(input.specialtyFa, 200),
    portfolioSummaryFa: sanitizeInput(input.portfolioSummaryFa, 300),
    submissionId: `prov-sub-${Date.now()}`,
    moderationStatus: 'pending',
    moderatorNoteFa: 'در صف بررسی هویت و پروانه تخصصی توسط تیم رادار',
    createdAtIso: new Date().toISOString(),
  };
  const next = [created, ...loadProviderSubmissions()].slice(0, 30);
  writeJson(PROVIDER_SUBMISSIONS_KEY, next);
  return created;
}

export function reviewProviderSubmission(
  submissionId: string,
  moderationStatus: ProviderOnboardingSubmission['moderationStatus'],
  moderatorNoteFa: string,
): ProviderOnboardingSubmission[] {
  const next = loadProviderSubmissions().map((s) =>
    s.submissionId === submissionId
      ? { ...s, moderationStatus, moderatorNoteFa: sanitizeInput(moderatorNoteFa, 200) }
      : s,
  );
  writeJson(PROVIDER_SUBMISSIONS_KEY, next);
  return next;
}

export function trackServiceEvent(
  eventName:
    | 'service_category_selected'
    | 'service_provider_viewed'
    | 'service_request_submitted'
    | 'service_proposal_compared'
    | 'service_review_submitted',
  meta: Record<string, string | number | boolean>,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent('radar:services-analytics', {
        detail: { eventName, timestampIso: new Date().toISOString(), ...meta },
      }),
    );
  } catch { /* non-blocking */ }
}
