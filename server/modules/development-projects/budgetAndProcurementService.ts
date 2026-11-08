/**
 * Real Estate Development Budget & Procurement Sub-Service
 * (`server/modules/development-projects/budgetAndProcurementService.ts`)
 * Exclusive ownership: `server/modules/development-projects/`
 */

import type { DevelopmentProjectRepository } from './repository';
import type {
  CostCategory,
  CostClassification,
  DevelopmentDomainEvent,
  MaterialCategory,
  ProjectCostEntryRecord,
  ProjectProcurementRequestRecord,
} from './types';
import {
  DevelopmentValidationError,
  sanitizeText,
  validateCostEntry,
  validateIsoDateString,
  validateSafeFirestoreId,
} from './validation';

export interface BudgetAndProcurementContext {
  repository: DevelopmentProjectRepository;
  emitEvent: (
    eventType: DevelopmentDomainEvent['eventType'],
    aggregateId: string,
    aggregateType: DevelopmentDomainEvent['aggregateType'],
    actorUserId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
}

export async function recordProjectCostWorkflow(
  ctx: BudgetAndProcurementContext,
  input: {
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
  },
  actorUserId: string,
): Promise<ProjectCostEntryRecord> {
  const projectId = validateSafeFirestoreId(input.projectId, 'projectId');
  const validated = validateCostEntry({
    amountMillionToman: input.amountMillionToman,
    currency: input.currency,
    category: input.category,
    classification: input.classification,
    descriptionFa: input.descriptionFa,
  });

  const costEntryId = `cost_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const entry: ProjectCostEntryRecord = {
    costEntryId,
    projectId,
    phaseId: input.phaseId,
    taskId: input.taskId,
    category: validated.category,
    classification: validated.classification,
    amountMillionToman: validated.amountMillionToman,
    currency: 'IRT',
    descriptionFa: validated.descriptionFa,
    providerId: input.providerId,
    invoiceReferenceId: input.invoiceReferenceId,
    recordedByUserId: actorUserId,
    recordedAtIso: now,
  };

  await ctx.repository.saveCostEntry(entry);
  await ctx.emitEvent('project.cost_recorded', costEntryId, 'project', actorUserId, {
    projectId,
    amountMillionToman: validated.amountMillionToman,
    classification: validated.classification,
  });

  return entry;
}

export async function createProcurementRequestWorkflow(
  ctx: BudgetAndProcurementContext,
  input: {
    projectId: string;
    phaseId?: string;
    taskId?: string;
    category: MaterialCategory;
    itemDescriptionFa: string;
    quantity: number;
    unitOfMeasure: ProjectProcurementRequestRecord['unitOfMeasure'];
    requiredByDateIso: string;
    supplierProviderId?: string;
  },
  actorUserId: string,
): Promise<ProjectProcurementRequestRecord> {
  const projectId = validateSafeFirestoreId(input.projectId, 'projectId');
  if (typeof input.quantity !== 'number' || input.quantity <= 0) {
    throw new DevelopmentValidationError('INVALID_PROCUREMENT_QUANTITY', 'Procurement quantity must be positive.', 'quantity');
  }

  const cleanDesc = sanitizeText(input.itemDescriptionFa, 300);
  if (cleanDesc.length < 2) {
    throw new DevelopmentValidationError('INVALID_ITEM_DESCRIPTION', 'Item description must be at least 2 characters.', 'itemDescriptionFa');
  }

  const requiredDate = validateIsoDateString(input.requiredByDateIso, 'requiredByDateIso');
  const requestId = `proc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const record: ProjectProcurementRequestRecord = {
    requestId,
    projectId,
    phaseId: input.phaseId,
    taskId: input.taskId,
    category: input.category,
    itemDescriptionFa: cleanDesc,
    quantity: Math.round(input.quantity * 100) / 100,
    unitOfMeasure: input.unitOfMeasure,
    requiredByDateIso: requiredDate,
    requestingUserId: actorUserId,
    status: 'requested',
    supplierProviderId: input.supplierProviderId,
    deliveredQuantity: 0,
    createdAtIso: now,
    updatedAtIso: now,
  };

  await ctx.repository.saveProcurementRequest(record);
  await ctx.emitEvent('project.procurement_requested', requestId, 'procurement', actorUserId, {
    projectId,
    category: input.category,
    quantity: record.quantity,
  });

  return record;
}

export async function recordProcurementDeliveryWorkflow(
  ctx: BudgetAndProcurementContext,
  requestId: string,
  newDeliveredQuantity: number,
  actorUserId: string,
): Promise<ProjectProcurementRequestRecord> {
  const req = await ctx.repository.getProcurementRequestById(requestId);
  if (!req) throw new DevelopmentValidationError('PROCUREMENT_NOT_FOUND', `Procurement request ${requestId} not found.`);

  if (typeof newDeliveredQuantity !== 'number' || newDeliveredQuantity <= 0) {
    throw new DevelopmentValidationError('INVALID_DELIVERED_QUANTITY', 'Delivered quantity must be positive.');
  }

  const updatedDelivered = Math.round((req.deliveredQuantity + newDeliveredQuantity) * 100) / 100;
  req.deliveredQuantity = updatedDelivered;

  if (updatedDelivered >= req.quantity) {
    req.status = 'delivered';
  } else {
    req.status = 'partially_delivered';
  }

  req.updatedAtIso = new Date().toISOString();
  await ctx.repository.saveProcurementRequest(req);

  await ctx.emitEvent('project.procurement_delivered', req.requestId, 'procurement', actorUserId, {
    projectId: req.projectId,
    deliveredQuantity: newDeliveredQuantity,
    totalDelivered: req.deliveredQuantity,
    status: req.status,
  });

  return req;
}
