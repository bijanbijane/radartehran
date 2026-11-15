import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DATA_CLASSIFICATION_LABELS_FA,
  NEIGHBORHOOD_11_SECTIONS,
  STAGE40_DESIGN_COMPONENT_IDS,
  applyReportMetadataOrVersionUpdate,
  evaluateReportPreGenerationAudit,
  evaluateReportSharePermissions,
  generateRealReportCsvExport,
  handleReportGenerationOutcome,
  toggleReportSectionSafely,
  type ReportDraftSpec,
  type StoredReportDocument,
} from '../services/reportsAndDocumentsEngine';

const sampleDraft: ReportDraftSpec = {
  reportId: 'RT-RPT-00901',
  titleFa: 'گزارش تحلیلی محله نیاوران',
  type: 'neighborhood',
  subjectId: 'niavaran',
  subjectTitleFa: 'محله نیاوران',
  geoBoundaryLabelFa: 'تهران، منطقه ۱',
  timeRangeLabelFa: 'مهر و آبان ۱۴۰۵',
  template: 'formal',
  mode: 'snapshot',
  format: 'pdf',
  sections: NEIGHBORHOOD_11_SECTIONS,
  claims: [
    { statementFa: 'روند قیمت پیشنهادی آگهی', classification: 'registered', sourceLabelFa: 'SRC-02', referencePeriodFa: 'آبان ۱۴۰۵', sampleCount: 22 },
    { statementFa: 'بازه ارزش تخمینی سامانه', classification: 'estimated', sourceLabelFa: 'Hedonic', referencePeriodFa: 'آبان ۱۴۰۵', sampleCount: 22 },
  ],
  dataReferenceDateLabelFa: '۱ آبان ۱۴۰۵',
  generatedAtLabelFa: '۱۴ آبان ۱۴۰۵',
  dataAgeDays: 13,
  sampleCount: 6,
  minRequiredSamples: 10,
  hasUnverifiedData: true,
  hasBoundaryChange: true,
  containsPrivatePii: true,
  inheritedComparisonWeights: { 'قیمت': 50, 'دسترسی': 50 },
  incomparableWarningFa: 'اختلاف نسخه مرز جغرافیایی',
  methodologyVersion: 'v3.2',
};

test('Stage 40 (RT-UI-REPORTS-001): enforces provenance section locks, dual-date stale audit, failure preservation, immutable snapshot versioning, real CSV export, and privacy share gates', () => {
  // 1. Essential provenance & limitation sections cannot be deselected (Test 1 & Section 7)
  const afterToggleProvenance = toggleReportSectionSafely(NEIGHBORHOOD_11_SECTIONS, 'sources_method');
  assert.equal(afterToggleProvenance.find((s) => s.id === 'sources_method')?.selected, true);
  const afterToggleRent = toggleReportSectionSafely(NEIGHBORHOOD_11_SECTIONS, 'rent_indices');
  assert.equal(afterToggleRent.find((s) => s.id === 'rent_indices')?.selected, false);

  // 2. Dual-date separation & stale/sample/incomparable audit warnings (Tests 2, 3, 8)
  const audit = evaluateReportPreGenerationAudit(sampleDraft);
  assert.equal(audit.isDateSeparated, true);
  assert.ok(audit.warningsFa.some((w) => w.includes('کهنگی داده')));
  assert.ok(audit.warningsFa.some((w) => w.includes('حجم نمونه ناکافی')));
  assert.ok(audit.incompleteSectionIds.includes('rent_indices'));

  // 3. Export failure preserves draft configuration & exact copy (Test 4)
  const failOutcome = handleReportGenerationOutcome(sampleDraft, 'failed');
  assert.equal(failOutcome.status, 'failed');
  assert.equal(failOutcome.preservedDraft.inheritedComparisonWeights?.['قیمت'], 50);
  assert.ok(failOutcome.messageFa.includes('تنظیمات گزارش حفظ شده‌اند'));

  // 4. Snapshot immutability: rename doesn't bump version; analytical update creates v2 while v1 stays frozen (Tests 5 & 10)
  const doc: StoredReportDocument = {
    reportId: sampleDraft.reportId,
    titleFa: sampleDraft.titleFa,
    type: 'neighborhood',
    subjectTitleFa: 'محله نیاوران',
    mode: 'snapshot',
    currentVersion: 1,
    versions: [{ version: 1, versionId: 'v1', createdAtLabelFa: '۱۴ آبان ۱۴۰۵', dataReferenceDateLabelFa: '۱ آبان ۱۴۰۵', template: 'formal', mode: 'snapshot', format: 'pdf', changeNoteFa: 'اصلی', snapshotFrozen: true, status: 'ready_to_download' }],
    shareMode: 'private',
    containsPrivatePii: true,
    draft: sampleDraft,
  };
  const renameRes = applyReportMetadataOrVersionUpdate(doc, { kind: 'rename', newTitleFa: 'عنوان جدید' });
  assert.equal(renameRes.createsNewVersion, false);
  assert.equal(renameRes.updatedDoc.currentVersion, 1);

  const verRes = applyReportMetadataOrVersionUpdate(renameRes.updatedDoc, { kind: 'new_analytical_version', newDataRefDateFa: '۱۴ آبان ۱۴۰۵', noteFa: 'تازه‌سازی' });
  assert.equal(verRes.createsNewVersion, true);
  assert.equal(verRes.updatedDoc.versions.length, 2);
  assert.equal(verRes.updatedDoc.versions[0].dataReferenceDateLabelFa, '۱ آبان ۱۴۰۵');
  assert.equal(verRes.updatedDoc.versions[0].snapshotFrozen, true);

  // 5. Sharing security gate blocks public sharing of PII-containing reports (Test 7)
  const publicAttempt = evaluateReportSharePermissions({ requestedMode: 'public', containsPrivatePii: true, expiryDays: 7, allowDownload: true });
  assert.equal(publicAttempt.allowed, false);
  assert.equal(publicAttempt.effectiveMode, 'private');

  const limitedAttempt = evaluateReportSharePermissions({ requestedMode: 'limited_link', containsPrivatePii: true, expiryDays: 14, allowDownload: false });
  assert.equal(limitedAttempt.allowed, true);
  assert.ok(limitedAttempt.shareToken?.startsWith('rtsec_'));

  // 6. Real UTF-8 CSV export & 4-way classification + RPT-01..25 registry (Tests 6 & 9)
  const csv = generateRealReportCsvExport(sampleDraft);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes(DATA_CLASSIFICATION_LABELS_FA.registered));
  assert.ok(csv.includes(DATA_CLASSIFICATION_LABELS_FA.estimated));
  assert.equal(STAGE40_DESIGN_COMPONENT_IDS.length, 25);
});
