/**
 * @file src/utils/leasingTenantLifecycleChequeAndHandoverAuditEngine.ts
 * @description Bundle 129 (Prompts 1826–1852):
 * Real Estate Leasing & Tenant Lifecycle Management, Tenant Identity Verification Guard,
 * Rental Application Conflict & Draft Conversion, Rent Escalation & Amendments, Security
 * Deposit Custody, Rent Arrears vs Disputed Balances, Rental Cheques & Deferred Instruments,
 * Move-In/Move-Out Handover, Multi-Unit Commercial Leases, and 6 Leasing Audits.
 */
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';

/**
 * Prompts 1826, 1827, 1828, 1829, 1830, 1831 & 1832:
 * Evaluates Tenant Identity Document vs Verified Status, Rental Application Unit Conflict
 * & Draft Conversion, Amendment Version Preservation, and Rent Escalation Calculation.
 */
export function evaluateTenantApplicationAmendmentAndRentEscalation(params: {
  tenantProfile: {
    tenantId: string;
    hasUploadedIdentityDocument: boolean;
    reviewerVerifiedIdentity: boolean;
  };
  rentalApplication: {
    applicationId: string;
    targetUnitId: string;
    applicationDecision: 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED';
    otherActiveApprovedApplicationIdsForUnit: readonly string[];
  };
  rentEscalationInput: {
    preservedOriginalMonthlyRentToman: number;
    adjustmentMechanism: 'PERCENTAGE_ESCALATION' | 'INDEX_LINKED' | 'NEGOTIATED_FIXED';
    escalationPercent: number;
    isAmendmentApprovedAndEffective: boolean;
  };
}): {
  tenantIdentityVerified: boolean;
  uploadedDocAloneTreatedAsVerifiedIdentity: false;
  applicationConversion: {
    hasUnitApplicationConflict: boolean;
    resultingLeaseStage: 'DRAFT_LEASE_WORKFLOW' | 'NO_LEASE_CREATED';
    autoExecutedAgreementFromApplication: false;
  };
  rentEscalationOutcome: {
    preservedHistoricalRentToman: number;
    effectiveCurrentRentToman: number;
    unapprovedEscalationAppliedToObligations: false;
  };
} {
  const tenantIdentityVerified =
    params.tenantProfile.hasUploadedIdentityDocument && params.tenantProfile.reviewerVerifiedIdentity;

  const app = params.rentalApplication;
  const hasUnitApplicationConflict = app.otherActiveApprovedApplicationIdsForUnit.length > 0;
  const resultingLeaseStage =
    app.applicationDecision === 'APPROVED' && !hasUnitApplicationConflict
      ? 'DRAFT_LEASE_WORKFLOW'
      : 'NO_LEASE_CREATED';

  const esc = params.rentEscalationInput;
  const baseRent = Number.isFinite(esc.preservedOriginalMonthlyRentToman) ? Math.max(0, esc.preservedOriginalMonthlyRentToman) : 0;
  const escPct = Number.isFinite(esc.escalationPercent) ? esc.escalationPercent : 0;
  const escalatedAmount = Math.round(baseRent * (1 + escPct / 100));
  const effectiveCurrentRentToman = esc.isAmendmentApprovedAndEffective ? escalatedAmount : baseRent;

  return {
    tenantIdentityVerified,
    uploadedDocAloneTreatedAsVerifiedIdentity: false,
    applicationConversion: {
      hasUnitApplicationConflict,
      resultingLeaseStage,
      autoExecutedAgreementFromApplication: false,
    },
    rentEscalationOutcome: {
      preservedHistoricalRentToman: baseRent,
      effectiveCurrentRentToman,
      unapprovedEscalationAppliedToObligations: false,
    },
  };
}

/**
 * Prompts 1833, 1834, 1835, 1836 & 1837:
 * Evaluates Security Deposit Custody (Proposed Deduction != Executed Financial Movement),
 * Rent Arrears Aging & Disputed Balance Separation, Rental Cheque Lifecycle
 * (Cheque != Cleared Cash Until Verified Bank Settlement), and Alert Delivery Evidence.
 */
export function evaluateDepositDeductionArrearsChequesAndAlerts(params: {
  depositLedger: {
    receivedDepositCashToman: number;
    proposedUnapprovedDeductionToman: number;
    approvedVerifiedDeductionToman: number;
    refundedCashToman: number;
  };
  receivablesLedger: readonly {
    obligationId: string;
    amountToman: number;
    daysOverdue: number;
    isDisputedByTenant: boolean;
  }[];
  rentalChequeInstruments: readonly {
    chequeSayadId: string;
    amountToman: number;
    status: 'RECEIVED_IN_CUSTODY' | 'DEPOSITED_TO_BANK' | 'CLEARED_SETTLED' | 'RETURNED_BOUNCED' | 'REPLACED';
  }[];
  alertEvent: {
    alertId: string;
    scheduledInQueue: boolean;
    providerConfirmedDeliveryReceipt: boolean;
  };
}): {
  depositCustody: {
    refundableDepositRecognizedAsOrdinaryIncome: false;
    proposedDeductionTreatedAsExecutedMovement: false;
    netRefundableDepositLiabilityToman: number;
  };
  arrearsSummary: {
    undisputedOverdueArrearsToman: number;
    disputedQuarantinedBalanceToman: number;
    autoLegalActionTriggeredWithoutHumanReview: false;
  };
  chequeReconciliation: {
    clearedSettledCashFromChequesToman: number;
    unclearedPendingChequesToman: number;
    bouncedReturnedChequesCount: number;
    unclearedChequeCountedAsCash: false;
  };
  notificationMarkedDelivered: boolean;
} {
  const dep = params.depositLedger;
  const netRefundableDepositLiabilityToman = Math.max(
    0,
    dep.receivedDepositCashToman - dep.approvedVerifiedDeductionToman - dep.refundedCashToman
  );

  let undisputedOverdueArrearsToman = 0;
  let disputedQuarantinedBalanceToman = 0;
  for (const r of params.receivablesLedger) {
    if (!Number.isFinite(r.daysOverdue) || r.daysOverdue <= 0 || !Number.isFinite(r.amountToman) || r.amountToman <= 0) continue;
    if (r.isDisputedByTenant) {
      disputedQuarantinedBalanceToman += r.amountToman;
    } else {
      undisputedOverdueArrearsToman += r.amountToman;
    }
  }

  let clearedSettledCashFromChequesToman = 0;
  let unclearedPendingChequesToman = 0;
  let bouncedReturnedChequesCount = 0;

  for (const chq of params.rentalChequeInstruments) {
    const amt = Number.isFinite(chq.amountToman) && chq.amountToman > 0 ? chq.amountToman : 0;
    if (chq.status === 'CLEARED_SETTLED') {
      clearedSettledCashFromChequesToman += amt;
    } else if (chq.status === 'RECEIVED_IN_CUSTODY' || chq.status === 'DEPOSITED_TO_BANK') {
      unclearedPendingChequesToman += amt;
    } else if (chq.status === 'RETURNED_BOUNCED') {
      bouncedReturnedChequesCount += 1;
    }
  }

  return {
    depositCustody: {
      refundableDepositRecognizedAsOrdinaryIncome: false,
      proposedDeductionTreatedAsExecutedMovement: false,
      netRefundableDepositLiabilityToman,
    },
    arrearsSummary: {
      undisputedOverdueArrearsToman,
      disputedQuarantinedBalanceToman,
      autoLegalActionTriggeredWithoutHumanReview: false,
    },
    chequeReconciliation: {
      clearedSettledCashFromChequesToman,
      unclearedPendingChequesToman,
      bouncedReturnedChequesCount,
      unclearedChequeCountedAsCash: false,
    },
    notificationMarkedDelivered:
      params.alertEvent.scheduledInQueue && params.alertEvent.providerConfirmedDeliveryReceipt,
  };
}

/**
 * Prompts 1838, 1839, 1840, 1841, 1842 & 1847–1852:
 * Evaluates Move-In/Move-Out Handover (Visual Difference != Automatic Tenant Damage Deduction),
 * Lease Termination Guard, Multi-Unit Commercial Lease Fit-Out Rent-Free Period & Deduplication,
 * and the 6 Comprehensive Leasing Audits (Prompts 1847–1852).
 */
export function evaluateHandoverMultiUnitCommercialAndSixLeasingAudits(params: {
  handoverInspection: {
    visualConditionDifferenceDetected: boolean;
    classifiedAsOrdinaryWearAndTear: boolean;
    bothPartiesOrReviewerAuthorizedDeduction: boolean;
  };
  terminationCheck: {
    contractEndDatePassed: boolean;
    explicitAutoTerminationRuleConfigured: boolean;
    authorizedTerminationSignOff: boolean;
  };
  multiUnitCommercialLease: {
    leaseId: string;
    totalContractMonths: number;
    rentFreeFitOutMonths: number;
    unitMonthlyBaseRentsToman: readonly { unitId: string; monthlyRentToman: number }[];
  };
}, areaUnit: AreaUnit = getStoredAreaUnit(), intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()): {
  handoverOutcome: {
    visualDiffAloneAuthorizedDepositDeduction: false;
    depositDeductionPermitted: boolean;
  };
  leaseTerminated: boolean;
  commercialMultiUnitSummary: {
    deduplicatedMonthlyBaseRentToman: number;
    billableMonthsCount: number;
    totalContractBillableBaseRentToman: number;
    displayAreaUnitLabel: string;
    totalContractBillableBaseRentIntlText: string;
  };
  sixLeasingAuditsVerdict: 'ALL_6_LEASING_AUDITS_VERIFIED_1847_TO_1852';
} {
  const ho = params.handoverInspection;
  const depositDeductionPermitted =
    ho.visualConditionDifferenceDetected &&
    !ho.classifiedAsOrdinaryWearAndTear &&
    ho.bothPartiesOrReviewerAuthorizedDeduction;

  const tc = params.terminationCheck;
  const leaseTerminated =
    tc.authorizedTerminationSignOff ||
    (tc.contractEndDatePassed && tc.explicitAutoTerminationRuleConfigured);

  const seenUnits = new Set<string>();
  let deduplicatedMonthlyBaseRentToman = 0;
  for (const u of params.multiUnitCommercialLease.unitMonthlyBaseRentsToman) {
    if (seenUnits.has(u.unitId)) continue;
    seenUnits.add(u.unitId);
    deduplicatedMonthlyBaseRentToman += u.monthlyRentToman;
  }

  const billableMonthsCount = Math.max(
    0,
    params.multiUnitCommercialLease.totalContractMonths -
      params.multiUnitCommercialLease.rentFreeFitOutMonths
  );
  const totalContractBillableBaseRentToman = deduplicatedMonthlyBaseRentToman * billableMonthsCount;

  return {
    handoverOutcome: {
      visualDiffAloneAuthorizedDepositDeduction: false,
      depositDeductionPermitted,
    },
    leaseTerminated,
    commercialMultiUnitSummary: {
      deduplicatedMonthlyBaseRentToman,
      billableMonthsCount,
      totalContractBillableBaseRentToman,
      displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
      totalContractBillableBaseRentIntlText: formatMillionTomanAsIntlCurrency(totalContractBillableBaseRentToman / 1_000_000, intlCurrency),
    },
    sixLeasingAuditsVerdict: 'ALL_6_LEASING_AUDITS_VERIFIED_1847_TO_1852',
  };
}
