/** @file src/features/onboarding/services/serviceDeliveryTypes.ts — Stage 45 (RT-UI-SERVICE-DELIVERY-001) Domain Types & Registries */

export type DeliveryConceptId = 'project' | 'milestone' | 'task' | 'deliverable' | 'acceptance';

export interface DeliveryConceptDefinition {
  id: DeliveryConceptId;
  titleFa: string;
  definitionFa: string;
  boundaryRuleFa: string;
}

export const FIVE_DELIVERY_CONCEPTS: readonly DeliveryConceptDefinition[] = [
  { id: 'project', titleFa: '۱. پروژه', definitionFa: 'مجموعه فعالیت‌های مرتبط برای رسیدن به نتیجه توافق‌شده', boundaryRuleFa: 'اطلاعات مالی پروژه از پرونده مرحله ۴۴ دریافت می‌شود.' },
  { id: 'milestone', titleFa: '۲. مرحله اجرایی', definitionFa: 'بخش مشخصی از پروژه با مسئول، موعد و خروجی معین', boundaryRuleFa: 'پرداخت مرحله‌ای از پیشرفت فیزیکی مرحله تفکیک است.' },
  { id: 'task', titleFa: '۳. وظیفه', definitionFa: 'فعالیت اجرایی مشخص در دل هر مرحله', boundaryRuleFa: 'انجام وظیفه به‌معنای پذیرش نهایی خروجی نیست.' },
  { id: 'deliverable', titleFa: '۴. تحویل‌دادنی', definitionFa: 'خروجی قابل بررسی یک فعالیت یا مرحله (گزارش، مستند، نمونه)', boundaryRuleFa: 'نسخه اصلاح‌شده جایگزین بی‌سابقه نسخه قبلی نمی‌شود.' },
  { id: 'acceptance', titleFa: '۵. تأیید تحویل', definitionFa: 'ثبت نتیجه بررسی خروجی توسط شخص دارای اختیار', boundaryRuleFa: '«انجام شد» با «تأیید شد» یکسان نیست؛ ابتدا «نیازمند بررسی» ثبت می‌شود.' },
] as const;

export type MilestoneExecutionStatus =
  | 'برنامه‌ریزی‌شده'
  | 'آماده شروع'
  | 'در حال اجرا'
  | 'متوقف‌شده'
  | 'نیازمند بررسی'
  | 'تأییدشده'
  | 'نیازمند اصلاح'
  | 'تکمیل‌شده'
  | 'لغوشده';

export type DeliverableStatus =
  | 'آماده‌سازی'
  | 'ارسال‌شده'
  | 'در حال بررسی'
  | 'پذیرفته‌شده'
  | 'نیازمند اصلاح'
  | 'ردشده'
  | 'جایگزین‌شده';

export type ProjectDocumentCategory =
  | 'تصاویر قبل از اجرا'
  | 'تصاویر حین اجرا'
  | 'تصاویر پس از اجرا'
  | 'گزارش فنی'
  | 'نقشه'
  | 'فاکتور مصالح'
  | 'صورت‌جلسه'
  | 'مستندات تحویل';

export type EvidenceVerificationLevel = 'تصویر ثبت‌شده' | 'مستند بررسی‌شده' | 'نتیجه تأییدشده';

export type DelayCauseCategory =
  | 'تأخیر در تأمین مصالح'
  | 'آماده نبودن محل اجرا'
  | 'تغییر درخواست مشتری'
  | 'شرایط فنی پیش‌بینی‌نشده'
  | 'تأخیر نیروی اجرایی'
  | 'محدودیت دسترسی'
  | 'شرایط خارج از کنترل طرفین'
  | 'سایر موارد';

export type HandoverDecisionType = 'پذیرش نهایی' | 'پذیرش همراه با موارد تکمیلی' | 'درخواست اصلاح' | 'رد پذیرش با ذکر دلیل';

export type WorkspaceDeliveryRole = 'formal_approve' | 'participate_review' | 'view_progress' | 'revoked';

export const STAGE45_DESIGN_COMPONENT_IDS = [
  'DEL-01', 'DEL-02', 'DEL-03', 'DEL-04', 'DEL-05', 'DEL-06', 'DEL-07', 'DEL-08',
  'DEL-09', 'DEL-10', 'DEL-11', 'DEL-12', 'DEL-13', 'DEL-14', 'DEL-15', 'DEL-16',
  'DEL-17', 'DEL-18', 'DEL-19', 'DEL-20', 'DEL-21', 'DEL-22', 'DEL-23', 'DEL-24',
] as const;

export const STAGE45_UX_EVENTS = [
  'project_started',
  'project_milestone_started',
  'project_progress_submitted',
  'project_document_uploaded',
  'project_change_requested',
  'project_delay_reported',
  'project_delivery_submitted',
  'project_delivery_reviewed',
  'project_revision_requested',
  'project_milestone_accepted',
  'project_handover_submitted',
  'project_completed',
  'project_dispute_opened',
] as const;

export interface ProjectTaskItem {
  taskId: string;
  titleFa: string;
  completed: boolean;
  assigneeFa: string;
}

export interface ProjectMilestoneRecord {
  milestoneId: string;
  order: number;
  titleFa: string;
  descriptionFa: string;
  assigneeFa: string;
  startDateFa: string;
  dueDateFa: string;
  weightPercent: number;
  status: MilestoneExecutionStatus;
  expectedOutputsFa: string[];
  prerequisitesFa: string[];
  tasks: ProjectTaskItem[];
}

export interface ProgressReportRecord {
  reportId: string;
  milestoneId: string;
  milestoneTitleFa: string;
  reportedAtFa: string;
  authorFa: string;
  activitySummaryFa: string;
  declaredPercent?: number;
  blockersFa?: string;
  nextStepsFa: string;
  attachmentNamesFa: string[];
  editedHistoryNoteFa?: string;
}

export interface ProjectDocumentRecord {
  documentId: string;
  titleFa: string;
  category: ProjectDocumentCategory;
  milestoneId: string;
  uploadedByFa: string;
  uploadedAtFa: string;
  descriptionFa: string;
  evidenceLevel: EvidenceVerificationLevel;
  accessScope: 'project_members_only' | 'financial_approvers_only';
}

export interface ProjectDelayRecord {
  delayId: string;
  milestoneId: string;
  milestoneTitleFa: string;
  baselineDueDateFa: string;
  delayDays: number;
  causeCategory: DelayCauseCategory;
  reportedByFa: string;
  impactFa: string;
  newProjectedDateFa: string;
  opponentReviewStatus: 'بررسی‌نشده' | 'تأییدشده توسط طرف مقابل' | 'مورد اختلاف';
}

export interface ScopeChangeRequestRecord {
  changeId: string;
  milestoneId: string;
  descriptionFa: string;
  reasonFa: string;
  proposedByFa: string;
  estimatedCostImpactToman: number;
  estimatedTimeImpactDays: number;
  approvalStatus: 'در انتظار بررسی' | 'تأییدشده جهت اصلاح توافق مرحله ۴۴' | 'ردشده';
  requiresStage44Revision: boolean;
  agreedAmountAutoModified: false;
}

export interface DeliverySubmissionRecord {
  submissionId: string;
  versionNumber: number;
  milestoneId: string;
  titleFa: string;
  summaryFa: string;
  submittedAtFa: string;
  submittedByFa: string;
  reviewerFa?: string;
  status: DeliverableStatus;
  revisionNoteFa?: string;
  supersededById?: string;
}

export interface QualityChecklistItem {
  checkId: string;
  criterionFa: string;
  checkedByFa?: string;
  result: 'در انتظار' | 'مطابق' | 'نیازمند اصلاح' | 'ارجاع به کارشناس فنی';
  needsSpecialistReferral: boolean;
}

export interface ProjectWorkspaceMember {
  memberId: string;
  displayNameFa: string;
  roleLabelFa: string;
  permission: WorkspaceDeliveryRole;
}

export interface ServiceDeliveryProject {
  projectId: string;
  linkedDossierId: string;
  linkedAgreementVersionLabel: string;
  titleFa: string;
  serviceCategoryFa: string;
  locationSummaryFa: string;
  applicantNameFa: string;
  providerNameFa: string;
  overallStatusFa: 'در حال اجرا' | 'در انتظار بررسی تحویل' | 'دارای تعهد باز' | 'تکمیل‌شده';
  startDateFa: string;
  plannedCompletionFa: string;
  agreedAmountToman: number;
  paidAmountToman: number;
  remainingAmountToman: number;
  milestones: ProjectMilestoneRecord[];
  progressReports: ProgressReportRecord[];
  documents: ProjectDocumentRecord[];
  delays: ProjectDelayRecord[];
  changeRequests: ScopeChangeRequestRecord[];
  deliverables: DeliverySubmissionRecord[];
  qualityChecklist: QualityChecklistItem[];
  members: ProjectWorkspaceMember[];
  recentActivitiesFa: Array<{ id: string; timestampFa: string; summaryFa: string }>;
  handoverResult?: { decision: HandoverDecisionType; noteFa: string; recordedAtFa: string };
}
