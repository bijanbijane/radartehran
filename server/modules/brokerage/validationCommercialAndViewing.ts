import { CoreApiError } from '../core';
import {
  ALL_REPRESENTATION_TYPES,
  ALL_BROKERAGE_AGREEMENT_TYPES,
  ALL_COMMISSION_STRUCTURES,
  RepresentationType,
  RepresentationExclusivity,
  BrokerageAgreementType,
  BrokerageAgreementStatus,
  CommissionStructureType,
  CommissionAllocationShare,
  ViewingStatus,
  ReferralStatus,
} from './types';
import { ALL_TRANSACTION_CURRENCIES, TransactionCurrency } from '../transactions';
import {
  asPlainObject,
  reqStr,
  optStr,
  reqEnum,
  optEnum,
  reqInt,
  optInt,
  optStrArray,
  assertIsoTimestamp,
} from './validation';

export type CreatePropertyRepresentationInput = {
  brokerageId: string;
  responsibleAgentUid: string;
  representationType: RepresentationType;
  exclusivity: RepresentationExclusivity;
  propertyId?: string;
  listingId?: string;
  clientId: string;
  principalUserUid: string;
  contractReferenceId?: string;
  startDateIso: string;
  expirationDateIso: string;
};

export function validateCreateRepresentationInput(raw: unknown): CreatePropertyRepresentationInput {
  const obj = asPlainObject(raw);
  const startDateIso = reqStr(obj, 'startDateIso', 10, 64);
  const expirationDateIso = reqStr(obj, 'expirationDateIso', 10, 64);
  assertIsoTimestamp(startDateIso, 'startDateIso');
  assertIsoTimestamp(expirationDateIso, 'expirationDateIso');
  if (Date.parse(expirationDateIso) <= Date.parse(startDateIso)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'expirationDateIso must be after startDateIso.');
  }
  return {
    brokerageId: reqStr(obj, 'brokerageId', 3, 128),
    responsibleAgentUid: reqStr(obj, 'responsibleAgentUid', 2, 128),
    representationType: reqEnum(obj, 'representationType', ALL_REPRESENTATION_TYPES),
    exclusivity: reqEnum(obj, 'exclusivity', ['EXCLUSIVE', 'NON_EXCLUSIVE'] as const),
    propertyId: optStr(obj, 'propertyId', 2, 128),
    listingId: optStr(obj, 'listingId', 2, 128),
    clientId: reqStr(obj, 'clientId', 3, 128),
    principalUserUid: reqStr(obj, 'principalUserUid', 2, 128),
    contractReferenceId: optStr(obj, 'contractReferenceId', 3, 128),
    startDateIso,
    expirationDateIso,
  };
}

export type CreateListingAcquisitionInput = {
  brokerageId: string;
  propertyId: string;
  listingId?: string;
  representationId: string;
  assignedAgentUid: string;
  ownerAuthorizationReferenceId: string;
  documentationIds?: string[];
  expirationDateIso: string;
};

export function validateCreateAcquisitionInput(raw: unknown): CreateListingAcquisitionInput {
  const obj = asPlainObject(raw);
  return {
    brokerageId: reqStr(obj, 'brokerageId', 3, 128),
    propertyId: reqStr(obj, 'propertyId', 2, 128),
    listingId: optStr(obj, 'listingId', 2, 128),
    representationId: reqStr(obj, 'representationId', 3, 128),
    assignedAgentUid: reqStr(obj, 'assignedAgentUid', 2, 128),
    ownerAuthorizationReferenceId: reqStr(obj, 'ownerAuthorizationReferenceId', 3, 128),
    documentationIds: optStrArray(obj, 'documentationIds', 25),
    expirationDateIso: reqStr(obj, 'expirationDateIso', 10, 64),
  };
}

export type UpdateListingAcquisitionInput = {
  acquisitionId: string;
  status?: 'PENDING_APPROVAL' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  assignedAgentUid?: string;
  note?: string;
};

export function validateUpdateAcquisitionInput(raw: unknown): UpdateListingAcquisitionInput {
  const obj = asPlainObject(raw);
  return {
    acquisitionId: reqStr(obj, 'acquisitionId', 3, 128),
    status: optEnum(
      obj,
      'status',
      ['PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'EXPIRED'] as const,
    ),
    assignedAgentUid: optStr(obj, 'assignedAgentUid', 2, 128),
    note: optStr(obj, 'note', 2, 500),
  };
}

export type RegisterTransactionParticipationInput = {
  brokerageId: string;
  transactionId: string;
  representationId?: string;
  side: RepresentationType;
  assignedAgentUid: string;
  teamId?: string;
};

export function validateTransactionParticipationInput(raw: unknown): RegisterTransactionParticipationInput {
  const obj = asPlainObject(raw);
  return {
    brokerageId: reqStr(obj, 'brokerageId', 3, 128),
    transactionId: reqStr(obj, 'transactionId', 3, 128),
    representationId: optStr(obj, 'representationId', 3, 128),
    side: reqEnum(obj, 'side', ALL_REPRESENTATION_TYPES),
    assignedAgentUid: reqStr(obj, 'assignedAgentUid', 2, 128),
    teamId: optStr(obj, 'teamId', 3, 128),
  };
}

export type ReplaceTransactionAgentInput = {
  participationId: string;
  newAgentUid: string;
  reason: string;
};

export function validateReplaceTransactionAgentInput(raw: unknown): ReplaceTransactionAgentInput {
  const obj = asPlainObject(raw);
  return {
    participationId: reqStr(obj, 'participationId', 3, 128),
    newAgentUid: reqStr(obj, 'newAgentUid', 2, 128),
    reason: reqStr(obj, 'reason', 3, 400),
  };
}

export type CreateBrokerageAgreementInput = {
  brokerageId: string;
  clientId: string;
  agentUid: string;
  propertyId?: string;
  transactionId?: string;
  agreementType: BrokerageAgreementType;
  effectiveDateIso: string;
  expirationDateIso: string;
  serviceScope: string;
  commissionStructure: CommissionStructureType;
  commissionRateBasisPoints?: number;
  fixedCommissionAmount?: number;
  currency: TransactionCurrency;
  contractDocumentIds?: string[];
  executionDocumentIds?: string[];
  status?: BrokerageAgreementStatus;
};

export function validateCreateAgreementInput(raw: unknown): CreateBrokerageAgreementInput {
  const obj = asPlainObject(raw);
  return {
    brokerageId: reqStr(obj, 'brokerageId', 3, 128),
    clientId: reqStr(obj, 'clientId', 3, 128),
    agentUid: reqStr(obj, 'agentUid', 2, 128),
    propertyId: optStr(obj, 'propertyId', 2, 128),
    transactionId: optStr(obj, 'transactionId', 3, 128),
    agreementType: reqEnum(obj, 'agreementType', ALL_BROKERAGE_AGREEMENT_TYPES),
    effectiveDateIso: reqStr(obj, 'effectiveDateIso', 10, 64),
    expirationDateIso: reqStr(obj, 'expirationDateIso', 10, 64),
    serviceScope: reqStr(obj, 'serviceScope', 3, 1000),
    commissionStructure: reqEnum(obj, 'commissionStructure', ALL_COMMISSION_STRUCTURES),
    commissionRateBasisPoints: optInt(obj, 'commissionRateBasisPoints', 1, 10000),
    fixedCommissionAmount: optInt(obj, 'fixedCommissionAmount', 1),
    currency: reqEnum(obj, 'currency', ALL_TRANSACTION_CURRENCIES),
    contractDocumentIds: optStrArray(obj, 'contractDocumentIds', 20),
    executionDocumentIds: optStrArray(obj, 'executionDocumentIds', 20),
    status: optEnum(obj, 'status', ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTED'] as const),
  };
}

export type AmendBrokerageAgreementInput = {
  agreementId: string;
  serviceScope?: string;
  commissionRateBasisPoints?: number;
  fixedCommissionAmount?: number;
  executionDocumentIds?: string[];
  status?: BrokerageAgreementStatus;
  reason: string;
};

export function validateAmendAgreementInput(raw: unknown): AmendBrokerageAgreementInput {
  const obj = asPlainObject(raw);
  return {
    agreementId: reqStr(obj, 'agreementId', 3, 128),
    serviceScope: optStr(obj, 'serviceScope', 3, 1000),
    commissionRateBasisPoints: optInt(obj, 'commissionRateBasisPoints', 1, 10000),
    fixedCommissionAmount: optInt(obj, 'fixedCommissionAmount', 1),
    executionDocumentIds: optStrArray(obj, 'executionDocumentIds', 20),
    status: optEnum(
      obj,
      'status',
      ['PENDING_APPROVAL', 'APPROVED', 'EXECUTED', 'AMENDED', 'TERMINATED'] as const,
    ),
    reason: reqStr(obj, 'reason', 3, 500),
  };
}

export type CalculateAndAllocateCommissionInput = {
  brokerageId: string;
  transactionId: string;
  agreementId: string;
  payerUid: string;
  contractualBaseAmount: number;
  dueDateIso: string;
  allocations: CommissionAllocationShare[];
};

export function validateCommissionAllocationInput(raw: unknown): CalculateAndAllocateCommissionInput {
  const obj = asPlainObject(raw);
  if (!Array.isArray(obj.allocations) || obj.allocations.length === 0 || obj.allocations.length > 10) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'allocations must be a non-empty array of up to 10 items.');
  }
  return {
    brokerageId: reqStr(obj, 'brokerageId', 3, 128),
    transactionId: reqStr(obj, 'transactionId', 3, 128),
    agreementId: reqStr(obj, 'agreementId', 3, 128),
    payerUid: reqStr(obj, 'payerUid', 2, 128),
    contractualBaseAmount: reqInt(obj, 'contractualBaseAmount', 1),
    dueDateIso: reqStr(obj, 'dueDateIso', 10, 64),
    allocations: obj.allocations as CommissionAllocationShare[],
  };
}

export type CreateReferralInput = {
  referringBrokerageId: string;
  receivingBrokerageId: string;
  referringAgentUid: string;
  receivingAgentUid: string;
  leadId?: string;
  clientId?: string;
  referralTermsSummary: string;
  referralBasisPoints?: number;
  fixedReferralAmount?: number;
  currency: TransactionCurrency;
  expiresAtIso: string;
};

export function validateCreateReferralInput(raw: unknown): CreateReferralInput {
  const obj = asPlainObject(raw);
  return {
    referringBrokerageId: reqStr(obj, 'referringBrokerageId', 3, 128),
    receivingBrokerageId: reqStr(obj, 'receivingBrokerageId', 3, 128),
    referringAgentUid: reqStr(obj, 'referringAgentUid', 2, 128),
    receivingAgentUid: reqStr(obj, 'receivingAgentUid', 2, 128),
    leadId: optStr(obj, 'leadId', 3, 128),
    clientId: optStr(obj, 'clientId', 3, 128),
    referralTermsSummary: reqStr(obj, 'referralTermsSummary', 3, 500),
    referralBasisPoints: optInt(obj, 'referralBasisPoints', 1, 10000),
    fixedReferralAmount: optInt(obj, 'fixedReferralAmount', 1),
    currency: reqEnum(obj, 'currency', ALL_TRANSACTION_CURRENCIES),
    expiresAtIso: reqStr(obj, 'expiresAtIso', 10, 64),
  };
}

export type UpdateReferralStatusInput = {
  referralId: string;
  status: ReferralStatus;
  convertedTransactionId?: string;
  brokerageCommissionId?: string;
};

export function validateUpdateReferralStatusInput(raw: unknown): UpdateReferralStatusInput {
  const obj = asPlainObject(raw);
  return {
    referralId: reqStr(obj, 'referralId', 3, 128),
    status: reqEnum(obj, 'status', ['ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'] as const),
    convertedTransactionId: optStr(obj, 'convertedTransactionId', 3, 128),
    brokerageCommissionId: optStr(obj, 'brokerageCommissionId', 3, 128),
  };
}

export type RecordClientCommunicationInput = {
  brokerageId: string;
  clientId: string;
  leadId?: string;
  eventType: 'CONTACT_ATTEMPT' | 'SCHEDULED_MEETING' | 'VIEWING_APPOINTMENT' | 'NEGOTIATION' | 'FOLLOW_UP_OUTCOME' | 'INTERNAL_NOTE';
  visibility: 'CLIENT_VISIBLE' | 'INTERNAL_PRIVATE';
  summary: string;
};

export function validateRecordCommunicationInput(raw: unknown): RecordClientCommunicationInput {
  const obj = asPlainObject(raw);
  return {
    brokerageId: reqStr(obj, 'brokerageId', 3, 128),
    clientId: reqStr(obj, 'clientId', 3, 128),
    leadId: optStr(obj, 'leadId', 3, 128),
    eventType: reqEnum(obj, 'eventType', [
      'CONTACT_ATTEMPT', 'SCHEDULED_MEETING', 'VIEWING_APPOINTMENT',
      'NEGOTIATION', 'FOLLOW_UP_OUTCOME', 'INTERNAL_NOTE',
    ] as const),
    visibility: reqEnum(obj, 'visibility', ['CLIENT_VISIBLE', 'INTERNAL_PRIVATE'] as const),
    summary: reqStr(obj, 'summary', 2, 1500),
  };
}

export type ScheduleViewingInput = {
  brokerageId: string;
  propertyId: string;
  listingId?: string;
  clientId: string;
  assignedAgentUid: string;
  startTimeIso: string;
  endTimeIso: string;
};

export function validateScheduleViewingInput(raw: unknown): ScheduleViewingInput {
  const obj = asPlainObject(raw);
  const startTimeIso = reqStr(obj, 'startTimeIso', 10, 64);
  const endTimeIso = reqStr(obj, 'endTimeIso', 10, 64);
  if (Date.parse(endTimeIso) <= Date.parse(startTimeIso)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'endTimeIso must be after startTimeIso.');
  }
  return {
    brokerageId: reqStr(obj, 'brokerageId', 3, 128),
    propertyId: reqStr(obj, 'propertyId', 2, 128),
    listingId: optStr(obj, 'listingId', 2, 128),
    clientId: reqStr(obj, 'clientId', 3, 128),
    assignedAgentUid: reqStr(obj, 'assignedAgentUid', 2, 128),
    startTimeIso,
    endTimeIso,
  };
}

export type UpdateViewingInput = {
  viewingId: string;
  status: ViewingStatus;
  startTimeIso?: string;
  endTimeIso?: string;
  feedbackSummary?: string;
  clientInterestRating?: number;
};

export function validateUpdateViewingInput(raw: unknown): UpdateViewingInput {
  const obj = asPlainObject(raw);
  return {
    viewingId: reqStr(obj, 'viewingId', 3, 128),
    status: reqEnum(
      obj,
      'status',
      ['REQUESTED', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED'] as const,
    ),
    startTimeIso: optStr(obj, 'startTimeIso', 10, 64),
    endTimeIso: optStr(obj, 'endTimeIso', 10, 64),
    feedbackSummary: optStr(obj, 'feedbackSummary', 2, 1000),
    clientInterestRating: optInt(obj, 'clientInterestRating', 1, 5),
  };
}
