/** @file src/features/onboarding/services/urbanDataAtlasTypes.ts — Stage 52 (RT-UI-URBAN-DATA-ATLAS-001) Types & Catalogs */

export type UrbanEntityKind = 'لایه نقشه' | 'مجموعه‌داده' | 'شاخص' | 'گزارش' | 'منبع';

export type DataProductionStageKind =
  | 'داده اولیه'
  | 'داده پاک‌سازی‌شده'
  | 'داده استانداردشده'
  | 'داده تجمیعی'
  | 'داده مشتق‌شده'
  | 'شاخص'
  | 'تفسیر تحلیلی';

export type DataProvenanceOriginKind =
  | 'رسمی'
  | 'پژوهشی'
  | 'مشارکتی'
  | 'مشاهده‌شده'
  | 'تجاری'
  | 'داخلی'
  | 'مشتق‌شده'
  | 'برآوردی';

export type DatasetLifecycleStatus =
  | 'پیش‌نویس'
  | 'در حال بررسی'
  | 'آماده انتشار'
  | 'منتشرشده'
  | 'نیازمند بازبینی'
  | 'جایگزین‌شده'
  | 'منسوخ‌شده'
  | 'تعلیق‌شده'
  | 'حذف‌شده از دسترس عمومی';

export type DatasetAccessPolicyLevel =
  | 'عمومی'
  | 'عمومی با محدودیت استفاده'
  | 'قابل مشاهده برای کاربران واردشده'
  | 'قابل استفاده برای کاربران مجاز'
  | 'داخلی'
  | 'محرمانه'
  | 'غیرقابل انتشار';

export type GeographicCoverageStatus =
  | 'پوشش کل شهر'
  | 'پوشش چند منطقه'
  | 'پوشش محله‌های منتخب'
  | 'پوشش محدوده سفارشی'
  | 'پوشش نقطه‌ای'
  | 'پوشش ناقص یا نامشخص';

export type SpecialMissingValueKind =
  | 'صفر'
  | 'مقدار نامشخص'
  | 'اطلاعات ثبت نشده'
  | 'اطلاعات قابل اعمال نیست'
  | 'مقدار حذف‌شده'
  | 'مقدار در انتظار تأیید';

export type SourceConflictType =
  | 'تعارض هویتی'
  | 'تعارض مکانی'
  | 'تعارض زمانی'
  | 'تعارض طبقه‌بندی'
  | 'تعارض مقداری'
  | 'تعارض مرزی'
  | 'تعارض منشأ';

export interface UrbanDatasetLicensePolicy {
  rightsHolderFa: string;
  licenseTypeFa: string;
  allowView: boolean;
  allowAddToMap: boolean;
  allowUseInAnalysis: boolean;
  allowDownloadRawFile: boolean;
  allowPublicReportReuse: boolean;
  attributionRequired: boolean;
  commercialUseAllowed: boolean;
}

export interface NineDimensionDatasetQuality {
  completenessFa: string;
  accuracyFa: string;
  consistencyFa: string;
  freshnessFa: string;
  validityFa: string;
  uniquenessFa: string;
  positionalAccuracyFa: string;
  coverageFa: string;
  traceabilityFa: string;
  usesSingleOpaqueScore: false;
}

export interface UrbanDatasetCatalogRecord {
  datasetId: string;
  technicalName: string;
  titleFa: string;
  categoryFa: string;
  multiTopicTagsFa: string[];
  entityShapeFa: 'داده نقطه‌ای' | 'داده خطی' | 'داده محدوده‌ای' | 'جدول اطلاعاتی' | 'داده شبکه‌ای' | 'سری زمانی';
  productionStage: DataProductionStageKind;
  originKind: DataProvenanceOriginKind;
  publisherFa: string;
  supplierFa: string;
  processorFa: string;
  geographicCoverage: GeographicCoverageStatus;
  coverageScopeNoteFa: string;
  validAtDateFa: string;
  receivedAtDateFa: string;
  lastReviewedAtFa: string;
  expectedReviewDueDateFa: string;
  lifecycleStatus: DatasetLifecycleStatus;
  accessLevel: DatasetAccessPolicyLevel;
  sensitivityLevel: 'عمومی' | 'عمومی با تجمیع' | 'محدود' | 'محرمانه' | 'داده شخصی' | 'داده مکانی حساس';
  version: string;
  recordCount: number;
  isAvailableInRepository: boolean;
  suitableForFa: string[];
  notSuitableForFa: string[];
  license: UrbanDatasetLicensePolicy;
  quality: NineDimensionDatasetQuality;
  dependentLayersDirect: string[];
  dependentReportsIndirect: string[];
}

export interface DatasetSourceConflictRecord {
  conflictId: string;
  datasetIds: string[];
  conflictType: SourceConflictType;
  fieldOrFeatureFa: string;
  sourceAValueFa: string;
  sourceADateFa: string;
  sourceBValueFa: string;
  sourceBDateFa: string;
  status: 'در انتظار بررسی' | 'حل‌شده با سند مرجع' | 'حفظ هر دو نسخه با توضیح' | 'غیرقابل‌حل با شواهد فعلی';
  resolutionNoteFa: string;
}

export interface CitizenCorrectionProposal {
  proposalId: string;
  datasetId: string;
  errorTypeFa: string;
  proposedValueFa: string;
  evidenceSourceFa: string;
  status: 'دریافت‌شده' | 'در انتظار بررسی' | 'نیازمند مدرک' | 'پذیرفته‌شده' | 'ردشده';
  mutatesReferenceDirectly: false;
}

export const STAGE52_BOUNDARIES_8 = [
  { prevStageFa: '۱۶: مدیریت لایه‌ها', roleFa: 'معرفی، شناسنامه‌دارکردن و مدیریت داده‌های پشت لایه‌ها' },
  { prevStageFa: '۱۷: شناخت محله', roleFa: 'معرفی مجموعه‌داده‌های تشکیل‌دهنده اطلاعات محله' },
  { prevStageFa: '۲۳: مرکز دانش', roleFa: 'سازمان‌دهی خود مجموعه‌داده‌ها و مراجع اطلاعاتی' },
  { prevStageFa: '۳۷: اعتماد داده', roleFa: 'ارائه کاتالوگ جامع، منشأ سهگانه و تاریخچه داده' },
  { prevStageFa: '۴۷: دانش حرفه‌ای', roleFa: 'تفکیک مستندات علمی و واژه‌نامه از داده‌های قابل استفاده' },
  { prevStageFa: '۵۰: گزارش‌های بازار', roleFa: 'معرفی داده‌های مرجع مورد استفاده در گزارش‌ها' },
  { prevStageFa: '۵۱: تحلیل مکانی', roleFa: 'معرفی لایه‌ها و مجموعه‌داده‌های ورودی تحلیل‌ها' },
  { prevStageFa: '۵۲: اطلس داده شهری', roleFa: 'مرجع شناخت، کشف، کیفیت و دسترسی کنترل‌شده به داده‌ها' },
] as const;

export const STAGE52_UA_COMPONENT_IDS_45 = Array.from(
  { length: 45 },
  (_, idx) => `UA-${String(idx + 1).padStart(2, '0')}`,
);

export const STAGE52_UX_EVENTS_17 = [
  'urban_catalog_opened', 'dataset_search_submitted', 'dataset_filter_applied',
  'dataset_opened', 'dataset_source_opened', 'dataset_coverage_opened',
  'dataset_quality_opened', 'dataset_version_opened', 'dataset_comparison_created',
  'dataset_saved', 'dataset_layer_added', 'dataset_access_requested',
  'dataset_issue_reported', 'dataset_update_viewed', 'dataset_export_requested',
  'dataset_request_submitted', 'dataset_conflict_reviewed',
] as const;
