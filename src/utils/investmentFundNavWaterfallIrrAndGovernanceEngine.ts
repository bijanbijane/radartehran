import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export function evaluateInvestmentOwnershipAndCircularGuard(params: { edges: Array<{ parentEntityId: string; childTargetId: string; ownershipSharePercent: number; interestType: 'REGISTERED_LEGAL_DEED' | 'INDIRECT_VEHICLE_UNITS' | 'CONTRACTUAL_PARTICIPATION'; verifiedDocumentRef: string | null; }>; rootInvestorId: string; targetPropertyId: string; }) { const sumByTarget = new Map<string, number>(); for (const e of params.edges) { sumByTarget.set(e.childTargetId, (sumByTarget.get(e.childTargetId) ?? 0) + e.ownershipSharePercent); } const overAllocatedTargets = Array.from(sumByTarget.entries()).filter(([, total]) => total > 100.0001).map(([id]) => id); const adj = new Map<string, Array<{ to: string; share: number }>>(); for (const e of params.edges) { const list = adj.get(e.parentEntityId) ?? []; list.push({ to: e.childTargetId, share: e.ownershipSharePercent / 100 }); adj.set(e.parentEntityId, list); }
  let hasCircularOwnership = false; const visiting = new Set<string>(); const visited = new Set<string>(); const dfsCycle = (node: string) => { if (visiting.has(node)) { hasCircularOwnership = true; return; } if (visited.has(node)) return; visiting.add(node); for (const next of adj.get(node) ?? []) dfsCycle(next.to); visiting.delete(node); visited.add(node); };
  for (const node of adj.keys()) dfsCycle(node); let effectiveEconomicSharePercent = 0; if (!hasCircularOwnership) { const computePathShare = (current: string, currentFactor: number, pathSet: Set<string>) => { if (current === params.targetPropertyId) { effectiveEconomicSharePercent += currentFactor * 100; return; }
      for (const next of adj.get(current) ?? []) { if (!pathSet.has(next.to)) { const nextSet = new Set(pathSet); nextSet.add(next.to); computePathShare(next.to, currentFactor * next.share, nextSet); } }
    }; computePathShare(params.rootInvestorId, 1, new Set([params.rootInvestorId])); }
  return { hasCircularOwnership, overAllocatedTargets, isValidStructure: !hasCircularOwnership && overAllocatedTargets.length === 0, effectiveEconomicSharePercent: Number(effectiveEconomicSharePercent.toFixed(4)), }; }
export function reconcileInvestorCapitalCallsAndContributions(params: { investorId: string; totalCommittedCapitalToman: number; capitalCalls: Array<{ callId: string; calledAmountToman: number; receivedCashToman: number; dueDateIso: string }>; nowIso: string; }) { const seenCallIds = new Set<string>();
  let duplicateCallIdsDetected = false; let totalCalledToman = 0; let totalReceivedCashToman = 0; let overdueCallsCount = 0;
  for (const c of params.capitalCalls) { if (seenCallIds.has(c.callId)) { duplicateCallIdsDetected = true; continue; }
    seenCallIds.add(c.callId); totalCalledToman += c.calledAmountToman; totalReceivedCashToman += c.receivedCashToman;
    if (c.calledAmountToman - c.receivedCashToman > 0 && Date.parse(c.dueDateIso) < Date.parse(params.nowIso)) overdueCallsCount += 1;
  }
  return {
    investorId: params.investorId, duplicateCallIdsDetected,
    totalCommittedCapitalToman: params.totalCommittedCapitalToman, totalCalledToman, totalReceivedCashToman,
    uncalledRemainingCommitmentToman: Math.max(0, params.totalCommittedCapitalToman - totalCalledToman),
    outstandingCalledUnpaidToman: Math.max(0, totalCalledToman - totalReceivedCashToman),
    overpaidContributionToman: Math.max(0, totalReceivedCashToman - totalCalledToman),
    overdueCallsCount,
  };
}
export function calculateFundNavAndUnitValuation(params: {
  vehicleId: string; valuationEffectiveDateIso: string; maxValuationAgeDays: number;
  cashAndEligibleReceivablesToman: number; accruedLiabilitiesAndDebtToman: number; outstandingUnitsCount: number;
  holdings: Array<{
    assetId: string; valuationAmountToman: number; ownershipSharePercent: number; valuationDateIso: string;
    evidenceSource: 'INDEPENDENT_CERTIFIED_APPRAISAL' | 'INTERNAL_MANAGEMENT_ESTIMATE' | 'ASKING_PRICE_UNVERIFIED';
  }>;
  areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode;
}) {
  const areaUnit = params.areaUnit ?? getStoredAreaUnit();
  const intlCurrency = params.intlCurrency ?? getStoredIntlCurrency();
  const effMs = Date.parse(params.valuationEffectiveDateIso);
  let grossPropertyHoldingsValueToman = 0;
  let staleHoldingsCount = 0;
  let unverifiedHoldingsCount = 0;
  for (const h of params.holdings) {
    const share = Math.max(0, Math.min(100, h.ownershipSharePercent)) / 100;
    grossPropertyHoldingsValueToman += Math.round(h.valuationAmountToman * share);
    const ageDays = (effMs - Date.parse(h.valuationDateIso)) / (1000 * 3600 * 24);
    if (ageDays > params.maxValuationAgeDays) staleHoldingsCount += 1;
    if (h.evidenceSource !== 'INDEPENDENT_CERTIFIED_APPRAISAL') unverifiedHoldingsCount += 1;
  }
  const grossAssetValueGavToman = grossPropertyHoldingsValueToman + params.cashAndEligibleReceivablesToman;
  const netAssetValueNavToman = grossAssetValueGavToman - params.accruedLiabilitiesAndDebtToman;
  const navPerUnitToman = params.outstandingUnitsCount > 0 ? Number((netAssetValueNavToman / params.outstandingUnitsCount).toFixed(2)) : null;
  return {
    vehicleId: params.vehicleId,
    valuationEffectiveDateIso: params.valuationEffectiveDateIso,
    grossPropertyHoldingsValueToman,
    grossAssetValueGavToman,
    accruedLiabilitiesAndDebtToman: params.accruedLiabilitiesAndDebtToman,
    netAssetValueNavToman,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    netAssetValueNavIntlText: formatMillionTomanAsIntlCurrency(netAssetValueNavToman / 1_000_000, intlCurrency),
    outstandingUnitsCount: params.outstandingUnitsCount,
    navPerUnitToman,
    staleHoldingsCount,
    unverifiedHoldingsCount,
    navQualityStatus:
      staleHoldingsCount === 0 && unverifiedHoldingsCount === 0
        ? ('AUDITED_INDEPENDENT_APPRAISAL_BASIS' as const)
        : ('ESTIMATED_OR_STALE_HOLDINGS_PRESENT' as const),
    regulatoryDisclaimerFa:
      'مدل‌سازی ساختار صندوق و NAV صرفاً تحلیلی و قراردادی است و به منزله مجوز نهاد ناظر بازار سرمایه نیست.',
  };
}
export function calculateDistributionWaterfallAndFees(params: {
  policyVersion: string; accountingProfitToman: number; realizedDistributableCashToman: number;
  unreturnedCapitalContributionsToman: number; preferredReturnHurdleAmountToman: number;
  managementFeePercentAnnual: number; feeBasisToman: number; performanceCarryPercentAboveHurdle: number;
  highWaterMarkNavPerUnit: number; currentNavPerUnit: number; createdByUserId: string; approvedByUserId: string;
}) {
  const sodPassed = Boolean(
    params.createdByUserId &&
      params.approvedByUserId &&
      params.createdByUserId !== params.approvedByUserId
  );
  const availableCashPool = Math.max(0, params.realizedDistributableCashToman);
  const accruedManagementFeeToman = Math.round(
    params.feeBasisToman * (Math.max(0, params.managementFeePercentAnnual) / 100)
  );
  let remainingCash = Math.max(0, availableCashPool - accruedManagementFeeToman);
  const returnOfCapitalAllocatedToman = Math.min(
    remainingCash,
    params.unreturnedCapitalContributionsToman
  );
  remainingCash -= returnOfCapitalAllocatedToman;
  const preferredReturnAllocatedToman = Math.min(
    remainingCash,
    params.preferredReturnHurdleAmountToman
  );
  remainingCash -= preferredReturnAllocatedToman;
  const isAboveHighWaterMark = params.currentNavPerUnit > params.highWaterMarkNavPerUnit;
  const performanceFeeAllocatedToman = isAboveHighWaterMark
    ? Math.round(remainingCash * (Math.max(0, params.performanceCarryPercentAboveHurdle) / 100))
    : 0;
  const residualLpDistributionToman = remainingCash - performanceFeeAllocatedToman;
  return {
    policyVersion: params.policyVersion,
    sodPassed,
    approvalStatus: sodPassed ? ('APPROVED_SOD_VERIFIED' as const) : ('BLOCKED_SELF_APPROVAL_SOD' as const),
    accountingProfitToman: params.accountingProfitToman,
    realizedDistributableCashToman: availableCashPool,
    accruedManagementFeeToman,
    returnOfCapitalAllocatedToman,
    preferredReturnAllocatedToman,
    performanceFeeAllocatedToman,
    residualLpDistributionToman,
    totalAllocatedToInvestorsToman:
      returnOfCapitalAllocatedToman + preferredReturnAllocatedToman + residualLpDistributionToman,
  };
}
export function calculateSafePeriodicIrrAndPerformance(params: {
  cashFlowsToman: number[]; // e.g. [-10000, 1200, 1500, 11800]
  isProjectedScenario: boolean;
}) {
  const flows = params.cashFlowsToman.filter((v) => Number.isFinite(v) && Math.abs(v) > 1e-6);
  let signChanges = 0;
  for (let i = 1; i < flows.length; i++) {
    if ((flows[i - 1] < 0 && flows[i] > 0) || (flows[i - 1] > 0 && flows[i] < 0)) {
      signChanges += 1;
    }
  }
  if (signChanges === 0) {
    return {
      status: 'NO_VALID_IRR_SIGN_CHANGE' as const,
      periodicIrrPercent: null,
      signChangesCount: 0,
      performanceNature: params.isProjectedScenario ? ('PROJECTED_SCENARIO' as const) : ('REALIZED_ACTUAL' as const),
    };
  }
  if (signChanges > 1) {
    return {
      status: 'MULTIPLE_IRR_ROOTS_AMBIGUOUS' as const,
      periodicIrrPercent: null,
      signChangesCount: signChanges,
      performanceNature: params.isProjectedScenario ? ('PROJECTED_SCENARIO' as const) : ('REALIZED_ACTUAL' as const),
    };
  }
  const npvAt = (rate: number): number => {
    let sum = 0;
    for (let t = 0; t < params.cashFlowsToman.length; t++) {
      sum += params.cashFlowsToman[t] / Math.pow(1 + rate, t);
    }
    return sum;
  };
  let low = -0.95;
  let high = 5.0;
  let fLow = npvAt(low);
  let fHigh = npvAt(high);
  if (fLow * fHigh > 0) {
    return {
      status: 'NON_CONVERGENT_OUT_OF_BOUNDS' as const,
      periodicIrrPercent: null,
      signChangesCount: signChanges,
      performanceNature: params.isProjectedScenario ? ('PROJECTED_SCENARIO' as const) : ('REALIZED_ACTUAL' as const),
    };
  }
  let mid = 0;
  for (let iter = 0; iter < 80; iter++) {
    mid = (low + high) / 2;
    const fMid = npvAt(mid);
    if (Math.abs(fMid) < 1e-7) break;
    if (fLow * fMid <= 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return {
    status: 'CONVERGED_UNIQUE_ROOT' as const,
    periodicIrrPercent: Number((mid * 100).toFixed(2)),
    signChangesCount: 1,
    performanceNature: params.isProjectedScenario ? ('PROJECTED_SCENARIO' as const) : ('REALIZED_ACTUAL' as const),
  };
}
export function evaluatePortfolioLiquidityDebtGovernanceAndVdr(params: {
  unrestrictedCashBalanceToman: number;
  committedRestrictedCashToman: number;
  illiquidPropertyMarketValueToman: number;
  nearTermObligationsDueToman: number;
  debtFacility: {
    committedFacilityLimitToman: number;
    drawnPrincipalBalanceToman: number;
    accruedInterestToman: number;
    maxAllowedLtvPercent: number;
  };
  governanceVote: {
    requiredThresholdPercent: number;
    relatedPartyCounterpartyIds: ReadonlySet<string>;
    transactionCounterpartyId: string;
    votes: Array<{
      partnerId: string;
      votingWeightPercent: number;
      choice: 'APPROVE' | 'REJECT' | 'ABSTAIN';
      isConflictedWithCounterparty: boolean;
    }>;
  };
  vdrAccessAttempt: {
    documentId: string;
    documentPortfolioId: string;
    viewerPortfolioId: string;
    grantExpiresIso: string;
    isGrantRevoked: boolean;
    nowIso: string;
  };
}) {
  const immediatelyAvailableLiquidCashToman = Math.max(
    0,
    params.unrestrictedCashBalanceToman - params.committedRestrictedCashToman
  );
  const liquidityCoverageShortfallToman = Math.max(
    0,
    params.nearTermObligationsDueToman - immediatelyAvailableLiquidCashToman
  );
  const undrawnCreditFacilityToman = Math.max(
    0,
    params.debtFacility.committedFacilityLimitToman - params.debtFacility.drawnPrincipalBalanceToman
  );
  const currentLtvPercent =
    params.illiquidPropertyMarketValueToman > 0
      ? Number(
          (
            (params.debtFacility.drawnPrincipalBalanceToman /
              params.illiquidPropertyMarketValueToman) *
            100
          ).toFixed(2)
        )
      : 0;
  const ltvCovenantBreached = currentLtvPercent > params.debtFacility.maxAllowedLtvPercent;
  const isRelatedPartyTransaction = params.governanceVote.relatedPartyCounterpartyIds.has(
    params.governanceVote.transactionCounterpartyId
  );
  let eligiblePoolWeight = 0;
  let eligibleApproveWeight = 0;
  let recusedConflictedVotersCount = 0;
  for (const v of params.governanceVote.votes) {
    if (v.isConflictedWithCounterparty) {
      recusedConflictedVotersCount += 1;
      continue; // Conflicted partner is automatically recused from approving related-party deal
    }
    eligiblePoolWeight += v.votingWeightPercent;
    if (v.choice === 'APPROVE') eligibleApproveWeight += v.votingWeightPercent;
  }
  const effectiveApprovalSharePercent =
    eligiblePoolWeight > 0
      ? Number(((eligibleApproveWeight / eligiblePoolWeight) * 100).toFixed(2))
      : 0;
  const resolutionPassed =
    eligiblePoolWeight > 0 &&
    effectiveApprovalSharePercent >= params.governanceVote.requiredThresholdPercent;
  const vdr = params.vdrAccessAttempt;
  const isExpiredGrant = Date.parse(vdr.grantExpiresIso) < Date.parse(vdr.nowIso);
  const vdrAccessAllowed =
    !vdr.isGrantRevoked &&
    !isExpiredGrant &&
    vdr.documentPortfolioId === vdr.viewerPortfolioId;
  return {
    liquidityReport: {
      immediatelyAvailableLiquidCashToman,
      illiquidPropertyExcludedFromCashToman: params.illiquidPropertyMarketValueToman,
      liquidityCoverageShortfallToman,
    },
    debtReport: {
      drawnPrincipalBalanceToman: params.debtFacility.drawnPrincipalBalanceToman,
      undrawnCreditFacilityToman,
      currentLtvPercent,
      ltvCovenantBreached,
    },
    governanceAndConflictReport: {
      isRelatedPartyTransaction,
      recusedConflictedVotersCount, effectiveApprovalSharePercent, resolutionPassed, }, vdrAccessReport: { documentId: vdr.documentId, accessAllowed: vdrAccessAllowed, denialReason: vdrAccessAllowed
        ? null
        : vdr.isGrantRevoked
        ? ('GRANT_REVOKED' as const)
        : isExpiredGrant
        ? ('GRANT_EXPIRED' as const)
        : ('CROSS_PORTFOLIO_ISOLATION_BLOCKED' as const), }, }; }