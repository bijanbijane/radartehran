/**
 * Stage 37 — Data Provenance, Quality, Freshness & Trust Interface Engine
 * (RT-UI-DATA-TRUST-001 | مرحله ۳۷: طراحی رابط منشأ، کیفیت، تازگی و اعتمادپذیری داده)
 *
 * Pure deterministic engine enforcing:
 * 1. Separation of Source, Provenance (W3C PROV), Quality (ISO 19157-1 / W3C DQV),
 *    Scoped Verification, and 5-Timestamp Freshness.
 * 2. Prevention of single "Trust Score" or blanket `verified: true` badges.
 * 3. Explicit denominator for Geographic Coverage vs. Statistical Sufficiency.
 * 4. Conflict preservation (`CON-01`..`CON-07`), Snapshot reproducibility, and Rights gating.
 */

export type RadarSourceCategoryId =
  | 'SRC-01'
  | 'SRC-02'
  | 'SRC-03'
  | 'SRC-04'
  | 'SRC-05'
  | 'SRC-06'
  | 'SRC-07'
  | 'SRC-08';

export interface RadarSourceCategorySpec {
  id: RadarSourceCategoryId;
  titleFa: string;
  exampleFa: string;
  natureNoteFa: string;
}

export const RADAR_SOURCE_TAXONOMY: readonly RadarSourceCategorySpec[] = [
  { id: 'SRC-01', titleFa: 'رسمی و نهادی', exampleFa: 'سازمان ثبت، مرکز آمار، شهرداری', natureNoteFa: 'رسمی بودن منبع به‌تنهایی به معنای به‌روز بودن برای قیمت روز بازار نیست.' },
  { id: 'SRC-02', titleFa: 'داده بازار', exampleFa: 'آگهی‌ها و اطلاعات عرضه مسکن', natureNoteFa: 'نشان‌دهنده قیمت پیشنهادی فروشنده است، نه قیمت قطعی معامله.' },
  { id: 'SRC-03', titleFa: 'داده عمومی وب', exampleFa: 'منابع عمومی مجاز شهری', natureNoteFa: 'نیازمند بررسی مجوز بازنشر و تطبیق ساختاری است.' },
  { id: 'SRC-04', titleFa: 'داده مشارکتی', exampleFa: 'گزارش‌ها و اصلاحات ارسالی کاربران', natureNoteFa: 'بدون بررسی شواهد مستقیماً به داده مرجع تبدیل نمی‌شود.' },
  { id: 'SRC-05', titleFa: 'داده تخصصی', exampleFa: 'گزارش کارشناسی یا پژوهشی', natureNoteFa: 'وابسته به دامنه مطالعه و روش‌شناسی نویسنده است.' },
  { id: 'SRC-06', titleFa: 'داده پردازش‌شده', exampleFa: 'خروجی سامانه تحلیل و شاخص‌سازی رادار', natureNoteFa: 'کیفیت آن تابع کیفیت ورودی‌ها و نسخه روش محاسبه است.' },
  { id: 'SRC-07', titleFa: 'داده تخمینی', exampleFa: 'خروجی مدل ارزش‌گذاری هدونیک', natureNoteFa: 'برآورد آماری همراه دامنه عدم‌قطعیت؛ معادل مشاهده مستقیم نیست.' },
  { id: 'SRC-08', titleFa: 'داده مکانی مرجع', exampleFa: 'مرز محله‌ها، قطعات و شبکه معابر', natureNoteFa: 'دقت هندسی آن باید مستقل از صحت نشانی سنجیده شود.' },
];

export type QualityDimensionId =
  | 'Q-01' | 'Q-02' | 'Q-03' | 'Q-04' | 'Q-05' | 'Q-06'
  | 'Q-07' | 'Q-08' | 'Q-09' | 'Q-10' | 'Q-11' | 'Q-12';

export interface QualityDimensionSpec {
  id: QualityDimensionId;
  nameEn: string;
  nameFa: string;
  coreQuestionFa: string;
}

export const RADAR_QUALITY_DIMENSIONS: readonly QualityDimensionSpec[] = [
  { id: 'Q-01', nameEn: 'Completeness', nameFa: 'کامل بودن', coreQuestionFa: 'چه مقدار از فیلدها و رکوردهای الزامی موجود است؟ (Complete ≠ Accurate)' },
  { id: 'Q-02', nameEn: 'Accuracy', nameFa: 'صحت محتوا', coreQuestionFa: 'مقادیر ثبت‌شده تا چه اندازه با واقعیت یا مرجع معتبر تطبیق دارند؟' },
  { id: 'Q-03', nameEn: 'Consistency', nameFa: 'سازگاری', coreQuestionFa: 'آیا فیلدها و رکوردها با یکدیگر تناقض منطقی ندارند؟' },
  { id: 'Q-04', nameEn: 'Validity', nameFa: 'اعتبار ساختاری', coreQuestionFa: 'آیا قالب و دامنه مقادیر از قواعد پیروی می‌کنند؟ (Valid ≠ Accurate)' },
  { id: 'Q-05', nameEn: 'Uniqueness', nameFa: 'یکتایی', coreQuestionFa: 'چه سهمی از رکوردها تکراری یا بازنشر یک ملک واحد هستند؟' },
  { id: 'Q-06', nameEn: 'Timeliness', nameFa: 'به‌روز بودن', coreQuestionFa: 'داده نسبت به زمان مرجع و کاربرد موردنظر چقدر تازه است؟' },
  { id: 'Q-07', nameEn: 'Coverage', nameFa: 'پوشش جغرافیایی', coreQuestionFa: 'داده بر اساس مخرج مشخص چه بخشی از شهر یا جامعه هدف را پوشش می‌دهد؟' },
  { id: 'Q-08', nameEn: 'Positional Accuracy', nameFa: 'دقت مکانی', coreQuestionFa: 'مختصات هندسی تا چه حد دقیق است؟ (مستقل از صحت نشانی)' },
  { id: 'Q-09', nameEn: 'Temporal Accuracy', nameFa: 'دقت زمانی', coreQuestionFa: 'آیا زمان وقوع، دوره اعتبار و زمان دریافت به درستی تفکیک شده‌اند؟' },
  { id: 'Q-10', nameEn: 'Thematic Accuracy', nameFa: 'صحت موضوعی', coreQuestionFa: 'طبقه‌بندی نوع ملک یا کاربری تا چه اندازه صحیح است؟' },
  { id: 'Q-11', nameEn: 'Lineage Completeness', nameFa: 'کامل بودن زنجیره منشأ', coreQuestionFa: 'آیا تمام مراحل تبدیل از منبع اولیه تا شاخص نهایی قابل ردیابی است؟' },
  { id: 'Q-12', nameEn: 'Accessibility', nameFa: 'دسترس‌پذیری داده', coreQuestionFa: 'آیا داده در زمان موردنیاز و با مجوز روشن قابل بازیابی است؟' },
];

export type DataFreshnessStatus = 'Current' | 'Approaching Stale' | 'Stale' | 'Unknown';

export type FiveTimestampBasis =
  | 'event_time'
  | 'valid_time'
  | 'retrieved_at'
  | 'processed_at'
  | 'published_at';

export interface FiveTimestampRecord {
  eventTimeIso?: string | null;
  validTimeLabelFa?: string | null;
  retrievedAtIso?: string | null;
  processedAtIso?: string | null;
  publishedAtIso?: string | null;
}

export interface FreshnessEvaluationResult {
  status: DataFreshnessStatus;
  statusLabelFa: string;
  basisUsed: FiveTimestampBasis;
  ageHours: number | null;
  displaySummaryFa: string;
  historicalValidityNoteFa: string | null;
}

export function evaluateDataFreshnessStatus(input: {
  dataType: 'active_listing' | 'market_index' | 'neighborhood_boundary' | 'census_demographics';
  timestamps: FiveTimestampRecord;
  nowEpochMs?: number;
}): FreshnessEvaluationResult {
  const nowMs = input.nowEpochMs ?? Date.now();
  const thresholdsHours: Record<typeof input.dataType, { warn: number; stale: number; basis: FiveTimestampBasis }> = {
    active_listing: { warn: 72, stale: 168, basis: 'retrieved_at' },
    market_index: { warn: 168, stale: 720, basis: 'processed_at' },
    neighborhood_boundary: { warn: 4320, stale: 8760, basis: 'retrieved_at' },
    census_demographics: { warn: 8760, stale: 26280, basis: 'event_time' },
  };

  const policy = thresholdsHours[input.dataType];
  const rawIso =
    policy.basis === 'processed_at'
      ? input.timestamps.processedAtIso
      : policy.basis === 'event_time'
        ? input.timestamps.eventTimeIso
        : input.timestamps.retrievedAtIso;

  if (!rawIso || !Number.isFinite(Date.parse(rawIso))) {
    return {
      status: 'Unknown',
      statusLabelFa: 'نامشخص (عدم ادعای به‌روز بودن)',
      basisUsed: policy.basis,
      ageHours: null,
      displaySummaryFa: 'زمان مرجع دریافت یا وقوع ثبت نشده است؛ وضعیت تازگی نامشخص اعلام می‌شود.',
      historicalValidityNoteFa: null,
    };
  }

  const ageHours = Math.max(0, Math.round((nowMs - Date.parse(rawIso)) / 3_600_000));
  let status: DataFreshnessStatus = 'Current';
  let statusLabelFa = 'در محدوده تازگی تعریف‌شده';

  if (ageHours >= policy.stale) {
    status = 'Stale';
    statusLabelFa = 'قدیمی‌تر از برنامه به‌روزرسانی';
  } else if (ageHours >= policy.warn) {
    status = 'Approaching Stale';
    statusLabelFa = 'نزدیک به مرز هشدار تازگی';
  }

  const validPeriodPart = input.timestamps.validTimeLabelFa
    ? `دوره اعتبار داده: ${input.timestamps.validTimeLabelFa}`
    : 'دوره اعتبار ثبت‌نشده';

  return {
    status,
    statusLabelFa,
    basisUsed: policy.basis,
    ageHours,
    displaySummaryFa: `${validPeriodPart} | مبنای سنجش تازگی: ${policy.basis} (${ageHours} ساعت قبل)`,
    historicalValidityNoteFa:
      input.dataType === 'census_demographics' && status === 'Stale'
        ? 'داده سرشماری برای مطالعه تاریخی معتبر است، اما نباید به‌عنوان آمار روز جاری معرفی شود.'
        : null,
  };
}

export type VerificationScopeType =
  | 'source_identity'
  | 'structural_schema'
  | 'coordinates_geometry'
  | 'address_match'
  | 'price_observation'
  | 'legal_ownership'
  | 'full_record';

export interface ScopedVerificationInput {
  scope: VerificationScopeType;
  evidenceIds: string[];
  reviewedAtIso: string | null;
}

export interface FourTrustBadgesEvaluation {
  sourceIdentified: boolean;
  structurallyChecked: boolean;
  contentReviewedScopes: VerificationScopeType[];
  provenanceTraceable: boolean;
  allowsFullRecordVerifiedClaim: boolean;
  publicQualificationFa: string;
}

export function evaluateScopedVerificationBadges(input: {
  sourceId: string | null;
  schemaValid: boolean;
  provenanceActivityCount: number;
  scopedVerifications: ScopedVerificationInput[];
}): FourTrustBadgesEvaluation {
  const validScoped = input.scopedVerifications.filter(
    (v) => v.evidenceIds.length > 0 && Boolean(v.reviewedAtIso),
  );
  const scopes = validScoped.map((v) => v.scope);
  const sourceIdentified = Boolean(input.sourceId && input.sourceId.trim().length > 0);
  const provenanceTraceable = input.provenanceActivityCount >= 3;
  const allowsFullRecordVerifiedClaim =
    scopes.includes('full_record') ||
    (scopes.includes('coordinates_geometry') &&
      scopes.includes('price_observation') &&
      scopes.includes('legal_ownership'));

  const scopeLabelsFa: Record<VerificationScopeType, string> = {
    source_identity: 'هویت منبع',
    structural_schema: 'ساختار داده',
    coordinates_geometry: 'موقعیت مکانی',
    address_match: 'تطبیق نشانی',
    price_observation: 'قیمت ثبت‌شده',
    legal_ownership: 'مالکیت قانونی',
    full_record: 'کل رکورد',
  };

  const verifiedNames = scopes.map((s) => scopeLabelsFa[s]).join('، ');
  const publicQualificationFa = allowsFullRecordVerifiedClaim
    ? 'تأیید کامل با شواهد ثبت‌شده'
    : verifiedNames
      ? `تأیید جزئی (صرفاً در دامنه: ${verifiedNames} — سایر فیلدها نیازمند احتیاط)`
      : 'بدون بازبینی محتوایی (صرفاً دریافت و بررسی ساختاری)';

  return {
    sourceIdentified,
    structurallyChecked: input.schemaValid,
    contentReviewedScopes: scopes,
    provenanceTraceable,
    allowsFullRecordVerifiedClaim,
    publicQualificationFa,
  };
}

export type CoverageDenominatorType =
  | 'neighborhood_count'
  | 'area_sqkm'
  | 'statistical_blocks'
  | 'target_parcels';

export function evaluateGeographicCoverageWithDenominator(input: {
  coveredUnits: number;
  totalUnits: number;
  denominatorType: CoverageDenominatorType;
  uniqueSampleCountInArea: number;
  minRequiredSamplesForIndex: number;
}): {
  coveragePct: number;
  denominatorLabelFa: string;
  isStatisticallySufficient: boolean;
  separationWarningFa: string;
} {
  const denomLabels: Record<CoverageDenominatorType, string> = {
    neighborhood_count: 'تعداد محله‌های شهر',
    area_sqkm: 'مساحت جغرافیایی (کیلومترمربع)',
    statistical_blocks: 'بلوک‌های آماری',
    target_parcels: 'قطعات ملکی هدف',
  };
  const coveragePct =
    input.totalUnits > 0
      ? Math.min(100, Math.max(0, Math.round((input.coveredUnits / input.totalUnits) * 100)))
      : 0;
  const isStatisticallySufficient =
    input.uniqueSampleCountInArea >= input.minRequiredSamplesForIndex;

  return {
    coveragePct,
    denominatorLabelFa: denomLabels[input.denominatorType],
    isStatisticallySufficient,
    separationWarningFa:
      coveragePct >= 70 && !isStatisticallySufficient
        ? 'پوشش مکانی مناسب است اما تعداد نمونه یکتا برای محاسبه شاخص آماری کافی نیست (Coverage ≠ Sufficiency).'
        : 'پوشش مکانی و کفایت آماری به‌صورت مستقل ارزیابی شده‌اند.',
  };
}

export type DataRightsStatus =
  | 'Public'
  | 'Restricted'
  | 'Internal'
  | 'Derived'
  | 'Expired Rights'
  | 'Unknown Rights';

export function evaluatePublicationRightsGate(rights: DataRightsStatus): {
  canDisplayPublicly: boolean;
  canExportRaw: boolean;
  policyExplanationFa: string;
} {
  if (rights === 'Public') {
    return { canDisplayPublicly: true, canExportRaw: true, policyExplanationFa: 'انتشار عمومی و دریافت در محدوده مجوز همراه ذکر منبع مجاز است.' };
  }
  if (rights === 'Derived') {
    return { canDisplayPublicly: true, canExportRaw: false, policyExplanationFa: 'نمایش شاخص مشتق‌شده مجاز است، اما بازتوزیع داده خام منبع اولیه مجاز نیست.' };
  }
  return {
    canDisplayPublicly: false,
    canExportRaw: false,
    policyExplanationFa: `به دلیل وضعیت حقوقی «${rights}»، انتشار عمومی بدون احراز مجوز معتبر متوقف شده است.`,
  };
}
