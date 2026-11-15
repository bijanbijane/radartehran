import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canMemberAccessDeliveryResource,
  computeProjectProgressSummary,
  createProjectFromAcceptedAgreement,
  evaluateFinalHandoverReadiness,
  reportProjectDelay,
  reviewDeliverableOrMilestone,
  submitDeliverableForReview,
  submitMilestoneProgressReport,
  submitScopeChangeRequest,
  uploadProjectDocumentSafely,
} from '../services/serviceDeliveryEngine';
import {
  FIVE_DELIVERY_CONCEPTS,
  STAGE45_DESIGN_COMPONENT_IDS,
  STAGE45_UX_EVENTS,
} from '../services/serviceDeliveryTypes';
import { INITIAL_STAGE44_DOSSIER } from '../services/stage44TransactionFixtures';
import { INITIAL_STAGE45_PROJECT } from '../services/stage45DeliveryFixtures';

test('Stage 45 (RT-UI-SERVICE-DELIVERY-001): converts Stage 44 agreement to project, separates submission from acceptance, protects versions/changes/RBAC & offline drafts', () => {
  // Concepts, DEL-01..24, 13 UX events
  assert.equal(FIVE_DELIVERY_CONCEPTS.length, 5);
  assert.equal(STAGE45_DESIGN_COMPONENT_IDS.length, 24);
  assert.equal(STAGE45_UX_EVENTS.length, 13);

  // Tests 1, 2, 16: Agreement converts cleanly to project & links Stage 44 financial totals
  const created = createProjectFromAcceptedAgreement(INITIAL_STAGE44_DOSSIER);
  assert.equal(created.linkedDossierId, INITIAL_STAGE44_DOSSIER.dossierId);
  assert.equal(created.agreedAmountToman, 5_000_000);
  assert.equal(created.paidAmountToman, 2_600_000);

  // Tests 4, 5, 15: Progress report attaches to milestone, preserves history, and respects offline failure
  const offlineTry = submitMilestoneProgressReport({
    project: INITIAL_STAGE45_PROJECT,
    milestoneId: 'dlv-ms-3',
    authorFa: 'مهندس نیازی',
    activitySummaryFa: 'گزارش موقت میدانی',
    networkOnline: false,
  });
  assert.equal(offlineTry.ok, false);
  assert.equal(offlineTry.draftPreserved, true);
  assert.equal(offlineTry.project.progressReports.length, INITIAL_STAGE45_PROJECT.progressReports.length);

  const onlineTry = submitMilestoneProgressReport({
    project: INITIAL_STAGE45_PROJECT,
    milestoneId: 'dlv-ms-3',
    authorFa: 'مهندس نیازی',
    activitySummaryFa: 'تطبیق نقشه با وضع موجود انجام شد.',
    declaredPercent: 70,
    networkOnline: true,
  });
  assert.equal(onlineTry.ok, true);
  assert.equal(onlineTry.project.progressReports.length, 2);

  const progSummary = computeProjectProgressSummary(INITIAL_STAGE45_PROJECT);
  assert.ok(progSummary.basisLabelFa.includes('وزن'));

  // Test 6 & Sec 7: Document privacy & evidence distinction
  const deniedUpload = uploadProjectDocumentSafely({
    project: INITIAL_STAGE45_PROJECT,
    titleFa: 'عکس غیرمجاز',
    category: 'نقشه',
    milestoneId: 'dlv-ms-3',
    uploadedByFa: 'کاربر حذف‌شده',
    descriptionFa: 'تست دسترسی',
    viewerPermission: 'revoked',
  });
  assert.equal(deniedUpload.ok, false);

  const allowedUpload = uploadProjectDocumentSafely({
    project: INITIAL_STAGE45_PROJECT,
    titleFa: 'نقشه اصلاحی تأسیسات',
    category: 'نقشه',
    milestoneId: 'dlv-ms-3',
    uploadedByFa: 'مهندس نیازی',
    descriptionFa: 'بارگذاری مجاز',
    viewerPermission: 'participate_review',
  });
  assert.equal(allowedUpload.ok, true);
  assert.equal(allowedUpload.project.documents[0].evidenceLevel, 'تصویر ثبت‌شده');

  // Test 7 & Test 8: Change request never mutates agreed Toman price; delay separates claim vs opponent review
  const changed = submitScopeChangeRequest({
    project: INITIAL_STAGE45_PROJECT,
    milestoneId: 'dlv-ms-3',
    descriptionFa: 'بازسازی بالکن غربی',
    reasonFa: 'تغییر درخواست کارفرما',
    proposedByFa: 'آرش بهرامی',
    estimatedCostImpactToman: 1_200_000,
    estimatedTimeImpactDays: 2,
  });
  assert.equal(changed.agreedAmountToman, INITIAL_STAGE45_PROJECT.agreedAmountToman);
  assert.equal(changed.changeRequests[0].agreedAmountAutoModified, false);
  assert.equal(changed.changeRequests[0].requiresStage44Revision, true);

  const delayed = reportProjectDelay({
    project: changed,
    milestoneId: 'dlv-ms-3',
    delayDays: 2,
    causeCategory: 'تأخیر در تأمین مصالح',
    reportedByFa: 'مهندس نیازی',
    impactFa: 'تأخیر مصالح',
    newProjectedDateFa: '۲۰ آبان ۱۴۰۵',
  });
  assert.equal(delayed.delays[0].opponentReviewStatus, 'بررسی‌نشده');

  // Tests 9, 10, 11, 13: Delivery submission sets 'نیازمند بررسی', observer blocked from approving, resubmission keeps history
  const submittedV2 = submitDeliverableForReview({
    project: INITIAL_STAGE45_PROJECT,
    milestoneId: 'dlv-ms-2',
    titleFa: 'گزارش اصلاح‌شده تأسیسات (نسخه ۲)',
    summaryFa: 'تست فشار ۴ بار اضافه شد',
    submittedByFa: 'مهندس نیازی',
    supersedesSubmissionId: 'del-45-201',
  });
  const ms2 = submittedV2.milestones.find((m) => m.milestoneId === 'dlv-ms-2');
  assert.equal(ms2?.status, 'نیازمند بررسی');
  assert.equal(submittedV2.deliverables.find((d) => d.submissionId === 'del-45-201')?.status, 'جایگزین‌شده');

  const observerApproveAttempt = reviewDeliverableOrMilestone({
    project: submittedV2,
    submissionId: submittedV2.deliverables[0].submissionId,
    decision: 'پذیرفته‌شده',
    reviewerFa: 'مشاور',
    reviewerPermission: 'view_progress',
  });
  assert.equal(observerApproveAttempt.ok, false);
  assert.equal(canMemberAccessDeliveryResource('view_progress', 'view_financial').allowed, false);

  // Test 12: Open commitments block unlabeled completion on handover
  const handoverBlocked = evaluateFinalHandoverReadiness(INITIAL_STAGE45_PROJECT, 'پذیرش نهایی');
  assert.equal(handoverBlocked.canMarkFullyCompleted, false);
  assert.ok(handoverBlocked.openCommitmentsCount > 0);
});
