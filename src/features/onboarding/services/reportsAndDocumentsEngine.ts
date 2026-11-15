/** @file src/features/onboarding/services/reportsAndDocumentsEngine.ts — Stage 40 (RT-UI-REPORTS-001) Pure Engine */
export type ReportTypeId = 'property' | 'neighborhood' | 'market' | 'comparison' | 'valuation' | 'changes_history';
export type ReportTemplateId = 'formal' | 'analytical' | 'summary';
export type ReportExportFormat = 'pdf' | 'xlsx' | 'csv' | 'chart_image';
export type ReportDataClassification = 'registered' | 'verified' | 'computed' | 'estimated';
export type ReportMode = 'snapshot' | 'dynamic';
export type ReportGenerationStatus =
  | 'draft'
  | 'ready'
  | 'preparing'
  | 'generating_file'
  | 'ready_to_download'
  | 'partial'
  | 'failed'
  | 'expired';
export type ReportShareMode = 'private' | 'limited_link' | 'specific_user' | 'public';

export interface ReportTypeCatalogItem {
  id: ReportTypeId;
  titleFa: string;
  descriptionFa: string;
  phase: 1 | 2;
  availableFormats: ReportExportFormat[];
  defaultSections: ReportSectionSpec[];
}

export interface ReportSectionSpec {
  id: string;
  titleFa: string;
  required: boolean;
  selected: boolean;
  hasSufficientData: boolean;
  missingDataDisclosureFa?: string;
}

export interface ReportClaimItem {
  statementFa: string;
  classification: ReportDataClassification;
  sourceLabelFa: string;
  referencePeriodFa: string;
  sampleCount: number;
}

export interface ReportDraftSpec {
  reportId: string;
  titleFa: string;
  type: ReportTypeId;
  subjectId: string;
  subjectTitleFa: string;
  geoBoundaryLabelFa: string;
  timeRangeLabelFa: string;
  template: ReportTemplateId;
  mode: ReportMode;
  format: ReportExportFormat;
  sections: ReportSectionSpec[];
  claims: ReportClaimItem[];
  dataReferenceDateLabelFa: string;
  generatedAtLabelFa: string;
  dataAgeDays: number;
  sampleCount: number;
  minRequiredSamples: number;
  hasUnverifiedData: boolean;
  hasBoundaryChange: boolean;
  containsPrivatePii: boolean;
  inheritedComparisonWeights?: Record<string, number>;
  incomparableWarningFa?: string;
  methodologyVersion: string;
}

export interface ReportVersionRecord {
  version: number;
  versionId: string;
  createdAtLabelFa: string;
  dataReferenceDateLabelFa: string;
  template: ReportTemplateId;
  mode: ReportMode;
  format: ReportExportFormat;
  changeNoteFa: string;
  snapshotFrozen: boolean;
  status: ReportGenerationStatus;
}

export interface StoredReportDocument {
  reportId: string;
  titleFa: string;
  type: ReportTypeId;
  subjectTitleFa: string;
  mode: ReportMode;
  currentVersion: number;
  versions: ReportVersionRecord[];
  shareMode: ReportShareMode;
  shareToken?: string;
  shareExpiryDays?: number;
  containsPrivatePii: boolean;
  draft: ReportDraftSpec;
}

export const STAGE40_DESIGN_COMPONENT_IDS = [
  'RPT-01', 'RPT-02', 'RPT-03', 'RPT-04', 'RPT-05', 'RPT-06', 'RPT-07', 'RPT-08', 'RPT-09',
  'RPT-10', 'RPT-11', 'RPT-12', 'RPT-13', 'RPT-14', 'RPT-15', 'RPT-16', 'RPT-17', 'RPT-18',
  'RPT-19', 'RPT-20', 'RPT-21', 'RPT-22', 'RPT-23', 'RPT-24', 'RPT-25',
] as const;

export const REPORT_BUILDER_STEPS = [
  { step: 1, titleFa: 'انتخاب نوع گزارش' },
  { step: 2, titleFa: 'انتخاب موضوع' },
  { step: 3, titleFa: 'انتخاب بخش‌ها' },
  { step: 4, titleFa: 'تعیین بازه زمانی' },
  { step: 5, titleFa: 'قالب و فرمت خروجی' },
  { step: 6, titleFa: 'بازبینی و پیش‌نمایش' },
  { step: 7, titleFa: 'تولید و ذخیره در آرشیو' },
] as const;

export const DATA_CLASSIFICATION_LABELS_FA: Record<ReportDataClassification, string> = {
  registered: 'داده ثبت‌شده',
  verified: 'داده تأییدشده',
  computed: 'مقدار محاسبه‌شده',
  estimated: 'مقدار تخمینی',
};

export const REPORT_TEMPLATES_FA: Array<{ id: ReportTemplateId; titleFa: string; usageFa: string }> = [
  { id: 'formal', titleFa: 'قالب رسمی', usageFa: 'مناسب ارائه کاری و جلسات سازمانی' },
  { id: 'analytical', titleFa: 'قالب تحلیلی', usageFa: 'مناسب بررسی دقیق داده، جدول و نمودار' },
  { id: 'summary', titleFa: 'قالب خلاصه', usageFa: 'مناسب مرور سریع و تصمیم‌گیری فشرده' },
];

export const NEIGHBORHOOD_11_SECTIONS: ReportSectionSpec[] = [
  { id: 'exec_summary', titleFa: 'خلاصه اجرایی', required: true, selected: true, hasSufficientData: true },
  { id: 'intro_location', titleFa: 'معرفی و موقعیت محله', required: true, selected: true, hasSufficientData: true },
  { id: 'map_boundary', titleFa: 'نقشه و مرز جغرافیایی', required: false, selected: true, hasSufficientData: true },
  { id: 'price_indices', titleFa: 'شاخص‌های قیمت پیشنهادی', required: false, selected: true, hasSufficientData: true },
  { id: 'rent_indices', titleFa: 'شاخص‌های اجاره', required: false, selected: true, hasSufficientData: false, missingDataDisclosureFa: 'تعداد آگهی اجاره ثبت‌شده در این دوره زیر حداقل آستانه آماری است؛ مقدار ساختگی درج نمی‌شود.' },
  { id: 'time_trends', titleFa: 'روند تغییرات زمانی', required: false, selected: true, hasSufficientData: true },
  { id: 'listings_sample', titleFa: 'آگهی‌ها و حجم نمونه', required: false, selected: true, hasSufficientData: true },
  { id: 'urban_access', titleFa: 'خدمات و دسترسی‌های شهری', required: false, selected: true, hasSufficientData: true },
  { id: 'peer_compare', titleFa: 'مقایسه با محله‌های دیگر', required: false, selected: true, hasSufficientData: true },
  { id: 'sources_method', titleFa: 'منابع و روش محاسبه', required: true, selected: true, hasSufficientData: true },
  { id: 'data_limits', titleFa: 'محدودیت‌های داده', required: true, selected: true, hasSufficientData: true },
];

export const REPORT_TYPE_CATALOG: ReportTypeCatalogItem[] = [
  { id: 'property', titleFa: 'گزارش اختصاصی ملک', descriptionFa: 'بررسی مشخصات، موقعیت، قیمت پیشنهادی (نه معامله قطعی)، بازه تخمینی و وضعیت داده یک ملک', phase: 1, availableFormats: ['pdf', 'xlsx', 'csv'], defaultSections: NEIGHBORHOOD_11_SECTIONS.slice(0, 8) },
  { id: 'neighborhood', titleFa: 'گزارش تحلیلی محله', descriptionFa: 'تحلیل مرز جغرافیایی، شاخص‌های بازار، وضعیت عرضه، دسترسی‌ها، منابع و محدودیت‌های محله', phase: 1, availableFormats: ['pdf', 'xlsx', 'csv', 'chart_image'], defaultSections: NEIGHBORHOOD_11_SECTIONS },
  { id: 'comparison', titleFa: 'گزارش مقایسه چند گزینه', descriptionFa: 'انتقال مستقیم از مرحله ۳۸ با حفظ ترتیب گزینه‌ها، معیارها، وزن‌ها و هشدارهای عدم هم‌ارزی', phase: 1, availableFormats: ['pdf', 'xlsx', 'csv'], defaultSections: NEIGHBORHOOD_11_SECTIONS.slice(0, 6).concat(NEIGHBORHOOD_11_SECTIONS.slice(9)) },
  { id: 'market', titleFa: 'گزارش وضعیت بازار', descriptionFa: 'روند قیمت پیشنهادی، حجم نمونه، تفاوت مناطق و نقاط دارای داده کافی یا ناکافی', phase: 2, availableFormats: ['pdf', 'xlsx', 'csv', 'chart_image'], defaultSections: NEIGHBORHOOD_11_SECTIONS.slice(0, 7).concat(NEIGHBORHOOD_11_SECTIONS.slice(9)) },
  { id: 'valuation', titleFa: 'گزارش ارزش‌گذاری', descriptionFa: 'مستندات برآورد تخمینی، داده‌های ورودی و نسخه مدل (به‌عنوان کارشناسی رسمی معرفی نمی‌شود)', phase: 2, availableFormats: ['pdf', 'xlsx'], defaultSections: NEIGHBORHOOD_11_SECTIONS.slice(0, 4).concat(NEIGHBORHOOD_11_SECTIONS.slice(9)) },
  { id: 'changes_history', titleFa: 'گزارش تاریخچه تغییرات', descriptionFa: 'انتقال مستقیم از مرحله ۳۹ شامل وقایع پایش، تاریخ وقوع، تاریخ دریافت و کیفیت داده', phase: 2, availableFormats: ['pdf', 'csv'], defaultSections: NEIGHBORHOOD_11_SECTIONS.slice(0, 2).concat(NEIGHBORHOOD_11_SECTIONS.slice(5, 7), NEIGHBORHOOD_11_SECTIONS.slice(9)) },
];

export const STAGE40_REPORT_UX_EVENTS = [
  'report_builder_opened', 'report_type_selected', 'report_subject_selected', 'report_sections_updated',
  'report_preview_opened', 'report_generation_started', 'report_generation_completed', 'report_generation_failed',
  'report_downloaded', 'report_saved', 'report_version_created', 'report_shared', 'report_deleted',
] as const;

export function toggleReportSectionSafely(sections: ReportSectionSpec[], sectionId: string): ReportSectionSpec[] {
  return sections.map((s) => (s.id === sectionId && !s.required ? { ...s, selected: !s.selected } : s));
}

export function evaluateReportPreGenerationAudit(draft: ReportDraftSpec): {
  warningsFa: string[];
  isDateSeparated: boolean;
  incompleteSectionIds: string[];
  canExport: boolean;
} {
  const warningsFa: string[] = [];
  const isDateSeparated = draft.dataReferenceDateLabelFa !== draft.generatedAtLabelFa;
  if (draft.dataAgeDays > 7) {
    warningsFa.push(`هشدار کهنگی داده: تاریخ مرجع اطلاعات (${draft.dataReferenceDateLabelFa}) با تاریخ تولید گزارش (${draft.generatedAtLabelFa}) متفاوت است (${draft.dataAgeDays} روز قدمت).`);
  }
  if (draft.sampleCount < draft.minRequiredSamples) {
    warningsFa.push(`هشدار حجم نمونه ناکافی: تنها ${draft.sampleCount} نمونه از حداقل ${draft.minRequiredSamples} نمونه موجود است.`);
  }
  if (draft.hasUnverifiedData) warningsFa.push('بخشی از داده‌های این گزارش هنوز تأیید نهایی نشده است و با برچسب مجزا نمایش داده می‌شود.');
  if (draft.hasBoundaryChange) warningsFa.push('تغییر مرز جغرافیایی محله (BOUNDARY-V2 ← V3) در سوابق ثبت شده و مقایسه تاریخی نیازمند احتیاط است.');
  if (draft.incomparableWarningFa) warningsFa.push(draft.incomparableWarningFa);
  const incompleteSectionIds = draft.sections.filter((s) => s.selected && !s.hasSufficientData).map((s) => s.id);
  if (incompleteSectionIds.length > 0) {
    warningsFa.push(`${incompleteSectionIds.length} بخش انتخاب‌شده فاقد داده کافی است و بدون عددسازی در سند علامت‌گذاری می‌شود.`);
  }
  return { warningsFa, isDateSeparated, incompleteSectionIds, canExport: draft.sections.some((s) => s.selected) };
}

export function handleReportGenerationOutcome(
  draft: ReportDraftSpec,
  outcome: 'ready_to_download' | 'failed',
): { status: ReportGenerationStatus; messageFa: string; preservedDraft: ReportDraftSpec } {
  if (outcome === 'failed') {
    return {
      status: 'failed',
      messageFa: 'ساخت فایل کامل نشد. تنظیمات گزارش حفظ شده‌اند و می‌توانید دوباره تلاش کنید.',
      preservedDraft: { ...draft, sections: draft.sections.map((s) => ({ ...s })) },
    };
  }
  return { status: 'ready_to_download', messageFa: 'فایل گزارش با موفقیت آماده و در آرشیو ثبت شد.', preservedDraft: draft };
}

export function applyReportMetadataOrVersionUpdate(
  doc: StoredReportDocument,
  action: { kind: 'rename'; newTitleFa: string } | { kind: 'new_analytical_version'; newDataRefDateFa: string; noteFa: string },
): { updatedDoc: StoredReportDocument; createsNewVersion: boolean } {
  if (action.kind === 'rename') {
    return {
      createsNewVersion: false,
      updatedDoc: { ...doc, titleFa: action.newTitleFa, draft: { ...doc.draft, titleFa: action.newTitleFa } },
    };
  }
  const nextVer = doc.currentVersion + 1;
  const newVersionRec: ReportVersionRecord = {
    version: nextVer,
    versionId: `${doc.reportId}-v${nextVer}`,
    createdAtLabelFa: '۱۴ آبان ۱۴۰۵',
    dataReferenceDateLabelFa: action.newDataRefDateFa,
    template: doc.draft.template,
    mode: doc.mode,
    format: doc.draft.format,
    changeNoteFa: action.noteFa,
    snapshotFrozen: doc.mode === 'snapshot',
    status: 'ready_to_download',
  };
  return {
    createsNewVersion: true,
    updatedDoc: { ...doc, currentVersion: nextVer, versions: [...doc.versions, newVersionRec] },
  };
}

export function evaluateReportSharePermissions(params: {
  requestedMode: ReportShareMode;
  containsPrivatePii: boolean;
  expiryDays: number;
  allowDownload: boolean;
}): { allowed: boolean; effectiveMode: ReportShareMode; shareToken?: string; reasonFa: string } {
  if (params.requestedMode === 'public' && params.containsPrivatePii) {
    return {
      allowed: false,
      effectiveMode: 'private',
      reasonFa: 'گزارش حاوی اطلاعات خصوصی یا شخصی است و به‌طور خودکار فقط در حالت خصوصی باقی می‌ماند.',
    };
  }
  if (params.requestedMode === 'limited_link' && params.expiryDays <= 0) {
    return { allowed: false, effectiveMode: 'private', reasonFa: 'برای لینک محدود تعیین تاریخ انقضا الزامی است.' };
  }
  const token = params.requestedMode === 'private' ? undefined : `rtsec_${Math.abs(params.expiryDays * 97 + (params.allowDownload ? 13 : 7)).toString(36)}x9k`;
  return { allowed: true, effectiveMode: params.requestedMode, shareToken: token, reasonFa: 'تنظیمات دسترسی و حریم خصوصی با موفقیت اعمال شد.' };
}

export function generateRealReportCsvExport(draft: ReportDraftSpec): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const headers = ['شناسه گزارش', 'موضوع', 'بخش/گزاره', 'نوع داده', 'منبع', 'دوره مرجع', 'تاریخ مرجع داده', 'تاریخ تولید', 'حجم نمونه'];
  const rows = draft.claims.map((c) => [
    draft.reportId,
    draft.subjectTitleFa,
    c.statementFa,
    DATA_CLASSIFICATION_LABELS_FA[c.classification],
    c.sourceLabelFa,
    c.referencePeriodFa,
    draft.dataReferenceDateLabelFa,
    draft.generatedAtLabelFa,
    c.sampleCount > 0 ? String(c.sampleCount) : 'داده کافی موجود نیست',
  ]);
  return `\uFEFF${[headers, ...rows].map((r) => r.map(esc).join(',')).join('\n')}`;
}
