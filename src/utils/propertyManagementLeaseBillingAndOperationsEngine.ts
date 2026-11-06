import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface OwnershipShareRecord { ownerId: string; ownerType: 'INDIVIDUAL' | 'LEGAL_ENTITY'; sharePercent: number; effectiveFromIso: string; effectiveToIso: string | null; verifiedDeedOrContractRef: string | null; isManagementOrganizationOnly?: boolean; }
export interface BuildingHierarchyNode { nodeId: string; parentId: string | null; nodeKind: 'COMPLEX' | 'BUILDING' | 'FLOOR' | 'RESIDENTIAL_UNIT' | 'COMMERCIAL_UNIT' | 'PARKING' | 'STORAGE' | 'COMMON_FACILITY'; unitCode: string; persianLabel: string; }
export function evaluatePropertyOwnershipPortfolioAndHierarchy(params: { actorWorkspaceId: string; resourceWorkspaceId: string; requireCompleteHundredPercentAllocation: boolean; ownershipRecords: readonly OwnershipShareRecord[]; hierarchyNodes: readonly BuildingHierarchyNode[]; portfolioValuationInput: { acquisitionCostToman: number | null; estimatedMarketValueToman: number | null; verifiedTransactionPriceToman: number | null }; }): { workspaceAuthorized: boolean; activeOwnershipShareSumPercent: number; ownershipAllocationValid: boolean; managementOrgExcludedFromOwnershipCount: number; unverifiedOwnershipRefsCount: number; hasHierarchyCycle: boolean; duplicateUnitCodes: string[]; portfolioValuationClassification: 'VERIFIED_TRANSACTION' | 'ESTIMATED_VALUATION_ONLY' | 'UNVALUED'; } { const workspaceAuthorized = Boolean(params.actorWorkspaceId) && params.actorWorkspaceId === params.resourceWorkspaceId; let activeShareBasePointSum = 0; let managementOrgExcludedFromOwnershipCount = 0; let unverifiedOwnershipRefsCount = 0; for (const rec of params.ownershipRecords) {
    if (rec.isManagementOrganizationOnly) { managementOrgExcludedFromOwnershipCount += 1; continue; } if (rec.effectiveToIso === null) activeShareBasePointSum += Math.round(rec.sharePercent * 100); if (!rec.verifiedDeedOrContractRef) unverifiedOwnershipRefsCount += 1; }
  const activeOwnershipShareSumPercent = Number((activeShareBasePointSum / 100).toFixed(2)); const ownershipAllocationValid = params.requireCompleteHundredPercentAllocation
    ? activeShareBasePointSum === 10_000
    : activeShareBasePointSum > 0 && activeShareBasePointSum <= 10_000; const parentMap = new Map<string, string | null>(); const seenCodePerParent = new Set<string>(); const duplicateUnitCodes: string[] = [];
  for (const node of params.hierarchyNodes) { parentMap.set(node.nodeId, node.parentId); const scopedKey = `${node.parentId ?? 'ROOT'}::${node.unitCode.trim()}`;
    if (seenCodePerParent.has(scopedKey)) duplicateUnitCodes.push(node.unitCode); else seenCodePerParent.add(scopedKey); } let hasHierarchyCycle = false; for (const node of params.hierarchyNodes) { const visited = new Set<string>(); let cursor: string | null | undefined = node.nodeId; while (cursor) { if (visited.has(cursor)) { hasHierarchyCycle = true; break; }
      visited.add(cursor); cursor = parentMap.get(cursor) ?? null; } if (hasHierarchyCycle) break; }
  const portfolioValuationClassification = params.portfolioValuationInput.verifiedTransactionPriceToman !== null
      ? 'VERIFIED_TRANSACTION'
      : params.portfolioValuationInput.estimatedMarketValueToman !== null
      ? 'ESTIMATED_VALUATION_ONLY'
      : 'UNVALUED'; return { workspaceAuthorized, activeOwnershipShareSumPercent, ownershipAllocationValid, managementOrgExcludedFromOwnershipCount, unverifiedOwnershipRefsCount, hasHierarchyCycle, duplicateUnitCodes, portfolioValuationClassification, }; } export function evaluateOccupancyLeaseLifecycleAndAmendments(params: { unitId: string; viewerIsAuthorizedManagerOrOwner: boolean; physicalOccupancyState: 'VACANT' | 'TENANT_OCCUPIED' | 'OWNER_OCCUPIED' | 'UNDER_RENOVATION' | 'RESERVED'; occupantFullNamePii: string;
  leases: readonly { leaseId: string; category: 'RESIDENTIAL' | 'COMMERCIAL'; contractStatus: 'UNSIGNED_DRAFT' | 'PENDING_APPROVAL' | 'EXECUTED_ACTIVE' | 'EXPIRED' | 'TERMINATED_EARLY'; startIso: string; endIso: string; monthlyRentToman: number; depositAmountToman: number;
    autoRenewalExplicitlyConfigured: boolean; }[]; proposedAmendment?: { amendmentId: string; targetLeaseId: string; effectiveFromIso: string; newMonthlyRentToman: number; approvedByLandlordAndTenant: boolean;
  }; }): { visibleOccupantName: string | null; hasOverlappingExecutedLeases: boolean;
  unsignedDraftsExcludedFromActiveObligationsCount: number; physicalVsContractualDiscrepancyDetected: boolean; amendmentOutcome: { applied: boolean;
    preservedOriginalMonthlyRentToman: number | null; effectiveAmendedMonthlyRentToman: number | null; reason: string;
  };
} {
  const visibleOccupantName = params.viewerIsAuthorizedManagerOrOwner ? params.occupantFullNamePii : null;
  const executedActiveLeases = params.leases.filter((l) => l.contractStatus === 'EXECUTED_ACTIVE');
  const unsignedDraftsExcludedFromActiveObligationsCount = params.leases.filter((l) => l.contractStatus === 'UNSIGNED_DRAFT').length;
  let hasOverlappingExecutedLeases = false;
  for (let i = 0; i < executedActiveLeases.length; i++) {
    const aStart = Date.parse(executedActiveLeases[i].startIso);
    const aEnd = Date.parse(executedActiveLeases[i].endIso);
    for (let j = i + 1; j < executedActiveLeases.length; j++) {
      if (aStart < Date.parse(executedActiveLeases[j].endIso) && Date.parse(executedActiveLeases[j].startIso) < aEnd) {
        hasOverlappingExecutedLeases = true;
        break;
      }
    }
  }
  const physicalVsContractualDiscrepancyDetected =
    (params.physicalOccupancyState === 'VACANT' && executedActiveLeases.length > 0) ||
    (params.physicalOccupancyState === 'TENANT_OCCUPIED' && executedActiveLeases.length === 0);
  let amendmentOutcome = {
    applied: false,
    preservedOriginalMonthlyRentToman: null as number | null,
    effectiveAmendedMonthlyRentToman: null as number | null,
    reason: 'NO_AMENDMENT_REQUESTED',
  };
  if (params.proposedAmendment) {
    const target = executedActiveLeases.find((l) => l.leaseId === params.proposedAmendment?.targetLeaseId);
    if (!target) {
      amendmentOutcome = {
        applied: false,
        preservedOriginalMonthlyRentToman: null,
        effectiveAmendedMonthlyRentToman: null,
        reason: 'REJECTED_TARGET_LEASE_NOT_EXECUTED',
      };
    } else if (!params.proposedAmendment.approvedByLandlordAndTenant || !Number.isFinite(params.proposedAmendment.newMonthlyRentToman) || params.proposedAmendment.newMonthlyRentToman <= 0) {
      amendmentOutcome = {
        applied: false,
        preservedOriginalMonthlyRentToman: target.monthlyRentToman,
        effectiveAmendedMonthlyRentToman: target.monthlyRentToman,
        reason: 'BLOCKED_MISSING_BILATERAL_APPROVAL',
      };
    } else {
      amendmentOutcome = {
        applied: true,
        preservedOriginalMonthlyRentToman: target.monthlyRentToman,
        effectiveAmendedMonthlyRentToman: params.proposedAmendment.newMonthlyRentToman,
        reason: 'AMENDMENT_VERSION_APPENDED_IMMUTABLY',
      };
    }
  }
  return {
    visibleOccupantName,
    hasOverlappingExecutedLeases,
    unsignedDraftsExcludedFromActiveObligationsCount,
    physicalVsContractualDiscrepancyDetected,
    amendmentOutcome,
  };
}
export function evaluateDepositRecurringBillingAndCollection(params: {
  leaseId: string;
  contractualDepositToman: number;
  verifiedReceivedDepositCashToman: number;
  approvedDeductionsToman: number;
  refundedDepositCashToman: number;
  billingScheduleRequest: {
    termVersion: string;
    monthlyRentToman: number;
    requestedPeriods: readonly {
      periodKey: string;
      jalaliMonthNumber: number;
      isJalaliLeapYear: boolean;
      contractualDueDayOfMonth: number;
      isRentFreeGracePeriod?: boolean;
    }[];
    alreadyGeneratedIdempotencyKeys: ReadonlySet<string>;
  };
  paymentEvents: readonly {
    paymentId: string;
    providerTxRef: string | null;
    stage: 'INITIATED_UNCONFIRMED' | 'AUTHORITATIVE_SETTLED' | 'REVERSED';
    amountToman: number;
  }[];
}, areaUnit: AreaUnit = getStoredAreaUnit(), intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()): {
  depositSummary: {
    unpaidContractualDepositGapToman: number;
    netRefundableLiabilityBalanceToman: number;
    isFullyFunded: boolean;
    displayAreaUnitLabel: string;
    netRefundableLiabilityIntlText: string;
  };
  generatedReceivables: {
    idempotencyKey: string;
    periodKey: string;
    effectiveDueDayOfMonth: number;
    scheduledAmountToman: number;
    status: 'DUE_UNPAID' | 'PARTIALLY_PAID' | 'SETTLED' | 'RENT_FREE_EXEMPT';
  }[];
  skippedDuplicateScheduleCount: number;
  collectionReconciliation: {
    totalScheduledRentToman: number;
    authoritativeSettledCashToman: number;
    unconfirmedInitiatedIgnoredToman: number;
    duplicateProviderTxRefsBlocked: string[];
    outstandingRentReceivableToman: number;
    excessOverpaymentCreditToman: number;
  };
} {
  const unpaidContractualDepositGapToman = Math.max(0, params.contractualDepositToman - params.verifiedReceivedDepositCashToman);
  const netRefundableLiabilityBalanceToman = Math.max(0, params.verifiedReceivedDepositCashToman - params.approvedDeductionsToman - params.refundedDepositCashToman);
  const seenKeys = new Set<string>(params.billingScheduleRequest.alreadyGeneratedIdempotencyKeys);
  let skippedDuplicateScheduleCount = 0;
  const rawReceivables: { idempotencyKey: string; periodKey: string; effectiveDueDayOfMonth: number; scheduledAmountToman: number; }[] = [];
  for (const p of params.billingScheduleRequest.requestedPeriods) {
    const idempotencyKey = `${params.leaseId}::${params.billingScheduleRequest.termVersion}::${p.periodKey}`;
    if (seenKeys.has(idempotencyKey)) {
      skippedDuplicateScheduleCount += 1;
      continue;
    }
    seenKeys.add(idempotencyKey);
    const maxDaysInJalaliMonth =
      p.jalaliMonthNumber <= 6 ? 31 : p.jalaliMonthNumber <= 11 ? 30 : p.isJalaliLeapYear ? 30 : 29;
    const effectiveDueDayOfMonth = Math.min(Math.max(1, p.contractualDueDayOfMonth), maxDaysInJalaliMonth);
    const scheduledAmountToman = p.isRentFreeGracePeriod ? 0 : params.billingScheduleRequest.monthlyRentToman;
    rawReceivables.push({ idempotencyKey, periodKey: p.periodKey, effectiveDueDayOfMonth, scheduledAmountToman });
  }
  const seenProviderRefs = new Set<string>();
  const duplicateProviderTxRefsBlocked: string[] = [];
  let authoritativeSettledCashToman = 0;
  let unconfirmedInitiatedIgnoredToman = 0;
  for (const ev of params.paymentEvents) {
    if (ev.stage === 'INITIATED_UNCONFIRMED') {
      unconfirmedInitiatedIgnoredToman += ev.amountToman;
      continue;
    }
    if (ev.stage !== 'AUTHORITATIVE_SETTLED') continue;
    if (ev.providerTxRef) {
      if (seenProviderRefs.has(ev.providerTxRef)) {
        duplicateProviderTxRefsBlocked.push(ev.providerTxRef);
        continue;
      }
      seenProviderRefs.add(ev.providerTxRef);
    }
    authoritativeSettledCashToman += ev.amountToman;
  }
  let remainingSettledPool = authoritativeSettledCashToman;
  let totalScheduledRentToman = 0;
  const generatedReceivables = rawReceivables.map((r) => {
    totalScheduledRentToman += r.scheduledAmountToman;
    if (r.scheduledAmountToman === 0) return { ...r, status: 'RENT_FREE_EXEMPT' as const };
    if (remainingSettledPool >= r.scheduledAmountToman) {
      remainingSettledPool -= r.scheduledAmountToman;
      return { ...r, status: 'SETTLED' as const };
    }
    if (remainingSettledPool > 0) {
      remainingSettledPool = 0;
      return { ...r, status: 'PARTIALLY_PAID' as const };
    }
    return { ...r, status: 'DUE_UNPAID' as const };
  });
  const outstandingRentReceivableToman = Math.max(0, totalScheduledRentToman - authoritativeSettledCashToman);
  const excessOverpaymentCreditToman = Math.max(0, authoritativeSettledCashToman - totalScheduledRentToman);
  return {
    depositSummary: {
      unpaidContractualDepositGapToman,
      netRefundableLiabilityBalanceToman,
      isFullyFunded: unpaidContractualDepositGapToman === 0,
      displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
      netRefundableLiabilityIntlText: formatMillionTomanAsIntlCurrency(netRefundableLiabilityBalanceToman / 1_000_000, intlCurrency),
    },
    generatedReceivables,
    skippedDuplicateScheduleCount,
    collectionReconciliation: {
      totalScheduledRentToman,
      authoritativeSettledCashToman,
      unconfirmedInitiatedIgnoredToman,
      duplicateProviderTxRefsBlocked,
      outstandingRentReceivableToman,
      excessOverpaymentCreditToman,
    },
  };
}
export function evaluateOperationsVendorsChargesAndAudit(params: {
  operatingExpense: {
    invoiceNumber: string;
    alreadyRecordedInvoices: ReadonlySet<string>;
    amountToman: number;
    hasApprovedAllocationPolicy: boolean;
  };
  vendorAndMaintenance: {
    vendorId: string;
    hasVerifiedQualificationDocs: boolean;
    licenseExpiresIso: string;
    nowIso: string;
    workOrderHasCompletionEvidence: boolean;
    workOrderInspectorConfirmed: boolean;
  };
  commonChargeAllocation: {
    policyVersion: string;
    preserveHistoricalSnapshot: boolean;
    totalCommonExpenseToman: number;
    unitSharesPercent: readonly number[];
  };
  utilityMeterCheck: {
    previousReading: number;
    currentReading: number;
    isConfirmedMeterRollover: boolean;
    isEstimatedReadingOnly: boolean;
  };
  insuranceAndInspection: {
    hasPolicyDocumentEvidence: boolean;
    policyExpiresIso: string;
    inspectionHasCertifiedEngineerSignOff: boolean;
    unresolvedCriticalFindingsCount: number;
  };
}): {
  expenseAccepted: boolean;
  vendorVerifiedBadgeAllowed: boolean;
  workOrderCanCloseAsCompleted: boolean;
  chargeAllocationBreakdown: {
    allocatedPerUnitToman: number[];
    roundingResidualToman: number;
    totalReconciledExactToman: number;
  };
  utilityConsumptionStatus: 'VERIFIED_NORMAL' | 'ESTIMATED_UNVERIFIED' | 'ROLLOVER_HANDLED' | 'REJECTED_NEGATIVE_SPIKE';
  propertyInsuredBadgeAllowed: boolean;
  certifiedEngineeringInspectionBadgeAllowed: boolean;
  auditReadinessStatus: 'AUDIT_PASSED_ZERO_CRITICAL_GAPS' | 'AUDIT_ACTION_REQUIRED';
} {
  const isDuplicateInvoice = params.operatingExpense.alreadyRecordedInvoices.has(params.operatingExpense.invoiceNumber);
  const expenseAccepted = !isDuplicateInvoice && Number.isFinite(params.operatingExpense.amountToman) && params.operatingExpense.amountToman > 0 && params.operatingExpense.hasApprovedAllocationPolicy;
  const nowMs = Date.parse(params.vendorAndMaintenance.nowIso);
  const vendorLicenseValid = Number.isFinite(nowMs) && Date.parse(params.vendorAndMaintenance.licenseExpiresIso) > nowMs;
  const vendorVerifiedBadgeAllowed = params.vendorAndMaintenance.hasVerifiedQualificationDocs && vendorLicenseValid;
  const workOrderCanCloseAsCompleted = params.vendorAndMaintenance.workOrderHasCompletionEvidence && params.vendorAndMaintenance.workOrderInspectorConfirmed;
  const commonExp = Number.isFinite(params.commonChargeAllocation.totalCommonExpenseToman) && params.commonChargeAllocation.totalCommonExpenseToman >= 0 ? params.commonChargeAllocation.totalCommonExpenseToman : 0;
  const rawAllocations = params.commonChargeAllocation.unitSharesPercent.map((pct) => {
    const p = Number.isFinite(pct) && pct >= 0 ? pct : 0;
    return Math.floor((commonExp * p) / 100);
  });
  const floorSum = rawAllocations.reduce((a, b) => a + b, 0);
  const roundingResidualToman = commonExp - floorSum;
  const allocatedPerUnitToman = rawAllocations.map((amt, idx) => (idx === rawAllocations.length - 1 ? amt + roundingResidualToman : amt));
  let utilityConsumptionStatus: 'VERIFIED_NORMAL' | 'ESTIMATED_UNVERIFIED' | 'ROLLOVER_HANDLED' | 'REJECTED_NEGATIVE_SPIKE' = 'VERIFIED_NORMAL';
  if (params.utilityMeterCheck.currentReading < params.utilityMeterCheck.previousReading) {
    utilityConsumptionStatus = params.utilityMeterCheck.isConfirmedMeterRollover ? 'ROLLOVER_HANDLED' : 'REJECTED_NEGATIVE_SPIKE';
  } else if (params.utilityMeterCheck.isEstimatedReadingOnly) {
    utilityConsumptionStatus = 'ESTIMATED_UNVERIFIED';
  }
  const propertyInsuredBadgeAllowed =
    params.insuranceAndInspection.hasPolicyDocumentEvidence && Number.isFinite(nowMs) && Date.parse(params.insuranceAndInspection.policyExpiresIso) > nowMs;
  const certifiedEngineeringInspectionBadgeAllowed = params.insuranceAndInspection.inspectionHasCertifiedEngineerSignOff;
  const auditReadinessStatus =
    expenseAccepted &&
    roundingResidualToman >= 0 &&
    utilityConsumptionStatus !== 'REJECTED_NEGATIVE_SPIKE' &&
    params.insuranceAndInspection.unresolvedCriticalFindingsCount === 0
      ? 'AUDIT_PASSED_ZERO_CRITICAL_GAPS'
      : 'AUDIT_ACTION_REQUIRED';
  return {
    expenseAccepted,
    vendorVerifiedBadgeAllowed,
    workOrderCanCloseAsCompleted,
    chargeAllocationBreakdown: { allocatedPerUnitToman, roundingResidualToman, totalReconciledExactToman: allocatedPerUnitToman.reduce((a, b) => a + b, 0), }, utilityConsumptionStatus, propertyInsuredBadgeAllowed, certifiedEngineeringInspectionBadgeAllowed, auditReadinessStatus, }; }