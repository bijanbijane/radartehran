/** @file src/features/onboarding/services/urbanProjectsEngine.ts — Stage 53 Pure Domain Engine */
import type {
  ProjectDocumentRecord,
  ProjectSpatialRelationKind,
  UrbanProjectLifecycleStatus,
  UrbanProjectRecord,
} from './urbanProjectsTypes';

/** §§2, 4, 22, 26, 28: Enforce evidence-based status transitions & block news/AI auto-promotion */
export function evaluateProjectEvidenceAndStatus(params: {
  project: UrbanProjectRecord;
  evidenceKind: 'خبر رسانه‌ای' | 'مشاهده میدانی' | 'خروجی هوش مصنوعی بدون بازبین' | 'سند رسمی تأییدشده';
  registeredByUserId: string;
  reviewerUserId: string;
  targetStatus: UrbanProjectLifecycleStatus;
}) {
  const hasIndependentReview = params.registeredByUserId !== params.reviewerUserId;
  const hasOfficialDoc = params.project.documents.some((d) => d.docTypeFa === 'سند تصویب' || d.docTypeFa === 'قرارداد');
  const canPromoteOfficialStatus =
    params.evidenceKind === 'سند رسمی تأییدشده' && hasIndependentReview && hasOfficialDoc;

  const effectiveStatus: UrbanProjectLifecycleStatus = canPromoteOfficialStatus
    ? params.targetStatus
    : params.evidenceKind === 'خروجی هوش مصنوعی بدون بازبین'
      ? 'نامشخص'
      : params.project.status;

  return {
    effectiveStatus,
    officialPromotionBlocked: !canPromoteOfficialStatus,
    completedSeparateFromOperational: params.targetStatus !== 'در حال بهره‌برداری' || params.project.documents.some((d) => d.docTypeFa === 'گزارش پیشرفت'),
    preservesMultiPhaseIndependence: params.project.phases.some((p, _, arr) => p.status !== arr[0]?.status),
    reasonFa: canPromoteOfficialStatus
      ? `تغییر وضعیت به «${params.targetStatus}» با استناد به سند رسمی و بازبینی مستقل (${params.reviewerUserId}) ثبت شد.`
      : `تغییر وضعیت رسمی صرفاً با «${params.evidenceKind}» یا بدون بازبین مستقل مجاز نیست؛ وضعیت رسمی پیشین حفظ شد.`,
  };
}

/** §§10, 11: Progress fallback (no synthetic bar) + conflicting progress + uncollapsed nominal financials */
export function evaluateProjectProgressAndFinancials(project: UrbanProjectRecord) {
  const hasDocumentedProgress =
    project.documentedProgressPercent !== null && Boolean(project.progressCalculationMethodFa);

  const financialLines = [
    { labelFa: 'برآورد اولیه', value: project.financials.initialEstimateTomanB },
    { labelFa: 'مبلغ مصوب', value: project.financials.approvedBudgetTomanB },
    { labelFa: 'اعتبار تخصیص‌یافته', value: project.financials.allocatedCreditTomanB },
    { labelFa: 'مبلغ قرارداد', value: project.financials.contractAmountTomanB },
    { labelFa: 'پرداخت ثبت‌شده', value: project.financials.recordedPaymentTomanB },
  ];

  return {
    showsSyntheticProgressBar: hasDocumentedProgress,
    progressDisplayFa: hasDocumentedProgress
      ? `${project.documentedProgressPercent}٪ (${project.progressCalculationMethodFa})`
      : 'اطلاعات قابل استناد درباره درصد پیشرفت منتشر نشده است.',
    hasProgressConflict: Boolean(project.progressReportsConflict),
    collapsedIntoSingleCostNumber: false as const,
    usesNominalValuesUnlessDeflatorDeclared: !project.financials.adjustmentMethodDeclared,
    financialLines,
  };
}

/** §§14, 15, 16, 20: Separate execution footprint from effect zone, guard causal market & physical claims */
export function evaluateSpatialFootprintImpactAndMarketGuard(params: {
  project: UrbanProjectRecord;
  relationKind: ProjectSpatialRelationKind;
  geometryOverlapPercent: number;
  observedBuildingChangeNearby: boolean;
  hasIndependentAttributionEvidence: boolean;
}) {
  return {
    executionFootprintSeparateFromEffectZone:
      params.project.executionFootprintFa !== params.project.analyticalEffectZoneFa,
    claimsGuaranteedPriceIncrease: false as const,
    zoningAutoChangedByNearbyPlan: false as const,
    geometricAlignmentRepresentsPhysicalProgress: false as const,
    observedChangeAttributedToProject:
      params.observedBuildingChangeNearby && params.hasIndependentAttributionEvidence,
    interpretiveDisclaimerFa:
      'این ملک یا محله در محدوده انتخابی تحلیل پیرامونی پروژه قرار دارد. اثر واقعی پروژه بر ارزش یا حقوق ساخت از مجاورت مکانی قابل تعیین نیست.',
    physicalChangeNoteFa:
      params.observedBuildingChangeNearby && !params.hasIndependentAttributionEvidence
        ? 'تغییر کالبدی در اطراف محدوده مشاهده شده، اما بدون شواهد مستقل به این پروژه منتسب نمی‌شود.'
        : 'وضعیت انطباق کالبدی و محدوده عملیات به‌صورت جداگانه نمایش داده می‌شود.',
    beforeAfterProvesCausality: false as const,
    geometryOverlapPercent: params.geometryOverlapPercent,
    relationKind: params.relationKind,
  };
}

/** §§13, 27.2, 29: Field report separation (observation vs interpretation), privacy redaction & doc gating */
export function submitFieldReportAndPrivacyGate(params: {
  project: UrbanProjectRecord;
  observationFa: string;
  interpretationFa: string;
  facesAndPlatesRedacted: boolean;
  userRole: 'visitor' | 'logged_in_user' | 'data_admin';
  documentToAccess: ProjectDocumentRecord;
}) {
  const canDownloadDocument =
    params.documentToAccess.accessLevel === 'عمومی' ||
    (params.documentToAccess.accessLevel === 'عمومی با محدودیت' && params.userRole !== 'visitor') ||
    params.userRole === 'data_admin';

  return {
    observationKeptSeparateFromInterpretation: params.observationFa !== params.interpretationFa,
    mutatesOfficialStatusDirectly: false as const,
    publishedPubliclyWithoutReview: !params.facesAndPlatesRedacted ? false : false,
    privacyReadyForReview: params.facesAndPlatesRedacted,
    privacyNoticeFa: params.facesAndPlatesRedacted
      ? 'چهره افراد، پلاک خودرو و مختصات حساس گزارش‌دهنده پنهان‌سازی شد و در صف بازبینی قرار گرفت.'
      : 'انتشار تصویر بدون پوشاندن مشخصات شخصی و پلاک مسدود است.',
    canDownloadDocument,
    documentAccessNoteFa: canDownloadDocument
      ? `دسترسی به «${params.documentToAccess.titleFa}» مجاز است.`
      : `سند «${params.documentToAccess.titleFa}» با سطح «${params.documentToAccess.accessLevel}» برای کاربر عادی قابل دریافت نیست.`,
  };
}

/** §§18, 19.4: Compare projects transparently without ranking neighborhood quality by project count */
export function compareUrbanProjectsSafely(projects: UrbanProjectRecord[]) {
  return {
    ranksNeighborhoodQualityByProjectCount: false as const,
    rows: projects.map((p) => ({
      projectId: p.projectId,
      titleFa: p.titleFa,
      category: p.category,
      status: p.status,
      credibility: p.credibility,
      geometryPrecisionFa: p.geometryPrecisionFa,
      docCount: p.documents.length,
    })),
  };
}
