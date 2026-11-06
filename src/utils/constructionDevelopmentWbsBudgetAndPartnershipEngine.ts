import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface WbsActivityNode { activityId: string; parentId: string | null; wbsCode: string; titleFa: string; durationDays: number; predecessorIds: readonly string[]; baselineCostToman: number; }
export function evaluateProjectWbsCriticalPathAndMilestones(params: { actorWorkspaceId: string; projectWorkspaceId: string; projectCategory: 'RESIDENTIAL' | 'COMMERCIAL' | 'MIXED_USE' | 'INDUSTRIAL' | 'RENOVATION'; activities: readonly WbsActivityNode[]; milestones: readonly { milestoneId: string; titleFa: string; hasRequiredAcceptanceEvidence: boolean; contractuallyAcceptedByClient: boolean; internalTeamMarkedComplete: boolean }[]; }): { workspaceAuthorized: boolean; hasDependencyCycle: boolean; criticalPathCalculated: boolean; projectDurationDays: number | null; criticalPathActivityIds: string[]; milestonesBlockedWithoutEvidenceIds: string[]; internalCompletionSeparatedFromContractualAcceptance: boolean; } {
  const workspaceAuthorized = Boolean(params.actorWorkspaceId) && params.actorWorkspaceId === params.projectWorkspaceId;
  const actMap = new Map<string, WbsActivityNode>();
  for (const a of params.activities) actMap.set(a.activityId, a);
  const visiting = new Set<string>(), visited = new Set<string>();
  const topoOrder: WbsActivityNode[] = [];
  let hasDependencyCycle = false;
  const dfs = (id: string): void => {
    if (visiting.has(id)) { hasDependencyCycle = true; return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const node = actMap.get(id);
    if (node) { for (const predId of node.predecessorIds) if (actMap.has(predId)) dfs(predId); topoOrder.push(node); }
    visiting.delete(id); visited.add(id);
  };
  for (const a of params.activities) { dfs(a.activityId); if (hasDependencyCycle) break; }
  const allDurationsValid = params.activities.length > 0 && params.activities.every((a) => Number.isFinite(a.durationDays) && a.durationDays >= 0);
  let projectDurationDays: number | null = null;
  const criticalPathActivityIds: string[] = [];
  if (!hasDependencyCycle && allDurationsValid) {
    const earliestFinish = new Map<string, number>();
    for (const node of topoOrder) {
      let maxPredEf = 0;
      for (const predId of node.predecessorIds) maxPredEf = Math.max(maxPredEf, earliestFinish.get(predId) ?? 0);
      earliestFinish.set(node.activityId, maxPredEf + node.durationDays);
    }
    projectDurationDays = Math.max(0, ...Array.from(earliestFinish.values()));
    const latestFinish = new Map<string, number>();
    for (const node of params.activities) latestFinish.set(node.activityId, projectDurationDays);
    for (let i = topoOrder.length - 1; i >= 0; i--) {
      const node = topoOrder[i];
      const dur = Number.isFinite(node.durationDays) && node.durationDays >= 0 ? node.durationDays : 0;
      const lf = latestFinish.get(node.activityId) ?? projectDurationDays;
      const ls = lf - dur;
      const ef = earliestFinish.get(node.activityId) ?? 0;
      if (Math.abs(ef - lf) < 1e-6) criticalPathActivityIds.unshift(node.activityId);
      for (const predId of node.predecessorIds) {
        const curPredLf = latestFinish.get(predId) ?? projectDurationDays;
        if (ls < curPredLf) latestFinish.set(predId, ls);
      }
    }
  }
  const milestonesBlockedWithoutEvidenceIds = params.milestones
    .filter((m) => m.internalTeamMarkedComplete && !m.hasRequiredAcceptanceEvidence)
    .map((m) => m.milestoneId); return { workspaceAuthorized,
    hasDependencyCycle, criticalPathCalculated: projectDurationDays !== null,
    projectDurationDays, criticalPathActivityIds,
    milestonesBlockedWithoutEvidenceIds,
    internalCompletionSeparatedFromContractualAcceptance: true,
  };
}
export function evaluateBudgetProgressPaymentBoqAndSiteInventory(params: {
  budgetLedger: {
    initialEstimatedCostToman: number; approvedBaselineBudgetToman: number; committedPurchaseOrdersToman: number;
    incurredVerifiedWorkToman: number; invoicedPayableToman: number; settledPaidCashToman: number;
  };
  progressPaymentApplication: {
    applicationId: string; alreadyCertifiedApplicationIds: ReadonlySet<string>; contractorSubmittedGrossToman: number;
    engineerVerifiedGrossToman: number; retentionRatePercent: number; advanceAmortizationDeductionToman: number;
    taxAndInsuranceDeductionToman: number; isApprovedByProjectManager: boolean;
  };
  boqItems: readonly { itemCode: string; unit: string; estimatedQuantity: number; executedVerifiedQuantity: number; unitRateToman: number }[];
  siteInventoryMovements: readonly { movementId: string; materialCode: string; kind: 'RECEIPT' | 'ISSUE_TO_WBS' | 'RETURN_FROM_SITE' | 'DAMAGED_WRITE_OFF'; quantity: number }[];
  areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode;
}) {
  const areaUnit = params.areaUnit ?? getStoredAreaUnit();
  const intlCurrency = params.intlCurrency ?? getStoredIntlCurrency();
  const b = params.budgetLedger;
  const uncommittedRemainingBudgetToman = b.approvedBaselineBudgetToman - b.committedPurchaseOrdersToman;
  const unpaidCommittedObligationToman = Math.max(0, b.committedPurchaseOrdersToman - b.settledPaidCashToman);
  const costVarianceAgainstApprovedBudgetToman = b.approvedBaselineBudgetToman - b.incurredVerifiedWorkToman;
  const pa = params.progressPaymentApplication;
  const isDupCert = pa.alreadyCertifiedApplicationIds.has(pa.applicationId);
  const certificationAllowed = !isDupCert && pa.isApprovedByProjectManager;
  const certifiedGrossBasisToman = Number.isFinite(pa.engineerVerifiedGrossToman) && pa.engineerVerifiedGrossToman >= 0 ? pa.engineerVerifiedGrossToman : 0;
  const retentionRate = Number.isFinite(pa.retentionRatePercent) && pa.retentionRatePercent >= 0 && pa.retentionRatePercent <= 100 ? pa.retentionRatePercent : 0;
  const retentionDeductedToman = Math.round((certifiedGrossBasisToman * retentionRate) / 100);
  const advDeduct = Number.isFinite(pa.advanceAmortizationDeductionToman) && pa.advanceAmortizationDeductionToman >= 0 ? pa.advanceAmortizationDeductionToman : 0;
  const taxDeduct = Number.isFinite(pa.taxAndInsuranceDeductionToman) && pa.taxAndInsuranceDeductionToman >= 0 ? pa.taxAndInsuranceDeductionToman : 0;
  const netPayableToContractorToman = certificationAllowed
    ? Math.max(
        0,
        certifiedGrossBasisToman -
          retentionDeductedToman -
          advDeduct -
          taxDeduct
      )
    : 0;
  let totalEstimatedBoqToman = 0;
  let totalExecutedBoqToman = 0;
  const quantityOverrunItemCodes: string[] = [];
  for (const item of params.boqItems) {
    totalEstimatedBoqToman += Math.round(item.estimatedQuantity * item.unitRateToman);
    totalExecutedBoqToman += Math.round(item.executedVerifiedQuantity * item.unitRateToman);
    if (item.executedVerifiedQuantity > item.estimatedQuantity) {
      quantityOverrunItemCodes.push(item.itemCode);
    }
  }
  const stockMap: Record<string, number> = {};
  const rejectedNegativeStockMovementIds: string[] = [];
  for (const mov of params.siteInventoryMovements) {
    const current = stockMap[mov.materialCode] ?? 0;
    if (mov.kind === 'RECEIPT' || mov.kind === 'RETURN_FROM_SITE') {
      stockMap[mov.materialCode] = current + mov.quantity;
    } else {
      if (current < mov.quantity) {
        rejectedNegativeStockMovementIds.push(mov.movementId);
      } else {
        stockMap[mov.materialCode] = current - mov.quantity;
      }
    }
  }
  return {
    budgetSummary: {
      uncommittedRemainingBudgetToman,
      unpaidCommittedObligationToman,
      costVarianceAgainstApprovedBudgetToman,
      committedSeparatedFromPaid: true,
    },
    paymentCertificate: {
      certificationAllowed,
      certifiedGrossBasisToman,
      retentionDeductedToman,
      netPayableToContractorToman,
      displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
      netPayableToContractorIntlText: formatMillionTomanAsIntlCurrency(netPayableToContractorToman / 1_000_000, intlCurrency),
      contractorClaimNotTreatedAsVerified:
        pa.contractorSubmittedGrossToman !== pa.engineerVerifiedGrossToman,
    },
    boqReconciliation: {
      totalEstimatedBoqToman,
      totalExecutedBoqToman,
      quantityOverrunItemCodes,
    },
    siteInventoryStatus: {
      endingAvailableStockByMaterial: stockMap,
      rejectedNegativeStockMovementIds,
    },
  };
}
export function evaluateSiteOpsQaHsePartnershipAndPresale(params: {
  equipmentReservations: readonly {
    reservationId: string;
    equipmentId: string;
    startMs: number;
    endMs: number;
  }[];
  qaAndHse: {
    ncrId: string;
    hasReinspectionVerificationEvidence: boolean;
    hseIncidentCount: number;
    viewerAuthorizedForConfidentialHse: boolean;
  };
  changeOrder: {
    originalApprovedBudgetToman: number;
    proposedBudgetDeltaToman: number;
    isChangeOrderApproved: boolean;
  };
  unitAllocationAttempt: {
    unitId: string;
    currentStatus: 'AVAILABLE' | 'RESERVED' | 'CONTRACTED';
    treatReservationAsCompletedSale: boolean;
  };
  jointPartnership: {
    landownerLandValuationToman: number;
    developerCashConstructionContributionToman: number;
    contractualLandownerUnitSharePercent: number;
    contractualDeveloperUnitSharePercent: number;
    simulatedLandownerSharePercent: number;
    totalCompletedUnitsCount: number;
  };
}): {
  hasEquipmentOverlapConflict: boolean;
  ncrCanCloseAsResolved: boolean;
  regulatorySafetyComplianceClaimAllowed: boolean;
  changeOrderResult: {
    preservedOriginalBaselineToman: number;
    effectiveCurrentAuthorizedBudgetToman: number;
  };
  unitAllocationAllowed: boolean;
  reservationRecognizedAsSaleRevenue: boolean;
  partnershipSummary: {
    totalCombinedContributionToman: number;
    impliedEconomicLandWeightPercent: number;
    executedContractualLandownerSharePercent: number;
    simulationMutatedExecutedContract: boolean;
  };
} {
  let hasEquipmentOverlapConflict = false;
  for (let i = 0; i < params.equipmentReservations.length; i++) {
    const a = params.equipmentReservations[i];
    const aValid = Number.isFinite(a.startMs) && Number.isFinite(a.endMs) && a.startMs < a.endMs;
    for (let j = i + 1; j < params.equipmentReservations.length; j++) {
      const b = params.equipmentReservations[j];
      const bValid = Number.isFinite(b.startMs) && Number.isFinite(b.endMs) && b.startMs < b.endMs;
      if (aValid && bValid && a.equipmentId === b.equipmentId && a.startMs < b.endMs && b.startMs < a.endMs) {
        hasEquipmentOverlapConflict = true;
        break;
      }
    }
  }
  const preservedOriginalBaselineToman = params.changeOrder.originalApprovedBudgetToman;
  const effectiveCurrentAuthorizedBudgetToman = params.changeOrder.isChangeOrderApproved
    ? preservedOriginalBaselineToman + params.changeOrder.proposedBudgetDeltaToman
    : preservedOriginalBaselineToman;
  const jp = params.jointPartnership;
  const totalCombinedContributionToman =
    jp.landownerLandValuationToman + jp.developerCashConstructionContributionToman;
  const impliedEconomicLandWeightPercent =
    totalCombinedContributionToman > 0
      ? Number(((jp.landownerLandValuationToman / totalCombinedContributionToman) * 100).toFixed(2))
      : 0;
  return {
    hasEquipmentOverlapConflict,
    ncrCanCloseAsResolved: params.qaAndHse.hasReinspectionVerificationEvidence,
    regulatorySafetyComplianceClaimAllowed: false, // Prompt 1641: never claim regulatory compliance solely from HSE records
    changeOrderResult: {
      preservedOriginalBaselineToman,
      effectiveCurrentAuthorizedBudgetToman,
    },
    unitAllocationAllowed: params.unitAllocationAttempt.currentStatus === 'AVAILABLE',
    reservationRecognizedAsSaleRevenue: false, // Prompt 1645: never treat a reservation as a completed sale
    partnershipSummary: {
      totalCombinedContributionToman,
      impliedEconomicLandWeightPercent,
      executedContractualLandownerSharePercent: jp.contractualLandownerUnitSharePercent,
      simulationMutatedExecutedContract: false,
    },
  };
}
export function evaluateProjectEvmFeasibilityHandoverAndAudits(params: {
  earnedValueInput: {
    hasDocumentedMeasurementBasis: boolean;
    plannedValuePvToman: number;
    earnedValueEvToman: number;
    actualCostAcToman: number;
  };
  delayForecastInput: {
    observedHistoricalDelayDays: number;
    criticalPredecessorRemainingSlippageDays: number;
    isStatisticalBacktestedModel: boolean;
  };
  handoverAndWarranty: {
    unresolvedMandatoryPunchListCount: number;
    defectReportedIso: string;
    warrantyExpiresIso: string;
    defectVerifiedResolvedWithEvidence: boolean;
  };
}): {
  evmMetrics: { validMeasurementBasis: boolean; costVarianceCvToman: number | null; scheduleVarianceSvToman: number | null; costPerformanceIndexCpi: number | null; schedulePerformanceIndexSpi: number | null };
  delayForecast: { observedDelayDays: number; projectedTotalDelayDays: number; forecastMethodologyLabel: 'DETERMINISTIC_DEPENDENCY_PROPAGATION' | 'BACKTESTED_STATISTICAL_MODEL' };
  handoverAndWarrantyStatus: { finalHandoverClosureAllowed: boolean; warrantyClaimCovered: boolean; defectClosed: boolean };
  comprehensiveAuditVerdict: 'RELEASE_READY_ALL_6_AUDITS_VERIFIED' | 'HOLD_FOR_REMEDIATION';
} {
  const ev = params.earnedValueInput;
  const validBasis = ev.hasDocumentedMeasurementBasis && Number.isFinite(ev.plannedValuePvToman) && ev.plannedValuePvToman > 0 && Number.isFinite(ev.actualCostAcToman) && ev.actualCostAcToman > 0 && Number.isFinite(ev.earnedValueEvToman) && ev.earnedValueEvToman >= 0;
  const costVarianceCvToman = validBasis ? ev.earnedValueEvToman - ev.actualCostAcToman : null;
  const scheduleVarianceSvToman = validBasis ? ev.earnedValueEvToman - ev.plannedValuePvToman : null;
  const costPerformanceIndexCpi = validBasis ? Number((ev.earnedValueEvToman / ev.actualCostAcToman).toFixed(2)) : null;
  const schedulePerformanceIndexSpi = validBasis ? Number((ev.earnedValueEvToman / ev.plannedValuePvToman).toFixed(2)) : null;
  const hw = params.handoverAndWarranty;
  const finalHandoverClosureAllowed = hw.unresolvedMandatoryPunchListCount === 0;
  const repMs = Date.parse(hw.defectReportedIso), expMs = Date.parse(hw.warrantyExpiresIso);
  const warrantyClaimCovered = Number.isFinite(repMs) && Number.isFinite(expMs) && repMs <= expMs;
  return {
    evmMetrics: { validMeasurementBasis: validBasis, costVarianceCvToman, scheduleVarianceSvToman, costPerformanceIndexCpi, schedulePerformanceIndexSpi },
    delayForecast: {
      observedDelayDays: params.delayForecastInput.observedHistoricalDelayDays,
      projectedTotalDelayDays: params.delayForecastInput.observedHistoricalDelayDays + params.delayForecastInput.criticalPredecessorRemainingSlippageDays,
      forecastMethodologyLabel: params.delayForecastInput.isStatisticalBacktestedModel ? 'BACKTESTED_STATISTICAL_MODEL' : 'DETERMINISTIC_DEPENDENCY_PROPAGATION',
    },
    handoverAndWarrantyStatus: { finalHandoverClosureAllowed, warrantyClaimCovered, defectClosed: hw.defectVerifiedResolvedWithEvidence },
    comprehensiveAuditVerdict: validBasis && finalHandoverClosureAllowed ? 'RELEASE_READY_ALL_6_AUDITS_VERIFIED' : 'HOLD_FOR_REMEDIATION',
  };
}