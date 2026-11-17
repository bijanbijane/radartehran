/** @file src/features/knowledge/tests/knowledgeCenter.test.ts — Stages 81–88 Knowledge Base, Governance & Epistemic Provenance Unit Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWLEDGE_PUBLICATIONS,
  KNOWLEDGE_GLOSSARY_TERMS,
  buildKnowledgeReportExportJson,
  buildKnowledgeReportPrintHtml,
  filterGlossaryTerms,
  filterKnowledgePublications,
  validateEditorialStatusTransition,
  validateKnowledgePublicationForRelease,
} from '../services/knowledgeSearchService';
import { KNOWLEDGE_DATA_BRIEFS, KNOWLEDGE_SOURCE_REGISTRY } from '../data/knowledgeSourcesAndBriefs';
import type { KnowledgePublicationStatus } from '../types/knowledge.types';

test('Every Knowledge publication separates Raw Data, Calculated Indicators, and Research Interpretation', () => {
  assert.ok(KNOWLEDGE_PUBLICATIONS.length >= 5);
  for (const pub of KNOWLEDGE_PUBLICATIONS) {
    assert.ok(pub.rawDataSummaryFa.length > 15, `${pub.id} needs rawDataSummaryFa`);
    assert.ok(pub.calculatedIndicators.length >= 1, `${pub.id} needs calculatedIndicators`);
    assert.ok(pub.researchInterpretationFa.length > 20, `${pub.id} needs researchInterpretationFa`);
    assert.ok(pub.formulaVersion.length > 0);
    assert.equal(pub.author.roleKind, 'author');
    assert.equal(pub.technicalReviewer.roleKind, 'technical_reviewer');
  }
});

test('Knowledge search normalizes Persian characters and respects subTabs & freshness filters', () => {
  const metroResults = filterKnowledgePublications(KNOWLEDGE_PUBLICATIONS, {
    subTab: 'reports',
    query: 'مترو',
    contentType: 'all',
    freshness: 'all',
  });
  assert.equal(metroResults.length, 1);
  assert.equal(metroResults[0].id, 'rep-02');

  const archived = filterKnowledgePublications(KNOWLEDGE_PUBLICATIONS, {
    subTab: 'reports',
    query: '',
    contentType: 'all',
    freshness: 'archived',
  });
  assert.equal(archived.length, 1);
  assert.equal(archived[0].id, 'rep-03');
});

test('Glossary search matches English or Persian terms and category filters', () => {
  const iqrMatches = filterGlossaryTerms(KNOWLEDGE_GLOSSARY_TERMS, 'IQR', 'statistics');
  assert.equal(iqrMatches.length, 1);
  assert.equal(iqrMatches[0].id, 'gls-iqr');
});

test('Print HTML export strips/escapes unsafe markup and JSON export v2 preserves epistemic tiers and source provenance', () => {
  const sample = { ...KNOWLEDGE_PUBLICATIONS[0], titleFa: 'گزارش <script>alert(1)</script> "تست"' };
  const html = buildKnowledgeReportPrintHtml(sample);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&quot;تست&quot;'));

  const parsed = JSON.parse(buildKnowledgeReportExportJson(KNOWLEDGE_PUBLICATIONS[0]));
  assert.equal(parsed.schema, 'radar-tehran.knowledge-publication.v2');
  assert.equal(parsed.schemaVersion, 2);
  assert.ok(parsed.epistemicSeparation.tier1_rawDataSummary);
  assert.ok(Array.isArray(parsed.epistemicSeparation.tier2_calculatedIndicators));
  assert.ok(parsed.epistemicSeparation.tier3_researchInterpretation);
  assert.ok(Array.isArray(parsed.linkedSources) && parsed.linkedSources.length > 0);
});

test('Server-authoritative publication governance hides drafts/unreceived statuses and blocks self-publication', () => {
  const statusMap: Record<string, KnowledgePublicationStatus> = {
    'rep-01': 'editorial_review',
    'rep-02': 'published',
    'rep-03': 'archived',
  };
  const visibleCurrent = filterKnowledgePublications(
    KNOWLEDGE_PUBLICATIONS,
    { subTab: 'reports', query: '', contentType: 'all', freshness: 'all' },
    statusMap,
  );
  assert.equal(visibleCurrent.some((p) => p.id === 'rep-01'), false);
  assert.equal(visibleCurrent.some((p) => p.id === 'rep-02'), true);
  assert.equal(visibleCurrent.some((p) => p.id === 'rep-03'), false);
  assert.equal(visibleCurrent.some((p) => p.id === 'rep-04'), false);

  const visibleArchived = filterKnowledgePublications(
    KNOWLEDGE_PUBLICATIONS,
    { subTab: 'reports', query: '', contentType: 'all', freshness: 'archived' },
    statusMap,
  );
  assert.deepEqual(visibleArchived.map((p) => p.id), ['rep-03']);

  const pub = KNOWLEDGE_PUBLICATIONS[0];
  assert.equal(validateKnowledgePublicationForRelease(pub).ok, true);
  const selfPublishCheck = validateEditorialStatusTransition({
    pub,
    fromStatus: 'approved',
    toStatus: 'published',
    actorUserId: pub.author.id,
    actorRole: 'release_manager',
    reasonFa: 'تلاش انتشار توسط خود نویسنده',
  });
  assert.equal(selfPublishCheck.ok, false);

  const validPublishCheck = validateEditorialStatusTransition({
    pub,
    fromStatus: 'approved',
    toStatus: 'published',
    actorUserId: 'release-admin-99',
    actorRole: 'release_manager',
    reasonFa: 'تأیید نهایی پس از بازبینی علمی و کنترل مجوز منابع',
  });
  assert.equal(validPublishCheck.ok, true);
});

test('Source Registry & Data Briefs maintain non-empty provenance, units, and valid linked report IDs', () => {
  assert.ok(KNOWLEDGE_SOURCE_REGISTRY.length >= 3);
  const pubIds = new Set(KNOWLEDGE_PUBLICATIONS.map((p) => p.id));
  const sourceIds = new Set(KNOWLEDGE_SOURCE_REGISTRY.map((s) => s.sourceId));
  for (const brief of KNOWLEDGE_DATA_BRIEFS) {
    assert.ok(brief.unitFa.length > 0);
    assert.ok(brief.limitationFa.length > 0);
    assert.ok(sourceIds.has(brief.sourceId));
    assert.ok(pubIds.has(brief.linkedReportId));
  }
});
