/**
 * Real Estate Development Projects Durable Repository Interface & Store
 * (`server/modules/development-projects/repository.ts`)
 * Exclusive ownership: `server/modules/development-projects/`
 */

import type {
  DevelopmentDomainEvent,
  DevelopmentProjectRecord,
  ProjectChangeOrderRecord,
  ProjectCostEntryRecord,
  ProjectHandoverRecord,
  ProjectIssueRecord,
  ProjectPermitRecord,
  ProjectPhaseRecord,
  ProjectProcurementRequestRecord,
  ProjectQualityInspectionRecord,
  ProjectRiskRecord,
  ProjectScheduleVersionRecord,
  ProjectTaskRecord,
} from './types';
import { DevelopmentValidationError } from './validation';

export interface DevelopmentProjectRepository {
  saveProject(project: DevelopmentProjectRecord, expectedRevision?: number): Promise<void>;
  getProjectById(projectId: string): Promise<DevelopmentProjectRecord | null>;
  listProjectsForUser(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ items: DevelopmentProjectRecord[]; nextCursor?: string }>;

  savePhase(phase: ProjectPhaseRecord): Promise<void>;
  getPhaseById(phaseId: string): Promise<ProjectPhaseRecord | null>;
  listPhasesByProject(projectId: string): Promise<ProjectPhaseRecord[]>;

  saveTask(task: ProjectTaskRecord): Promise<void>;
  getTaskById(taskId: string): Promise<ProjectTaskRecord | null>;
  listTasksByProject(projectId: string): Promise<ProjectTaskRecord[]>;

  saveScheduleVersion(version: ProjectScheduleVersionRecord): Promise<void>;
  listScheduleVersions(projectId: string): Promise<ProjectScheduleVersionRecord[]>;

  saveCostEntry(entry: ProjectCostEntryRecord): Promise<void>;
  listCostEntriesByProject(projectId: string): Promise<ProjectCostEntryRecord[]>;

  saveProcurementRequest(req: ProjectProcurementRequestRecord): Promise<void>;
  getProcurementRequestById(requestId: string): Promise<ProjectProcurementRequestRecord | null>;
  listProcurementRequestsByProject(projectId: string): Promise<ProjectProcurementRequestRecord[]>;

  savePermitRecord(permit: ProjectPermitRecord): Promise<void>;
  getPermitRecordById(permitRecordId: string): Promise<ProjectPermitRecord | null>;
  listPermitsByProject(projectId: string): Promise<ProjectPermitRecord[]>;

  saveInspection(inspection: ProjectQualityInspectionRecord): Promise<void>;
  getInspectionById(inspectionId: string): Promise<ProjectQualityInspectionRecord | null>;
  listInspectionsByProject(projectId: string): Promise<ProjectQualityInspectionRecord[]>;

  saveChangeOrder(order: ProjectChangeOrderRecord): Promise<void>;
  getChangeOrderById(changeOrderId: string): Promise<ProjectChangeOrderRecord | null>;
  listChangeOrdersByProject(projectId: string): Promise<ProjectChangeOrderRecord[]>;

  saveRisk(risk: ProjectRiskRecord): Promise<void>;
  listRisksByProject(projectId: string): Promise<ProjectRiskRecord[]>;

  saveIssue(issue: ProjectIssueRecord): Promise<void>;
  getIssueById(issueId: string): Promise<ProjectIssueRecord | null>;
  listIssuesByProject(projectId: string): Promise<ProjectIssueRecord[]>;

  saveHandover(handover: ProjectHandoverRecord): Promise<void>;
  getHandoverByProject(projectId: string): Promise<ProjectHandoverRecord | null>;

  recordEvent(event: DevelopmentDomainEvent): Promise<void>;
  listEvents(aggregateId: string): Promise<DevelopmentDomainEvent[]>;
}

export class InMemoryDevelopmentProjectRepository implements DevelopmentProjectRepository {
  private projects = new Map<string, DevelopmentProjectRecord>();
  private phases = new Map<string, ProjectPhaseRecord>();
  private tasks = new Map<string, ProjectTaskRecord>();
  private schedules: ProjectScheduleVersionRecord[] = [];
  private costs: ProjectCostEntryRecord[] = [];
  private procurements = new Map<string, ProjectProcurementRequestRecord>();
  private permits = new Map<string, ProjectPermitRecord>();
  private inspections = new Map<string, ProjectQualityInspectionRecord>();
  private changeOrders = new Map<string, ProjectChangeOrderRecord>();
  private risks: ProjectRiskRecord[] = [];
  private issues = new Map<string, ProjectIssueRecord>();
  private handovers = new Map<string, ProjectHandoverRecord>();
  private events: DevelopmentDomainEvent[] = [];

  public async saveProject(project: DevelopmentProjectRecord, expectedRevision?: number): Promise<void> {
    const current = this.projects.get(project.projectId);
    if (expectedRevision !== undefined && current) {
      if (current.revision !== expectedRevision) {
        throw new DevelopmentValidationError(
          'CONCURRENCY_CONFLICT',
          `Optimistic concurrency conflict on project ${project.projectId}: expected revision ${expectedRevision}, found ${current.revision}.`,
        );
      }
    }
    const nextRevision = (current ? current.revision : 0) + 1;
    const updated: DevelopmentProjectRecord = {
      ...JSON.parse(JSON.stringify(project)),
      revision: nextRevision,
      updatedAtIso: new Date().toISOString(),
    };
    this.projects.set(project.projectId, updated);
  }

  public async getProjectById(projectId: string): Promise<DevelopmentProjectRecord | null> {
    const item = this.projects.get(projectId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listProjectsForUser(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ items: DevelopmentProjectRecord[]; nextCursor?: string }> {
    const matching = Array.from(this.projects.values()).filter(
      (p) => p.ownerUserId === userId || p.participants.some((part) => part.userId === userId && part.isActive),
    );
    matching.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));

    const startIndex = cursor ? matching.findIndex((p) => p.projectId === cursor) + 1 : 0;
    const safeStart = Math.max(0, startIndex);
    const slice = matching.slice(safeStart, safeStart + limit);
    const nextCursor = safeStart + limit < matching.length ? slice[slice.length - 1]?.projectId : undefined;

    return { items: JSON.parse(JSON.stringify(slice)), nextCursor };
  }

  public async savePhase(phase: ProjectPhaseRecord): Promise<void> {
    this.phases.set(phase.phaseId, JSON.parse(JSON.stringify(phase)));
  }

  public async getPhaseById(phaseId: string): Promise<ProjectPhaseRecord | null> {
    const item = this.phases.get(phaseId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listPhasesByProject(projectId: string): Promise<ProjectPhaseRecord[]> {
    return Array.from(this.phases.values())
      .filter((p) => p.projectId === projectId)
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async saveTask(task: ProjectTaskRecord): Promise<void> {
    this.tasks.set(task.taskId, JSON.parse(JSON.stringify(task)));
  }

  public async getTaskById(taskId: string): Promise<ProjectTaskRecord | null> {
    const item = this.tasks.get(taskId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listTasksByProject(projectId: string): Promise<ProjectTaskRecord[]> {
    return Array.from(this.tasks.values())
      .filter((t) => t.projectId === projectId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async saveScheduleVersion(version: ProjectScheduleVersionRecord): Promise<void> {
    this.schedules.push(JSON.parse(JSON.stringify(version)));
  }

  public async listScheduleVersions(projectId: string): Promise<ProjectScheduleVersionRecord[]> {
    return this.schedules
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => a.version - b.version)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async saveCostEntry(entry: ProjectCostEntryRecord): Promise<void> {
    this.costs.push(JSON.parse(JSON.stringify(entry)));
  }

  public async listCostEntriesByProject(projectId: string): Promise<ProjectCostEntryRecord[]> {
    return this.costs
      .filter((c) => c.projectId === projectId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async saveProcurementRequest(req: ProjectProcurementRequestRecord): Promise<void> {
    this.procurements.set(req.requestId, JSON.parse(JSON.stringify(req)));
  }

  public async getProcurementRequestById(requestId: string): Promise<ProjectProcurementRequestRecord | null> {
    const item = this.procurements.get(requestId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listProcurementRequestsByProject(projectId: string): Promise<ProjectProcurementRequestRecord[]> {
    return Array.from(this.procurements.values())
      .filter((p) => p.projectId === projectId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async savePermitRecord(permit: ProjectPermitRecord): Promise<void> {
    this.permits.set(permit.permitRecordId, JSON.parse(JSON.stringify(permit)));
  }

  public async getPermitRecordById(permitRecordId: string): Promise<ProjectPermitRecord | null> {
    const item = this.permits.get(permitRecordId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listPermitsByProject(projectId: string): Promise<ProjectPermitRecord[]> {
    return Array.from(this.permits.values())
      .filter((p) => p.projectId === projectId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async saveInspection(inspection: ProjectQualityInspectionRecord): Promise<void> {
    this.inspections.set(inspection.inspectionId, JSON.parse(JSON.stringify(inspection)));
  }

  public async getInspectionById(inspectionId: string): Promise<ProjectQualityInspectionRecord | null> {
    const item = this.inspections.get(inspectionId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listInspectionsByProject(projectId: string): Promise<ProjectQualityInspectionRecord[]> {
    return Array.from(this.inspections.values())
      .filter((i) => i.projectId === projectId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async saveChangeOrder(order: ProjectChangeOrderRecord): Promise<void> {
    this.changeOrders.set(order.changeOrderId, JSON.parse(JSON.stringify(order)));
  }

  public async getChangeOrderById(changeOrderId: string): Promise<ProjectChangeOrderRecord | null> {
    const item = this.changeOrders.get(changeOrderId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listChangeOrdersByProject(projectId: string): Promise<ProjectChangeOrderRecord[]> {
    return Array.from(this.changeOrders.values())
      .filter((co) => co.projectId === projectId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async saveRisk(risk: ProjectRiskRecord): Promise<void> {
    this.risks.push(JSON.parse(JSON.stringify(risk)));
  }

  public async listRisksByProject(projectId: string): Promise<ProjectRiskRecord[]> {
    return this.risks
      .filter((r) => r.projectId === projectId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async saveIssue(issue: ProjectIssueRecord): Promise<void> {
    this.issues.set(issue.issueId, JSON.parse(JSON.stringify(issue)));
  }

  public async getIssueById(issueId: string): Promise<ProjectIssueRecord | null> {
    const item = this.issues.get(issueId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listIssuesByProject(projectId: string): Promise<ProjectIssueRecord[]> {
    return Array.from(this.issues.values())
      .filter((i) => i.projectId === projectId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async saveHandover(handover: ProjectHandoverRecord): Promise<void> {
    this.handovers.set(handover.projectId, JSON.parse(JSON.stringify(handover)));
  }

  public async getHandoverByProject(projectId: string): Promise<ProjectHandoverRecord | null> {
    const item = this.handovers.get(projectId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async recordEvent(event: DevelopmentDomainEvent): Promise<void> {
    this.events.push(JSON.parse(JSON.stringify(event)));
  }

  public async listEvents(aggregateId: string): Promise<DevelopmentDomainEvent[]> {
    return this.events
      .filter((e) => e.aggregateId === aggregateId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }
}
