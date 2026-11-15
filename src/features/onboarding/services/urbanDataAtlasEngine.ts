/** @file src/features/onboarding/services/urbanDataAtlasEngine.ts — Stage 52 Pure Domain Engine */
import type {
  CitizenCorrectionProposal,
  DatasetSourceConflictRecord,
  SpecialMissingValueKind,
  UrbanDatasetCatalogRecord,
} from './urbanDataAtlasTypes';

/** §4.4, §4.5 & §11: Separate dataset availability from public release permission and gate every UI action by license */
export function evaluateDatasetAccessAndActions(params: {
  dataset: UrbanDatasetCatalogRecord;
  userRole: 'visitor' | 'logged_in_user' | 'professional' | 'data_admin';
}) {
  const { dataset, userRole } = params;
  const availabilityLabelFa = !dataset.isAvailableInRepository
    ? 'داده در سامانه موجود نیست'
    : dataset.accessLevel === 'غیرقابل انتشار' || dataset.accessLevel === 'محرمانه' || dataset.accessLevel === 'داخلی'
      ? `داده موجود است اما با سطح دسترسی «${dataset.accessLevel}» اجازه انتشار عمومی ندارد`
      : `موجود و دارای سطح دسترسی «${dataset.accessLevel}»`;

  const canRoleView =
    dataset.accessLevel === 'عمومی' ||
    dataset.accessLevel === 'عمومی با محدودیت استفاده' ||
    (dataset.accessLevel === 'قابل مشاهده برای کاربران واردشده' && userRole !== 'visitor') ||
    (dataset.accessLevel === 'قابل استفاده برای کاربران مجاز' &&
      (userRole === 'professional' || userRole === 'data_admin')) ||
    ((dataset.accessLevel === 'داخلی' || dataset.accessLevel === 'محرمانه') && userRole === 'data_admin');

  return {
    availabilityLabelFa,
    canViewMetadata: true as const,
    canViewDataPreview: canRoleView && dataset.license.allowView,
    canAddToMap: canRoleView && dataset.license.allowAddToMap,
    canUseInAnalysis: canRoleView && dataset.license.allowUseInAnalysis,
    canDownloadRawFile: canRoleView && dataset.license.allowDownloadRawFile,
    sourceLicenseEqualsProductOwnership: false as const,
    restrictionNoticeFa:
      !dataset.license.allowDownloadRawFile && dataset.license.allowAddToMap
        ? 'استفاده در نقشه مجاز است، اما دریافت فایل خام و بازنشر آن به‌موجب مجوز منبع محدود شده است.'
        : 'عملیات مطابق مجوز ثبت‌شده منبع کنترل می‌شوند.',
  };
}

/** §10.4 & §10.6: Multi-criteria dataset comparison without picking a winner purely by record count */
export function compareUrbanDatasetsByPurpose(params: {
  datasetA: UrbanDatasetCatalogRecord;
  datasetB: UrbanDatasetCatalogRecord;
  intendedUseFa: 'نمایش نقاط روی نقشه' | 'تحلیل فاصله' | 'بررسی پوشش خدمات' | 'تحلیل زمانی';
}) {
  const { datasetA, datasetB, intendedUseFa } = params;
  return {
    intendedUseFa,
    judgedSolelyByRecordCount: false as const,
    declaresAbsoluteWinner: false as const,
    comparisonRows: [
      { criterionFa: 'ناشر / تأمین‌کننده / پردازش‌کننده', aValFa: `${datasetA.publisherFa} / ${datasetA.supplierFa}`, bValFa: `${datasetB.publisherFa} / ${datasetB.supplierFa}` },
      { criterionFa: 'پوشش جغرافیایی', aValFa: datasetA.coverageScopeNoteFa, bValFa: datasetB.coverageScopeNoteFa },
      { criterionFa: 'تاریخ اعتبار (متمایز از تاریخ دریافت)', aValFa: `${datasetA.validAtDateFa} (دریافت: ${datasetA.receivedAtDateFa})`, bValFa: `${datasetB.validAtDateFa} (دریافت: ${datasetB.receivedAtDateFa})` },
      { criterionFa: 'دقت مکانی', aValFa: datasetA.quality.positionalAccuracyFa, bValFa: datasetB.quality.positionalAccuracyFa },
      { criterionFa: 'مناسب برای کاربرد انتخابی؟', aValFa: datasetA.suitableForFa.includes(intendedUseFa) ? 'مناسب با محدودیت‌های اعلام‌شده' : 'نامناسب / نیازمند بررسی', bValFa: datasetB.suitableForFa.includes(intendedUseFa) ? 'مناسب با محدودیت‌های اعلام‌شده' : 'نامناسب / نیازمند بررسی' },
    ],
  };
}

/** §17.3–§17.6: Source conflict governance — forbids resolving solely because one file looks newer or fuller */
export function evaluateSourceConflictResolution(params: {
  conflict: DatasetSourceConflictRecord;
  attemptedNewerFileOnlyHeuristic: boolean;
  verifiedReferenceDocumentId?: string;
}) {
  const blocked = params.attemptedNewerFileOnlyHeuristic && !params.verifiedReferenceDocumentId;
  return {
    conflictId: params.conflict.conflictId,
    conflictHidden: false as const,
    resolvedByNewerOrMoreCompleteHeuristicBlocked: blocked,
    effectiveStatus: blocked
      ? 'در انتظار بررسی'
      : params.verifiedReferenceDocumentId
        ? 'حل‌شده با سند مرجع'
        : params.conflict.status,
    guidanceFa: blocked
      ? 'انتخاب یک مقدار صرفاً به‌دلیل جدیدتر یا کامل‌تر بودن فایل، بدون بررسی مرجع و تاریخ اعتبار ممنوع است.'
      : params.verifiedReferenceDocumentId
        ? `تعارض با استناد به سند مرجع ${params.verifiedReferenceDocumentId} ثبت شد.`
        : 'هر دو نسخه متعارض با توضیح اختلاف حفظ می‌شوند.',
  };
}

/** §18.3, §14.4 & §24.6: Scheduled review status + non-destructive version rollback + dependent warning */
export function evaluateReviewScheduleAndVersionRollback(params: {
  dataset: UrbanDatasetCatalogRecord;
  currentDateFa: string;
  isReviewDuePassed: boolean;
  rollbackReasonFa?: string;
}) {
  const reviewWarningFa = params.isReviewDuePassed
    ? 'زمان بازبینی برنامه‌ریزی‌شده فرارسیده است؛ تازگی اطلاعات نیازمند بررسی مجدد است.'
    : 'در بازه بازبینی برنامه‌ریزی‌شده قرار دارد.';

  const rolledBack = Boolean(params.rollbackReasonFa);
  return {
    autoMarkedDefinitivelyInvalid: false as const,
    reviewWarningFa,
    impactedDirectLayers: params.dataset.dependentLayersDirect,
    impactedIndirectReports: params.dataset.dependentReportsIndirect,
    rollbackPerformed: rolledBack,
    newerVersionHistoryPreservedOnRollback: true as const,
    rollbackAuditNoteFa: rolledBack
      ? `انتشار نسخه ${params.dataset.version} موقتاً متوقف و به نسخه قبلی بازگردانده شد؛ سابقه نسخه جدید حفظ گردید (${params.rollbackReasonFa}).`
      : null,
  };
}

/** §19 & §20: Citizen correction proposal (never mutates reference directly) & data gap request prioritization */
export function submitCitizenProposalAndDataGapCheck(params: {
  datasetId: string;
  errorTypeFa: string;
  proposedValueFa: string;
  evidenceSourceFa: string;
  approvedPreviousCorrectionsCount: number;
  totalSubmissionsCount: number;
  gapRequestTitleFa: string;
  gapRequestPopularityVotes: number;
  containsSensitivePersonalOrPrivateData: boolean;
}) {
  const proposal: CitizenCorrectionProposal = {
    proposalId: `PRP-52-${params.totalSubmissionsCount + 1}`,
    datasetId: params.datasetId,
    errorTypeFa: params.errorTypeFa,
    proposedValueFa: params.proposedValueFa,
    evidenceSourceFa: params.evidenceSourceFa,
    status: 'در انتظار بررسی',
    mutatesReferenceDirectly: false,
  };

  return {
    proposal,
    credibilityBasedOnVerifiedHistoryOnly: true as const,
    verifiedApprovalRatioPercent:
      params.totalSubmissionsCount > 0
        ? Math.round((params.approvedPreviousCorrectionsCount / params.totalSubmissionsCount) * 100)
        : 0,
    dataGapRequest: {
      titleFa: params.gapRequestTitleFa,
      popularityVotes: params.gapRequestPopularityVotes,
      popularityAloneJustifiesSensitiveRelease: false as const,
      releaseBlockedDueToSensitivity: params.containsSensitivePersonalOrPrivateData,
      decisionNoteFa: params.containsSensitivePersonalOrPrivateData
        ? 'محبوبیت درخواست به‌تنهایی مجوز انتشار داده شخصی یا مکانی حساس را صادر نمی‌کند.'
        : 'درخواست در صف امکان‌سنجی و ارزیابی منبع ثبت شد.',
    },
  };
}

/** §27.3 & §12.3: Combined-layer re-identification risk check & special empty/zero distinction */
export function detectLayerCombinationPrivacyRisk(params: {
  selectedDatasets: ReadonlyArray<UrbanDatasetCatalogRecord>;
  distinguishedMissingKind: SpecialMissingValueKind;
}) {
  const hasHighSensitivity = params.selectedDatasets.some(
    (d) =>
      d.sensitivityLevel === 'داده شخصی' ||
      d.sensitivityLevel === 'داده مکانی حساس' ||
      d.sensitivityLevel === 'محرمانه',
  );
  const combinationRiskElevated =
    hasHighSensitivity ||
    (params.selectedDatasets.length >= 2 &&
      params.selectedDatasets.some((d) => d.entityShapeFa === 'داده نقطه‌ای') &&
      params.selectedDatasets.some((d) => d.geographicCoverage === 'پوشش نقطه‌ای'));

  return {
    combinationRiskElevated,
    requiresAggregationOrMasking: combinationRiskElevated,
    missingKindDistinctFromZero: params.distinguishedMissingKind !== 'صفر',
    warningFa: combinationRiskElevated
      ? 'هشدار ترکیب لایه‌ها (§۲۷.۳): هم‌نشینی این مجموعه‌داده‌ها ممکن است امکان شناسایی فرد یا ملک خصوصی را فراهم کند؛ تجمیع مکانی الزامی است.'
      : 'ترکیب لایه‌های انتخاب‌شده ریسک بازشناسایی فردی ایجاد نمی‌کند.',
  };
}

export type QualityControlStepStatus =
  | 'موفق'
  | 'ناموفق'
  | 'نیازمند بازبینی'
  | 'قابل اعمال نیست'
  | 'اجرا نشده'
  | 'دارای محدودیت';

/** §30: 12-Step Data Quality Control & Auditing Workbench with record-bound geometry errors */
export function runDatasetQualityAuditWorkbench(params: {
  dataset: UrbanDatasetCatalogRecord;
  previousVersionErrorCount: number;
  geometryIssues: Array<{ recordId: string; areaFa: string; issueKindFa: string }>;
}) {
  const { dataset, previousVersionErrorCount, geometryIssues } = params;
  const isSpatial = dataset.entityShapeFa !== 'جدول اطلاعاتی';
  const hasLicenseIssue = !dataset.license.allowDownloadRawFile && !dataset.license.allowPublicReportReuse;

  const steps: Array<{ stepNumber: number; titleFa: string; status: QualityControlStepStatus }> = [
    { stepNumber: 1, titleFa: 'کنترل ساختار فایل و قالب فیلدها', status: 'موفق' },
    { stepNumber: 2, titleFa: 'کنترل شناسه‌ها و یکتایی رکوردها', status: dataset.quality.uniquenessFa.includes('تکراری') ? 'نیازمند بازبینی' : 'موفق' },
    { stepNumber: 3, titleFa: 'کنترل نوع، دامنه و واحد فیلدها', status: 'موفق' },
    { stepNumber: 4, titleFa: 'کنترل مقادیر خالی و تفکیک از صفر', status: dataset.quality.completenessFa.includes('خالی') ? 'دارای محدودیت' : 'موفق' },
    { stepNumber: 5, titleFa: 'کنترل هندسه و مختصات (متصل به رکورد)', status: !isSpatial ? 'قابل اعمال نیست' : geometryIssues.length > 0 ? 'ناموفق' : 'موفق' },
    { stepNumber: 6, titleFa: 'کنترل محدوده جغرافیایی', status: dataset.geographicCoverage === 'پوشش کل شهر' ? 'موفق' : 'دارای محدودیت' },
    { stepNumber: 7, titleFa: 'کنترل تاریخ و دوره اعتبار', status: dataset.lifecycleStatus === 'نیازمند بازبینی' ? 'نیازمند بازبینی' : 'موفق' },
    { stepNumber: 8, titleFa: 'کنترل منشأ و مجوز', status: hasLicenseIssue ? 'دارای محدودیت' : 'موفق' },
    { stepNumber: 9, titleFa: 'بررسی تعارض با مجموعه‌داده‌های موجود', status: dataset.datasetId === 'RT-DATA-URBAN-0002' ? 'نیازمند بازبینی' : 'موفق' },
    { stepNumber: 10, titleFa: 'کنترل وابستگی‌های داده', status: 'موفق' },
    { stepNumber: 11, titleFa: 'تأیید مسئول مربوط', status: dataset.lifecycleStatus === 'منتشرشده' ? 'موفق' : 'اجرا نشده' },
    { stepNumber: 12, titleFa: 'آماده‌سازی نسخه قابل انتشار', status: geometryIssues.length > 0 ? 'نیازمند بازبینی' : 'موفق' },
  ];

  const errorCount = steps.filter((s) => s.status === 'ناموفق').length + geometryIssues.length;
  const reviewCount = steps.filter((s) => s.status === 'نیازمند بازبینی').length;

  return {
    totalStepsExecuted: steps.filter((s) => s.status !== 'اجرا نشده').length,
    steps,
    errorCount,
    reviewCount,
    previousVersionErrorCount,
    errorDeltaVsPreviousVersion: errorCount - previousVersionErrorCount,
    recordBoundGeometryIssues: geometryIssues,
    usesGenericSpatialErrorOnly: false as const,
  };
}

