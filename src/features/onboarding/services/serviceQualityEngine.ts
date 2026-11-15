/** @file src/features/onboarding/services/serviceQualityEngine.ts — Stage 46 Dispute, Quality & Conflict-of-Interest Engine */
import type {
  DisputeAppealRecord,
  DisputeCaseRecord,
  DisputeCategoryId,
  DisputeEvidenceItem,
  DisputeResolutionOutcome,
  DisputeResponseRecord,
  DisputeServiceDomain,
  DisputeViewerRole,
  IndependentReviewerProfile,
  QualityCriterionEvaluation,
} from './serviceQualityTypes';

export function canAccessDisputeCase(viewerRole: DisputeViewerRole): { allowed: boolean; canDecide: boolean; canSeePrivatePii: boolean; reasonFa: string } {
  if (viewerRole === 'outsider') {
    return { allowed: false, canDecide: false, canSeePrivatePii: false, reasonFa: 'دسترسی مسدود شد: کاربر خارج از پرونده اجازه مشاهده یا دریافت مستندات اختلاف را ندارد.' };
  }
  return {
    allowed: true,
    canDecide: viewerRole === 'case_manager',
    canSeePrivatePii: viewerRole === 'applicant' || viewerRole === 'provider' || viewerRole === 'case_manager',
    reasonFa: 'دسترسی محدود به نقش مجاز در پرونده رسیدگی برقرار است.',
  };
}

export function getConditionalComplaintFields(category: DisputeCategoryId, serviceDomain: DisputeServiceDomain): string[] {
  const domainTag = serviceDomain === 'construction_renovation' ? 'مغایرت با نقشه/مصالح بازسازی' : serviceDomain === 'advisory' ? 'تطابق خروجی مشاوره/تعداد جلسات' : 'انطباق گزارش فنی با استاندارد';
  if (category === 'اختلاف مالی') return ['شماره صورت‌حساب مرحله ۴۴', 'نسخه توافق مرتبط', 'مبلغ مورد اختلاف (تومان)', domainTag];
  if (category === 'زمان‌بندی و تأخیر') return ['موعد توافق‌شده مرحله ۴۵', 'مدت تأخیر اعلام‌شده', 'علت اعلامی طرفین', domainTag];
  if (category === 'کیفیت فنی' || category === 'عدم تطابق با توافق') return ['نوع نقص یا مغایرت', 'محل و مرحله اجرایی مرتبط', 'تصاویر یا گزارش تخصصی', domainTag];
  return ['شرح اتفاق و زمان وقوع', 'مستند مرتبط در پرونده', domainTag];
}

export function getServiceSpecificQualityCriteria(serviceDomain: DisputeServiceDomain): QualityCriterionEvaluation[] {
  if (serviceDomain === 'advisory') {
    return [
      { criterionId: 'qc-adv-1', titleFa: 'وضوح مشاوره و ارتباط موضوعی با نیاز کاربر', verificationMethodFa: 'بازبینی مکتوبات و جلسات', requiredEvidenceFa: 'صورت‌جلسه یا گزارش مشاوره', assessorRoleFa: 'ناظر کیفیت مشاوره', status: 'در انتظار', resultFa: 'ثبت‌نشده' },
      { criterionId: 'qc-adv-2', titleFa: 'شفافیت هزینه و شرایط اعلام‌شده', verificationMethodFa: 'تطبیق با پرونده مرحله ۴۴', requiredEvidenceFa: 'صورت‌حساب و توافق', assessorRoleFa: 'مسئول رسیدگی', status: 'در انتظار', resultFa: 'ثبت‌نشده' },
    ];
  }
  return [
    { criterionId: 'qc-eng-1', titleFa: 'تطابق خروجی فنی یا اجرایی با نسخه توافق مرحله ۴۴', verificationMethodFa: 'مقایسه سندی توافق با تحویل مرحله ۴۵', requiredEvidenceFa: 'نسخه توافق + گزارش مرحله', assessorRoleFa: 'ارزیاب فنی مستقل', status: 'در انتظار', resultFa: 'ثبت‌نشده' },
    { criterionId: 'qc-eng-2', titleFa: 'اعلام محدودیت‌های بررسی و مستندسازی قابل پیگیری', verificationMethodFa: 'کنترل شواهد و تصاویر زمان‌مند', requiredEvidenceFa: 'گزارش فنی و تصاویر', assessorRoleFa: 'ارزیاب فنی مستقل', status: 'در انتظار', resultFa: 'ثبت‌نشده' },
  ];
}

export function submitServiceComplaint(params: {
  existingCasesCount: number;
  linkedRequestId: string;
  linkedDossierId: string;
  linkedInvoiceNumber?: string;
  linkedProjectId: string;
  linkedMilestoneTitleFa: string;
  serviceDomain: DisputeServiceDomain;
  category: DisputeCategoryId;
  titleFa: string;
  claimSummaryFa: string;
  requestedOutcomeFa: string;
}): DisputeCaseRecord {
  return {
    caseId: `qar-46-${101 + params.existingCasesCount}`,
    linkedRequestId: params.linkedRequestId,
    linkedDossierId: params.linkedDossierId,
    linkedInvoiceNumber: params.linkedInvoiceNumber,
    linkedProjectId: params.linkedProjectId,
    linkedMilestoneTitleFa: params.linkedMilestoneTitleFa,
    serviceDomain: params.serviceDomain,
    category: params.category,
    titleFa: params.titleFa.trim(),
    claimSummaryFa: params.claimSummaryFa.trim(),
    claimVerificationBadgeFa: 'ادعای بررسی‌نشده',
    requestedOutcomeFa: params.requestedOutcomeFa.trim(),
    status: 'ثبت‌شده',
    handlerNameFa: null,
    providerBadgeAutoDropped: false,
    credentialImpactNoteFa: 'ثبت شکایت به‌تنهایی هیچ‌گونه کاهش خودکار در اعتبار حرفه‌ای یا نشان احراز هویت ایجاد نمی‌کند.',
    customerFeedbackSummaryFa: 'ثبت تجربه کاربر مستقل از ارزیابی تخصصی است.',
    customerSatisfactionScore5: 2,
    technicalCriteria: getServiceSpecificQualityCriteria(params.serviceDomain),
    evidences: [],
    responses: [],
    reviewStageFa: 'درخواست ثبت‌شده',
    correctiveActions: [],
    appeals: [],
    auditTrailFa: [{ id: `aud-${Date.now()}`, timestampFa: '۱۸ آبان ۱۴۰۵ · ۱۰:۰۰', summaryFa: 'شکایت ثبت شد (وضعیت ادعا: بررسی‌نشده؛ بدون تغییر خودکار اعتبار طرف مقابل).' }],
  };
}

export function submitCounterpartyResponse(params: {
  disputeCase: DisputeCaseRecord;
  authorNameFa: string;
  stance: DisputeResponseRecord['stance'];
  explanationFa: string;
}): DisputeCaseRecord {
  const response: DisputeResponseRecord = {
    responseId: `rsp-${Date.now()}`,
    authorNameFa: params.authorNameFa,
    submittedAtFa: '۱۸ آبان ۱۴۰۵ · ۱۱:۱۰',
    stance: params.stance,
    explanationFa: params.explanationFa.trim(),
    cannotDeleteComplaint: true,
  };
  return {
    ...params.disputeCase,
    status: 'در حال بررسی',
    handlerNameFa: params.disputeCase.handlerNameFa || 'کارگروه رسیدگی رادار تهران',
    responses: [response, ...params.disputeCase.responses],
    auditTrailFa: [{ id: `aud-${Date.now()}`, timestampFa: '۱۸ آبان ۱۴۰۵ · ۱۱:۱۰', summaryFa: `پاسخ طرف مقابل (${params.stance}) در کنار ادعای اولیه ثبت شد.` }, ...params.disputeCase.auditTrailFa],
  };
}

export function addConflictingEvidencePreservingBoth(params: {
  disputeCase: DisputeCaseRecord;
  titleFa: string;
  kindFa: DisputeEvidenceItem['kindFa'];
  submittedByRole: DisputeEvidenceItem['submittedByRole'];
  submittedByNameFa: string;
  descriptionFa: string;
  conflictsWithEvidenceId?: string;
}): DisputeCaseRecord {
  const ev: DisputeEvidenceItem = {
    evidenceId: `ev-${Date.now()}`,
    titleFa: params.titleFa.trim(),
    kindFa: params.kindFa,
    submittedByRole: params.submittedByRole,
    submittedByNameFa: params.submittedByNameFa,
    uploadedAtFa: '۱۸ آبان ۱۴۰۵ · ۱۱:۴۰',
    relatedTargetFa: params.disputeCase.linkedMilestoneTitleFa,
    versionLabel: `E${params.disputeCase.evidences.length + 1}`,
    descriptionFa: params.descriptionFa.trim(),
    status: 'ثبت‌شده',
    conflictsWithEvidenceId: params.conflictsWithEvidenceId,
  };
  return { ...params.disputeCase, evidences: [ev, ...params.disputeCase.evidences] };
}

export function assignIndependentReviewerSafely(params: {
  disputeCase: DisputeCaseRecord;
  candidate: IndependentReviewerProfile;
  fallbackReviewer?: IndependentReviewerProfile;
}): { ok: boolean; reroutedForConflict: boolean; disputeCase: DisputeCaseRecord; messageFa: string } {
  if (params.candidate.hasConflictWithParty) {
    if (params.fallbackReviewer && !params.fallbackReviewer.hasConflictWithParty) {
      return {
        ok: true,
        reroutedForConflict: true,
        messageFa: `تعارض منافع در ارزیاب قبلی (${params.candidate.conflictReasonFa || 'رابطه کاری'}) تشخیص داده شد و پرونده به ارزیاب مستقل جایگزین ارجاع گردید.`,
        disputeCase: {
          ...params.disputeCase,
          status: 'ارزیابی تخصصی',
          reviewStageFa: 'ارزیاب تعیین‌شده',
          assignedReviewer: params.fallbackReviewer,
        },
      };
    }
    return {
      ok: false,
      reroutedForConflict: true,
      disputeCase: params.disputeCase,
      messageFa: 'ارزیاب انتخاب‌شده دارای تعارض منافع است؛ تخصیص مسدود شد تا ارزیاب مستقل دیگری معرفی شود.',
    };
  }
  return {
    ok: true,
    reroutedForConflict: false,
    messageFa: `ارزیاب مستقل (${params.candidate.displayNameFa}) با صلاحیت ${params.candidate.specialtyFa} تعیین شد.`,
    disputeCase: {
      ...params.disputeCase,
      status: 'ارزیابی تخصصی',
      reviewStageFa: 'ارزیاب تعیین‌شده',
      assignedReviewer: params.candidate,
    },
  };
}

export function recordDisputeResolution(params: {
  disputeCase: DisputeCaseRecord;
  outcome: DisputeResolutionOutcome;
  confirmedScopeFa: string;
  unconfirmedScopeFa: string;
  decidedByFa: string;
  viewerRole: DisputeViewerRole;
}): { ok: boolean; disputeCase: DisputeCaseRecord; messageFa: string } {
  if (params.viewerRole !== 'case_manager') {
    return { ok: false, disputeCase: params.disputeCase, messageFa: 'ثبت تصمیم نهایی تنها توسط مدیر رسیدگی مجاز است.' };
  }
  if (!params.confirmedScopeFa.trim() && params.outcome !== 'شواهد ناکافی') {
    return { ok: false, disputeCase: params.disputeCase, messageFa: 'نتیجه رسیدگی بدون توضیح و مبنای شواهد قابل ثبت نیست.' };
  }
  const hasAnyEvidence = params.disputeCase.evidences.length > 0;
  const effectiveOutcome: DisputeResolutionOutcome = !hasAnyEvidence ? 'شواهد ناکافی' : params.outcome;
  return {
    ok: true,
    messageFa: `نتیجه «${effectiveOutcome}» ثبت شد و امکان اعتراض مستند حفظ است.`,
    disputeCase: {
      ...params.disputeCase,
      claimVerificationBadgeFa: 'بررسی‌شده',
      status: 'نتیجه‌گیری‌شده',
      handlerNameFa: params.decidedByFa,
      resolution: {
        outcome: effectiveOutcome,
        confirmedScopeFa: effectiveOutcome === 'شواهد ناکافی' ? 'شواهد برای تصمیم‌گیری قطعی کافی نیست.' : params.confirmedScopeFa.trim(),
        unconfirmedScopeFa: params.unconfirmedScopeFa.trim() || 'ادعاهای فاقد مدرک معتبر',
        evidenceBasisFa: `بررسی ${params.disputeCase.evidences.length} مستند ثبت‌شده و ${params.disputeCase.responses.length} پاسخ طرفین`,
        limitationsFa: 'این تصمیم به مستندات ارائه‌شده در سامانه محدود است و داوری قضایی یا حکم رسمی قانونی محسوب نمی‌شود.',
        decidedByFa: params.decidedByFa,
        decidedAtFa: '۱۸ آبان ۱۴۰۵ · ۱۴:۰۰',
      },
    },
  };
}

export function submitDisputeAppeal(params: {
  disputeCase: DisputeCaseRecord;
  reasonCategoryFa: DisputeAppealRecord['reasonCategoryFa'];
  summaryFa: string;
  requestedOutcomeFa: string;
  independentAppealReviewerFa: string;
}): DisputeCaseRecord {
  const prevSummary = params.disputeCase.resolution ? `${params.disputeCase.resolution.outcome}: ${params.disputeCase.resolution.confirmedScopeFa}` : 'بدون تصمیم قبلی';
  const appeal: DisputeAppealRecord = {
    appealId: `apl-${Date.now()}`,
    reasonCategoryFa: params.reasonCategoryFa,
    summaryFa: params.summaryFa.trim(),
    requestedOutcomeFa: params.requestedOutcomeFa.trim(),
    submittedAtFa: '۱۸ آبان ۱۴۰۵ · ۱۵:۰۰',
    previousResolutionPreservedFa: prevSummary,
    independentAppealReviewerFa: params.independentAppealReviewerFa,
    status: 'در حال بازبینی',
  };
  return { ...params.disputeCase, status: 'در حال بازبینی', appeals: [appeal, ...params.disputeCase.appeals] };
}

export function evaluateCredentialImpactSafely(disputeCase: DisputeCaseRecord): {
  canAlterKycIdentity: false;
  shouldReviewSpecificCredential: boolean;
  noteFa: string;
} {
  const isFinalVerifiedCredentialBreach =
    disputeCase.category === 'هویت و اعتبار' &&
    disputeCase.resolution?.outcome === 'ادعا تأیید شد';
  return {
    canAlterKycIdentity: false,
    shouldReviewSpecificCredential: isFinalVerifiedCredentialBreach,
    noteFa: isFinalVerifiedCredentialBreach
      ? 'به‌استناد نتیجه تأییدشده پرونده، صرفاً نشان/مدرک مرتبط برای بازبینی مرحله ۴۲ علامت‌گذاری می‌شود.'
      : 'اختلاف مالی، شکایت در حال بررسی یا نتیجه تأییدنشده هیچ اثر خودکاری بر نشان هویتی یا اعتبار مرحله ۴۲ ندارد.',
  };
}
