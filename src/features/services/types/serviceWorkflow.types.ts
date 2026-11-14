/** @file src/features/services/types/serviceWorkflow.types.ts — Service Request, Proposal, Review, Dispute & Onboarding Types + Labels */
import type {
  ServiceCanonicalCategory,
  ServiceCategory,
  ServiceCoverageScope,
  ServiceDeliveryMode,
  ServicePricingMode,
} from './service.types';

export type ServiceRequestStatus =
  | 'draft'
  | 'submitted'
  | 'matching'
  | 'proposals_received'
  | 'reviewing'
  | 'provider_selected'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'closed';

export interface ServiceRequestRecord {
  id: string;
  ownerUserId: string;
  providerId: string;
  providerName: string;
  serviceId: string;
  category: Exclude<ServiceCategory, 'all'>;
  canonicalCategory: ServiceCanonicalCategory;
  neighborhoodName: string;
  propertyTypeFa: string;
  areaSqm?: number;
  budgetRangeFa: string;
  preferredScheduleFa: string;
  deliveryMode: ServiceDeliveryMode;
  contactPolicy: 'platform_only' | 'shared_after_approval';
  requesterName: string;
  requesterPhone: string;
  projectSummary: string;
  categorySpecificDetails?: Record<string, string>;
  contactConsentAccepted: boolean;
  status: ServiceRequestStatus;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ServiceProposalRecord {
  proposalId: string;
  requestId: string;
  providerId: string;
  providerName: string;
  providerVerificationSummaryFa: string;
  offeringTitleFa: string;
  priceMode: ServicePricingMode;
  priceDisplayFa: string;
  estimatedAmountMillion: number | null;
  timelineFa: string;
  scopeSummaryFa: string;
  includesFa: string;
  excludesFa: string;
  status: 'submitted' | 'shortlisted' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
  createdAtIso: string;
}

export interface ProviderReviewRecord {
  reviewId: string;
  requestId: string;
  providerId: string;
  reviewerUid: string;
  reviewerLabelFa: string;
  overallScore: 1 | 2 | 3 | 4 | 5;
  qualityScore: number;
  timelineScore: number;
  transparencyScore: number;
  commentFa: string;
  verifiedRequestTied: true;
  status: 'published' | 'flagged_audit';
  createdAtIso: string;
}

export interface ServiceComplaintRecord {
  complaintId: string;
  requestId?: string;
  providerId: string;
  complainantUid: string;
  reason: 'misleading_credential' | 'fee_dispute' | 'unresponsive' | 'misconduct' | 'other';
  details: string;
  status: 'submitted' | 'under_review' | 'resolved';
  createdAtIso: string;
}

export interface ServiceDisputeRecord {
  id: string;
  requestId?: string;
  providerId: string;
  complainantUid?: string;
  reason: 'misleading_credential' | 'fee_dispute' | 'unresponsive' | 'misconduct' | 'other';
  details: string;
  status?: 'submitted' | 'under_review' | 'resolved';
  createdAtIso: string;
}

export interface ProviderOnboardingSubmission {
  submissionId: string;
  ownerUserId: string;
  displayName: string;
  entityKind: 'agency' | 'specialist' | 'company';
  canonicalCategory: ServiceCanonicalCategory;
  serviceId: string;
  neighborhoodId: number;
  neighborhoodName: string;
  zone: string;
  phone: string;
  specialtyFa: string;
  pricingMode: ServicePricingMode;
  priceDisplayFa: string;
  coverageScope: ServiceCoverageScope;
  coveredAreaNames: string[];
  remoteAvailable: boolean;
  licenseClaimedFa: string;
  portfolioSummaryFa: string;
  moderationStatus: 'pending' | 'verified' | 'revision_required' | 'rejected' | 'suspended';
  moderatorNoteFa: string;
  createdAtIso: string;
}

export const SERVICE_CATEGORY_LABELS_FA: Record<ServiceCategory, string> = {
  all: 'همه خدمات',
  brokerage: 'مشاوره و کارگزاری املاک',
  inspection: 'بازدید فنی و کارشناسی ملک',
  legal_valuation: 'حقوقی، قرارداد و ارزیابی',
  architecture: 'معماری و طراحی داخلی',
  contractor: 'پیمانکاری و ساخت‌وساز',
  renovation_repair: 'بازسازی و تعمیرات',
  materials: 'مصالح و تجهیزات ساختمان',
};

export const CANONICAL_CATEGORY_LABELS_FA: Record<ServiceCanonicalCategory | 'all', string> = {
  all: 'همه رسته‌های تخصصی',
  advisory: 'مشاوره خرید، فروش و اجاره',
  legal: 'حقوقی و تنظیم قرارداد',
  valuation: 'ارزش‌گذاری و کارشناسی قیمت',
  inspection: 'بازرسی فنی و تأسیسات',
  architecture: 'معماری و طراحی داخلی',
  renovation: 'بازسازی، پیمانکاری و اجرا',
  mortgage_finance: 'تأمین مالی و وام مسکن',
  moving_settlement: 'اسباب‌کشی و استقرار',
  documentation_municipality: 'امور ثبتی و شهرداری (R122)',
  property_management: 'مدیریت ساختمان و املاک',
};
