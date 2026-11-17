/** @file src/features/knowledge/data/knowledgeSourcesAndBriefs.ts — Stage 82–85 Source Registry, Provenance Rules, Data Briefs & Local Draft Helpers */
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import type {
  KnowledgeCorrectionInput,
  KnowledgeIndicatorCalculationStatus,
  KnowledgeSourceLicenseStatus,
  KnowledgeSourceRecord,
} from '../types/knowledge.types';

export type { KnowledgeSourceRecord, KnowledgeSourceLicenseStatus };

export interface KnowledgeDataBrief {
  briefId: string;
  titleFa: string;
  headlineFa: string;
  metricValueFa: string;
  unitFa: string;
  geographyFa: string;
  periodFa: string;
  sourceId: string;
  methodVersion: string;
  limitationFa: string;
  linkedReportId: string;
  calculationStatus: KnowledgeIndicatorCalculationStatus;
  sampleSize?: number;
  datasetVersion?: string;
  targetView: PrimaryViewId;
  targetSubTab?: ModuleSubTabId;
}

export const KNOWLEDGE_SOURCE_REGISTRY: readonly KnowledgeSourceRecord[] = [
  {
    sourceId: 'src-radar-listings',
    titleFa: 'دیتاست آگهی‌های پایش‌شده مسکونی تهران',
    creatorFa: 'موتور پالایش رادار تهران',
    sourceTypeFa: 'داده داخلی پایش‌شده',
    licenseStatus: 'approved',
    version: '2026.11-r1',
    reliabilityNoteFa: 'مبتنی بر مظنه پیشنهادی فروشندگان پس از حذف تکراری و فیلتر IQR؛ فاقد قیمت قطعی دفترخانه‌ای.',
    acquiredAt: '2026-10-01T00:00:00.000Z',
    lastVerifiedAt: '2026-11-10T00:00:00.000Z',
    geographicCoverage: 'تهران (مناطق ۱ تا ۲۲)',
    temporalCoverage: 'مهر و آبان ۱۴۰۵ (پنجره ۳۰ روزه)',
    updateFrequency: 'روزانه پس از پالایش موارد تکراری',
    attributionRequired: true,
    restrictionsFa: ['استفاده صرفاً جهت تحلیل دامنه مظنه پیشنهادی؛ جایگزین قیمت ثبتی نیست.'],
  },
  {
    sourceId: 'src-tehran-gis',
    titleFa: 'لایه مکانی ایستگاه‌های مترو و محدوده طرح ترافیک تهران',
    creatorFa: 'واحد داده‌های شهری و GIS رادار',
    sourceTypeFa: 'لایه GIS شهری',
    licenseStatus: 'approved',
    version: 'gis-tehran-v3.2',
    reliabilityNoteFa: 'مختصات ایستگاه‌های فعال و خطوط رینگ ترافیکی؛ تغییرات اجرایی جدید پس از راستی‌آزمایی به‌روزرسانی می‌شود.',
    acquiredAt: '2026-09-15T00:00:00.000Z',
    lastVerifiedAt: '2026-11-01T00:00:00.000Z',
    geographicCoverage: 'شبکه ریلی و معابر شهری تهران',
    temporalCoverage: 'پاییز ۱۴۰۵',
    updateFrequency: 'فصلی',
    attributionRequired: true,
    restrictionsFa: ['فاصله هندسی جایگزین زمان سفر واقعی در ساعات اوج ترافیک نیست.'],
  },
  {
    sourceId: 'src-hedonic-v64',
    titleFa: 'مدل تعدیل نقدشوندگی و ارزش‌گذاری هدونیک (v6.4 / v1405.1)',
    creatorFa: 'کارگروه مدل‌سازی ارزش‌گذاری رادار',
    sourceTypeFa: 'مدل تحلیلی رادار',
    licenseStatus: 'approved',
    version: 'v6.4 / v1405.1',
    reliabilityNoteFa: 'خروجی برآوردی جهت مقایسه و مذاکره است؛ جایگزین کارشناسی رسمی ثبتی نیست.',
    acquiredAt: '2026-10-10T00:00:00.000Z',
    lastVerifiedAt: '2026-11-12T00:00:00.000Z',
    geographicCoverage: 'سراسر تهران و شهرهای فعال رادار',
    temporalCoverage: 'سال ۱۴۰۵',
    updateFrequency: 'نسخه‌بندی ماهانه ضرایب',
    attributionRequired: true,
    restrictionsFa: ['ضریب نقدشوندگی سناریوی تحلیلی است و آمار معاملات قطعی محسوب نمی‌شود.'],
  },
  {
    sourceId: 'src-epistemic-spec',
    titleFa: 'استاندارد معرفت‌شناسی و حاکمیت داده رادار تهران',
    creatorFa: 'شورای روش‌شناسی و بازبینی فنی رادار',
    sourceTypeFa: 'سند روش‌شناسی',
    licenseStatus: 'approved',
    version: 'epistemic-v4.0',
    reliabilityNoteFa: 'چارچوب تفکیک چهارلایه داده خام، دیتاست، شاخص محاسبه‌شده و تفسیر پژوهشی.',
    acquiredAt: '2026-08-01T00:00:00.000Z',
    lastVerifiedAt: '2026-11-14T00:00:00.000Z',
    geographicCoverage: 'کل سامانه رادار تهران',
    temporalCoverage: 'دائمی (نسخه ۴)',
    updateFrequency: 'بازبینی فصلی',
    attributionRequired: false,
    restrictionsFa: [],
  },
  {
    sourceId: 'src-historic-fabric-1404',
    titleFa: 'آرشیو ممیزی کالبدی و ظرفیت پارکینگ بافت ریزدانه',
    creatorFa: 'پژوهشکده داده‌های شهری و GIS',
    sourceTypeFa: 'داده داخلی پایش‌شده',
    licenseStatus: 'restricted',
    version: 'fabric-audit-1404.2',
    reliabilityNoteFa: 'داده آرشیوی تابستان؛ استفاده صرفاً برای مقایسه تاریخی مجاز است و برای قیمت‌گذاری روز محدودیت دارد.',
    acquiredAt: '2026-06-20T00:00:00.000Z',
    lastVerifiedAt: '2026-09-15T00:00:00.000Z',
    geographicCoverage: 'منتخب محلات مرکزی و شرقی تهران',
    temporalCoverage: 'تابستان ۱۴۰۵',
    updateFrequency: 'سالانه (آرشیوی)',
    attributionRequired: true,
    restrictionsFa: ['صرفاً مجاز برای نمایش در گزارش‌های آرشیوی با ذکر محدودیت زمانی.'],
  },
  {
    sourceId: 'src-external-unverified-feed',
    titleFa: 'فید خام ادعایی کانال‌های غیررسمی منطقه ۲۲',
    creatorFa: 'منبع بیرونی تأییدنشدنی',
    sourceTypeFa: 'داده داخلی پایش‌شده',
    licenseStatus: 'expired',
    version: 'ext-2025.01',
    reliabilityNoteFa: 'مجوز و اعتبارسنجی این منبع منقضی شده و استفاده از آن در گزارش‌های جاری ممنوع است.',
    acquiredAt: '2025-02-01T00:00:00.000Z',
    lastVerifiedAt: '2025-06-01T00:00:00.000Z',
    geographicCoverage: 'منطقه ۲۲',
    temporalCoverage: 'زمستان ۱۴۰۳ (منقضی)',
    updateFrequency: 'متوقف‌شده',
    attributionRequired: true,
    restrictionsFa: ['مجوز منقضی شده است؛ انتشار عمومی شاخص وابسته به این منبع مجاز نیست.'],
  },
];

export function resolvePublicationSourcesById(
  sourceIds: readonly string[] | undefined,
  registry: readonly KnowledgeSourceRecord[] = KNOWLEDGE_SOURCE_REGISTRY,
): KnowledgeSourceRecord[] {
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) return [];
  const wanted = new Set(sourceIds);
  return registry.filter((s) => wanted.has(s.sourceId));
}

export function isSourceUsableForPublicRelease(source: KnowledgeSourceRecord): boolean {
  return source.licenseStatus === 'approved' || source.licenseStatus === 'restricted';
}

export const KNOWLEDGE_DATA_BRIEFS: readonly KnowledgeDataBrief[] = [
  {
    briefId: 'brief-asking-gap',
    titleFa: 'سناریوی آموزشی شکاف پیشنهادی',
    headlineFa: 'مثال آموزشی فاصله مظنه اعلامی تا سناریوی مذاکره نقدی (ضریب مدل هدونیک)',
    metricValueFa: '۸ تا ۱۲٪ (سناریوی نمونه)',
    unitFa: 'نسبت فرضی به میانه مظنه',
    geographyFa: 'تهران (مناطق ۱ تا ۲۲)',
    periodFa: 'آبان ۱۴۰۵',
    sourceId: 'src-hedonic-v64',
    methodVersion: 'hedonic-v6.4',
    limitationFa: 'مثال آموزشی مبتنی بر ضریب مدل است و آمار معاملات قطعی ثبت‌شده محسوب نمی‌شود.',
    linkedReportId: 'rep-01',
    calculationStatus: 'illustrative',
    datasetVersion: 'v6.4',
    targetView: 'intelligence',
    targetSubTab: 'prices',
  },
  {
    briefId: 'brief-metro-rent',
    titleFa: 'خلاصه داده پراکندگی بین‌چارکی (IQR)',
    headlineFa: 'پهنای میانی قیمت پیشنهادی پس از حذف داده‌های پرت در مناطق ۲ و ۵',
    metricValueFa: '۲۱٪',
    unitFa: 'پراکندگی IQR نمونه پالایش‌شده',
    geographyFa: 'مناطق ۲ و ۵ تهران',
    periodFa: 'آبان ۱۴۰۵ (۱٬۴۲۰ رکورد پالایش‌شده)',
    sourceId: 'src-radar-listings',
    methodVersion: 'tukey-iqr-v1',
    limitationFa: 'محاسبه‌شده روی نمونه آگهی‌های پایش‌شده پس از حذف تکراری و پرت.',
    linkedReportId: 'rep-01',
    calculationStatus: 'verified',
    sampleSize: 1420,
    datasetVersion: '2026.11-r1',
    targetView: 'intelligence',
    targetSubTab: 'prices',
  },
];

const KNOWLEDGE_CORRECTION_DRAFT_PREFIX = 'radar_knowledge_corr_draft_v2_';

export interface KnowledgeCorrectionNote {
  id: string;
  publicationId: string;
  noteFa: string;
  createdAtIso: string;
  isLocalDraftOnly: true;
}

export function saveKnowledgeCorrectionLocalDraft(
  publicationId: string,
  draft: Partial<KnowledgeCorrectionInput>,
): void {
  if (typeof window === 'undefined' || !publicationId) return;
  try {
    window.localStorage.setItem(
      `${KNOWLEDGE_CORRECTION_DRAFT_PREFIX}${publicationId}`,
      JSON.stringify({ ...draft, savedAtIso: new Date().toISOString() }),
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadKnowledgeCorrectionLocalDraft(
  publicationId: string,
): Partial<KnowledgeCorrectionInput> | null {
  if (typeof window === 'undefined' || !publicationId) return null;
  try {
    const raw = window.localStorage.getItem(`${KNOWLEDGE_CORRECTION_DRAFT_PREFIX}${publicationId}`);
    return raw ? (JSON.parse(raw) as Partial<KnowledgeCorrectionInput>) : null;
  } catch {
    return null;
  }
}

export function clearKnowledgeCorrectionLocalDraft(publicationId: string): void {
  if (typeof window === 'undefined' || !publicationId) return;
  try {
    window.localStorage.removeItem(`${KNOWLEDGE_CORRECTION_DRAFT_PREFIX}${publicationId}`);
  } catch {
    // Ignore
  }
}

/**
 * Stage 84.1: Local helper strictly saves a local draft (`isLocalDraftOnly: true`);
 * official submission MUST go through `submitKnowledgeCorrection` API.
 */
export function submitKnowledgeCorrectionNote(publicationId: string, noteFa: string): KnowledgeCorrectionNote[] {
  const clean = noteFa.trim().slice(0, 1000);
  saveKnowledgeCorrectionLocalDraft(publicationId, { noteFa: clean, correctionType: 'other' });
  return [
    {
      id: `local-draft-${Date.now()}`,
      publicationId,
      noteFa: clean,
      createdAtIso: new Date().toISOString(),
      isLocalDraftOnly: true,
    },
  ];
}

/**
 * Stage 85.1: Scoped per-UID cache helper (never shares bookmarks across different accounts on the same browser).
 * Anonymous callers (`!uid`) always receive `[]`.
 */
export function loadSavedKnowledgeIds(uid?: string | null): string[] {
  if (!uid || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`radar_saved_knowledge_uid_v2_${uid}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function cacheSavedKnowledgeIdsForUser(uid: string | null | undefined, ids: string[]): string[] {
  if (!uid || typeof window === 'undefined') return [];
  const deduped = Array.from(new Set(ids)).slice(0, 50);
  try {
    window.localStorage.setItem(`radar_saved_knowledge_uid_v2_${uid}`, JSON.stringify(deduped));
  } catch {
    // Ignore quota failure
  }
  return deduped;
}
