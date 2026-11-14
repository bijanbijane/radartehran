/** @file src/features/knowledge/types/knowledge.types.ts — Stage 24 Knowledge Base, Research & Epistemic Provenance Types */
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

export type KnowledgePublicationStatus =
  | 'draft'
  | 'editorial_review'
  | 'technical_review'
  | 'published'
  | 'archived';

export interface KnowledgeContributorProfile {
  id: string;
  nameFa: string;
  roleKind: 'author' | 'technical_reviewer';
  specialtyFa: string;
  affiliationSummaryFa: string;
}

export interface KnowledgeCalculatedIndicator {
  id: string;
  labelFa: string;
  valueDisplayFa: string;
  unitFa: string;
  formulaVersion: string;
  periodLabelFa: string;
  sampleScopeFa: string;
  limitationFa: string;
}

export interface KnowledgeCrossReference {
  labelFa: string;
  targetView: PrimaryViewId;
  targetSubTab?: ModuleSubTabId;
  neighborhoodName?: string;
}

export interface KnowledgePublication {
  id: string;
  slug: string;
  contentType: KnowledgeContentType;
  categoryLabelFa: string;
  titleFa: string;
  summaryFa: string;
  freshnessStatus: KnowledgeFreshnessStatus;
  defaultPublicationStatus: KnowledgePublicationStatus;
  version: string;
  publishedAtFa: string;
  updatedAtFa: string;
  geographyScopeFa: string;
  periodLabelFa: string;
  datasetSources: string[];
  formulaVersion: string;
  changelogFa: string;
  author: KnowledgeContributorProfile;
  technicalReviewer: KnowledgeContributorProfile;
  /** Tier 1 Epistemic Layer: Raw Data observed before statistical aggregation */
  rawDataSummaryFa: string;
  /** Tier 2 Epistemic Layer: Reproducible Calculated Indicators with version & scope */
  calculatedIndicators: KnowledgeCalculatedIndicator[];
  /** Tier 3 Epistemic Layer: Editorial / Research Interpretation (clearly separated from data & indicators) */
  researchInterpretationFa: string;
  limitationsFa: string[];
  relatedNeighborhoodNames: string[];
  crossReferences: KnowledgeCrossReference[];
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
