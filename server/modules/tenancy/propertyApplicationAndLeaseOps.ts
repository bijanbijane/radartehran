import { randomUUID } from 'node:crypto';
import { CoreApiError, type TransactionContextLike } from '../core';
import {
  executeGenerateRentalSchedule,
  type FinancialObligationRecord,
  type StoredTransactionDocument,
} from '../transactions';
import type {
  LeaseAgreementRecord,
  PropertyTenancyIndexRecord,
  RentalApplicationRecord,
  RentalAvailabilityStatus,
  RentalPropertyConfigRecord,
  TenancyDepositRecord,
  TenancyHistoryEventRecord,
  TenantScreeningReferenceRecord,
} from './types';
import type {
  CreateLeaseAgreementInput,
  CreateRentalApplicationInput,
  DecideRentalApplicationInput,
  LeaseWorkflowActionInput,
  RecordTenantScreeningInput,
  UpsertRentalPropertyConfigInput,
} from './validation';

export const ALLOWED_PROPERTY_AVAILABILITY_TRANSITIONS: Readonly<
  Record<RentalAvailabilityStatus, readonly RentalAvailabilityStatus[]>
> = {
  AVAILABLE: ['APPLICATIONS_OPEN', 'RESERVED', 'RENTED', 'MAINTENANCE', 'UNAVAILABLE'],
  APPLICATIONS_OPEN: ['AVAILABLE', 'RESERVED', 'RENTED', 'MAINTENANCE', 'UNAVAILABLE'],
  RESERVED: ['AVAILABLE', 'APPLICATIONS_OPEN', 'RENTED', 'UNAVAILABLE'],
  RENTED: ['AVAILABLE', 'MAINTENANCE', 'UNAVAILABLE'],
  MAINTENANCE: ['AVAILABLE', 'APPLICATIONS_OPEN', 'UNAVAILABLE'],
  UNAVAILABLE: ['AVAILABLE', 'APPLICATIONS_OPEN', 'MAINTENANCE'],
};

export async function loadOrInitPropertyTenancyIndex(
  tx: TransactionContextLike,
  propertyId: string,
  nowIso: string,
): Promise<PropertyTenancyIndexRecord> {
  const snap = await tx.get<PropertyTenancyIndexRecord>(`tenancyPropertyMeta/${propertyId}`);
  if (snap.exists && snap.data) {
    return {
      ...snap.data,
      applicationIds: [...snap.data.applicationIds],
      screeningIds: [...snap.data.screeningIds],
      leaseIds: [...snap.data.leaseIds],
      depositIds: [...snap.data.depositIds],
      renewalIds: [...snap.data.renewalIds],
      adjustmentIds: [...snap.data.adjustmentIds],
      amendmentIds: [...snap.data.amendmentIds],
      maintenanceIds: [...snap.data.maintenanceIds],
      inspectionIds: [...snap.data.inspectionIds],
      terminationIds: [...snap.data.terminationIds],
      handoverIds: [...snap.data.handoverIds],
      historyEventIds: [...snap.data.historyEventIds],
    };
  }
  return {
    propertyId,
    applicationIds: [],
    screeningIds: [],
    leaseIds: [],
    depositIds: [],
    renewalIds: [],
    adjustmentIds: [],
    amendmentIds: [],
    maintenanceIds: [],
    inspectionIds: [],
    terminationIds: [],
    handoverIds: [],
    historyEventIds: [],
    historySequence: 0,
    updatedAtIso: nowIso,
  };
}

export function appendTenancyHistoryEvent(
  tx: TransactionContextLike,
  pIndex: PropertyTenancyIndexRecord,
  params: {
    leaseId?: string;
    eventType: string;
    actorUid: string;
    summary: string;
    metadata: Record<string, string | number | boolean>;
    nowIso: string;
  },
): TenancyHistoryEventRecord {
  pIndex.historySequence += 1;
  const eventId = `the_${pIndex.propertyId}_${pIndex.historySequence}_${randomUUID().slice(0, 6)}`;
  const record: TenancyHistoryEventRecord = {
    eventId,
    propertyId: pIndex.propertyId,
    ...(params.leaseId ? { leaseId: params.leaseId } : {}),
    sequenceNumber: pIndex.historySequence,
    eventType: params.eventType,
    actorUid: params.actorUid,
    summary: params.summary,
    metadata: params.metadata,
    timestampIso: params.nowIso,
  };
  tx.set(`tenancyHistory/${eventId}`, record);
  pIndex.historyEventIds.push(eventId);
  pIndex.updatedAtIso = params.nowIso;
  return record;
}

export function savePropertyTenancyIndex(
  tx: TransactionContextLike,
  pIndex: PropertyTenancyIndexRecord,
): void {
  tx.set(`tenancyPropertyMeta/${pIndex.propertyId}`, pIndex);
}

export function assertLandlordOrManagerAccess(
  propConfig: RentalPropertyConfigRecord,
  actorUid: string,
  isAdmin: boolean,
  allowBroker = false,
): void {
  if (isAdmin) return;
  if (propConfig.landlordUid === actorUid || propConfig.propertyManagerUid === actorUid) return;
  if (allowBroker && propConfig.brokerUid === actorUid) return;
  throw new CoreApiError(
    'FORBIDDEN',
    403,
    'Access denied: principal is not the authorized landlord or property manager for this property.',
  );
}

export async function executeUpsertRentalPropertyConfig(params: {
  tx: TransactionContextLike;
  propertyId: string;
  actorUid: string;
  isAdmin: boolean;
  input: UpsertRentalPropertyConfigInput;
  nowIso: string;
}): Promise<RentalPropertyConfigRecord> {
  const { tx, propertyId, actorUid, isAdmin, input, nowIso } = params;
  const existingSnap = await tx.get<RentalPropertyConfigRecord>(`tenancyProperties/${propertyId}`);
  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);

  if (existingSnap.exists && existingSnap.data) {
    const existing = existingSnap.data;
    assertLandlordOrManagerAccess(existing, actorUid, isAdmin);
    if (existing.availabilityStatus !== input.availabilityStatus) {
      const allowed = ALLOWED_PROPERTY_AVAILABILITY_TRANSITIONS[existing.availabilityStatus] ?? [];
      if (!allowed.includes(input.availabilityStatus) && !isAdmin) {
        throw new CoreApiError(
          'CONFLICT',
          409,
          `Invalid availability transition from "${existing.availabilityStatus}" to "${input.availabilityStatus}".`,
        );
      }
      if (existing.activeLeaseId && input.availabilityStatus === 'AVAILABLE' && !isAdmin) {
        throw new CoreApiError(
          'CONFLICT',
          409,
          'Cannot mark property AVAILABLE while an active lease is in force.',
        );
      }
    }
    const updated: RentalPropertyConfigRecord = {
      ...existing,
      ...input,
      updatedAtIso: nowIso,
    };
    tx.set(`tenancyProperties/${propertyId}`, updated);
    appendTenancyHistoryEvent(tx, pIndex, {
      eventType: 'PROPERTY_CONFIG_UPDATED',
      actorUid,
      summary: `Rental property "${propertyId}" updated (status: ${input.availabilityStatus}).`,
      metadata: { availabilityStatus: input.availabilityStatus },
      nowIso,
    });
    savePropertyTenancyIndex(tx, pIndex);
    return updated;
  }

  const created: RentalPropertyConfigRecord = {
    propertyId,
    landlordUid: actorUid,
    ...input,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  tx.set(`tenancyProperties/${propertyId}`, created);
  appendTenancyHistoryEvent(tx, pIndex, {
    eventType: 'PROPERTY_CONFIG_CREATED',
    actorUid,
    summary: `Rental property "${propertyId}" configured with status "${input.availabilityStatus}".`,
    metadata: { availabilityStatus: input.availabilityStatus },
    nowIso,
  });
  savePropertyTenancyIndex(tx, pIndex);
  return created;
}

export async function executeCreateRentalApplication(params: {
  tx: TransactionContextLike;
  propertyId: string;
  applicantUid: string;
  input: CreateRentalApplicationInput;
  nowIso: string;
}): Promise<RentalApplicationRecord> {
  const { tx, propertyId, applicantUid, input, nowIso } = params;
  const propSnap = await tx.get<RentalPropertyConfigRecord>(`tenancyProperties/${propertyId}`);
  if (!propSnap.exists || !propSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Rental property "${propertyId}" is not configured.`);
  }
  const prop = propSnap.data;

  if (prop.availabilityStatus !== 'AVAILABLE' && prop.availabilityStatus !== 'APPLICATIONS_OPEN') {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Property "${propertyId}" is currently "${prop.availabilityStatus}" and not accepting rental applications.`,
    );
  }
  if (prop.landlordUid === applicantUid) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Landlord cannot submit a rental application on their own property.');
  }
  if (input.currency !== prop.currency) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Application currency must match property currency "${prop.currency}".`);
  }
  if (input.occupantCount > prop.maxOccupancyCount) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `occupantCount (${input.occupantCount}) exceeds permitted occupancy (${prop.maxOccupancyCount}).`,
    );
  }
  if (
    input.desiredLeaseDurationMonths < prop.minLeaseDurationMonths ||
    input.desiredLeaseDurationMonths > prop.maxLeaseDurationMonths
  ) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `desiredLeaseDurationMonths (${input.desiredLeaseDurationMonths}) must be between ${prop.minLeaseDurationMonths} and ${prop.maxLeaseDurationMonths}.`,
    );
  }

  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);
  const applicationId = input.applicationId ?? `app_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const status = input.submitImmediately !== false ? 'SUBMITTED' : 'DRAFT';
  const expiresAtIso = new Date(Date.parse(nowIso) + 14 * 24 * 60 * 60 * 1000).toISOString();

  const appRecord: RentalApplicationRecord = {
    applicationId,
    propertyId,
    landlordUid: prop.landlordUid,
    applicantUid,
    proposedPeriodicRentAmount: input.proposedPeriodicRentAmount,
    proposedDepositAmount: input.proposedDepositAmount,
    currency: input.currency,
    desiredMoveInDateIso: input.desiredMoveInDateIso,
    desiredLeaseDurationMonths: input.desiredLeaseDurationMonths,
    occupantCount: input.occupantCount,
    ...(input.applicantNote ? { applicantNote: input.applicantNote } : {}),
    status,
    expiresAtIso,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`tenancyApplications/${applicationId}`, appRecord);
  pIndex.applicationIds.push(applicationId);
  appendTenancyHistoryEvent(tx, pIndex, {
    eventType: 'APPLICATION_CREATED',
    actorUid: applicantUid,
    summary: `Rental application "${applicationId}" (${status}) created.`,
    metadata: { applicationId, status },
    nowIso,
  });
  savePropertyTenancyIndex(tx, pIndex);
  return appRecord;
}

export async function executeDecideRentalApplication(params: {
  tx: TransactionContextLike;
  propertyId: string;
  applicationId: string;
  actorUid: string;
  isAdmin: boolean;
  input: DecideRentalApplicationInput;
  nowIso: string;
}): Promise<RentalApplicationRecord> {
  const { tx, propertyId, applicationId, actorUid, isAdmin, input, nowIso } = params;
  const propSnap = await tx.get<RentalPropertyConfigRecord>(`tenancyProperties/${propertyId}`);
  const appSnap = await tx.get<RentalApplicationRecord>(`tenancyApplications/${applicationId}`);
  if (!propSnap.exists || !propSnap.data || !appSnap.exists || !appSnap.data || appSnap.data.propertyId !== propertyId) {
    throw new CoreApiError('NOT_FOUND', 404, `Rental application "${applicationId}" was not found.`);
  }
  const prop = propSnap.data;
  const app = appSnap.data;
  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);

  if (input.action === 'SUBMIT' || input.action === 'WITHDRAW') {
    if (app.applicantUid !== actorUid && !isAdmin) {
      throw new CoreApiError('FORBIDDEN', 403, 'Only the applicant can submit or withdraw their application.');
    }
    const nextStatus = input.action === 'SUBMIT' ? 'SUBMITTED' : 'WITHDRAWN';
    const updated: RentalApplicationRecord = {
      ...app,
      status: nextStatus,
      ...(input.reason ? { decisionReason: input.reason } : {}),
      updatedAtIso: nowIso,
    };
    tx.set(`tenancyApplications/${applicationId}`, updated);
    appendTenancyHistoryEvent(tx, pIndex, {
      eventType: `APPLICATION_${nextStatus}`,
      actorUid,
      summary: `Application "${applicationId}" transitioned to "${nextStatus}".`,
      metadata: { applicationId, status: nextStatus },
      nowIso,
    });
    savePropertyTenancyIndex(tx, pIndex);
    return updated;
  }

  assertLandlordOrManagerAccess(prop, actorUid, isAdmin, true);

  const statusMap = {
    START_REVIEW: 'UNDER_REVIEW',
    REQUEST_INFO: 'ADDITIONAL_INFORMATION_REQUIRED',
    APPROVE: 'APPROVED',
    REJECT: 'REJECTED',
  } as const;
  const nextStatus = statusMap[input.action];

  const updated: RentalApplicationRecord = {
    ...app,
    status: nextStatus,
    decidedByUid: actorUid,
    ...(input.reason ? { decisionReason: input.reason } : {}),
    ...(input.linkedTransactionId ? { linkedTransactionId: input.linkedTransactionId } : {}),
    updatedAtIso: nowIso,
  };
  tx.set(`tenancyApplications/${applicationId}`, updated);
  appendTenancyHistoryEvent(tx, pIndex, {
    eventType: `APPLICATION_${nextStatus}`,
    actorUid,
    summary: `Application "${applicationId}" updated to "${nextStatus}".`,
    metadata: { applicationId, status: nextStatus },
    nowIso,
  });
  savePropertyTenancyIndex(tx, pIndex);
  return updated;
}

export async function executeRecordTenantScreening(params: {
  tx: TransactionContextLike;
  propertyId: string;
  applicationId: string;
  actorUid: string;
  isAdmin: boolean;
  input: RecordTenantScreeningInput;
  nowIso: string;
}): Promise<TenantScreeningReferenceRecord> {
  const { tx, propertyId, applicationId, actorUid, isAdmin, input, nowIso } = params;
  const propSnap = await tx.get<RentalPropertyConfigRecord>(`tenancyProperties/${propertyId}`);
  const appSnap = await tx.get<RentalApplicationRecord>(`tenancyApplications/${applicationId}`);
  if (!propSnap.exists || !propSnap.data || !appSnap.exists || !appSnap.data || appSnap.data.propertyId !== propertyId) {
    throw new CoreApiError('NOT_FOUND', 404, `Application "${applicationId}" was not found.`);
  }
  assertLandlordOrManagerAccess(propSnap.data, actorUid, isAdmin, true);

  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);
  const screeningId = appSnap.data.screeningId ?? `scr_${applicationId}`;

  const screening: TenantScreeningReferenceRecord = {
    screeningId,
    applicationId,
    propertyId,
    applicantUid: appSnap.data.applicantUid,
    identityVerificationStatus: input.identityVerificationStatus,
    documentVerificationStatus: input.documentVerificationStatus,
    referenceVerificationStatus: input.referenceVerificationStatus,
    incomeDocumentationStatus: input.incomeDocumentationStatus,
    employmentVerificationStatus: input.employmentVerificationStatus,
    ...(input.externalProviderReference ? { externalProviderReference: input.externalProviderReference } : {}),
    manualReviewStatus: input.manualReviewStatus,
    reviewedByUid: actorUid,
    ...(input.reviewNote ? { reviewNote: input.reviewNote } : {}),
    updatedAtIso: nowIso,
  };

  tx.set(`tenancyScreenings/${screeningId}`, screening);
  tx.set(`tenancyApplications/${applicationId}`, {
    ...appSnap.data,
    screeningId,
    updatedAtIso: nowIso,
  });
  if (!pIndex.screeningIds.includes(screeningId)) {
    pIndex.screeningIds.push(screeningId);
  }
  savePropertyTenancyIndex(tx, pIndex);
  return screening;
}

export async function executeCreateLeaseAgreement(params: {
  tx: TransactionContextLike;
  propertyId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreateLeaseAgreementInput;
  nowIso: string;
}): Promise<LeaseAgreementRecord> {
  const { tx, propertyId, actorUid, isAdmin, input, nowIso } = params;
  const propSnap = await tx.get<RentalPropertyConfigRecord>(`tenancyProperties/${propertyId}`);
  if (!propSnap.exists || !propSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Rental property "${propertyId}" is not configured.`);
  }
  const prop = propSnap.data;
  assertLandlordOrManagerAccess(prop, actorUid, isAdmin, true);

  const txSnap = await tx.get<StoredTransactionDocument>(`transactions/${input.transactionId}`);
  if (!txSnap.exists || !txSnap.data || txSnap.data.transactionType !== 'RENTAL') {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Transaction "${input.transactionId}" must be a valid RENTAL transaction.`);
  }

  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);
  const leaseId = input.leaseId ?? `lse_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const lease: LeaseAgreementRecord = {
    leaseId,
    propertyId,
    transactionId: input.transactionId,
    ...(input.applicationId ? { applicationId: input.applicationId } : {}),
    ...(input.previousLeaseId ? { previousLeaseId: input.previousLeaseId } : {}),
    landlordUid: prop.landlordUid,
    tenantUid: input.tenantUid,
    ...(input.propertyManagerUid ?? prop.propertyManagerUid
      ? { propertyManagerUid: input.propertyManagerUid ?? prop.propertyManagerUid }
      : {}),
    ...(input.brokerUid ?? prop.brokerUid ? { brokerUid: input.brokerUid ?? prop.brokerUid } : {}),
    leaseStartDateIso: input.leaseStartDateIso,
    leaseEndDateIso: input.leaseEndDateIso,
    periodicRentAmount: input.periodicRentAmount,
    depositAmount: input.depositAmount,
    currency: input.currency,
    paymentFrequency: input.paymentFrequency,
    ...(input.customIntervalDays ? { customIntervalDays: input.customIntervalDays } : {}),
    installmentCount: input.installmentCount,
    gracePeriodDays: input.gracePeriodDays,
    contractualConditions: input.contractualConditions,
    ...(input.permittedRentAdjustmentClauseRef
      ? { permittedRentAdjustmentClauseRef: input.permittedRentAdjustmentClauseRef }
      : {}),
    contractDocumentId: input.contractDocumentId,
    status: 'DRAFT',
    approvedByLandlord: false,
    approvedByTenant: false,
    signedByLandlord: false,
    signedByTenant: false,
    amendmentIds: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`tenancyLeases/${leaseId}`, lease);
  pIndex.leaseIds.push(leaseId);
  appendTenancyHistoryEvent(tx, pIndex, {
    leaseId,
    eventType: 'LEASE_CREATED',
    actorUid,
    summary: `Lease agreement "${leaseId}" created in DRAFT status.`,
    metadata: { leaseId, transactionId: input.transactionId },
    nowIso,
  });
  savePropertyTenancyIndex(tx, pIndex);
  return lease;
}

export async function executeLeaseWorkflowAction(params: {
  tx: TransactionContextLike;
  propertyId: string;
  leaseId: string;
  actorUid: string;
  isAdmin: boolean;
  input: LeaseWorkflowActionInput;
  nowIso: string;
}): Promise<LeaseAgreementRecord> {
  const { tx, propertyId, leaseId, actorUid, isAdmin, input, nowIso } = params;
  const propSnap = await tx.get<RentalPropertyConfigRecord>(`tenancyProperties/${propertyId}`);
  const leaseSnap = await tx.get<LeaseAgreementRecord>(`tenancyLeases/${leaseId}`);
  if (!propSnap.exists || !propSnap.data || !leaseSnap.exists || !leaseSnap.data || leaseSnap.data.propertyId !== propertyId) {
    throw new CoreApiError('NOT_FOUND', 404, `Lease agreement "${leaseId}" was not found.`);
  }
  const prop = propSnap.data;
  const lease = leaseSnap.data;
  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);

  const isLandlordSide =
    actorUid === lease.landlordUid || actorUid === lease.propertyManagerUid || isAdmin;
  const isTenantSide = actorUid === lease.tenantUid || isAdmin;

  if (!isLandlordSide && !isTenantSide) {
    throw new CoreApiError('FORBIDDEN', 403, 'Principal is not a party to this lease agreement.');
  }

  if (input.action === 'SUBMIT_FOR_APPROVAL') {
    if (lease.status !== 'DRAFT') {
      throw new CoreApiError('CONFLICT', 409, 'Only DRAFT leases can be submitted for approval.');
    }
    const updated: LeaseAgreementRecord = { ...lease, status: 'PENDING_APPROVAL', updatedAtIso: nowIso };
    tx.set(`tenancyLeases/${leaseId}`, updated);
    savePropertyTenancyIndex(tx, pIndex);
    return updated;
  }

  if (input.action === 'APPROVE') {
    const approvedByLandlord = lease.approvedByLandlord || isLandlordSide;
    const approvedByTenant = lease.approvedByTenant || isTenantSide;
    const bothApproved = approvedByLandlord && approvedByTenant;
    const updated: LeaseAgreementRecord = {
      ...lease,
      approvedByLandlord,
      approvedByTenant,
      status: bothApproved ? 'SIGNATURE_PENDING' : 'PENDING_APPROVAL',
      updatedAtIso: nowIso,
    };
    tx.set(`tenancyLeases/${leaseId}`, updated);
    savePropertyTenancyIndex(tx, pIndex);
    return updated;
  }

  if (input.action === 'RECORD_SIGNATURE') {
    if (!lease.approvedByLandlord || !lease.approvedByTenant) {
      throw new CoreApiError('CONFLICT', 409, 'Both landlord and tenant must approve the lease before recording signatures.');
    }
    const signedByLandlord = lease.signedByLandlord || isLandlordSide;
    const signedByTenant = lease.signedByTenant || isTenantSide;
    const bothSigned = signedByLandlord && signedByTenant;
    const updated: LeaseAgreementRecord = {
      ...lease,
      signedByLandlord,
      signedByTenant,
      status: bothSigned ? 'APPROVED' : 'SIGNATURE_PENDING',
      updatedAtIso: nowIso,
    };
    tx.set(`tenancyLeases/${leaseId}`, updated);
    savePropertyTenancyIndex(tx, pIndex);
    return updated;
  }

  // input.action === 'ACTIVATE'
  if (lease.status === 'ACTIVE') {
    throw new CoreApiError('CONFLICT', 409, `Lease "${leaseId}" is already ACTIVE.`);
  }
  if (!lease.approvedByLandlord || !lease.approvedByTenant || !lease.signedByLandlord || !lease.signedByTenant) {
    throw new CoreApiError(
      'CONFLICT',
      409,
      'Cannot activate tenancy: draft or unsigned agreements cannot be represented as active.',
    );
  }

  // Check for conflicting active or overlapping leases on the same property
  const newStartMs = Date.parse(lease.leaseStartDateIso);
  const newEndMs = Date.parse(lease.leaseEndDateIso);
  for (const otherId of pIndex.leaseIds) {
    if (otherId === leaseId) continue;
    const oSnap = await tx.get<LeaseAgreementRecord>(`tenancyLeases/${otherId}`);
    if (oSnap.exists && oSnap.data && oSnap.data.status === 'ACTIVE') {
      const oStartMs = Date.parse(oSnap.data.leaseStartDateIso);
      const oEndMs = Date.parse(oSnap.data.leaseEndDateIso);
      if (newStartMs < oEndMs && newEndMs > oStartMs) {
        throw new CoreApiError(
          'CONFLICT',
          409,
          `Conflicting active lease "${otherId}" overlaps with requested tenancy period on property "${propertyId}".`,
        );
      }
    }
  }

  // Generate rent schedule and deposit obligation via Employee 54 ledger engine if not already generated
  let rentalScheduleId = lease.rentalScheduleId;
  let depositRecordId = lease.depositRecordId;

  if (!rentalScheduleId) {
    const schedResult = await executeGenerateRentalSchedule({
      tx,
      transactionId: lease.transactionId,
      actorUid,
      isAdmin: true,
      input: {
        scheduleId: `rsc_${leaseId}`,
        contractReferenceId: lease.contractDocumentId,
        tenantUid: lease.tenantUid,
        landlordUid: lease.landlordUid,
        currency: lease.currency,
        securityDepositAmount: lease.depositAmount,
        periodicRentAmount: lease.periodicRentAmount,
        frequency: lease.paymentFrequency,
        customIntervalDays: lease.customIntervalDays,
        installmentCount: lease.installmentCount,
        startDateIso: lease.leaseStartDateIso,
      },
      nowIso,
    });
    rentalScheduleId = schedResult.schedule.scheduleId;

    depositRecordId = `dep_${leaseId}`;
    const depositRecord: TenancyDepositRecord = {
      depositId: depositRecordId,
      leaseId,
      transactionId: lease.transactionId,
      propertyId,
      tenantUid: lease.tenantUid,
      landlordUid: lease.landlordUid,
      requiredDepositAmount: lease.depositAmount,
      confirmedDepositAmount: 0,
      deductedAmount: 0,
      refundedAmount: 0,
      refundableBalance: 0,
      currency: lease.currency,
      depositObligationId: schedResult.schedule.securityDepositObligationId,
      status: lease.depositAmount > 0 ? 'AWAITING_PAYMENT' : 'HELD_CONFIRMED',
      deductions: [],
      updatedAtIso: nowIso,
    };
    tx.set(`tenancyDeposits/${depositRecordId}`, depositRecord);
    pIndex.depositIds.push(depositRecordId);
  }

  if (input.requireConfirmedDepositOnActivation && lease.depositAmount > 0 && depositRecordId) {
    const depSnap = await tx.get<TenancyDepositRecord>(`tenancyDeposits/${depositRecordId}`);
    if (depSnap.exists && depSnap.data) {
      const obSnap = await tx.get<FinancialObligationRecord>(
        `transactionObligations/${depSnap.data.depositObligationId}`,
      );
      if (!obSnap.exists || !obSnap.data || obSnap.data.status !== 'SETTLED') {
        throw new CoreApiError(
          'CONFLICT',
          409,
          'Required security deposit obligation has not been confirmed as settled.',
        );
      }
    }
  }

  const activatedLease: LeaseAgreementRecord = {
    ...lease,
    status: 'ACTIVE',
    rentalScheduleId,
    depositRecordId,
    activatedAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  tx.set(`tenancyLeases/${leaseId}`, activatedLease);

  // Synchronize property availability status to RENTED
  tx.set(`tenancyProperties/${propertyId}`, {
    ...prop,
    availabilityStatus: 'RENTED',
    activeLeaseId: leaseId,
    updatedAtIso: nowIso,
  });

  appendTenancyHistoryEvent(tx, pIndex, {
    leaseId,
    eventType: 'TENANCY_ACTIVATED',
    actorUid,
    summary: `Tenancy "${leaseId}" activated; property "${propertyId}" marked RENTED.`,
    metadata: { leaseId, rentalScheduleId: rentalScheduleId ?? '' },
    nowIso,
  });
  savePropertyTenancyIndex(tx, pIndex);
  return activatedLease;
}
