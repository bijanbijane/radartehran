/**
 * Real Estate Development Quality Control, Change Orders, Risks & Handover Sub-Service
 * (`server/modules/development-projects/qualityChangeAndHandoverService.ts`)
 * Exclusive ownership: `server/modules/development-projects/`
 */

import type { DevelopmentProjectRepository } from './repository';
import type {
  ChangeOrderStatus,
  DevelopmentDomainEvent,
  ProjectChangeOrderRecord,
  ProjectHandoverRecord,
  ProjectIssueRecord,
  ProjectQualityInspectionRecord,
  ProjectRiskRecord,
} from './types';
import {
  DevelopmentValidationError,
  sanitizeText,
  validateIsoDateString,
  validateSafeFirestoreId,
} from './validation';

export interface QualityChangeAndHandoverContext {
  repository: DevelopmentProjectRepository;
  emitEvent: (
    eventType: DevelopmentDomainEvent['eventType'],
    aggregateId: string,
    aggregateType: DevelopmentDomainEvent['aggregateType'],
    actorUserId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
}

export async function createQualityInspectionWorkflow(
  ctx: QualityChangeAndHandoverContext,
  input: {
    projectId: string;
    phaseId?: string;
    taskId?: string;
    inspectionType: ProjectQualityInspectionRecord['inspectionType'];
    criteriaFa: string;
    passed: boolean;
    findingsFa: string;
    defects?: Array<{ descriptionFa: string; severity: 'minor' | 'moderate' | 'critical' }>;
  },
  inspectorUserId: string,
): Promise<ProjectQualityInspectionRecord> {
  const projectId = validateSafeFirestoreId(input.projectId, 'projectId');
  const inspectionId = `insp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const formattedDefects = (input.defects || []).map((d, idx) => ({
    defectId: `def_${inspectionId}_${idx + 1}`,
    descriptionFa: sanitizeText(d.descriptionFa, 300),
    severity: d.severity,
    isCorrected: false,
  }));

  const record: ProjectQualityInspectionRecord = {
    inspectionId,
    projectId,
    phaseId: input.phaseId,
    taskId: input.taskId,
    inspectionType: input.inspectionType,
    inspectorUserId,
    inspectionDateIso: now,
    criteriaFa: sanitizeText(input.criteriaFa, 300),
    passed: input.passed && formattedDefects.length === 0,
    findingsFa: sanitizeText(input.findingsFa, 1000),
    defects: formattedDefects,
    createdAtIso: now,
  };

  await ctx.repository.saveInspection(record);
  await ctx.emitEvent('project.inspection_completed', inspectionId, 'inspection', inspectorUserId, {
    projectId,
    passed: record.passed,
    defectsCount: formattedDefects.length,
  });

  return record;
}

export async function resolveDefectWorkflow(
  ctx: QualityChangeAndHandoverContext,
  inspectionId: string,
  defectId: string,
  correctionEvidenceMediaId: string | undefined,
  actorUserId: string,
): Promise<ProjectQualityInspectionRecord> {
  const inspection = await ctx.repository.getInspectionById(inspectionId);
  if (!inspection) throw new DevelopmentValidationError('INSPECTION_NOT_FOUND', 'Inspection not found.');

  const defect = inspection.defects.find((d) => d.defectId === defectId);
  if (!defect) throw new DevelopmentValidationError('DEFECT_NOT_FOUND', `Defect ${defectId} not found.`);

  defect.isCorrected = true;
  defect.correctionEvidenceMediaId = correctionEvidenceMediaId ? sanitizeText(correctionEvidenceMediaId, 128) : undefined;
  defect.correctedByUserId = actorUserId;
  defect.correctedAtIso = new Date().toISOString();

  if (inspection.defects.every((d) => d.isCorrected)) {
    inspection.passed = true;
  }

  await ctx.repository.saveInspection(inspection);
  await ctx.emitEvent('project.defect_resolved', defectId, 'inspection', actorUserId, { inspectionId, defectId });
  return inspection;
}

export async function submitChangeOrderWorkflow(
  ctx: QualityChangeAndHandoverContext,
  input: {
    projectId: string;
    titleFa: string;
    reasonFa: string;
    affectedPhaseIds?: string[];
    affectedTaskIds?: string[];
    costImpactMillionToman: number;
    scheduleImpactDays: number;
  },
  actorUserId: string,
): Promise<ProjectChangeOrderRecord> {
  const projectId = validateSafeFirestoreId(input.projectId, 'projectId');
  const titleFa = sanitizeText(input.titleFa, 200);
  const reasonFa = sanitizeText(input.reasonFa, 1000);

  if (titleFa.length < 3) throw new DevelopmentValidationError('INVALID_CHANGE_ORDER_TITLE', 'Title must be at least 3 characters.');
  if (reasonFa.length < 5) throw new DevelopmentValidationError('INVALID_CHANGE_ORDER_REASON', 'Reason must be at least 5 characters.');

  const changeOrderId = `co_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const record: ProjectChangeOrderRecord = {
    changeOrderId,
    projectId,
    requestingUserId: actorUserId,
    titleFa,
    reasonFa,
    affectedPhaseIds: input.affectedPhaseIds || [],
    affectedTaskIds: input.affectedTaskIds || [],
    costImpactMillionToman: Math.round(input.costImpactMillionToman * 100) / 100,
    scheduleImpactDays: Math.floor(input.scheduleImpactDays),
    status: 'submitted',
    createdAtIso: now,
  };

  await ctx.repository.saveChangeOrder(record);
  await ctx.emitEvent('project.change_order_submitted', changeOrderId, 'change_order', actorUserId, {
    projectId,
    costImpact: record.costImpactMillionToman,
    scheduleImpactDays: record.scheduleImpactDays,
  });

  return record;
}

export async function decideChangeOrderWorkflow(
  ctx: QualityChangeAndHandoverContext,
  changeOrderId: string,
  decision: 'approved' | 'rejected',
  actorUserId: string,
): Promise<ProjectChangeOrderRecord> {
  const co = await ctx.repository.getChangeOrderById(changeOrderId);
  if (!co) throw new DevelopmentValidationError('CHANGE_ORDER_NOT_FOUND', 'Change order not found.');

  co.status = decision;
  co.decidedByUserId = actorUserId;
  co.decidedAtIso = new Date().toISOString();

  await ctx.repository.saveChangeOrder(co);

  if (decision === 'approved') {
    const project = await ctx.repository.getProjectById(co.projectId);
    if (project) {
      project.baselineBudgetMillionToman += co.costImpactMillionToman;
      await ctx.repository.saveProject(project);
    }
  }

  await ctx.emitEvent('project.change_order_approved', co.changeOrderId, 'change_order', actorUserId, {
    projectId: co.projectId,
    decision,
  });

  return co;
}

export async function scheduleProjectHandoverWorkflow(
  ctx: QualityChangeAndHandoverContext,
  input: {
    projectId: string;
    handoverDateIso: string;
    participants: Array<{ userId: string; role: string }>;
    acceptanceNotesFa?: string;
  },
  actorUserId: string,
): Promise<ProjectHandoverRecord> {
  const projectId = validateSafeFirestoreId(input.projectId, 'projectId');
  const handoverDate = validateIsoDateString(input.handoverDateIso, 'handoverDateIso');

  const inspections = await ctx.repository.listInspectionsByProject(projectId);
  const openCriticalDefects = inspections
    .flatMap((i) => i.defects)
    .filter((d) => !d.isCorrected && d.severity === 'critical');

  if (openCriticalDefects.length > 0) {
    throw new DevelopmentValidationError(
      'OPEN_CRITICAL_DEFECTS_BLOCK_HANDOVER',
      `Cannot schedule handover: ${openCriticalDefects.length} open critical defect(s) must be resolved first.`,
    );
  }

  const handover: ProjectHandoverRecord = {
    handoverId: `hnd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    handoverDateIso: handoverDate,
    handoverParticipants: input.participants,
    status: 'handover_accepted',
    finalChecklistCompleted: true,
    openDefectsCount: openCriticalDefects.length,
    evidenceMediaIds: [],
    acceptanceNotesFa: sanitizeText(input.acceptanceNotesFa, 1000) || undefined,
    createdAtIso: new Date().toISOString(),
    updatedAtIso: new Date().toISOString(),
  };

  await ctx.repository.saveHandover(handover);

  const project = await ctx.repository.getProjectById(projectId);
  if (project) {
    project.status = 'completed';
    project.actualCompletionDateIso = new Date().toISOString();
    project.closedAtIso = new Date().toISOString();
    await ctx.repository.saveProject(project);
  }

  await ctx.emitEvent('project.handover_scheduled', handover.handoverId, 'handover', actorUserId, {
    projectId,
    status: handover.status,
  });

  return handover;
}
