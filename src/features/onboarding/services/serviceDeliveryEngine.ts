/** @file src/features/onboarding/services/serviceDeliveryEngine.ts — Stage 45 Reports, Deliverables, Delays & Change Engine */
import {
  canMemberAccessDeliveryResource,
  computeProjectProgressSummary,
  createProjectFromAcceptedAgreement,
} from './serviceDeliverySetupAndProgress';
import type {
  DelayCauseCategory,
  HandoverDecisionType,
  ProjectDocumentCategory,
  ServiceDeliveryProject,
  WorkspaceDeliveryRole,
} from './serviceDeliveryTypes';

export { canMemberAccessDeliveryResource, computeProjectProgressSummary, createProjectFromAcceptedAgreement };

export function submitMilestoneProgressReport(params: {
  project: ServiceDeliveryProject;
  milestoneId: string;
  authorFa: string;
  activitySummaryFa: string;
  declaredPercent?: number;
  blockersFa?: string;
  networkOnline?: boolean;
}): { ok: boolean; project: ServiceDeliveryProject; draftPreserved?: boolean; messageFa: string } {
  if (params.networkOnline === false) {
    return {
      ok: false,
      project: params.project,
      draftPreserved: true,
      messageFa: 'اختلال شبکه: گزارش به‌عنوان «ارسال‌شده» ثبت نشد اما پیش‌نویس بدون از دست رفتن اطلاعات حفظ گردید.',
    };
  }
  const ms = params.project.milestones.find((m) => m.milestoneId === params.milestoneId);
  if (!ms || !params.activitySummaryFa.trim()) {
    return { ok: false, project: params.project, messageFa: 'مرحله یا شرح فعالیت معتبر نیست.' };
  }
  const report = {
    reportId: `rep-${Date.now()}`,
    milestoneId: ms.milestoneId,
    milestoneTitleFa: ms.titleFa,
    reportedAtFa: '۱۶ آبان ۱۴۰۵ · ۱۴:۰۰',
    authorFa: params.authorFa,
    activitySummaryFa: params.activitySummaryFa.trim(),
    declaredPercent: params.declaredPercent,
    blockersFa: params.blockersFa?.trim() || undefined,
    nextStepsFa: 'ارسال مستندات برای بررسی مرحله',
    attachmentNamesFa: ['گزارش_فنی_مرحله.pdf'],
  };
  return {
    ok: true,
    messageFa: `گزارش پیشرفت برای «${ms.titleFa}» در تاریخچه ثبت شد (سابقه گزارش‌های قبلی محفوظ ماند).`,
    project: {
      ...params.project,
      milestones: params.project.milestones.map((m) =>
        m.milestoneId === ms.milestoneId && (m.status === 'آماده شروع' || m.status === 'برنامه‌ریزی‌شده') ? { ...m, status: 'در حال اجرا' as const } : m,
      ),
      progressReports: [report, ...params.project.progressReports],
      recentActivitiesFa: [{ id: `act-${Date.now()}`, timestampFa: '۱۶ آبان ۱۴۰۵ · ۱۴:۰۰', summaryFa: `ثبت گزارش پیشرفت در «${ms.titleFa}».` }, ...params.project.recentActivitiesFa],
    },
  };
}

export function uploadProjectDocumentSafely(params: {
  project: ServiceDeliveryProject;
  titleFa: string;
  category: ProjectDocumentCategory;
  milestoneId: string;
  uploadedByFa: string;
  descriptionFa: string;
  viewerPermission: WorkspaceDeliveryRole;
}): { ok: boolean; project: ServiceDeliveryProject; messageFa: string } {
  const access = canMemberAccessDeliveryResource(params.viewerPermission, 'view_project');
  if (!access.allowed) return { ok: false, project: params.project, messageFa: access.reasonFa };
  const doc = {
    documentId: `doc-${Date.now()}`,
    titleFa: params.titleFa.trim(),
    category: params.category,
    milestoneId: params.milestoneId,
    uploadedByFa: params.uploadedByFa,
    uploadedAtFa: '۱۶ آبان ۱۴۰۵ · ۱۴:۲۰',
    descriptionFa: params.descriptionFa.trim(),
    evidenceLevel: 'تصویر ثبت‌شده' as const,
    accessScope: 'project_members_only' as const,
  };
  return {
    ok: true,
    messageFa: 'مستند بارگذاری شد (فقط برای اعضای مجاز پروژه قابل مشاهده است و تصویر ثبت‌شده به‌معنای تأیید کیفیت نیست).',
    project: { ...params.project, documents: [doc, ...params.project.documents] },
  };
}

export function submitDeliverableForReview(params: {
  project: ServiceDeliveryProject;
  milestoneId: string;
  titleFa: string;
  summaryFa: string;
  submittedByFa: string;
  supersedesSubmissionId?: string;
}): ServiceDeliveryProject {
  const prevCount = params.project.deliverables.filter((d) => d.milestoneId === params.milestoneId).length;
  const newId = `del-${Date.now()}`;
  const updatedDeliverables = params.project.deliverables.map((d) =>
    d.submissionId === params.supersedesSubmissionId ? { ...d, status: 'جایگزین‌شده' as const, supersededById: newId } : d,
  );
  const sub = {
    submissionId: newId,
    versionNumber: prevCount + 1,
    milestoneId: params.milestoneId,
    titleFa: params.titleFa.trim(),
    summaryFa: params.summaryFa.trim(),
    submittedAtFa: '۱۶ آبان ۱۴۰۵ · ۱۵:۰۰',
    submittedByFa: params.submittedByFa,
    status: 'ارسال‌شده' as const,
  };
  return {
    ...params.project,
    deliverables: [sub, ...updatedDeliverables],
    milestones: params.project.milestones.map((m) => (m.milestoneId === params.milestoneId ? { ...m, status: 'نیازمند بررسی' as const } : m)),
    recentActivitiesFa: [{ id: `act-${Date.now()}`, timestampFa: '۱۶ آبان ۱۴۰۵ · ۱۵:۰۰', summaryFa: `خروجی نسخه ${sub.versionNumber} برای بررسی ارسال شد (وضعیت: نیازمند بررسی).` }, ...params.project.recentActivitiesFa],
  };
}

export function reviewDeliverableOrMilestone(params: {
  project: ServiceDeliveryProject;
  submissionId: string;
  decision: 'پذیرفته‌شده' | 'نیازمند اصلاح';
  reviewerFa: string;
  reviewerPermission: WorkspaceDeliveryRole;
  revisionNoteFa?: string;
}): { ok: boolean; project: ServiceDeliveryProject; messageFa: string } {
  const access = canMemberAccessDeliveryResource(params.reviewerPermission, 'formal_approve');
  if (!access.allowed) return { ok: false, project: params.project, messageFa: access.reasonFa };
  const sub = params.project.deliverables.find((d) => d.submissionId === params.submissionId);
  if (!sub) return { ok: false, project: params.project, messageFa: 'تحویل‌دادنی یافت نشد.' };
  return {
    ok: true,
    messageFa: params.decision === 'پذیرفته‌شده' ? 'خروجی بررسی و مرحله توسط شخص مجاز تأیید شد.' : 'درخواست اصلاح با جزئیات به تحویل مربوط متصل شد.',
    project: {
      ...params.project,
      deliverables: params.project.deliverables.map((d) =>
        d.submissionId === params.submissionId ? { ...d, status: params.decision, reviewerFa: params.reviewerFa, revisionNoteFa: params.revisionNoteFa?.trim() || undefined } : d,
      ),
      milestones: params.project.milestones.map((m) =>
        m.milestoneId === sub.milestoneId ? { ...m, status: params.decision === 'پذیرفته‌شده' ? ('تأییدشده' as const) : ('نیازمند اصلاح' as const) } : m,
      ),
    },
  };
}

export function reportProjectDelay(params: {
  project: ServiceDeliveryProject;
  milestoneId: string;
  delayDays: number;
  causeCategory: DelayCauseCategory;
  reportedByFa: string;
  impactFa: string;
  newProjectedDateFa: string;
}): ServiceDeliveryProject {
  const ms = params.project.milestones.find((m) => m.milestoneId === params.milestoneId);
  if (!ms) return params.project;
  return {
    ...params.project,
    delays: [
      {
        delayId: `dly-${Date.now()}`,
        milestoneId: ms.milestoneId,
        milestoneTitleFa: ms.titleFa,
        baselineDueDateFa: ms.dueDateFa,
        delayDays: Math.max(1, Math.round(params.delayDays)),
        causeCategory: params.causeCategory,
        reportedByFa: params.reportedByFa,
        impactFa: params.impactFa,
        newProjectedDateFa: params.newProjectedDateFa,
        opponentReviewStatus: 'بررسی‌نشده',
      },
      ...params.project.delays,
    ],
  };
}

export function submitScopeChangeRequest(params: {
  project: ServiceDeliveryProject;
  milestoneId: string;
  descriptionFa: string;
  reasonFa: string;
  proposedByFa: string;
  estimatedCostImpactToman: number;
  estimatedTimeImpactDays: number;
}): ServiceDeliveryProject {
  return {
    ...params.project,
    changeRequests: [
      {
        changeId: `chg-${Date.now()}`,
        milestoneId: params.milestoneId,
        descriptionFa: params.descriptionFa,
        reasonFa: params.reasonFa,
        proposedByFa: params.proposedByFa,
        estimatedCostImpactToman: params.estimatedCostImpactToman,
        estimatedTimeImpactDays: params.estimatedTimeImpactDays,
        approvalStatus: 'در انتظار بررسی',
        requiresStage44Revision: true,
        agreedAmountAutoModified: false,
      },
      ...params.project.changeRequests,
    ],
  };
}

export function evaluateFinalHandoverReadiness(
  project: ServiceDeliveryProject,
  decision: HandoverDecisionType,
): { canMarkFullyCompleted: boolean; openCommitmentsCount: number; warningFa: string } {
  const openMilestones = project.milestones.filter((m) => m.status !== 'تأییدشده' && m.status !== 'تکمیل‌شده' && m.status !== 'لغوشده');
  const openChanges = project.changeRequests.filter((c) => c.approvalStatus === 'در انتظار بررسی');
  const openCommitmentsCount = openMilestones.length + openChanges.length;
  if (openCommitmentsCount > 0 && decision === 'پذیرش نهایی') {
    return {
      canMarkFullyCompleted: false,
      openCommitmentsCount,
      warningFa: `هشدار تعارض: پروژه هنوز دارای ${openCommitmentsCount} تعهد یا مرحله تأییدنشده است و نمی‌تواند بدون رفع یا توضیح تکمیلی «کاملاً تکمیل‌شده» اعلام شود.`,
    };
  }
  return {
    canMarkFullyCompleted: openCommitmentsCount === 0 && decision === 'پذیرش نهایی',
    openCommitmentsCount,
    warningFa: 'تأیید تحویل در سامانه به‌خودی‌خود جایگزین تأییدیه فنی یا سند رسمی قانونی نیست.',
  };
}
