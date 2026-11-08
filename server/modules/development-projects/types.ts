/**
 * Real Estate Development & Construction Project Management Domain Types
 * (`server/modules/development-projects/types.ts`)
 * Exclusive ownership: `server/modules/development-projects/`
 */

export type DevelopmentProjectType =
  | 'new_construction'
  | 'residential_development'
  | 'commercial_development'
  | 'office_development'
  | 'mixed_use_development'
  | 'land_development'
  | 'renovation'
  | 'reconstruction'
  | 'infrastructure_work'
  | 'multi_building_development';

export type ProjectLifecycleStatus =
  | 'planning'
  | 'design_review'
  | 'permitting'
  | 'tender_contracting'
  | 'active_construction'
  | 'inspection_testing'
  | 'handover_pending'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

export type ProjectParticipantRole =
  | 'developer'
  | 'project_owner'
  | 'project_manager'
  | 'site_manager'
  | 'architect'
  | 'structural_engineer'
  | 'civil_engineer'
  | 'consultant'
  | 'general_contractor'
  | 'subcontractor'
  | 'procurement_manager'
  | 'quality_inspector'
  | 'safety_supervisor'
  | 'financial_controller'
  | 'authorized_reviewer';

export type PhaseStatus = 'not_started' | 'in_progress' | 'completed' | 'on_hold' | 'skipped';

export type TaskStatus =
  | 'draft'
  | 'ready'
  | 'assigned'
  | 'in_progress'
  | 'blocked'
  | 'under_review'
  | 'completed'
  | 'cancelled';

export type CostCategory =
  | 'labor'
  | 'material'
  | 'equipment'
  | 'design_consulting'
  | 'permit_administrative'
  | 'contingency'
  | 'other';

export type CostClassification = 'planned_estimate' | 'forecast' | 'approved_commitment' | 'confirmed_expenditure';

export type MaterialCategory =
  | 'cement_concrete'
  | 'steel_reinforcement'
  | 'bricks_blocks'
  | 'stone_tile'
  | 'electrical_materials'
  | 'plumbing_materials'
  | 'insulation'
  | 'flooring_finishing'
  | 'doors_windows'
  | 'construction_machinery'
  | 'scaffolding'
  | 'safety_equipment';

export type ProcurementStatus =
  | 'requested'
  | 'approved'
  | 'ordered'
  | 'partially_delivered'
  | 'delivered'
  | 'rejected'
  | 'cancelled';

export type PermitStatus =
  | 'preparation'
  | 'submitted'
  | 'under_review'
  | 'correction_required'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'withdrawn';

export type ChangeOrderStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'implemented';

export type HandoverStatus =
  | 'preparation'
  | 'awaiting_inspection'
  | 'defects_outstanding'
  | 'awaiting_handover'
  | 'handover_proposed'
  | 'handover_accepted'
  | 'closed';

export interface ProjectParticipant {
  participantId: string;
  userId: string;
  role: ProjectParticipantRole;
  isOwnerOrDeveloper: boolean;
  assignedByUserId: string;
  assignedAtIso: string;
  isActive: boolean;
  canManageTasks: boolean;
  canApproveBudgets: boolean;
  canSubmitChangeOrders: boolean;
  canConductInspections: boolean;
}

export interface DevelopmentProjectRecord {
  projectId: string;
  nameFa: string;
  projectType: DevelopmentProjectType;
  descriptionFa?: string;
  ownerUserId: string;
  developerOrgId?: string;
  projectManagerUserId?: string;
  targetPropertyIds?: string[];
  cityId: string;
  hoodId?: number;
  streetText?: string;
  plannedStartDateIso: string;
  plannedCompletionDateIso: string;
  actualStartDateIso?: string;
  actualCompletionDateIso?: string;
  status: ProjectLifecycleStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  participants: ProjectParticipant[];
  baselineBudgetMillionToman: number;
  currency: 'IRT';
  totalPhysicalProgressPercent: number;
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
  closedAtIso?: string;
}

export interface ProjectPhaseRecord {
  phaseId: string;
  projectId: string;
  phaseKey: string;
  titleFa: string;
  sequenceOrder: number;
  status: PhaseStatus;
  plannedStartDateIso: string;
  plannedEndDateIso: string;
  actualStartDateIso?: string;
  actualEndDateIso?: string;
  dependsOnPhaseIds?: string[];
  allocatedBudgetMillionToman: number;
  progressPercent: number;
}

export interface ProjectTaskRecord {
  taskId: string;
  projectId: string;
  phaseId: string;
  nameFa: string;
  descriptionFa?: string;
  assignedUserIds: string[];
  contractorProviderId?: string;
  plannedStartDateIso: string;
  plannedCompletionDateIso: string;
  actualStartDateIso?: string;
  actualCompletionDateIso?: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dependsOnTaskIds: string[];
  estimatedEffortHours: number;
  progressPercent: number;
  blockingReason?: string;
  evidenceMediaIds?: string[];
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ProjectScheduleVersionRecord {
  scheduleId: string;
  projectId: string;
  version: number;
  isBaseline: boolean;
  plannedStartDateIso: string;
  plannedCompletionDateIso: string;
  revisionReason?: string;
  createdByUser: string;
  createdAtIso: string;
}

export interface ProjectCostEntryRecord {
  costEntryId: string;
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
  recordedByUserId: string;
  recordedAtIso: string;
}

export interface ProjectProcurementRequestRecord {
  requestId: string;
  projectId: string;
  phaseId?: string;
  taskId?: string;
  category: MaterialCategory;
  itemDescriptionFa: string;
  quantity: number;
  unitOfMeasure: 'ton' | 'kg' | 'bag' | 'square_meter' | 'linear_meter' | 'cubic_meter' | 'unit' | 'set';
  requiredByDateIso: string;
  requestingUserId: string;
  status: ProcurementStatus;
  supplierProviderId?: string;
  deliveredQuantity: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ProjectPermitRecord {
  permitRecordId: string;
  projectId: string;
  permitType: 'building_permit' | 'renovation_permit' | 'demolition_permit' | 'utility_connection' | 'occupancy_certificate';
  issuingAuthority: string;
  applicationReferenceNumber: string;
  submissionDateIso: string;
  status: PermitStatus;
  approvalDateIso?: string;
  expirationDateIso?: string;
  conditionsFa?: string;
  isOfficialSourceVerified: boolean;
  evidenceMediaId?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ProjectQualityInspectionRecord {
  inspectionId: string;
  projectId: string;
  phaseId?: string;
  taskId?: string;
  inspectionType: 'foundation' | 'structural' | 'concrete' | 'electrical' | 'plumbing' | 'waterproofing' | 'facade' | 'finishing' | 'final';
  inspectorUserId: string;
  inspectionDateIso: string;
  criteriaFa: string;
  passed: boolean;
  findingsFa: string;
  defects: Array<{
    defectId: string;
    descriptionFa: string;
    severity: 'minor' | 'moderate' | 'critical';
    isCorrected: boolean;
    correctionEvidenceMediaId?: string;
    correctedByUserId?: string;
    correctedAtIso?: string;
  }>;
  createdAtIso: string;
}

export interface ProjectChangeOrderRecord {
  changeOrderId: string;
  projectId: string;
  requestingUserId: string;
  titleFa: string;
  reasonFa: string;
  affectedPhaseIds: string[];
  affectedTaskIds: string[];
  costImpactMillionToman: number;
  scheduleImpactDays: number;
  status: ChangeOrderStatus;
  decidedByUserId?: string;
  decidedAtIso?: string;
  createdAtIso: string;
}

export interface ProjectRiskRecord {
  riskId: string;
  projectId: string;
  category: 'technical' | 'financial' | 'regulatory' | 'procurement' | 'environmental' | 'safety';
  descriptionFa: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigationPlanFa: string;
  ownerUserId: string;
  status: 'identified' | 'mitigating' | 'closed' | 'occurred';
  createdAtIso: string;
}

export interface ProjectIssueRecord {
  issueId: string;
  projectId: string;
  taskId?: string;
  descriptionFa: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  responsibleUserId: string;
  resolutionPlanFa?: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  createdAtIso: string;
  resolvedAtIso?: string;
}

export interface ProjectHandoverRecord {
  handoverId: string;
  projectId: string;
  handoverDateIso: string;
  handoverParticipants: Array<{ userId: string; role: string }>;
  status: HandoverStatus;
  finalChecklistCompleted: boolean;
  openDefectsCount: number;
  evidenceMediaIds: string[];
  acceptanceNotesFa?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface DevelopmentDomainEvent {
  eventId: string;
  eventType:
    | 'project.created'
    | 'project.participant_assigned'
    | 'project.phase_started'
    | 'project.task_assigned'
    | 'project.task_blocked'
    | 'project.task_completed'
    | 'project.schedule_revised'
    | 'project.cost_recorded'
    | 'project.procurement_requested'
    | 'project.procurement_delivered'
    | 'project.permit_updated'
    | 'project.inspection_completed'
    | 'project.defect_reported'
    | 'project.defect_resolved'
    | 'project.change_order_submitted'
    | 'project.change_order_approved'
    | 'project.handover_scheduled'
    | 'project.closed';
  aggregateId: string;
  aggregateType: 'project' | 'task' | 'procurement' | 'change_order' | 'inspection' | 'handover';
  actorUserId: string;
  payload: Record<string, unknown>;
  timestampIso: string;
}
