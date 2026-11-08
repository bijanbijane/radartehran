/**
 * Real Estate Development & Construction Project Management Application Service
 * (`server/modules/development-projects/service.ts`)
 * Exclusive ownership: `server/modules/development-projects/`
 */

import {
  createProcurementRequestWorkflow,
  recordProcurementDeliveryWorkflow,
  recordProjectCostWorkflow,
} from './budgetAndProcurementService';
import type {
  GeographyReferenceAdapter,
  MediaStorageReferenceAdapter,
  NotificationsEventAdapter,
  PropertyRegistryAssetAdapter,
  PropertyServicesProviderAdapter,
  SafetyIncidentEscalationAdapter,
} from './contracts';
import {
  createTaskWorkflow,
  generateDefaultPhases,
  updateTaskDependenciesWorkflow,
  updateTaskStatusWorkflow,
} from './phasesAndTasksService';
import {
  createQualityInspectionWorkflow,
  decideChangeOrderWorkflow,
  resolveDefectWorkflow,
  scheduleProjectHandoverWorkflow,
  submitChangeOrderWorkflow,
} from './qualityChangeAndHandoverService';
import type { DevelopmentProjectRepository } from './repository';
import type {
  CostCategory,
  CostClassification,
  DevelopmentDomainEvent,
  DevelopmentProjectRecord,
  DevelopmentProjectType,
  MaterialCategory,
  PermitStatus,
  ProjectChangeOrderRecord,
  ProjectCostEntryRecord,
  ProjectHandoverRecord,
  ProjectIssueRecord,
  ProjectParticipant,
  ProjectParticipantRole,
  ProjectPermitRecord,
  ProjectProcurementRequestRecord,
  ProjectQualityInspectionRecord,
  ProjectRiskRecord,
  ProjectTaskRecord,
  TaskStatus,
} from './types';
import {
  DevelopmentValidationError,
  sanitizeText,
  validateDateRange,
  validateIsoDateString,
  validateProjectType,
  validateSafeFirestoreId,
} from './validation';

export interface DevelopmentProjectServiceDependencies {
  repository: DevelopmentProjectRepository;
  propertyRegistryAdapter?: PropertyRegistryAssetAdapter;
  geographyAdapter?: GeographyReferenceAdapter;
  propertyServicesAdapter?: PropertyServicesProviderAdapter;
  mediaAdapter?: MediaStorageReferenceAdapter;
  notificationsAdapter?: NotificationsEventAdapter;
  safetyIncidentAdapter?: SafetyIncidentEscalationAdapter;
}

export class DevelopmentProjectService {
  constructor(private readonly deps: DevelopmentProjectServiceDependencies) {}

  public async createProject(input: {
    nameFa: string;
    projectType: DevelopmentProjectType;
    descriptionFa?: string;
    targetPropertyIds?: string[];
    cityId: string;
    hoodId?: number;
    streetText?: string;
    plannedStartDateIso: string;
    plannedCompletionDateIso: string;
    baselineBudgetMillionToman: number;
    priority?: 'low' | 'medium' | 'high' | 'critical';
  }, actorUserId: string): Promise<DevelopmentProjectRecord> {
    const ownerUserId = validateSafeFirestoreId(actorUserId, 'actorUserId');
    const validProjectType = validateProjectType(input.projectType);
    const nameFa = sanitizeText(input.nameFa, 200);
    if (nameFa.length < 3) {
      throw new DevelopmentValidationError('INVALID_PROJECT_NAME', 'Project name must be at least 3 characters.', 'nameFa');
    }

    const startIso = validateIsoDateString(input.plannedStartDateIso, 'plannedStartDateIso');
    const endIso = validateIsoDateString(input.plannedCompletionDateIso, 'plannedCompletionDateIso');
    validateDateRange(startIso, endIso, 'Project dates');

    if (typeof input.baselineBudgetMillionToman !== 'number' || input.baselineBudgetMillionToman <= 0) {
      throw new DevelopmentValidationError('INVALID_BUDGET', 'Baseline budget must be positive.', 'baselineBudgetMillionToman');
    }

    const projectId = `prj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const initialParticipant: ProjectParticipant = {
      participantId: `part_${ownerUserId}_1`,
      userId: ownerUserId,
      role: 'developer',
      isOwnerOrDeveloper: true,
      assignedByUserId: ownerUserId,
      assignedAtIso: now,
      isActive: true,
      canManageTasks: true,
      canApproveBudgets: true,
      canSubmitChangeOrders: true,
      canConductInspections: true,
    };

    const projectRecord: DevelopmentProjectRecord = {
      projectId,
      nameFa,
      projectType: validProjectType,
      descriptionFa: sanitizeText(input.descriptionFa, 1000) || undefined,
      ownerUserId,
      targetPropertyIds: input.targetPropertyIds || [],
      cityId: input.cityId,
      hoodId: input.hoodId,
      streetText: sanitizeText(input.streetText, 200) || undefined,
      plannedStartDateIso: startIso,
      plannedCompletionDateIso: endIso,
      status: 'planning',
      priority: input.priority || 'medium',
      participants: [initialParticipant],
      baselineBudgetMillionToman: Math.round(input.baselineBudgetMillionToman * 100) / 100,
      currency: 'IRT',
      totalPhysicalProgressPercent: 0,
      revision: 1,
      createdAtIso: now,
      updatedAtIso: now,
    };

    await this.deps.repository.saveProject(projectRecord);

    const defaultPhases = generateDefaultPhases(
      projectId,
      validProjectType,
      startIso,
      endIso,
      projectRecord.baselineBudgetMillionToman,
    );
    for (const ph of defaultPhases) {
      await this.deps.repository.savePhase(ph);
    }

    await this.deps.repository.saveScheduleVersion({
      scheduleId: `sch_${Date.now()}_1`,
      projectId,
      version: 1,
      isBaseline: true,
      plannedStartDateIso: startIso,
      plannedCompletionDateIso: endIso,
      createdByUser: ownerUserId,
      createdAtIso: now,
    });

    await this.emitEvent('project.created', projectId, 'project', ownerUserId, { nameFa, projectType: validProjectType });
    return projectRecord;
  }

  public async addParticipant(input: {
    projectId: string;
    userId: string;
    role: ProjectParticipantRole;
    canManageTasks?: boolean;
    canApproveBudgets?: boolean;
    canSubmitChangeOrders?: boolean;
    canConductInspections?: boolean;
  }, actorUserId: string): Promise<DevelopmentProjectRecord> {
    const project = await this.deps.repository.getProjectById(input.projectId);
    if (!project) throw new DevelopmentValidationError('PROJECT_NOT_FOUND', 'Project not found.');

    const caller = project.participants.find((p) => p.userId === actorUserId && p.isActive);
    if (!caller || !caller.isOwnerOrDeveloper) {
      throw new DevelopmentValidationError('UNAUTHORIZED_PARTICIPANT_ASSIGNMENT', 'Only the project owner or developer can assign participants.');
    }

    const participant: ProjectParticipant = {
      participantId: `part_${input.userId}_${Date.now()}`,
      userId: input.userId,
      role: input.role,
      isOwnerOrDeveloper: input.role === 'developer' || input.role === 'project_owner',
      assignedByUserId: actorUserId,
      assignedAtIso: new Date().toISOString(),
      isActive: true,
      canManageTasks: Boolean(input.canManageTasks),
      canApproveBudgets: Boolean(input.canApproveBudgets),
      canSubmitChangeOrders: Boolean(input.canSubmitChangeOrders),
      canConductInspections: Boolean(input.canConductInspections),
    };

    project.participants.push(participant);
    await this.deps.repository.saveProject(project);

    await this.emitEvent('project.participant_assigned', project.projectId, 'project', actorUserId, {
      assignedUserId: input.userId,
      role: input.role,
    });

    return project;
  }

  public async createTask(input: {
    projectId: string;
    phaseId: string;
    nameFa: string;
    descriptionFa?: string;
    assignedUserIds?: string[];
    contractorProviderId?: string;
    plannedStartDateIso: string;
    plannedCompletionDateIso: string;
    dependsOnTaskIds?: string[];
    estimatedEffortHours?: number;
    priority?: 'low' | 'medium' | 'high' | 'critical';
  }, actorUserId: string): Promise<ProjectTaskRecord> {
    return createTaskWorkflow(
      { repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) },
      input,
      actorUserId,
    );
  }

  public async updateTaskStatus(taskId: string, newStatus: TaskStatus, progressPercent: number | undefined, actorUserId: string): Promise<ProjectTaskRecord> {
    return updateTaskStatusWorkflow(
      { repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) },
      taskId,
      newStatus,
      progressPercent,
      actorUserId,
    );
  }

  public async updateTaskDependencies(taskId: string, newDependsOnTaskIds: string[], actorUserId: string): Promise<ProjectTaskRecord> {
    return updateTaskDependenciesWorkflow(
      { repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) },
      taskId,
      newDependsOnTaskIds,
      actorUserId,
    );
  }

  public async recordCost(input: {
    projectId: string;
    phaseId?: string;
    taskId?: string;
    category: CostCategory;
    classification: CostClassification;
    amountMillionToman: number;
    currency: 'IRT';
    descriptionFa: string;
    providerId?: string;
    invoiceReferenceId?: string;
  }, actorUserId: string): Promise<ProjectCostEntryRecord> {
    return recordProjectCostWorkflow(
      { repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) },
      input,
      actorUserId,
    );
  }

  public async createProcurement(input: {
    projectId: string;
    phaseId?: string;
    taskId?: string;
    category: MaterialCategory;
    itemDescriptionFa: string;
    quantity: number;
    unitOfMeasure: ProjectProcurementRequestRecord['unitOfMeasure'];
    requiredByDateIso: string;
    supplierProviderId?: string;
  }, actorUserId: string): Promise<ProjectProcurementRequestRecord> {
    return createProcurementRequestWorkflow(
      { repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) },
      input,
      actorUserId,
    );
  }

  public async deliverProcurement(requestId: string, quantity: number, actorUserId: string): Promise<ProjectProcurementRequestRecord> {
    return recordProcurementDeliveryWorkflow(
      { repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) },
      requestId,
      quantity,
      actorUserId,
    );
  }

  public async recordPermit(input: {
    projectId: string;
    permitType: ProjectPermitRecord['permitType'];
    issuingAuthority: string;
    applicationReferenceNumber: string;
    submissionDateIso: string;
    status: PermitStatus;
    approvalDateIso?: string;
    isOfficialSourceVerified?: boolean;
  }, actorUserId: string): Promise<ProjectPermitRecord> {
    const permitRecordId = `pmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const record: ProjectPermitRecord = {
      permitRecordId,
      projectId: input.projectId,
      permitType: input.permitType,
      issuingAuthority: sanitizeText(input.issuingAuthority, 150),
      applicationReferenceNumber: sanitizeText(input.applicationReferenceNumber, 100),
      submissionDateIso: validateIsoDateString(input.submissionDateIso, 'submissionDateIso'),
      status: input.status,
      approvalDateIso: input.approvalDateIso ? validateIsoDateString(input.approvalDateIso, 'approvalDateIso') : undefined,
      isOfficialSourceVerified: Boolean(input.isOfficialSourceVerified),
      createdAtIso: now,
      updatedAtIso: now,
    };

    await this.deps.repository.savePermitRecord(record);
    await this.emitEvent('project.permit_updated', permitRecordId, 'project', actorUserId, {
      projectId: input.projectId,
      status: input.status,
    });
    return record;
  }

  public async inspectQuality(input: {
    projectId: string;
    phaseId?: string;
    taskId?: string;
    inspectionType: ProjectQualityInspectionRecord['inspectionType'];
    criteriaFa: string;
    passed: boolean;
    findingsFa: string;
    defects?: Array<{ descriptionFa: string; severity: 'minor' | 'moderate' | 'critical' }>;
  }, inspectorUserId: string): Promise<ProjectQualityInspectionRecord> {
    return createQualityInspectionWorkflow(
      { repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) },
      input,
      inspectorUserId,
    );
  }

  public async resolveDefect(inspectionId: string, defectId: string, evidenceMediaId: string | undefined, actorUserId: string): Promise<ProjectQualityInspectionRecord> {
    return resolveDefectWorkflow(
      { repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) },
      inspectionId,
      defectId,
      evidenceMediaId,
      actorUserId,
    );
  }

  public async submitChangeOrder(input: {
    projectId: string;
    titleFa: string;
    reasonFa: string;
    affectedPhaseIds?: string[];
    affectedTaskIds?: string[];
    costImpactMillionToman: number;
    scheduleImpactDays: number;
  }, actorUserId: string): Promise<ProjectChangeOrderRecord> {
    return submitChangeOrderWorkflow(
      { repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) },
      input,
      actorUserId,
    );
  }

  public async decideChangeOrder(changeOrderId: string, decision: 'approved' | 'rejected', actorUserId: string): Promise<ProjectChangeOrderRecord> {
    return decideChangeOrderWorkflow(
      { repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) },
      changeOrderId,
      decision,
      actorUserId,
    );
  }

  public async scheduleHandoverAndClose(input: {
    projectId: string;
    handoverDateIso: string;
    participants: Array<{ userId: string; role: string }>;
    acceptanceNotesFa?: string;
  }, actorUserId: string): Promise<ProjectHandoverRecord> {
    return scheduleProjectHandoverWorkflow(
      { repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) },
      input,
      actorUserId,
    );
  }

  public async getProjectSummaryMetrics(projectId: string): Promise<{
    projectId: string;
    totalTasks: number;
    completedTasks: number;
    blockedTasks: number;
    physicalProgressPercent: number;
    baselineBudgetMillionToman: number;
    totalConfirmedExpenditureMillionToman: number;
    openCriticalDefects: number;
  }> {
    const project = await this.deps.repository.getProjectById(projectId);
    if (!project) throw new DevelopmentValidationError('PROJECT_NOT_FOUND', 'Project not found.');

    const tasks = await this.deps.repository.listTasksByProject(projectId);
    const costs = await this.deps.repository.listCostEntriesByProject(projectId);
    const inspections = await this.deps.repository.listInspectionsByProject(projectId);

    const completed = tasks.filter((t) => t.status === 'completed').length;
    const blocked = tasks.filter((t) => t.status === 'blocked').length;
    const confirmedExpenditure = costs
      .filter((c) => c.classification === 'confirmed_expenditure')
      .reduce((sum, c) => sum + c.amountMillionToman, 0);

    const openCritical = inspections
      .flatMap((i) => i.defects)
      .filter((d) => !d.isCorrected && d.severity === 'critical').length;

    return {
      projectId,
      totalTasks: tasks.length,
      completedTasks: completed,
      blockedTasks: blocked,
      physicalProgressPercent: project.totalPhysicalProgressPercent,
      baselineBudgetMillionToman: project.baselineBudgetMillionToman,
      totalConfirmedExpenditureMillionToman: Math.round(confirmedExpenditure * 100) / 100,
      openCriticalDefects: openCritical,
    };
  }

  private async emitEvent(
    eventType: DevelopmentDomainEvent['eventType'],
    aggregateId: string,
    aggregateType: DevelopmentDomainEvent['aggregateType'],
    actorUserId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event: DevelopmentDomainEvent = {
      eventId: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eventType,
      aggregateId,
      aggregateType,
      actorUserId,
      payload,
      timestampIso: new Date().toISOString(),
    };
    await this.deps.repository.recordEvent(event);
    if (this.deps.notificationsAdapter) {
      await this.deps.notificationsAdapter.dispatchProjectEvent(event);
    }
  }
}
