/** @file src/features/knowledge/types/knowledge.types.ts — Stages 81–88 Knowledge Governance, Provenance, Editorial Workflow & Export Contracts */
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { KnowledgeSubTabId, ModuleSubTabId } from '../../../navigation/registry/route.types';

export type KnowledgeContentType =
  | 'market_report'
  | 'neighborhood_report'
  | 'urban_research'
  | 'methodology'
  | 'guide'
  | 'article';

export type KnowledgeFreshnessStatus = 'current' | 'periodic' | 'archived';

/** Stage 86.1: Full server-validated editorial lifecycle */
export type KnowledgePublicationStatus =
  | 'draft'
  | 'editorial_review'
  | 'technical_review'
  | 'approved'
  | 'published'
  | 'archived'
  | 'revision_requested'
  | 'rejected';

/** Stage 86.2: Separation of editorial and technical roles */
export type KnowledgeEditorialRole =
  | 'author'
  | 'editorial_editor'
  | 'technical_reviewer'
  | 'release_manager'
  | 'archive_manager'
  | 'super_admin';

export interface KnowledgeContributorProfile {
  id: string;
  nameFa: string;
  roleKind: 'author' | 'technical_reviewer' | 'editorial_editor' | 'release_manager';
  specialtyFa: string;
  affiliationSummaryFa: string;
}

export type KnowledgeIndicatorCalculationStatus =
  | 'verified'
  | 'illustrative'
  | 'pending'
  | 'unavailable';

/** Stage 82.2: Provenance-backed calculated indicator contract */
export interface KnowledgeCalculatedIndicator {
  id: string;
  labelFa: string;
  valueDisplayFa: string;
  unitFa: string;
  formulaVersion: string;
  periodLabelFa: string;
  sampleScopeFa: string;
  limitationFa: string;

  datasetId?: string;
  datasetVersion?: string;
  sampleSize?: number;
  calculatedAt?: string;
  sourceIds?: string[];
  confidenceLevel?: 'low' | 'medium' | 'high' | 'not_assessed';
  calculationStatus: KnowledgeIndicatorCalculationStatus;
}

/** Stage 82.5: Expanded source license status */
export type KnowledgeSourceLicenseStatus =
  | 'approved'
  | 'restricted'
  | 'pending_review'
  | 'expired'
  | 'unknown';

/** Stage 82.4: Complete source provenance record */
export interface KnowledgeSourceRecord {
  sourceId: string;
  titleFa: string;
  creatorFa: string;
  sourceTypeFa: 'داده داخلی پایش‌شده' | 'لایه GIS شهری' | 'مدل تحلیلی رادار' | 'سند روش‌شناسی';
  licenseStatus: KnowledgeSourceLicenseStatus;
  version: string;
  reliabilityNoteFa: string;

  sourceUrl?: string;
  acquiredAt?: string;
  lastVerifiedAt?: string;
  geographicCoverage?: string;
  temporalCoverage?: string;
  updateFrequency?: string;
  attributionRequired?: boolean;
  restrictionsFa?: string[];
}

export interface KnowledgeCrossReference {
  labelFa: string;
  targetView: PrimaryViewId;
  targetSubTab?: ModuleSubTabId;
  neighborhoodName?: string;
}

/** Stage 86.3: Immutable server-side editorial decision record */
export interface KnowledgeEditorialDecision {
  decisionId: string;
  publicationId: string;
  fromStatus: KnowledgePublicationStatus;
  toStatus: KnowledgePublicationStatus;
  actorUserId: string;
  actorRole: KnowledgeEditorialRole;
  reasonFa: string;
  createdAt: string;
}

/** Stage 86.4: Immutable version snapshot preserving historical versions */
export interface KnowledgePublicationVersionSnapshot {
  versionId: string;
  publicationId: string;
  version: string;
  publishedAtFa: string;
  updatedAtFa: string;
  updatedAtIso: string;
  previousVersionId: string | null;
  status: KnowledgePublicationStatus;
  changelogFa: string;
  titleFa: string;
  summaryFa: string;
  geographyScopeFa: string;
  periodLabelFa: string;
  formulaVersion: string;
  sourceIds: string[];
  rawDataSummaryFa: string;
  calculatedIndicators: KnowledgeCalculatedIndicator[];
  researchInterpretationFa: string;
  limitationsFa: string[];
}

export interface KnowledgePublication {
  id: string;
  slug: string;
  contentType: KnowledgeContentType;
  categoryLabelFa: string;
  titleFa: string;
  summaryFa: string;
  freshnessStatus: KnowledgeFreshnessStatus;
  /** Used ONLY for seed initialization and isolated development tests */
  defaultPublicationStatus: KnowledgePublicationStatus;
  /** Authoritative publication status populated by the server */
  status?: KnowledgePublicationStatus;
  version: string;
  versionId?: string;
  previousVersionId?: string | null;
  publishedAtFa: string;
  updatedAtFa: string;
  updatedAtIso?: string;
  geographyScopeFa: string;
  geographyId?: string;
  neighborhoodIds?: number[];
  periodFromIso?: string;
  periodToIso?: string;
  periodLabelFa: string;
  datasetSources: string[];
  sourceIds?: string[];
  formulaVersion: string;
  changelogFa: string;
  author: KnowledgeContributorProfile;
  technicalReviewer: KnowledgeContributorProfile;
  rawDataSummaryFa: string;
  calculatedIndicators: KnowledgeCalculatedIndicator[];
  researchInterpretationFa: string;
  limitationsFa: string[];
  relatedNeighborhoodNames: string[];
  crossReferences: KnowledgeCrossReference[];
  versionHistory?: KnowledgePublicationVersionSnapshot[];
  decisionHistory?: KnowledgeEditorialDecision[];
  source?: 'seed' | 'editorial';
}

/** Stage 84.2 & 84.4: Structured publication error/correction submission */
export type KnowledgeCorrectionType =
  | 'data_error'
  | 'formula_error'
  | 'source_error'
  | 'interpretation_error'
  | 'outdated_information'
  | 'other';

export type KnowledgeCorrectionStatus =
  | 'submitted'
  | 'triage'
  | 'under_review'
  | 'needs_evidence'
  | 'accepted'
  | 'rejected'
  | 'applied'
  | 'closed';

export interface KnowledgeCorrectionInput {
  correctionType: KnowledgeCorrectionType;
  targetSection?: string;
  targetIndicatorId?: string;
  noteFa: string;
  evidenceDescriptionFa?: string;
  sourceUrl?: string;
}

export interface KnowledgeCorrectionRecord extends KnowledgeCorrectionInput {
  id: string;
  publicationId: string;
  publicationVersion: string;
  submitterUserId: string;
  status: KnowledgeCorrectionStatus;
  reviewerNoteFa?: string;
  appliedInVersion?: string | null;
  createdAtIso: string;
  updatedAtIso: string;
  statusHistory: Array<{
    status: KnowledgeCorrectionStatus;
    actorUserId: string;
    noteFa: string;
    changedAtIso: string;
  }>;
}

/** Stage 85: Account-linked saved knowledge item */
export interface SavedKnowledgeBookmarkItem {
  publicationId: string;
  slug: string;
  titleFa: string;
  version: string;
  status: KnowledgePublicationStatus;
  freshnessStatus: KnowledgeFreshnessStatus;
  savedAtIso: string;
  isArchivedOrRemoved: boolean;
}

export type GlossaryTermCategory = 'market' | 'valuation' | 'urban_zoning' | 'statistics' | 'legal';

export interface KnowledgeGlossaryTerm {
  id: string;
  termFa: string;
  termEn: string;
  category: GlossaryTermCategory;
  shortDefinitionFa: string;
  usageDistinctionFa: string;
  exampleFa: string;
  relatedView?: PrimaryViewId;
  relatedSubTab?: ModuleSubTabId;
}

export interface KnowledgeFilterState {
  subTab: KnowledgeSubTabId;
  query: string;
  contentType: KnowledgeContentType | 'all';
  freshness: KnowledgeFreshnessStatus | 'all';
  geographyId?: string;
  neighborhoodId?: number;
  periodFrom?: string;
  periodTo?: string;
  sortBy?: 'updated_desc' | 'published_desc' | 'title_asc';
}

/** Stage 83.4: Standardized paginated publication response */
export interface KnowledgePublicationListResponse {
  items: KnowledgePublication[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  filters: {
    contentTypes: string[];
    freshnessStatuses: string[];
  };
  serverUpdatedAtIso?: string;
  fetchedAtIso?: string;
}

export const KNOWLEDGE_CONTENT_TYPE_LABELS_FA: Record<KnowledgeContentType | 'all', string> = {
  all: 'همه انواع محتوا',
  market_report: 'گزارش بازار',
  neighborhood_report: 'گزارش محله‌ای',
  urban_research: 'پژوهش شهری',
  methodology: 'روش‌شناسی و مدل',
  guide: 'راهنمای کاربردی',
  article: 'مقاله تخصصی',
};

export const KNOWLEDGE_FRESHNESS_LABELS_FA: Record<KnowledgeFreshnessStatus, { labelFa: string; badgeClass: string }> = {
  current: {
    labelFa: 'جاری (به‌روز)',
    badgeClass: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  periodic: {
    labelFa: 'دوره‌ای (فصل / ماه)',
    badgeClass: 'bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  },
  archived: {
    labelFa: 'آرشیوی (مرجع تاریخی)',
    badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700',
  },
};

export const KNOWLEDGE_PUBLICATION_STATUS_LABELS_FA: Record<KnowledgePublicationStatus, string> = {
  draft: 'پیش‌نویس تحریریه',
  editorial_review: 'در صف بازبینی تحریریه',
  technical_review: 'در صف بازبینی فنی و آماری',
  approved: 'تأییدشده (آماده انتشار)',
  published: 'منتشرشده',
  archived: 'آرشیوشده (مرجع تاریخی)',
  revision_requested: 'نیازمند اصلاح نویسنده',
  rejected: 'ردشده در ممیزی علمی',
};

export const KNOWLEDGE_CORRECTION_TYPE_LABELS_FA: Record<KnowledgeCorrectionType, string> = {
  data_error: 'خطای داده خام یا نمونه آماری',
  formula_error: 'خطای فرمول یا روش محاسبه شاخص',
  source_error: 'نقص منبع، مجوز یا ارجاع',
  interpretation_error: 'تفسیر نامتناسب با داده',
  outdated_information: 'اطلاعات منسوخ یا تغییریافته',
  other: 'سایر موارد علمی و نگارشی',
};

export const KNOWLEDGE_CORRECTION_STATUS_LABELS_FA: Record<KnowledgeCorrectionStatus, string> = {
  submitted: 'ثبت‌شده توسط خواننده',
  triage: 'پالایش اولیه تحریریه',
  under_review: 'در حال بررسی فنی',
  needs_evidence: 'نیازمند مستندات تکمیلی',
  accepted: 'پذیرفته‌شده (در نوبت اعمال در نسخه بعد)',
  rejected: 'ردشده با توضیح فنی',
  applied: 'اعمال‌شده در نسخه منتشرشده',
  closed: 'رسیدگی پایان‌یافته',
};

export const KNOWLEDGE_SOURCE_LICENSE_LABELS_FA: Record<KnowledgeSourceLicenseStatus, string> = {
  approved: 'مجوز معتبر و تأییدشده',
  restricted: 'استفاده محدود (نیازمند رعایت شروط)',
  pending_review: 'در انتظار بررسی مجوز حقوقی',
  expired: 'مجوز منقضی‌شده',
  unknown: 'وضعیت مجوز نامشخص',
};
