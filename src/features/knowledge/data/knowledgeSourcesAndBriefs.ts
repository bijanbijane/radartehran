/** @file src/features/knowledge/data/knowledgeSourcesAndBriefs.ts — Stage 24 Source Registry, Data Briefs & Account-Linked Bookmarks */
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';

export interface KnowledgeSourceRecord {
  sourceId: string;
  titleFa: string;
  creatorFa: string;
  sourceTypeFa: 'داده داخلی پایش‌شده' | 'لایه GIS شهری' | 'مدل تحلیلی رادار' | 'سند روش‌شناسی';
  licenseStatus: 'approved' | 'restricted';
  version: string;
  reliabilityNoteFa: string;
}

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
  },
  {
    sourceId: 'src-tehran-gis',
    titleFa: 'لایه مکانی ایستگاه‌های مترو و محدوده طرح ترافیک تهران',
    creatorFa: 'واحد داده‌های شهری و GIS رادار',
    sourceTypeFa: 'لایه GIS شهری',
    licenseStatus: 'approved',
    version: 'gis-tehran-v3.2',
    reliabilityNoteFa: 'مختصات ایستگاه‌های فعال و خطوط رینگ ترافیکی؛ تغییرات اجرایی جدید پس از راستی‌آزمایی به‌روزرسانی می‌شود.',
  },
  {
    sourceId: 'src-hedonic-v64',
    titleFa: 'مدل تعدیل نقدشوندگی و ارزش‌گذاری هدونیک (v6.4 / v1405.1)',
    creatorFa: 'کارگروه مدل‌سازی ارزش‌گذاری رادار',
    sourceTypeFa: 'مدل تحلیلی رادار',
    licenseStatus: 'approved',
    version: 'v6.4 / v1405.1',
    reliabilityNoteFa: 'خروجی برآوردی جهت مقایسه و مذاکره است؛ جایگزین کارشناسی رسمی ثبتی نیست.',
  },
];

export const KNOWLEDGE_DATA_BRIEFS: readonly KnowledgeDataBrief[] = [
  {
    briefId: 'brief-asking-gap',
    titleFa: 'خلاصه داده شکاف پیشنهادی',
    headlineFa: 'فاصله میانه قیمت اعلامی تا برآورد مذاکره در مناطق پرتراکم',
    metricValueFa: '۸ تا ۱۲٪',
    unitFa: 'نسبت به میانه مظنه',
    geographyFa: 'تهران (مناطق ۱ تا ۲۲)',
    periodFa: 'آبان ۱۴۰۵',
    sourceId: 'src-hedonic-v64',
    methodVersion: 'hedonic-v6.4',
    limitationFa: 'سناریوی برآوردی غیرثبتی است، نه آمار معاملات قطعی.',
    linkedReportId: 'rep-01',
    targetView: 'intelligence',
    targetSubTab: 'prices',
  },
  {
    briefId: 'brief-metro-rent',
    titleFa: 'خلاصه داده دسترسی مترو',
    headlineFa: 'تفاوت رهن معادل ۸۰ متری در شعاع پیاده ایستگاه مترو',
    metricValueFa: '+۹ تا ۱۴٪',
    unitFa: 'رهن کامل ۸۰ متری',
    geographyFa: 'محورهای مرکزی و غربی',
    periodFa: 'مهر ۱۴۰۵',
    sourceId: 'src-tehran-gis',
    methodVersion: 'median-rent-80m',
    limitationFa: 'وابسته به کیفیت گذر و وضعیت پارکینگ ساختمان.',
    linkedReportId: 'rep-02',
    targetView: 'map',
  },
];

const SAVED_KNOWLEDGE_KEY = 'radar_saved_knowledge_ids_v1';
const KNOWLEDGE_CORRECTIONS_KEY = 'radar_knowledge_corrections_v1';

export interface KnowledgeCorrectionNote {
  id: string;
  publicationId: string;
  noteFa: string;
  createdAtIso: string;
}

export function loadSavedKnowledgeIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SAVED_KNOWLEDGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function toggleSavedKnowledgeId(publicationId: string): string[] {
  const curr = loadSavedKnowledgeIds();
  const next = curr.includes(publicationId)
    ? curr.filter((id) => id !== publicationId)
    : [publicationId, ...curr].slice(0, 50);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SAVED_KNOWLEDGE_KEY, JSON.stringify(next));
    } catch { /* ignore quota failures */ }
  }
  return next;
}

export function submitKnowledgeCorrectionNote(publicationId: string, noteFa: string): KnowledgeCorrectionNote[] {
  const clean = noteFa.trim().slice(0, 400);
  let list: KnowledgeCorrectionNote[] = [];
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(KNOWLEDGE_CORRECTIONS_KEY);
      list = raw ? (JSON.parse(raw) as KnowledgeCorrectionNote[]) : [];
    } catch { list = []; }
  }
  const next = [{ id: `corr-${Date.now()}`, publicationId, noteFa: clean, createdAtIso: new Date().toISOString() }, ...list].slice(0, 30);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KNOWLEDGE_CORRECTIONS_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  }
  return next;
}
