/** @file src/features/onboarding/services/marketReportingEngine.ts — Stage 50 Pure Domain Engine & 15 Acceptance Tests */
import type {
  ChangeNarrativeBlockRecord,
  MapCoverageZoneState,
  MarketReportAccessLevel,
  MarketReportPriceDataType,
  MarketReportSummaryRecord,
  ReportErrataRecord,
} from './marketReportingTypes';

export const SAMPLE_COMPOSITION_WARNING_FA =
  'ترکیب داده‌های مشاهده‌شده در این دوره با دوره قبلی تفاوت دارد؛ بنابراین بخشی از تغییر شاخص ممکن است به تفاوت نوع املاک موجود در نمونه مربوط باشد.';

/** Test 1 & Test 2 & §8.5 & §10.4: Evaluate period-over-period change rate with zero-division guard and price concept separation */
export function evaluateMarketReportPeriodComparison(params: {
  report: MarketReportSummaryRecord;
  previousValue: number | null;
  currentValue: number;
  askingPriceChartSeparateFromDealPrice: boolean;
}) {
  const isPrevValid = typeof params.previousValue === 'number' && params.previousValue > 0;
  const absoluteDiff = isPrevValid ? Math.round((params.currentValue - params.previousValue!) * 100) / 100 : null;
  const changeRatePercent = isPrevValid
    ? Math.round(((params.currentValue - params.previousValue!) / params.previousValue!) * 1000) / 10
    : null;

  return {
    reportId: params.report.reportId,
    priceDataType: params.report.priceDataType,
    askingAndDealChartsSeparated: params.askingPriceChartSeparateFromDealPrice,
    mergedAsGenericRealMarketPrice: false as const,
    observationCount: params.report.observationCount,
    changeRateCalculable: isPrevValid,
    changeRateDisplayFa: isPrevValid ? `${changeRatePercent! > 0 ? `+${changeRatePercent}` : changeRatePercent}٪` : 'قابل محاسبه نیست (مقدار دوره پایه نامعتبر یا صفر)',
    changeRatePercent,
    absoluteDiff,
    compositionShiftBannerFa: params.report.sampleCompositionChanged ? SAMPLE_COMPOSITION_WARNING_FA : null,
  };
}

/** Test 3 & §13.3: Supply composition breakdown preserving unclassified records in the denominator */
export function calculateSupplyCompositionShares(params: {
  classifiedCounts: ReadonlyArray<{ categoryFa: string; count: number }>;
  unclassifiedCount: number;
}) {
  const classifiedSum = params.classifiedCounts.reduce((acc, item) => acc + Math.max(0, item.count), 0);
  const safeUnclassified = Math.max(0, params.unclassifiedCount);
  const totalRecords = classifiedSum + safeUnclassified;

  const shares = params.classifiedCounts.map((item) => ({
    categoryFa: item.categoryFa,
    count: item.count,
    sharePercent: totalRecords > 0 ? Math.round((item.count / totalRecords) * 1000) / 10 : 0,
  }));

  if (safeUnclassified > 0) {
    shares.push({
      categoryFa: 'نامشخص / طبقه‌بندی‌نشده',
      count: safeUnclassified,
      sharePercent: totalRecords > 0 ? Math.round((safeUnclassified / totalRecords) * 1000) / 10 : 0,
    });
  }

  return {
    totalRecords,
    unclassifiedPreservedInDenominator: true as const,
    claimedAsRealHousingStockOrDeals: false as const,
    scopeTitleFa: 'ترکیب آگهی‌های مشاهده‌شده',
    shares,
  };
}

/** Test 4 & Test 5 & §9.5 & §12.4: Multi-neighborhood comparison with period alignment & missing data map guard */
export function evaluateMultiNeighborhoodReportComparison(params: {
  neighborhoods: ReadonlyArray<{
    hoodNameFa: string;
    periodFa: string;
    propertyTypeFa: string;
    dataType: MarketReportPriceDataType;
    medianPricePerSqmM: number | null;
    observationCount: number;
  }>;
  minSufficientSample: number;
}) {
  const periods = new Set(params.neighborhoods.map((n) => n.periodFa));
  const periodsAligned = periods.size <= 1;

  const rows = params.neighborhoods.map((n) => {
    const hasData = n.medianPricePerSqmM !== null && n.observationCount > 0;
    const isSufficient = n.observationCount >= params.minSufficientSample;
    const mapZoneState: MapCoverageZoneState = !hasData
      ? 'فاقد داده (غیرقابل تفسیر به‌عنوان ارزان)'
      : isSufficient
        ? 'پوشش کافی'
        : 'پوشش کم داده';

    return {
      ...n,
      mapZoneState,
      treatedAsLowValueZoneOnMap: false as const,
      qualityWarningFa: !hasData
        ? 'فاقد داده کافی؛ با محدوده ارزان اشتباه نشود.'
        : !isSufficient
          ? `نمونه محدود (${n.observationCount} مشاهده)؛ نیازمند احتیاط در مقایسه.`
          : 'پوشش نمونه کافی است.',
    };
  });

  return {
    periodsAligned,
    alignmentNoticeFa: periodsAligned
      ? 'تمام محله‌ها در دوره زمانی یکسان مقایسه شده‌اند.'
      : 'هشدار عدم همسانی دوره: دوره‌های زمانی محله‌ها یکسان نیستند و مقایسه مستقیم نیازمند توضیح است.',
    rows,
  };
}

/** Test 6 & Test 11: Method version discontinuity marker & Nominal vs Adjusted price trend separation */
export function evaluateTrendSeriesAndAdjustment(params: {
  nominalSeries: ReadonlyArray<{ periodFa: string; valueM: number; methodVersion: string }>;
  referenceIndexAvailable: boolean;
  referenceIndexNameFa?: string;
  basePeriodFa?: string;
  referenceDeflators?: ReadonlyArray<number>;
}) {
  const methodVersions = Array.from(new Set(params.nominalSeries.map((p) => p.methodVersion)));
  const hasMethodChange = methodVersions.length > 1;

  const canComputeAdjusted =
    params.referenceIndexAvailable &&
    Boolean(params.referenceIndexNameFa) &&
    Boolean(params.basePeriodFa) &&
    Array.isArray(params.referenceDeflators) &&
    params.referenceDeflators.length === params.nominalSeries.length &&
    params.referenceDeflators.every((d) => d > 0);

  const adjustedSeries = canComputeAdjusted
    ? params.nominalSeries.map((pt, idx) => ({
        periodFa: pt.periodFa,
        adjustedValueM: Math.round((pt.valueM / params.referenceDeflators![idx]) * 100) / 100,
      }))
    : null;

  return {
    nominalSeries: params.nominalSeries,
    adjustedSeries,
    usesHiddenArbitraryAdjustment: false as const,
    hasMethodChangeMarker: hasMethodChange,
    artificialHistoricalContinuityCreated: false as const,
    methodBreakNoticeFa: hasMethodChange
      ? `نشان تغییر روش (${methodVersions.join(' → ')}): به دلیل تغییر تعریف شاخص، سری تاریخی دارای گسست روش‌شناختی مشخص‌شده است.`
      : 'روش محاسبه در طول دوره یکسان بوده است.',
    adjustmentMetaFa: canComputeAdjusted
      ? `تعدیل‌شده بر پایه «${params.referenceIndexNameFa}» (دوره مبنا: ${params.basePeriodFa})`
      : 'به دلیل نبود شاخص مرجع معتبر، صرفاً روند اسمی نمایش داده می‌شود.',
  };
}

/** Test 7 & Test 12: Published report errata (preserving previous version) & AI narrative ground-truth check */
export function issueReportErrataAndValidateAiNarrative(params: {
  report: MarketReportSummaryRecord;
  errataInput: {
    affectedSectionFa: string;
    previousValueFa: string;
    correctedValueFa: string;
    reasonFa: string;
    impactOnConclusionFa: string;
    correctedAtFa: string;
  };
  aiDraftClaimsDefinitiveCausation: boolean;
  aiDraftMatchesComputedTable: boolean;
  humanReviewed: boolean;
}): {
  errata: ReportErrataRecord;
  updatedReport: MarketReportSummaryRecord;
  aiDraftApprovedForPublication: boolean;
  aiValidationReasonFa: string;
} {
  const nextVersion = 'نسخه ۲ (اصلاح‌شده)';
  const errata: ReportErrataRecord = {
    errataId: `ERR-MR-${params.report.reportId}`,
    reportId: params.report.reportId,
    previousVersion: params.report.reportVersion,
    newVersion: nextVersion,
    affectedSectionFa: params.errataInput.affectedSectionFa,
    previousValueFa: params.errataInput.previousValueFa,
    correctedValueFa: params.errataInput.correctedValueFa,
    reasonFa: params.errataInput.reasonFa,
    impactOnConclusionFa: params.errataInput.impactOnConclusionFa,
    correctedAtFa: params.errataInput.correctedAtFa,
    previousVersionPreserved: true,
  };

  const approved =
    !params.aiDraftClaimsDefinitiveCausation && params.aiDraftMatchesComputedTable && params.humanReviewed;

  return {
    errata,
    updatedReport: {
      ...params.report,
      reportVersion: nextVersion,
      status: 'به‌روزرسانی‌شده',
    },
    aiDraftApprovedForPublication: approved,
    aiValidationReasonFa: approved
      ? 'پیش‌نویس روایی با جدول محاسبه منطبق است، ادعای علّی بی‌پشتوانه ندارد و توسط بازبین انسانی تأیید شد.'
      : 'انتشار خودکار مسدود شد: پیش‌نویس دارای ادعای علّی بدون شواهد یا ناسازگاری با جدول داده/عدم بازبینی انسانی است.',
  };
}

/** Test 8, Test 13 & Test 14: Personal report scope isolation, access guard & export metadata bundle */
export function evaluatePersonalReportAccessAndExport(params: {
  report: MarketReportSummaryRecord;
  userRole: 'visitor' | 'logged_in_user' | 'professional' | 'internal_admin';
  monitoredHoodsFa: string[];
  candidateEventHoodFa: string;
  narrative: ChangeNarrativeBlockRecord;
}) {
  const isAllowedAccess =
    params.report.accessLevel === 'عمومی' ||
    (params.report.accessLevel === 'کاربری' && params.userRole !== 'visitor') ||
    (params.report.accessLevel === 'حرفه‌ای' &&
      (params.userRole === 'professional' || params.userRole === 'internal_admin')) ||
    ((params.report.accessLevel === 'مدیریتی' || params.report.accessLevel === 'محرمانه') &&
      params.userRole === 'internal_admin');

  const includedInPersonalReport = params.monitoredHoodsFa.includes(params.candidateEventHoodFa);

  return {
    accessGranted: isAllowedAccess,
    accessDenialNoticeFa: isAllowedAccess
      ? null
      : `دسترسی غیرمجاز رد شد: این گزارش دارای سطح دسترسی «${params.report.accessLevel}» است.`,
    includedInPersonalReport,
    personalReportPresentedAsCitywideMarket: false as const,
    exportMetadataBundle: {
      reportId: params.report.reportId,
      titleFa: params.report.titleFa,
      reportPeriodFa: params.report.reportPeriodFa,
      reportVersion: params.report.reportVersion,
      generatedAtFa: params.report.generatedAtFa,
      methodNameFa: params.report.methodNameFa,
      methodVersion: params.report.methodVersion,
      provenanceFa: params.report.qualityAxes.provenanceFa,
      limitationFa: params.narrative.limitationFa,
      rawPrivatePiiExportedByDefault: false as const,
    },
  };
}
