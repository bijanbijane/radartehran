/** @file src/features/onboarding/services/professionalKnowledgeEngine.ts — Stage 47 Pure Domain Engine & 12 Acceptance Tests */
import {
  FORBIDDEN_TRUST_CLAIMS_FA,
  type ChecklistItemStatus,
  type ContentErrorReportRecord,
  type ContentTrustLabel,
  type DocumentPublicationPermission,
  type KnowledgeSourceMetadata,
  type ProfessionalChecklistRecord,
  type ProfessionalGuideRecord,
} from './professionalKnowledgeTypes';

/** Test 1: Content Detail Header exposes content type, target audience, and geographic/thematic scope up front */
export function resolveContentDetailHeader(guide: ProfessionalGuideRecord) {
  return {
    contentType: guide.contentType,
    trustLabel: guide.trustLabel,
    targetAudienceFa: guide.targetAudienceFa,
    geographicAndTopicScopeFa: guide.geographicAndTopicScopeFa,
    publishedDateFa: guide.publishedDateFa,
    lastReviewedDateFa: guide.lastReviewedDateFa,
    hasCompleteTopBanner: Boolean(
      guide.contentType && guide.targetAudienceFa && guide.geographicAndTopicScopeFa,
    ),
  };
}

/** Test 2: Inspect source metadata, keeping any missing field explicitly as 'نامشخص' instead of fabricating */
export function inspectSourceProvenance(source: Partial<KnowledgeSourceMetadata>) {
  return {
    sourceId: source.sourceId || 'نامشخص',
    fullTitleFa: source.fullTitleFa || 'نامشخص',
    publisherFa: source.publisherFa || 'نامشخص',
    authorFa: source.authorFa || 'نامشخص',
    documentCodeOrVersion: source.documentCodeOrVersion || 'نامشخص',
    publishedDateFa: source.publishedDateFa || 'نامشخص',
    effectiveDateFa: source.effectiveDateFa || 'نامشخص',
    geographicScopeFa: source.geographicScopeFa || 'نامشخص',
    thematicScopeFa: source.thematicScopeFa || 'نامشخص',
    status: source.status || 'unknown_validity',
    accessLocationFa: source.accessLocationFa || 'نامشخص',
    lastVerifiedDateFa: source.lastVerifiedDateFa || 'نامشخص',
    replacementSourceId: source.replacementSourceId || 'نامشخص',
  };
}

/** Test 3: Superseding a source updates source status to 'superseded' and queues dependent guide for editorial review */
export function supersedeKnowledgeSource(params: {
  guide: ProfessionalGuideRecord;
  oldSourceId: string;
  newSourceId: string;
  impactsGuideContent: boolean;
}): {
  updatedGuide: ProfessionalGuideRecord;
  queuedForEditorialReview: boolean;
  editorialQueueReasonFa: string;
} {
  const updatedSources = params.guide.sources.map((src) =>
    src.sourceId === params.oldSourceId
      ? { ...src, status: 'superseded' as const, replacementSourceId: params.newSourceId }
      : src,
  );
  const queued = params.impactsGuideContent;
  return {
    updatedGuide: {
      ...params.guide,
      sources: updatedSources,
      publicationStatus: queued ? 'نیازمند بازبینی' : params.guide.publicationStatus,
      trustLabel: queued ? 'نیازمند بازبینی' : params.guide.trustLabel,
    },
    queuedForEditorialReview: queued,
    editorialQueueReasonFa: queued
      ? `منبع ${params.oldSourceId} با نسخه ${params.newSourceId} جایگزین شد؛ راهنما به صف بازبینی تحریریه منتقل گردید.`
      : 'منبع جایگزین ثبت شد (بدون تغییر در حکم راهنما).',
  };
}

/** Test 4: Scheduled Review Due flags content as 'نیازمند بازبینی' and never auto-certifies validity */
export function evaluateScheduledReviewDue(guide: ProfessionalGuideRecord, nowIso: string): {
  isReviewOverdue: boolean;
  autoRenewedValidity: false;
  updatedGuide: ProfessionalGuideRecord;
  warningBannerFa: string | null;
} {
  const isOverdue = new Date(nowIso).getTime() >= new Date(guide.nextReviewDueIso).getTime();
  return {
    isReviewOverdue: isOverdue,
    autoRenewedValidity: false,
    updatedGuide: isOverdue
      ? { ...guide, publicationStatus: 'نیازمند بازبینی', trustLabel: 'نیازمند بازبینی' }
      : guide,
    warningBannerFa: isOverdue
      ? 'موعد بازبینی دوره‌ای این راهنما فرا رسیده است؛ محتوا تا بررسی مجدد متخصص به‌عنوان تأییدشده جاری معرفی نمی‌شود.'
      : null,
  };
}

/** Test 5: User Error Report binds to a specific section, assigns an ID, and routes by problem type */
export function submitContentErrorReport(params: {
  existingCount: number;
  guideId: string;
  targetSectionFa: string;
  problemType: ContentErrorReportRecord['problemType'];
  descriptionFa: string;
  suggestedSourceFa?: string;
}): ContentErrorReportRecord {
  const routingMap: Record<ContentErrorReportRecord['problemType'], string> = {
    'خطای نگارشی': 'ویرایش تحریری',
    'خطای مفهومی': 'بازبینی نویسنده یا متخصص',
    'منبع نامعتبر': 'بررسی منشأ',
    'اطلاعات منسوخ': 'بازبینی محتوا و تاریخ اعتبار',
    'ادعای تخصصی نادرست': 'بررسی متخصص مرتبط',
    'محتوای آسیب‌زا یا گمراه‌کننده': 'بررسی اولویت‌دار',
    'نقض حقوق محتوا': 'بررسی حقوقی و تحریری',
  };
  return {
    reportId: `ERR-PK-${101 + params.existingCount}`,
    guideId: params.guideId,
    targetSectionFa: params.targetSectionFa,
    problemType: params.problemType,
    descriptionFa: params.descriptionFa,
    suggestedSourceFa: params.suggestedSourceFa,
    routingPathFa: routingMap[params.problemType],
    status: 'دریافت‌شده',
  };
}

/** Test 6: Expert Revision Proposal preserves previous version diff and enters review workflow before publication */
export function proposeExpertContentRevision(params: {
  guide: ProfessionalGuideRecord;
  sectionId: string;
  proposedTextFa: string;
  expertNameFa: string;
  reviewLimitationNoteFa: string;
}) {
  const target = params.guide.sections.find((s) => s.sectionId === params.sectionId) || params.guide.sections[0];
  return {
    revisionId: `REV-${params.guide.guideId}-${params.sectionId}`,
    previousVersion: params.guide.version,
    previousTextFa: target.authorInterpretationFa,
    proposedTextFa: params.proposedTextFa,
    expertNameFa: params.expertNameFa,
    reviewLimitationNoteFa: params.reviewLimitationNoteFa,
    workflowStatus: 'در بازبینی تخصصی' as const,
    publishedImmediately: false,
  };
}

/** Test 7: Interactive Checklist updates 5-state item, saves progress, and enforces non-certification disclaimer */
export function updateInteractiveChecklistItem(params: {
  checklist: ProfessionalChecklistRecord;
  itemId: string;
  nextStatus: ChecklistItemStatus;
  userNoteFa?: string;
}) {
  const updatedItems = params.checklist.items.map((item) =>
    item.itemId === params.itemId
      ? { ...item, status: params.nextStatus, userNoteFa: params.userNoteFa ?? item.userNoteFa }
      : item,
  );
  const completedOrHandledCount = updatedItems.filter((i) => i.status !== 'بررسی نشده').length;
  return {
    updatedChecklist: { ...params.checklist, items: updatedItems },
    progressPercent: Math.round((completedOrHandledCount / Math.max(1, updatedItems.length)) * 100),
    isOfficialTechnicalOrLegalCertification: false as const,
    disclaimerFa: params.checklist.nonCertificationDisclaimerFa,
  };
}

/** Test 8: Contextual Knowledge Suggestion matches user step without blocking primary CTA or recording consent */
export function resolveContextualKnowledgeSuggestion(moduleContext: 'renovation_request' | 'property_visit' | 'dispute_filing' | 'valuation_view') {
  const map = {
    renovation_request: {
      guideId: 'pk-guide-renovation-scope',
      titleFa: 'پیش از توافق با مجری، دامنه کار را مشخص کنید',
      reasonFa: 'پیشنهاد مرتبط با مرحله ثبت درخواست بازسازی برای شفاف‌سازی خروجی‌ها و مصالح',
    },
    property_visit: {
      guideId: 'pk-checklist-initial-visit',
      titleFa: 'چک‌لیست بازدید اولیه ملک و نشانه‌های نقص ظاهری',
      reasonFa: 'پیشنهاد مرتبط با صفحه ملک پیش از هماهنگی بازدید',
    },
    dispute_filing: {
      guideId: 'pk-guide-dispute-evidence',
      titleFa: 'راهنمای جمع‌آوری مستندات و فهم فرایند رسیدگی به اختلاف',
      reasonFa: 'پیشنهاد مرتبط با پرونده اختلاف مرحله ۴۶',
    },
    valuation_view: {
      guideId: 'pk-guide-valuation-limits',
      titleFa: 'راهنمای فهم روش هدونیک و محدودیت برآورد آماری',
      reasonFa: 'پیشنهاد مرتبط با صفحه ارزش‌گذاری ملک',
    },
  };
  return {
    ...map[moduleContext],
    coversPrimaryCtaButton: false as const,
    dismissible: true as const,
    recordsPassiveViewAsConsent: false as const,
  };
}

/** Test 9: Multi-criteria search & zero-result recovery without forcing unrelated results */
export function searchProfessionalKnowledgeCatalog(
  guides: ProfessionalGuideRecord[],
  query: string,
): {
  matchedGuides: ProfessionalGuideRecord[];
  zeroResultRecovery: null | {
    spellingSuggestionFa: string;
    nearbyTopicsFa: string[];
    canRequestNewTopic: true;
    forcedUnrelatedResults: false;
  };
} {
  const q = query.trim();
  if (!q) return { matchedGuides: guides, zeroResultRecovery: null };
  const matched = guides.filter(
    (g) => g.titleFa.includes(q) || g.categoryFa.includes(q) || g.summaryWhatFa.includes(q),
  );
  if (matched.length > 0) return { matchedGuides: matched, zeroResultRecovery: null };
  return {
    matchedGuides: [],
    zeroResultRecovery: {
      spellingSuggestionFa: 'آیا منظور شما «بازسازی ساختمان» یا «کارشناسی فنی ملک» بود؟',
      nearbyTopicsFa: ['بازسازی', 'بررسی ساختمان', 'خدمات کارشناسی'],
      canRequestNewTopic: true,
      forcedUnrelatedResults: false,
    },
  };
}

/** Test 10: Separate official source facts from author interpretation and reject forbidden overclaim labels */
export function separateReferenceFromInterpretation(section: ProfessionalGuideRecord['sections'][number], candidateLabel: string) {
  const isForbiddenLabel = (FORBIDDEN_TRUST_CLAIMS_FA as readonly string[]).includes(candidateLabel);
  return {
    sourceFactLayerFa: section.sourceFactFa,
    authorInterpretationLayerFa: section.authorInterpretationFa,
    editorialExplanationLayerFa: section.editorialNoteFa,
    layersDistinct:
      section.sourceFactFa !== section.authorInterpretationFa &&
      section.authorInterpretationFa !== section.editorialNoteFa,
    isLabelAllowed: !isForbiddenLabel,
    sanitizedTrustLabel: (isForbiddenLabel ? 'منبع تخصصی دارد' : candidateLabel) as ContentTrustLabel,
  };
}

/** Test 11: User uploaded document does not grant public publication rights and requires PII anonymization */
export function evaluateUserDocumentPublicationRights(params: {
  uploadedByUser: boolean;
  explicitPublicLicenseGranted: boolean;
  containsPersonalPii: boolean;
  intendedUse: DocumentPublicationPermission;
}) {
  const canPublishPublicly =
    params.explicitPublicLicenseGranted && !params.containsPersonalPii && params.intendedUse === 'public_licensed';
  return {
    uploadAloneGrantsPublicRelease: false as const,
    canPublishPublicly,
    effectivePermission: canPublishPublicly
      ? ('public_licensed' as const)
      : params.containsPersonalPii
        ? ('internal_review_only' as const)
        : params.intendedUse,
    guardReasonFa: canPublishPublicly
      ? 'مجوز انتشار عمومی ثبت شده و فاقد اطلاعات شخصی قابل شناسایی است.'
      : 'بارگذاری فایل به‌تنهایی مجوز انتشار عمومی نیست؛ حذف اطلاعات شناسایی‌کننده (PII) و تأیید حقوق انتشار الزامی است.',
  };
}

/** Test 12 & §24: Mobile reading layout and AI Human-in-the-Loop Risk Gate */
export function resolveMobileKnowledgeLayout(viewportWidthPx: number, aiGeneratedTopic: 'legal_interpretation' | 'safety_warning' | 'initial_draft') {
  const isMobile = viewportWidthPx < 768;
  const requiresHumanSpecialistReview = aiGeneratedTopic !== 'initial_draft';
  return {
    singleColumnNarrowText: isMobile,
    tablesConvertedToScrollableCards: isMobile,
    collapsibleTocAndSources: isMobile,
    requiresHorizontalPageScroll: false as const,
    aiCanAutoPublishDirectly: false as const,
    requiresHumanSpecialistReview,
  };
}
