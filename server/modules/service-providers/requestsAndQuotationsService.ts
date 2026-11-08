/**
 * Service Providers Customer Requests & Quotations Sub-Service
 * (`server/modules/service-providers/requestsAndQuotationsService.ts`)
 * Exclusive ownership: `server/modules/service-providers/`
 */

import type { ServiceProviderRepository } from './repository';
import type {
  CustomerServiceRequest,
  PricingModel,
  ProviderCategory,
  ProviderDomainEvent,
  ProviderQuotationRecord,
} from './types';
import {
  ProviderValidationError,
  sanitizeText,
  validateIsoDateString,
  validatePricingModel,
  validateProviderCategory,
  validateSafeFirestoreId,
} from './validation';

export interface RequestsAndQuotationsContext {
  repository: ServiceProviderRepository;
  emitEvent: (
    eventType: ProviderDomainEvent['eventType'],
    aggregateId: string,
    aggregateType: ProviderDomainEvent['aggregateType'],
    actorUserId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
}

export async function createServiceRequestWorkflow(
  ctx: RequestsAndQuotationsContext,
  input: {
    category: ProviderCategory;
    desiredServiceId?: string;
    cityId: string;
    hoodId?: number;
    titleFa: string;
    descriptionFa: string;
    preferredTimeframeFa?: string;
    budgetCapMillionToman?: number;
    targetProviderIds?: string[];
  },
  requesterUserId: string,
): Promise<CustomerServiceRequest> {
  const category = validateProviderCategory(input.category);
  const titleFa = sanitizeText(input.titleFa, 200);
  const descriptionFa = sanitizeText(input.descriptionFa, 1500);

  if (titleFa.length < 3) throw new ProviderValidationError('INVALID_REQUEST_TITLE', 'Request title must be at least 3 characters.');
  if (descriptionFa.length < 10) throw new ProviderValidationError('INVALID_REQUEST_DESCRIPTION', 'Description must be at least 10 characters.');

  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const expiry = new Date(now.getTime() + 30 * 86400000);

  const request: CustomerServiceRequest = {
    requestId,
    requesterUserId,
    category,
    desiredServiceId: input.desiredServiceId,
    cityId: input.cityId,
    hoodId: input.hoodId,
    titleFa,
    descriptionFa,
    preferredTimeframeFa: sanitizeText(input.preferredTimeframeFa, 100) || undefined,
    budgetCapMillionToman: typeof input.budgetCapMillionToman === 'number' && input.budgetCapMillionToman > 0 ? input.budgetCapMillionToman : undefined,
    currency: 'IRT',
    status: 'open',
    targetProviderIds: input.targetProviderIds || [],
    createdAtIso: now.toISOString(),
    updatedAtIso: now.toISOString(),
    expiresAtIso: expiry.toISOString(),
  };

  await ctx.repository.saveServiceRequest(request);
  await ctx.emitEvent('provider.service_request.created', requestId, 'request', requesterUserId, {
    category,
    cityId: input.cityId,
  });

  return request;
}

export async function submitQuotationWorkflow(
  ctx: RequestsAndQuotationsContext,
  input: {
    requestId: string;
    providerId?: string;
    organizationId?: string;
    proposedPriceMillionToman: number;
    pricingModel: PricingModel;
    proposalDetailsFa: string;
    estimatedDurationDays?: number;
    validDays?: number;
  },
  submittingUserId: string,
): Promise<ProviderQuotationRecord> {
  const req = await ctx.repository.getServiceRequestById(input.requestId);
  if (!req) throw new ProviderValidationError('REQUEST_NOT_FOUND', 'Service request not found.');
  if (req.status !== 'open' && req.status !== 'responses_pending' && req.status !== 'responses_received') {
    throw new ProviderValidationError('REQUEST_CLOSED_TO_QUOTATIONS', `Service request is ${req.status} and cannot accept quotations.`);
  }

  if (typeof input.proposedPriceMillionToman !== 'number' || input.proposedPriceMillionToman <= 0) {
    throw new ProviderValidationError('INVALID_PRICE', 'Proposed price must be positive.');
  }

  const model = validatePricingModel(input.pricingModel);
  const details = sanitizeText(input.proposalDetailsFa, 1000);
  if (details.length < 5) throw new ProviderValidationError('INVALID_PROPOSAL_DETAILS', 'Proposal details must be at least 5 characters.');

  const quotationId = `quo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const validUntil = new Date(now.getTime() + (input.validDays || 14) * 86400000);

  const quotation: ProviderQuotationRecord = {
    quotationId,
    requestId: req.requestId,
    providerId: input.providerId,
    organizationId: input.organizationId,
    submittingUserId,
    version: 1,
    proposedPriceMillionToman: Math.round(input.proposedPriceMillionToman * 100) / 100,
    currency: 'IRT',
    pricingModel: model,
    proposalDetailsFa: details,
    estimatedDurationDays: typeof input.estimatedDurationDays === 'number' && input.estimatedDurationDays > 0 ? Math.floor(input.estimatedDurationDays) : undefined,
    status: 'submitted',
    validUntilDateIso: validUntil.toISOString(),
    submittedAtIso: now.toISOString(),
    updatedAtIso: now.toISOString(),
  };

  await ctx.repository.saveQuotation(quotation);

  req.status = 'responses_received';
  req.updatedAtIso = now.toISOString();
  await ctx.repository.saveServiceRequest(req);

  await ctx.emitEvent('provider.quotation.submitted', quotationId, 'quotation', submittingUserId, {
    requestId: req.requestId,
    price: quotation.proposedPriceMillionToman,
    version: 1,
  });

  return quotation;
}

export async function updateQuotationWorkflow(
  ctx: RequestsAndQuotationsContext,
  parentQuotationId: string,
  newPriceMillionToman: number,
  newDetailsFa: string,
  actorUserId: string,
): Promise<ProviderQuotationRecord> {
  const parent = await ctx.repository.getQuotationById(parentQuotationId);
  if (!parent) throw new ProviderValidationError('QUOTATION_NOT_FOUND', 'Quotation not found.');
  if (parent.submittingUserId !== actorUserId) {
    throw new ProviderValidationError('UNAUTHORIZED_QUOTATION_UPDATE', 'Only the submitting professional can update this quotation.');
  }
  if (parent.status !== 'submitted') {
    throw new ProviderValidationError('CANNOT_UPDATE_QUOTATION', `Quotation is '${parent.status}' and cannot be revised.`);
  }

  // Mark parent as updated
  parent.status = 'updated';
  await ctx.repository.saveQuotation(parent);

  const now = new Date();
  const quotationId = `quo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const validUntil = new Date(now.getTime() + 14 * 86400000);

  const newQuotation: ProviderQuotationRecord = {
    ...parent,
    quotationId,
    version: parent.version + 1,
    proposedPriceMillionToman: Math.round(newPriceMillionToman * 100) / 100,
    proposalDetailsFa: sanitizeText(newDetailsFa, 1000),
    status: 'submitted',
    validUntilDateIso: validUntil.toISOString(),
    submittedAtIso: now.toISOString(),
    updatedAtIso: now.toISOString(),
  };

  await ctx.repository.saveQuotation(newQuotation);
  await ctx.emitEvent('provider.quotation.submitted', quotationId, 'quotation', actorUserId, {
    requestId: parent.requestId,
    version: newQuotation.version,
  });

  return newQuotation;
}

export async function selectProviderWorkflow(
  ctx: RequestsAndQuotationsContext,
  requestId: string,
  selectedProviderId: string,
  selectedQuotationId: string | undefined,
  requesterUserId: string,
): Promise<CustomerServiceRequest> {
  const req = await ctx.repository.getServiceRequestById(requestId);
  if (!req) throw new ProviderValidationError('REQUEST_NOT_FOUND', 'Service request not found.');
  if (req.requesterUserId !== requesterUserId) {
    throw new ProviderValidationError('UNAUTHORIZED_REQUEST_ACTION', 'Only the customer who created the request can select a provider.');
  }

  req.selectedProviderId = selectedProviderId;
  req.selectedQuotationId = selectedQuotationId;
  req.status = 'provider_selected';
  req.updatedAtIso = new Date().toISOString();

  await ctx.repository.saveServiceRequest(req);
  await ctx.emitEvent('provider.selection.recorded', req.requestId, 'request', requesterUserId, {
    selectedProviderId,
    selectedQuotationId,
  });

  return req;
}
