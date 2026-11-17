/** @file src/features/knowledge/services/knowledgeSearchService.ts — Stage 81–87 Pure Search, Server-Backed Governance Validation & Print/JSON Export Engine */
import { escapeHtmlAttr } from '../../../utils/security';
import { KNOWLEDGE_PUBLICATIONS } from '../data/knowledgeCatalog';
import { KNOWLEDGE_GLOSSARY_TERMS } from '../data/knowledgeGlossaryData';
import {
  KNOWLEDGE_SOURCE_REGISTRY,
  resolvePublicationSourcesById,
} from '../data/knowledgeSourcesAndBriefs';
import {
  KNOWLEDGE_PUBLICATION_STATUS_LABELS_FA,
  KNOWLEDGE_SOURCE_LICENSE_LABELS_FA,
  type GlossaryTermCategory,
  type KnowledgeEditorialRole,
  type KnowledgeFilterState,
  type KnowledgeGlossaryTerm,
  type KnowledgePublication,
  type KnowledgePublicationStatus,
  type KnowledgeSourceRecord,
} from '../types/knowledge.types';

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

const ALLOWED_EDITORIAL_TRANSITIONS: Record<KnowledgePublicationStatus, KnowledgePublicationStatus[]> = {
  draft: ['editorial_review', 'archived'],
  editorial_review: ['technical_review', 'revision_requested', 'rejected'],
  technical_review: ['approved', 'revision_requested', 'rejected'],
  approved: ['published', 'revision_requested', 'archived'],
  published: ['archived', 'revision_requested'],
  archived: ['editorial_review'],
  revision_requested: ['editorial_review', 'draft', 'rejected'],
  rejected: ['draft'],
};

/** Stage 81.4 & 82: Comprehensive pre-publication scientific & provenance validation */
export function validateKnowledgePublicationForRelease(
  pub: KnowledgePublication | null | undefined,
  sourcesRegistry: readonly KnowledgeSourceRecord[] = KNOWLEDGE_SOURCE_REGISTRY,
): { ok: boolean; errorsFa: string[] } {
  const errorsFa: string[] = [];
  if (!pub) return { ok: false, errorsFa: ['گزارش موردنظر یافت نشد.'] };
  if (!pub.version || !/^v\d+\.\d+/.test(pub.version.trim())) {
    errorsFa.push('نسخه گزارش معتبر نیست (فرمت استاندارد vX.Y الزامی است).');
  }
  if (!pub.author?.id || !pub.author?.nameFa?.trim()) {
    errorsFa.push('نویسنده گزارش مشخص نشده است.');
  }
  if (!pub.technicalReviewer?.id || !pub.technicalReviewer?.nameFa?.trim()) {
    errorsFa.push('بازبین فنی مستقل مشخص نشده است.');
  }
  if (pub.author?.id && pub.technicalReviewer?.id && pub.author.id === pub.technicalReviewer.id) {
    errorsFa.push('بازبین فنی باید مستقل از نویسنده گزارش باشد.');
  }
  if (!pub.geographyScopeFa?.trim() || !pub.periodLabelFa?.trim()) {
    errorsFa.push('محدوده جغرافیایی و دوره زمانی گزارش باید مشخص و غیرخالی باشند.');
  }
  if (pub.periodFromIso && pub.periodToIso && pub.periodFromIso > pub.periodToIso) {
    errorsFa.push('بازه زمانی گزارش متناقض است (تاریخ شروع پس از تاریخ پایان).');
  }
  if (!Array.isArray(pub.limitationsFa) || pub.limitationsFa.filter((l) => l.trim().length > 5).length === 0) {
    errorsFa.push('ثبت محدودیت‌های روش‌شناختی برای انتشار گزارش الزامی است.');
  }
  const linkedSources = resolvePublicationSourcesById(pub.sourceIds, sourcesRegistry);
  if (linkedSources.length === 0 && (!Array.isArray(pub.datasetSources) || pub.datasetSources.length === 0)) {
    errorsFa.push('گزارش فاقد منبع داده ثبت‌شده است.');
  }
  for (const src of linkedSources) {
    if (src.licenseStatus === 'expired' || src.licenseStatus === 'pending_review' || src.licenseStatus === 'unknown') {
      errorsFa.push(`منبع «${src.titleFa}» دارای وضعیت مجوز نامعتبر (${src.licenseStatus}) برای انتشار عمومی است.`);
    }
  }
  if (!Array.isArray(pub.calculatedIndicators) || pub.calculatedIndicators.length === 0) {
    errorsFa.push('گزارش باید حداقل یک شاخص با وضعیت محاسبه مشخص داشته باشد.');
  } else {
    for (const ind of pub.calculatedIndicators) {
      if (!ind.labelFa?.trim() || !ind.unitFa?.trim() || !ind.formulaVersion?.trim()) {
        errorsFa.push(`شاخص «${ind.id}» فاقد عنوان، واحد یا نسخه فرمول است.`);
      }
      if (!ind.periodLabelFa?.trim() || !ind.sampleScopeFa?.trim() || !ind.limitationFa?.trim()) {
        errorsFa.push(`شاخص «${ind.id}» فاقد دامنه نمونه، دوره زمانی یا توضیح محدودیت است.`);
      }
      if (!['verified', 'illustrative', 'pending', 'unavailable'].includes(ind.calculationStatus)) {
        errorsFa.push(`وضعیت محاسبه شاخص «${ind.id}» نامعتبر است.`);
      }
      if (ind.calculationStatus === 'verified' && (!ind.datasetId || !ind.datasetVersion || !ind.sampleSize)) {
        errorsFa.push(`شاخص تأییدشده «${ind.id}» باید دارای شناسه دیتاست، نسخه دیتاست و اندازه نمونه باشد.`);
      }
    }
  }
  return { ok: errorsFa.length === 0, errorsFa };
}

/** Stage 86.1 & 86.2: Server-grade editorial transition & role separation check */
export function validateEditorialStatusTransition(params: {
  pub: KnowledgePublication;
  fromStatus: KnowledgePublicationStatus;
  toStatus: KnowledgePublicationStatus;
  actorUserId: string;
  actorRole: KnowledgeEditorialRole;
  reasonFa: string;
  sourcesRegistry?: readonly KnowledgeSourceRecord[];
}): { ok: boolean; errorFa?: string } {
  const { pub, fromStatus, toStatus, actorUserId, actorRole, reasonFa } = params;
  if (!reasonFa || reasonFa.trim().length < 5) {
    return { ok: false, errorFa: 'ثبت دلیل تصمیم تحریریه (حداقل ۵ کاراکتر) الزامی است.' };
  }
  const allowedNext = ALLOWED_EDITORIAL_TRANSITIONS[fromStatus] ?? [];
  if (fromStatus !== toStatus && !allowedNext.includes(toStatus) && actorRole !== 'super_admin') {
    return { ok: false, errorFa: `انتقال مستقیم وضعیت از «${fromStatus}» به «${toStatus}» در چرخه تحریریه مجاز نیست.` };
  }
  if ((toStatus === 'approved' || toStatus === 'published') && actorUserId === pub.author.id) {
    return { ok: false, errorFa: 'نویسنده گزارش مجاز نیست بهتنهایی گزارش خود را تأیید فنی یا منتشر کند.' };
  }
  if (toStatus === 'approved' && !['technical_reviewer', 'release_manager', 'super_admin'].includes(actorRole)) {
    return { ok: false, errorFa: 'تأیید فنی گزارش نیازمند نقش بازبین فنی مستقل است.' };
  }
  if (toStatus === 'published' && !['release_manager', 'editorial_editor', 'super_admin'].includes(actorRole)) {
    return { ok: false, errorFa: 'انتشار نهایی گزارش نیازمند مجوز مسئول انتشار یا دبیر تحریریه است.' };
  }
  if (toStatus === 'archived' && !['archive_manager', 'release_manager', 'editorial_editor', 'super_admin'].includes(actorRole)) {
    return { ok: false, errorFa: 'آرشیو گزارش نیازمند مجوز مدیر آرشیو یا مسئول انتشار است.' };
  }
  if (toStatus === 'published' || toStatus === 'approved') {
    const check = validateKnowledgePublicationForRelease(pub, params.sourcesRegistry);
    if (!check.ok) {
      return { ok: false, errorFa: check.errorsFa[0] };
    }
  }
  return { ok: true };
}

/**
 * Stage 81.1 & 81.2: Pure publication filter consuming authoritative status from server or explicit status map.
 * Never reads from `localStorage`. If a publication has no valid status, it is NOT assumed published.
 */
export function filterKnowledgePublications(
  publications: readonly KnowledgePublication[],
  filter: KnowledgeFilterState,
  statuses?: Record<string, KnowledgePublicationStatus | undefined>,
): KnowledgePublication[] {
  const q = normalizeKnowledgePersianQuery(filter.query);

  return publications.filter((pub) => {
    const effectiveStatus: KnowledgePublicationStatus | undefined =
      statuses !== undefined ? statuses[pub.id] : pub.status;

    // Stage 81.1 & 81.2: If status was not received or is non-public, hide from public catalog
    if (!effectiveStatus) return false;
    if (
      effectiveStatus === 'draft' ||
      effectiveStatus === 'editorial_review' ||
      effectiveStatus === 'technical_review' ||
      effectiveStatus === 'approved' ||
      effectiveStatus === 'revision_requested' ||
      effectiveStatus === 'rejected'
    ) {
      return false;
    }

    // Stage 81.2: Archived reports appear only when archived filter is explicitly selected, not in current reports list
    const isArchivedReport = effectiveStatus === 'archived' || pub.freshnessStatus === 'archived';
    if (filter.freshness === 'archived') {
      if (!isArchivedReport) return false;
    } else if (filter.freshness === 'current' || filter.freshness === 'periodic') {
      if (effectiveStatus === 'archived' || pub.freshnessStatus !== filter.freshness) return false;
    } else {
      // filter.freshness === 'all' in main active catalog excludes 'archived' status reports unless explicitly viewing archive
      if (effectiveStatus === 'archived') return false;
    }

    if (filter.subTab === 'guide' && pub.contentType !== 'guide') return false;
    if (filter.subTab === 'methodology' && pub.contentType !== 'methodology') return false;
    if (filter.subTab === 'reports' && (pub.contentType === 'guide' || pub.contentType === 'methodology')) return false;

    if (filter.contentType !== 'all' && pub.contentType !== filter.contentType) return false;
    if (filter.geographyId && pub.geographyId && pub.geographyId !== filter.geographyId) return false;
    if (filter.neighborhoodId && Array.isArray(pub.neighborhoodIds) && !pub.neighborhoodIds.includes(filter.neighborhoodId)) {
      return false;
    }

    if (q.length > 0) {
      const haystack = normalizeKnowledgePersianQuery(
        [
          pub.titleFa,
          pub.summaryFa,
          pub.categoryLabelFa,
          pub.geographyScopeFa,
          pub.author.nameFa,
          pub.formulaVersion,
          ...pub.relatedNeighborhoodNames,
        ].join(' '),
      );
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

export function formatIndicatorExportValue(ind: KnowledgePublication['calculatedIndicators'][number]): string {
  if (ind.calculationStatus === 'pending') return 'در انتظار محاسبه';
  if (ind.calculationStatus === 'unavailable') return 'داده کافی در دسترس نیست';
  if (ind.calculationStatus === 'illustrative' && !ind.valueDisplayFa.includes('مثال آموزشی')) {
    return `${ind.valueDisplayFa} (مثال آموزشی)`;
  }
  return ind.valueDisplayFa;
}

/** Stage 87.2: Complete schema-versioned JSON export reflecting exact version, sources, licenses, and indicator provenance */
export function buildKnowledgeReportExportJson(
  pub: KnowledgePublication,
  sourcesRegistry: readonly KnowledgeSourceRecord[] = KNOWLEDGE_SOURCE_REGISTRY,
): string {
  const effectiveStatus = pub.status ?? pub.defaultPublicationStatus;
  const linkedSources = resolvePublicationSourcesById(pub.sourceIds, sourcesRegistry);
  return JSON.stringify(
    {
      schema: 'radar-tehran.knowledge-publication.v2',
      schemaVersion: 2,
      exportedAtIso: new Date().toISOString(),
      id: pub.id,
      slug: pub.slug,
      version: pub.version,
      versionId: pub.versionId || `${pub.id}-${pub.version}`,
      previousVersionId: pub.previousVersionId ?? null,
      publicationStatus: effectiveStatus,
      isArchived: effectiveStatus === 'archived' || pub.freshnessStatus === 'archived',
      publishedAtFa: pub.publishedAtFa,
      updatedAtFa: pub.updatedAtFa,
      freshnessStatus: pub.freshnessStatus,
      geographyScopeFa: pub.geographyScopeFa,
      periodLabelFa: pub.periodLabelFa,
      formulaVersion: pub.formulaVersion,
      datasetSources: pub.datasetSources,
      linkedSources: linkedSources.map((s) => ({
        sourceId: s.sourceId,
        titleFa: s.titleFa,
        version: s.version,
        licenseStatus: s.licenseStatus,
        licenseLabelFa: KNOWLEDGE_SOURCE_LICENSE_LABELS_FA[s.licenseStatus],
        geographicCoverage: s.geographicCoverage ?? null,
        temporalCoverage: s.temporalCoverage ?? null,
        restrictionsFa: s.restrictionsFa ?? [],
      })),
      contributors: {
        author: pub.author.nameFa,
        technicalReviewer: pub.technicalReviewer.nameFa,
      },
      epistemicSeparation: {
        tier1_rawDataSummary: pub.rawDataSummaryFa,
        tier2_calculatedIndicators: pub.calculatedIndicators.map((ind) => ({
          ...ind,
          valueDisplayFa: formatIndicatorExportValue(ind),
          isIllustrativeExample: ind.calculationStatus === 'illustrative',
          datasetVersion: ind.datasetVersion ?? null,
          sampleSize: ind.sampleSize ?? null,
        })),
        tier3_researchInterpretation: pub.researchInterpretationFa,
      },
      limitationsFa: pub.limitationsFa,
      changelogFa: pub.changelogFa,
      versionHistory: (pub.versionHistory ?? []).map((v) => ({
        versionId: v.versionId,
        version: v.version,
        publishedAtFa: v.publishedAtFa,
        status: v.status,
        changelogFa: v.changelogFa,
      })),
    },
    null,
    2,
  );
}

/** Stage 87.3: Safe escaped RTL print HTML preserving archive state, source licenses, illustrative tags, and non-zero missing data */
export function buildKnowledgeReportPrintHtml(
  pub: KnowledgePublication,
  sourcesRegistry: readonly KnowledgeSourceRecord[] = KNOWLEDGE_SOURCE_REGISTRY,
): string {
  const effectiveStatus = pub.status ?? pub.defaultPublicationStatus;
  const isArchived = effectiveStatus === 'archived' || pub.freshnessStatus === 'archived';
  const safeTitle = escapeHtmlAttr(String(pub.titleFa || ''));
  const safeGeo = escapeHtmlAttr(String(pub.geographyScopeFa || ''));
  const safePeriod = escapeHtmlAttr(String(pub.periodLabelFa || ''));
  const safeAuthor = escapeHtmlAttr(String(pub.author?.nameFa || ''));
  const safeReviewer = escapeHtmlAttr(String(pub.technicalReviewer?.nameFa || ''));
  const safeRaw = escapeHtmlAttr(String(pub.rawDataSummaryFa || ''));
  const safeInterp = escapeHtmlAttr(String(pub.researchInterpretationFa || ''));
  const safeStatusLabel = escapeHtmlAttr(KNOWLEDGE_PUBLICATION_STATUS_LABELS_FA[effectiveStatus] || effectiveStatus);

  const indicatorsRows = (pub.calculatedIndicators ?? [])
    .map((ind) => {
      const displayVal = escapeHtmlAttr(formatIndicatorExportValue(ind));
      const statusBadge =
        ind.calculationStatus === 'illustrative'
          ? ' [مثال آموزشی]'
          : ind.calculationStatus === 'pending'
            ? ' [در انتظار محاسبه]'
            : ind.calculationStatus === 'unavailable'
              ? ' [فاقد داده]'
              : ' [محاسبه تأییدشده]';
      const meta = [
        ind.datasetVersion ? `نسخه داده: ${ind.datasetVersion}` : '',
        typeof ind.sampleSize === 'number' ? `نمونه: ${ind.sampleSize}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return `<tr style="page-break-inside:avoid"><td>${escapeHtmlAttr(ind.labelFa)}<br><small>${escapeHtmlAttr(statusBadge)}</small></td><td><strong>${displayVal}</strong> (${escapeHtmlAttr(ind.unitFa)})</td><td><code>${escapeHtmlAttr(ind.formulaVersion)}</code>${meta ? `<br><small>${escapeHtmlAttr(meta)}</small>` : ''}</td><td>${escapeHtmlAttr(ind.limitationFa)}</td></tr>`;
    })
    .join('');

  const linkedSources = resolvePublicationSourcesById(pub.sourceIds, sourcesRegistry);
  const sourcesRows = linkedSources
    .map(
      (s) =>
        `<li><strong>${escapeHtmlAttr(s.titleFa)}</strong> (<code>${escapeHtmlAttr(s.sourceId)}</code> · نسخه ${escapeHtmlAttr(s.version)}) — وضعیت مجوز: ${escapeHtmlAttr(KNOWLEDGE_SOURCE_LICENSE_LABELS_FA[s.licenseStatus])}</li>`,
    )
    .join('');

  const limitationsRows = (pub.limitationsFa ?? []).map((l) => `<li>${escapeHtmlAttr(l)}</li>`).join('');

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><title>${safeTitle} — ${escapeHtmlAttr(pub.version)}</title>
<style>body{font-family:Tahoma,sans-serif;direction:rtl;text-align:right;max-width:860px;margin:24px auto;padding:16px;line-height:1.8;color:#182522}h1{font-size:22px}section{border:1px solid #DCE3DF;border-radius:10px;padding:14px;margin:14px 0;page-break-inside:avoid}table{width:100%;border-collapse:collapse;font-size:13px;page-break-inside:auto}tr{page-break-inside:avoid;page-break-after:auto}th,td{border:1px solid #DCE3DF;padding:8px;text-align:right}.archive-banner{background:#FEF3C7;border:1px solid #F59E0B;padding:10px;border-radius:8px;font-weight:bold;margin-bottom:12px}</style>
</head>
<body>
${isArchived ? '<div class="archive-banner">وضعیت آرشیوی: این گزارش در وضعیت آرشیوشده (مرجع تاریخی) قرار دارد و شاخص‌های جاری بازار محسوب نمی‌شود.</div>' : ''}
<h1>${safeTitle}</h1>
<p>شناسه نسخه: <code>${escapeHtmlAttr(pub.versionId || `${pub.id}-${pub.version}`)}</code> · نسخه: ${escapeHtmlAttr(pub.version)} · تاریخ انتشار: ${escapeHtmlAttr(pub.publishedAtFa)} · وضعیت انتشار: ${safeStatusLabel}</p>
<p>محدوده: ${safeGeo} · بازه زمانی: ${safePeriod}</p>
<p>نویسنده: ${safeAuthor} · بازبین فنی: ${safeReviewer}</p>
<section><h2>۱. داده خام (مشاهده‌شده پیش از شاخص‌سازی)</h2><p>${safeRaw}</p></section>
<section><h2>۲. شاخص‌های محاسبه‌شده</h2><table><thead><tr><th>شاخص</th><th>مقدار</th><th>فرمول و دیتاست</th><th>محدودیت</th></tr></thead><tbody>${indicatorsRows}</tbody></table></section>
<section><h2>۳. تفسیر پژوهشی و محدودیت‌ها</h2><p>${safeInterp}</p><ul>${limitationsRows}</ul></section>
<section><h2>۴. شناسنامه منابع و وضعیت مجوز</h2><ul>${sourcesRows}</ul></section>
</body></html>`;
}

export { KNOWLEDGE_PUBLICATIONS, KNOWLEDGE_GLOSSARY_TERMS };
