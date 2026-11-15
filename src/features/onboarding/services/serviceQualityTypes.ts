/** @file src/features/onboarding/services/serviceQualityTypes.ts — Stage 46 (RT-UI-SERVICE-QUALITY-001) Types & Registries */

export type QualityConceptId = 'feedback' | 'complaint' | 'dispute' | 'technical_review' | 'platform_review' | 'resolution';

export const SIX_QUALITY_CONCEPTS: ReadonlyArray<{ id: QualityConceptId; titleFa: string; showsWhatFa: string; boundaryFa: string }> = [
  { id: 'feedback', titleFa: '۱. بازخورد مشتری', showsWhatFa: 'تجربه گزارش‌شده کاربر', boundaryFa: 'نظر شخصی الزاماً تخلف یا نقص فنی را اثبات نمی‌کند.' },
  { id: 'complaint', titleFa: '۲. شکایت', showsWhatFa: 'اعتراض ثبت‌شده', boundaryFa: 'ثبت شکایت به‌معنای اثبات ادعا یا کاهش خودکار اعتبار نیست.' },
  { id: 'dispute', titleFa: '۳. اختلاف', showsWhatFa: 'وجود موضع متفاوت میان طرفین', boundaryFa: 'نیازمند بررسی مستندات طرفین پیش از تصمیم‌گیری است.' },
  { id: 'technical_review', titleFa: '۴. ارزیابی تخصصی', showsWhatFa: 'بررسی فنی شواهد توسط متخصص دارای صلاحیت', boundaryFa: 'مستقل از تجربه مشتری است و جایگزین تعهد حقوقی نیست.' },
  { id: 'platform_review', titleFa: '۵. رسیدگی داخلی پلتفرم', showsWhatFa: 'بررسی انطباق رفتار با قواعد رادار تهران', boundaryFa: 'در دعاوی قضایی یا داوری رسمی دادگاهی ورود نمی‌کند.' },
  { id: 'resolution', titleFa: '۶. تصمیم یا نتیجه', showsWhatFa: 'نتیجه مستند فرایند رسیدگی', boundaryFa: 'محدود به شواهد و دامنه بررسی است و امکان اعتراض دارد.' },
] as const;

export const STAGE46_DESIGN_COMPONENT_IDS = [
  'QAR-01', 'QAR-02', 'QAR-03', 'QAR-04', 'QAR-05', 'QAR-06', 'QAR-07', 'QAR-08', 'QAR-09', 'QAR-10',
  'QAR-11', 'QAR-12', 'QAR-13', 'QAR-14', 'QAR-15', 'QAR-16', 'QAR-17', 'QAR-18', 'QAR-19', 'QAR-20',
  'QAR-21', 'QAR-22', 'QAR-23', 'QAR-24', 'QAR-25', 'QAR-26', 'QAR-27', 'QAR-28', 'QAR-29', 'QAR-30',
] as const;

export const STAGE46_UX_EVENTS = [
  'service_complaint_started', 'service_complaint_submitted', 'dispute_response_submitted', 'dispute_evidence_uploaded',
  'dispute_review_started', 'independent_review_requested', 'reviewer_assigned', 'review_conflict_declared',
  'quality_assessment_completed', 'corrective_action_created', 'corrective_action_completed',
  'dispute_resolution_recorded', 'dispute_appeal_submitted', 'dispute_reopened', 'dispute_closed',
] as const;

export type DisputeCategoryId =
  | 'کیفیت فنی'
  | 'عدم تطابق با توافق'
  | 'زمان‌بندی و تأخیر'
  | 'اختلاف مالی'
  | 'ارتباطی'
  | 'رفتاری'
  | 'مدارک و گزارش'
  | 'هویت و اعتبار'
  | 'حریم خصوصی'
  | 'سایر';

export type DisputeServiceDomain = 'construction_renovation' | 'technical_inspection' | 'advisory' | 'facilities_repair';

export type DisputeCaseStatus =
  | 'پیش‌نویس'
  | 'ثبت‌شده'
  | 'بررسی اولیه'
  | 'ناقص'
  | 'در انتظار پاسخ طرف مقابل'
  | 'در حال بررسی'
  | 'ارزیابی تخصصی'
  | 'نیازمند اطلاعات تکمیلی'
  | 'پیشنهاد اصلاح'
  | 'حل‌شده با توافق'
  | 'نتیجه‌گیری‌شده'
  | 'در انتظار اعتراض'
  | 'در حال بازبینی'
  | 'مختومه'
  | 'خارج از دامنه';

export type DisputeResolutionOutcome =
  | 'ادعا تأیید شد'
  | 'ادعا تا حدی تأیید شد'
  | 'ادعا تأیید نشد'
  | 'شواهد ناکافی'
  | 'حل‌شده با توافق'
  | 'نیازمند اصلاح'
  | 'ارجاع‌شده'
  | 'خارج از دامنه';

export type EvidenceProcessStatus = 'ثبت‌شده' | 'بررسی‌شده' | 'مؤثر در تصمیم' | 'نامعتبر';

export type DisputeViewerRole = 'applicant' | 'provider' | 'case_manager' | 'independent_reviewer' | 'observer' | 'outsider';

export interface DisputeEvidenceItem {
  evidenceId: string;
  titleFa: string;
  kindFa: 'توافق' | 'صورت‌حساب' | 'رسید پرداخت' | 'تصویر' | 'گزارش فنی' | 'صورت‌جلسه' | 'سایر';
  submittedByRole: 'applicant' | 'provider' | 'reviewer';
  submittedByNameFa: string;
  uploadedAtFa: string;
  relatedTargetFa: string;
  versionLabel: string;
  descriptionFa: string;
  status: EvidenceProcessStatus;
  conflictsWithEvidenceId?: string;
}

export interface DisputeResponseRecord {
  responseId: string;
  authorNameFa: string;
  submittedAtFa: string;
  stance: 'پذیرش کامل موضوع' | 'پذیرش بخشی از موضوع' | 'مخالفت با ادعا' | 'ارائه توضیح' | 'پیشنهاد اصلاح' | 'درخواست بررسی مستقل';
  explanationFa: string;
  cannotDeleteComplaint: true;
}

export interface IndependentReviewerProfile {
  reviewerId: string;
  displayNameFa: string;
  specialtyFa: string;
  verifiedQualificationFa: string;
  hasConflictWithParty: boolean;
  conflictReasonFa?: string;
}

export interface CorrectiveActionItem {
  actionId: string;
  titleFa: string;
  descriptionFa: string;
  responsibleFa: string;
  deadlineFa: string;
  requiredDocFa: string;
  status: 'ثبت‌شده' | 'پذیرفته‌شده' | 'در حال اجرا' | 'ارسال‌شده برای بررسی' | 'تأییدشده' | 'نیازمند اصلاح مجدد';
  linkedStage44FinancialChange: boolean;
  linkedStage45DeliveryRevision: boolean;
}

export interface QualityCriterionEvaluation {
  criterionId: string;
  titleFa: string;
  verificationMethodFa: string;
  requiredEvidenceFa: string;
  assessorRoleFa: string;
  status: 'در انتظار' | 'بررسی‌شده';
  resultFa: string;
}

export interface DisputeAppealRecord {
  appealId: string;
  reasonCategoryFa: 'ایراد به روش بررسی' | 'ایراد به مستندات' | 'تعارض منافع' | 'نقص فرایند' | 'اشتباه در ثبت اطلاعات' | 'شواهد جدید';
  summaryFa: string;
  requestedOutcomeFa: string;
  submittedAtFa: string;
  previousResolutionPreservedFa: string;
  independentAppealReviewerFa: string;
  status: 'در حال بازبینی' | 'بررسی‌شد';
}

export interface DisputeCaseRecord {
  caseId: string;
  linkedRequestId: string;
  linkedDossierId: string;
  linkedInvoiceNumber?: string;
  linkedProjectId: string;
  linkedMilestoneTitleFa: string;
  serviceDomain: DisputeServiceDomain;
  category: DisputeCategoryId;
  titleFa: string;
  claimSummaryFa: string;
  claimVerificationBadgeFa: 'ادعای بررسی‌نشده' | 'بررسی‌شده';
  requestedOutcomeFa: string;
  status: DisputeCaseStatus;
  handlerNameFa: string | null;
  providerBadgeAutoDropped: false;
  credentialImpactNoteFa: string;
  customerFeedbackSummaryFa: string;
  customerSatisfactionScore5: number;
  technicalCriteria: QualityCriterionEvaluation[];
  evidences: DisputeEvidenceItem[];
  responses: DisputeResponseRecord[];
  assignedReviewer?: IndependentReviewerProfile;
  reviewStageFa: 'درخواست ثبت‌شده' | 'در انتظار تخصیص' | 'ارزیاب تعیین‌شده' | 'در حال بررسی' | 'گزارش آماده';
  resolution?: {
    outcome: DisputeResolutionOutcome;
    confirmedScopeFa: string;
    unconfirmedScopeFa: string;
    evidenceBasisFa: string;
    limitationsFa: string;
    decidedByFa: string;
    decidedAtFa: string;
  };
  correctiveActions: CorrectiveActionItem[];
  appeals: DisputeAppealRecord[];
  auditTrailFa: Array<{ id: string; timestampFa: string; summaryFa: string }>;
}
