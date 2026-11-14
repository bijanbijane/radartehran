/** @file src/features/knowledge/services/knowledgeSearchService.ts — Pure Search, Governance Lifecycle & Print/JSON Export Engine */
import { escapeHtmlAttr, sanitizeInput } from '../../../utils/security';
import { KNOWLEDGE_PUBLICATIONS } from '../data/knowledgeCatalog';
import { KNOWLEDGE_GLOSSARY_TERMS } from '../data/knowledgeGlossaryData';
import type {
  GlossaryTermCategory,
  KnowledgeFilterState,
  KnowledgeGlossaryTerm,
  KnowledgePublication,
  KnowledgePublicationStatus,
} from '../types/knowledge.types';

const KNOWLEDGE_STATUS_OVERRIDES_KEY = 'radar_knowledge_pub_status_v1';

export function normalizeKnowledgePersianQuery(raw: string): string {
  return String(raw || '')
    .replace(/[يیى]/g, 'ی')
    .replace(/[كک]/g, 'ک')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/\u200c+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function loadKnowledgePublicationStatuses(): Record<string, KnowledgePublicationStatus> {
  const defaults: Record<string, KnowledgePublicationStatus> = {};
  KNOWLEDGE_PUBLICATIONS.forEach((p) => {
    defaults[p.id] = p.defaultPublicationStatus;
  });
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(KNOWLEDGE_STATUS_OVERRIDES_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Record<string, KnowledgePublicationStatus>) };
  } catch {
    return defaults;
  }
}

export function transitionKnowledgePublicationStatus(
  publicationId: string,
  nextStatus: KnowledgePublicationStatus,
): Record<string, KnowledgePublicationStatus> {
  const current = loadKnowledgePublicationStatuses();
  const updated = { ...current, [publicationId]: nextStatus };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KNOWLEDGE_STATUS_OVERRIDES_KEY, JSON.stringify(updated));
    } catch { /* ignore quota failures */ }
  }
  return updated;
}

export function filterKnowledgePublications(
  publications: readonly KnowledgePublication[],
  filter: KnowledgeFilterState,
  statuses: Record<string, KnowledgePublicationStatus> = loadKnowledgePublicationStatuses(),
): KnowledgePublication[] {
  const q = normalizeKnowledgePersianQuery(filter.query);

  return publications.filter((pub) => {
    const effectiveStatus = statuses[pub.id] || pub.defaultPublicationStatus;
    if (effectiveStatus === 'draft' || effectiveStatus === 'editorial_review' || effectiveStatus === 'technical_review') {
      return false;
    }

    if (filter.subTab === 'guide' && pub.contentType !== 'guide') return false;
    if (filter.subTab === 'methodology' && pub.contentType !== 'methodology') return false;
    if (filter.subTab === 'reports' && (pub.contentType === 'guide' || pub.contentType === 'methodology')) return false;

    if (filter.contentType !== 'all' && pub.contentType !== filter.contentType) return false;
    if (filter.freshness !== 'all' && pub.freshnessStatus !== filter.freshness) return false;

    if (q.length > 0) {
      const haystack = normalizeKnowledgePersianQuery([
        pub.titleFa,
        pub.summaryFa,
        pub.categoryLabelFa,
        pub.geographyScopeFa,
        pub.author.nameFa,
        pub.formulaVersion,
        ...pub.relatedNeighborhoodNames,
      ].join(' '));
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

export function filterGlossaryTerms(
  terms: readonly KnowledgeGlossaryTerm[],
  query: string,
  category: GlossaryTermCategory | 'all' = 'all',
): KnowledgeGlossaryTerm[] {
  const q = normalizeKnowledgePersianQuery(query);
  return terms.filter((t) => {
    if (category !== 'all' && t.category !== category) return false;
    if (q.length === 0) return true;
    const hay = normalizeKnowledgePersianQuery(`${t.termFa} ${t.termEn} ${t.shortDefinitionFa} ${t.usageDistinctionFa}`);
    return hay.includes(q);
  });
}

export function buildKnowledgeReportExportJson(pub: KnowledgePublication): string {
  return JSON.stringify(
    {
      schema: 'radar-tehran.knowledge-publication.v1',
      id: pub.id,
      slug: pub.slug,
      version: pub.version,
      publishedAtFa: pub.publishedAtFa,
      updatedAtFa: pub.updatedAtFa,
      freshnessStatus: pub.freshnessStatus,
      geographyScopeFa: pub.geographyScopeFa,
      periodLabelFa: pub.periodLabelFa,
      formulaVersion: pub.formulaVersion,
      datasetSources: pub.datasetSources,
      contributors: {
        author: pub.author.nameFa,
        technicalReviewer: pub.technicalReviewer.nameFa,
      },
      epistemicSeparation: {
        tier1_rawDataSummary: pub.rawDataSummaryFa,
        tier2_calculatedIndicators: pub.calculatedIndicators,
        tier3_researchInterpretation: pub.researchInterpretationFa,
      },
      limitationsFa: pub.limitationsFa,
    },
    null,
    2,
  );
}

export function buildKnowledgeReportPrintHtml(pub: KnowledgePublication): string {
  const safeTitle = escapeHtmlAttr(sanitizeInput(pub.titleFa, 160));
  const safeGeo = escapeHtmlAttr(pub.geographyScopeFa);
  const safePeriod = escapeHtmlAttr(pub.periodLabelFa);
  const safeAuthor = escapeHtmlAttr(pub.author.nameFa);
  const safeReviewer = escapeHtmlAttr(pub.technicalReviewer.nameFa);
  const safeRaw = escapeHtmlAttr(pub.rawDataSummaryFa);
  const safeInterp = escapeHtmlAttr(pub.researchInterpretationFa);
  const indicatorsRows = pub.calculatedIndicators
    .map(
      (ind) =>
        `<tr><td>${escapeHtmlAttr(ind.labelFa)}</td><td><strong>${escapeHtmlAttr(ind.valueDisplayFa)}</strong> (${escapeHtmlAttr(ind.unitFa)})</td><td><code>${escapeHtmlAttr(ind.formulaVersion)}</code></td><td>${escapeHtmlAttr(ind.limitationFa)}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><title>${safeTitle}</title>
<style>body{font-family:Tahoma,sans-serif;max-width:860px;margin:24px auto;padding:16px;line-height:1.8;color:#182522}h1{font-size:22px}section{border:1px solid #DCE3DF;border-radius:10px;padding:14px;margin:14px 0}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #DCE3DF;padding:8px;text-align:right}</style>
</head>
<body>
<h1>${safeTitle}</h1>
<p>محدوده: ${safeGeo} · بازه زمانی: ${safePeriod} · نسخه: ${escapeHtmlAttr(pub.version)}</p>
<p>نویسنده: ${safeAuthor} · بازبین فنی: ${safeReviewer}</p>
<section><h2>۱. داده خام (مشاهده‌شده پیش از شاخص‌سازی)</h2><p>${safeRaw}</p></section>
<section><h2>۲. شاخص‌های محاسبه‌شده</h2><table><thead><tr><th>شاخص</th><th>مقدار</th><th>فرمول</th><th>محدودیت</th></tr></thead><tbody>${indicatorsRows}</tbody></table></section>
<section><h2>۳. تفسیر پژوهشی (تفکیک‌شده از داده و شاخص)</h2><p>${safeInterp}</p></section>
</body></html>`;
}

export { KNOWLEDGE_PUBLICATIONS, KNOWLEDGE_GLOSSARY_TERMS };
