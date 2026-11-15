/** @file src/features/onboarding/tests/stage46QualityArchitecture.test.ts — Stage 46 Acceptance Tests */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addConflictingEvidencePreservingBoth,
  assignIndependentReviewerSafely,
  canAccessDisputeCase,
  evaluateCredentialImpactSafely,
  getConditionalComplaintFields,
  getServiceSpecificQualityCriteria,
  recordDisputeResolution,
  submitCounterpartyResponse,
  submitDisputeAppeal,
  submitServiceComplaint,
} from '../services/serviceQualityEngine';
import {
  SIX_QUALITY_CONCEPTS,
  STAGE46_DESIGN_COMPONENT_IDS,
  STAGE46_UX_EVENTS,
} from '../services/serviceQualityTypes';
import { INITIAL_STAGE46_CASE, STAGE46_REVIEWERS } from '../services/stage46QualityFixtures';

describe('Stage 46 (RT-UI-SERVICE-QUALITY-001) Acceptance & Architecture Suite', () => {
  it('T46-01: enforces 6 concepts, 30 QAR component IDs, and 15 UX telemetry events', () => {
    assert.equal(SIX_QUALITY_CONCEPTS.length, 6);
    assert.equal(STAGE46_DESIGN_COMPONENT_IDS.length, 30);
    assert.equal(STAGE46_DESIGN_COMPONENT_IDS[0], 'QAR-01');
    assert.equal(STAGE46_DESIGN_COMPONENT_IDS[29], 'QAR-30');
    assert.equal(STAGE46_UX_EVENTS.length, 15);
  });

  it('T46-02: conditional complaint builder requires category-specific fields and marks claim as unverified without auto-dropping credentials', () => {
    const finFields = getConditionalComplaintFields('اختلاف مالی', 'advisory');
    assert.ok(finFields.some((f) => f.includes('تومان')) && finFields.some((f) => f.includes('مرحله ۴۴')));

    const created = submitServiceComplaint({
      existingCasesCount: 1,
      linkedRequestId: 'req-43-101',
      linkedDossierId: 'dos-44-saadat-101',
      linkedInvoiceNumber: 'INV-1405-4401',
      linkedProjectId: 'prj-45-saadat-101',
      linkedMilestoneTitleFa: 'مرحله ۲',
      serviceDomain: 'technical_inspection',
      category: 'کیفیت فنی',
      titleFa: 'شکایت تست کلکتور',
      claimSummaryFa: 'گزارش فشار آب گرم کامل نیست',
      requestedOutcomeFa: 'تکمیل گزارش',
    });

    assert.equal(created.claimVerificationBadgeFa, 'ادعای بررسی‌نشده');
    assert.equal(created.providerBadgeAutoDropped, false);
    assert.equal(created.status, 'ثبت‌شده');
  });

  it('T46-03: bilateral response appends side-by-side and prevents deleting initial complaint', () => {
    const updated = submitCounterpartyResponse({
      disputeCase: INITIAL_STAGE46_CASE,
      authorNameFa: 'مهندس نیازی',
      stance: 'ارائه توضیح',
      explanationFa: 'توضیح تکمیلی ضمیمه شد.',
    });
    assert.equal(updated.responses[0].cannotDeleteComplaint, true);
    assert.equal(updated.claimSummaryFa, INITIAL_STAGE46_CASE.claimSummaryFa);
    assert.equal(updated.status, 'در حال بررسی');
  });

  it('T46-04: conflicting evidence preserves both prior and new documents side-by-side', () => {
    const updated = addConflictingEvidencePreservingBoth({
      disputeCase: INITIAL_STAGE46_CASE,
      titleFa: 'گزارش سوم',
      kindFa: 'گزارش فنی',
      submittedByRole: 'reviewer',
      submittedByNameFa: 'دکتر رضایی‌فر',
      descriptionFa: 'مستند مغایر برای بازبینی',
      conflictsWithEvidenceId: 'ev-46-1',
    });
    assert.equal(updated.evidences.length, INITIAL_STAGE46_CASE.evidences.length + 1);
    assert.ok(updated.evidences.some((e) => e.evidenceId === 'ev-46-1'));
    assert.equal(updated.evidences[0].conflictsWithEvidenceId, 'ev-46-1');
  });

  it('T46-05: separates customer satisfaction score from service-specific technical criteria', () => {
    const advCriteria = getServiceSpecificQualityCriteria('advisory');
    const engCriteria = getServiceSpecificQualityCriteria('technical_inspection');
    assert.notEqual(advCriteria[0].titleFa, engCriteria[0].titleFa);
    assert.equal(INITIAL_STAGE46_CASE.customerSatisfactionScore5, 3);
  });

  it('T46-06: detects reviewer conflict-of-interest and reroutes safely to independent reviewer', () => {
    const conflicted = STAGE46_REVIEWERS[0];
    const independent = STAGE46_REVIEWERS[1];
    assert.equal(conflicted.hasConflictWithParty, true);

    const rerouted = assignIndependentReviewerSafely({
      disputeCase: INITIAL_STAGE46_CASE,
      candidate: conflicted,
      fallbackReviewer: independent,
    });
    assert.equal(rerouted.ok, true);
    assert.equal(rerouted.reroutedForConflict, true);
    assert.equal(rerouted.disputeCase.assignedReviewer?.reviewerId, independent.reviewerId);

    const blockedNoFallback = assignIndependentReviewerSafely({
      disputeCase: INITIAL_STAGE46_CASE,
      candidate: conflicted,
    });
    assert.equal(blockedNoFallback.ok, false);
  });

  it('T46-07: resolution requires case_manager RBAC, supports partial confirmation & insufficient evidence, and preserves appeals', () => {
    const denied = recordDisputeResolution({
      disputeCase: INITIAL_STAGE46_CASE,
      outcome: 'ادعا تأیید شد',
      confirmedScopeFa: 'تایید',
      unconfirmedScopeFa: 'رد',
      decidedByFa: 'کاربر',
      viewerRole: 'applicant',
    });
    assert.equal(denied.ok, false);

    const noEvidenceCase = { ...INITIAL_STAGE46_CASE, evidences: [] };
    const insuf = recordDisputeResolution({
      disputeCase: noEvidenceCase,
      outcome: 'ادعا تأیید شد',
      confirmedScopeFa: 'تایید',
      unconfirmedScopeFa: '',
      decidedByFa: 'مدیر',
      viewerRole: 'case_manager',
    });
    assert.equal(insuf.ok, true);
    assert.equal(insuf.disputeCase.resolution?.outcome, 'شواهد ناکافی');

    const partial = recordDisputeResolution({
      disputeCase: INITIAL_STAGE46_CASE,
      outcome: 'ادعا تا حدی تأیید شد',
      confirmedScopeFa: 'تست آب گرم الزامی است',
      unconfirmedScopeFa: 'خسارت تاخیر رد شد',
      decidedByFa: 'هیئت رسیدگی',
      viewerRole: 'case_manager',
    });
    assert.equal(partial.ok, true);
    const appealed = submitDisputeAppeal({
      disputeCase: partial.disputeCase,
      reasonCategoryFa: 'شواهد جدید',
      summaryFa: 'سند جدید پیوست شد',
      requestedOutcomeFa: 'بازبینی مجدد',
      independentAppealReviewerFa: 'هیئت مستقل',
    });
    assert.equal(appealed.status, 'در حال بازبینی');
    assert.ok(appealed.appeals[0].previousResolutionPreservedFa.includes('ادعا تا حدی تأیید شد'));
  });

  it('T46-08: protects Stage 42 KYC/credentials from financial disputes and denies outsider RBAC access', () => {
    const safeEval = evaluateCredentialImpactSafely(INITIAL_STAGE46_CASE);
    assert.equal(safeEval.canAlterKycIdentity, false);
    assert.equal(safeEval.shouldReviewSpecificCredential, false);

    const outsider = canAccessDisputeCase('outsider');
    assert.equal(outsider.allowed, false);
  });
});
