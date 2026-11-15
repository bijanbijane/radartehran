/** @file src/features/onboarding/services/serviceDeliverySetupAndProgress.ts — Stage 45 RBAC, Project Setup & Progress Calculation */
import type { ServiceTransactionDossier } from './serviceTransactionTypes';
import { dossierActiveVersion } from './serviceTransactionEngine';
import type { ProjectMilestoneRecord, ServiceDeliveryProject, WorkspaceDeliveryRole } from './serviceDeliveryTypes';

export function canMemberAccessDeliveryResource(
  permission: WorkspaceDeliveryRole,
  action: 'view_project' | 'view_financial' | 'participate_review' | 'formal_approve',
): { allowed: boolean; reasonFa: string } {
  if (permission === 'revoked') {
    return { allowed: false, reasonFa: 'دسترسی مسدود شد: عضویت این کاربر از فضای کاری پروژه لغو شده است.' };
  }
  if (action === 'view_project') {
    return { allowed: true, reasonFa: 'مشاهده پیشرفت پروژه مجاز است.' };
  }
  if (action === 'view_financial') {
    return permission === 'formal_approve'
      ? { allowed: true, reasonFa: 'مشاهده اطلاعات مالی پرونده ۴۴ مجاز است.' }
      : { allowed: false, reasonFa: 'محدودیت دسترسی مالی: اعضای مشاهده‌گر یا همکار بررسی به جزئیات مالی محرمانه دسترسی ندارند.' };
  }
  if (action === 'participate_review') {
    return permission === 'formal_approve' || permission === 'participate_review'
      ? { allowed: true, reasonFa: 'ثبت نظر بررسی تحویل مجاز است.' }
      : { allowed: false, reasonFa: 'کاربر با سطح «مشاهده پیشرفت» نمی‌تواند نظر بررسی ثبت کند.' };
  }
  return permission === 'formal_approve'
    ? { allowed: true, reasonFa: 'اختیار تأیید رسمی مرحله یا تحویل نهایی برقرار است.' }
    : { allowed: false, reasonFa: 'مجوز ناکافی: عضو فاقد اختیار تأیید رسمی نمی‌تواند مرحله یا تعهد مالی را تأیید کند.' };
}

export function createProjectFromAcceptedAgreement(dossier: ServiceTransactionDossier): ServiceDeliveryProject {
  const activeVer = dossierActiveVersion(dossier);
  const agreedAmountToman = activeVer.amountToman + activeVer.sideCostsToman - activeVer.discountToman;
  const paidAmountToman = dossier.payments
    .filter((p) => p.status === 'موفق' || p.status === 'بازپرداخت جزئی')
    .reduce((s, p) => s + p.amountToman, 0);
  const stages = activeVer.timelineFa.executionStagesFa;
  const weightEach = stages.length > 0 ? Math.floor(100 / stages.length) : 100;
  const milestones: ProjectMilestoneRecord[] = stages.map((st, idx) => ({
    milestoneId: `dlv-ms-${idx + 1}`,
    order: idx + 1,
    titleFa: st,
    descriptionFa: `اجرا و مستندسازی ${st} مطابق دامنه توافق ${activeVer.versionLabel}`,
    assigneeFa: dossier.provider.displayNameFa,
    startDateFa: activeVer.timelineFa.proposedStartDateFa,
    dueDateFa: activeVer.timelineFa.deliveryDeadlineFa,
    weightPercent: idx === stages.length - 1 ? 100 - weightEach * (stages.length - 1) : weightEach,
    status: idx === 0 ? 'آماده شروع' : 'برنامه‌ریزی‌شده',
    expectedOutputsFa: ['گزارش و مستندات مرحله'],
    prerequisitesFa: idx > 0 ? [stages[idx - 1]] : ['تأیید توافق مرحله ۴۴'],
    tasks: [{ taskId: `tsk-${idx + 1}`, titleFa: `انجام ${st}`, completed: false, assigneeFa: dossier.provider.displayNameFa }],
  }));
  return {
    projectId: `prj-${dossier.dossierId}`,
    linkedDossierId: dossier.dossierId,
    linkedAgreementVersionLabel: activeVer.versionLabel,
    titleFa: dossier.serviceTitleFa,
    serviceCategoryFa: 'کارشناسی فنی و کنترل کیفیت ملک',
    locationSummaryFa: dossier.locationSummaryFa,
    applicantNameFa: dossier.applicant.displayNameFa,
    providerNameFa: dossier.provider.displayNameFa,
    overallStatusFa: 'در حال اجرا',
    startDateFa: activeVer.timelineFa.proposedStartDateFa,
    plannedCompletionFa: activeVer.timelineFa.deliveryDeadlineFa,
    agreedAmountToman,
    paidAmountToman,
    remainingAmountToman: Math.max(0, agreedAmountToman - paidAmountToman),
    milestones,
    progressReports: [],
    documents: [],
    delays: [],
    changeRequests: [],
    deliverables: [],
    qualityChecklist: [
      { checkId: 'qc-1', criterionFa: 'تطابق کامل با دامنه توافق‌شده در مرحله ۴۴', result: 'در انتظار', needsSpecialistReferral: false },
      { checkId: 'qc-2', criterionFa: 'تحویل مستندات و گزارش مکتوب', result: 'در انتظار', needsSpecialistReferral: true },
    ],
    members: [
      { memberId: dossier.applicant.userId, displayNameFa: dossier.applicant.displayNameFa, roleLabelFa: 'درخواست‌کننده (تأییدکننده)', permission: 'formal_approve' },
      { memberId: dossier.provider.userId, displayNameFa: dossier.provider.displayNameFa, roleLabelFa: 'ارائه‌دهنده مجری', permission: 'participate_review' },
    ],
    recentActivitiesFa: [{ id: `act-${Date.now()}`, timestampFa: '۱۴ آبان ۱۴۰۵', summaryFa: `پروژه از توافق ${activeVer.versionLabel} بدون ورود مجدد ایجاد شد.` }],
  };
}

export function computeProjectProgressSummary(project: ServiceDeliveryProject): {
  totalMilestones: number;
  acceptedOrCompletedCount: number;
  inProgressCount: number;
  awaitingReviewCount: number;
  pausedOrRevisionCount: number;
  weightedPercent: number;
  basisLabelFa: string;
} {
  const totalMilestones = project.milestones.length;
  const weightSum = project.milestones.reduce((s, m) => s + m.weightPercent, 0);
  const acceptedOrCompletedCount = project.milestones.filter((m) => m.status === 'تأییدشده' || m.status === 'تکمیل‌شده').length;
  const inProgressCount = project.milestones.filter((m) => m.status === 'در حال اجرا').length;
  const awaitingReviewCount = project.milestones.filter((m) => m.status === 'نیازمند بررسی').length;
  const pausedOrRevisionCount = project.milestones.filter((m) => m.status === 'متوقف‌شده' || m.status === 'نیازمند اصلاح').length;

  if (weightSum === 100 && totalMilestones > 0) {
    const weighted = project.milestones.reduce((sum, m) => {
      if (m.status === 'تأییدشده' || m.status === 'تکمیل‌شده') return sum + m.weightPercent;
      if (m.status === 'نیازمند بررسی') return sum + m.weightPercent * 0.7;
      if (m.status === 'در حال اجرا') return sum + m.weightPercent * 0.35;
      return sum;
    }, 0);
    return {
      totalMilestones,
      acceptedOrCompletedCount,
      inProgressCount,
      awaitingReviewCount,
      pausedOrRevisionCount,
      weightedPercent: Math.min(100, Math.round(weighted)),
      basisLabelFa: 'محاسبه‌شده بر اساس وزن مراحل تأییدشده و شواهد ثبت‌شده',
    };
  }
  const latestDeclared = project.progressReports[0]?.declaredPercent ?? 0;
  return {
    totalMilestones,
    acceptedOrCompletedCount,
    inProgressCount,
    awaitingReviewCount,
    pausedOrRevisionCount,
    weightedPercent: latestDeclared,
    basisLabelFa: 'درصد اعلام‌شده توسط ارائه‌دهنده (بدون وزن‌دهی مراحل)',
  };
}
