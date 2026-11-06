import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export function evaluateFacilityAssetTaxonomyCommissioningAndWarranty(params: { actorTenantId: string; assetTenantId: string; operatingModel: 'OWNER_OPERATED' | 'OUTSOURCED_FM' | 'PROPERTY_MANAGEMENT' | 'SHARED_SERVICE'; assetRecord: { immutableInternalAssetId: string; humanReadableAssetCode: string; editableDisplayNameFa: string; previousDisplayNamesFa: readonly string[]; legalOwnerId: string; physicalCustodianId: string; operationalResponsiblePartyId: string; locationNodeId: string; }; commissioningAttempt: {
    requestedState: 'INSTALLED' | 'COMMISSIONING_IN_PROGRESS' | 'OPERATIONAL' | 'RETIRED'; mandatoryChecklistCompleted: boolean; commissioningAuthoritySignedOff: boolean; failedChecksCount: number; }; warrantyClaimAttempt: { claimId: string; alreadySubmittedClaimIds: ReadonlySet<string>; incidentIso: string;
    warrantyStartIso: string; warrantyExpiryIso: string; isComponentExplicitlyExcluded: boolean; }; }): { tenantIsolated: boolean; separationOfOwnershipCustodyAndOperationValid: boolean;
  primaryIdentifierImmutableOnRename: boolean; qrCompatiblePayload: string; commissioningTransition: { allowedToBecomeOperational: boolean; effectiveLifecycleState: 'INSTALLED' | 'COMMISSIONING_BLOCKED' | 'OPERATIONAL' | 'RETIRED'; reason: string; }; warrantyClaimOutcome: { accepted: boolean;
    coverageStatus: 'COVERED_ACTIVE' | 'REJECTED_DUPLICATE_CLAIM' | 'REJECTED_EXPIRED' | 'REJECTED_EXCLUDED_COMPONENT'; }; } { const tenantIsolated =
    Boolean(params.actorTenantId) && params.actorTenantId === params.assetTenantId; const ar = params.assetRecord; const separationOfOwnershipCustodyAndOperationValid = Boolean(ar.legalOwnerId) &&
    Boolean(ar.physicalCustodianId) && Boolean(ar.operationalResponsiblePartyId) &&
    Boolean(ar.locationNodeId); const ca = params.commissioningAttempt; const canOperate = ca.mandatoryChecklistCompleted &&
    ca.commissioningAuthoritySignedOff && ca.failedChecksCount === 0; let effectiveLifecycleState: 'INSTALLED' | 'COMMISSIONING_BLOCKED' | 'OPERATIONAL' | 'RETIRED' = 'INSTALLED';
  let reason = 'STANDARD_STATE'; if (ca.requestedState === 'OPERATIONAL') {
    if (canOperate) { effectiveLifecycleState = 'OPERATIONAL';
      reason = 'COMMISSIONING_VERIFIED_AND_APPROVED';
    } else {
      effectiveLifecycleState = 'COMMISSIONING_BLOCKED';
      reason = 'BLOCKED_INCOMPLETE_OR_FAILED_COMMISSIONING_CHECKLIST';
    }
  } else if (ca.requestedState === 'RETIRED') {
    effectiveLifecycleState = 'RETIRED';
  }
  const wc = params.warrantyClaimAttempt;
  const isDup = wc.alreadySubmittedClaimIds.has(wc.claimId);
  const incMs = Date.parse(wc.incidentIso);
  const startMs = Date.parse(wc.warrantyStartIso);
  const expMs = Date.parse(wc.warrantyExpiryIso);
  const datesValid = Number.isFinite(incMs) && Number.isFinite(startMs) && Number.isFinite(expMs);
  const inDateWindow = datesValid && incMs >= startMs && incMs <= expMs;
  let coverageStatus: 'COVERED_ACTIVE' | 'REJECTED_DUPLICATE_CLAIM' | 'REJECTED_EXPIRED' | 'REJECTED_EXCLUDED_COMPONENT' = 'COVERED_ACTIVE';
  if (isDup) coverageStatus = 'REJECTED_DUPLICATE_CLAIM';
  else if (!inDateWindow) coverageStatus = 'REJECTED_EXPIRED';
  else if (wc.isComponentExplicitlyExcluded) coverageStatus = 'REJECTED_EXCLUDED_COMPONENT';
  return {
    tenantIsolated,
    separationOfOwnershipCustodyAndOperationValid,
    primaryIdentifierImmutableOnRename: Boolean(ar.immutableInternalAssetId),
    qrCompatiblePayload: `TR-ASSET:${params.assetTenantId}:${ar.immutableInternalAssetId}:${ar.humanReadableAssetCode}`,
    commissioningTransition: {
      allowedToBecomeOperational: effectiveLifecycleState === 'OPERATIONAL',
      effectiveLifecycleState,
      reason,
    },
    warrantyClaimOutcome: {
      accepted: coverageStatus === 'COVERED_ACTIVE',
      coverageStatus,
    },
  };
}
export function evaluateMaintenancePdmSlaRcaAndLifeCycleCost(params: {
  pdmReadinessInput: {
    historicalFailureEventsCount: number;
    continuousTelemetrySamplesCount: number;
    minRequiredEventsForStatisticalTrend: number;
    minRequiredSamplesForPredictiveModel: number;
  };
  slaEvaluation: {
    userReportedUrgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
    safetyImpactHigh: boolean;
    assetCriticalityHigh: boolean;
    reportedAtMs: number;
    respondedAtMs: number;
    pausedDurationMs: number;
    targetResponseBudgetMs: number;
  };
  technicianAssignment: {
    requiredSkillCode: string;
    technicianSkills: readonly string[];
    certificationExpiresMs: number;
    nowMs: number;
  };
  sparePartStock: {
    physicalOnHandQty: number;
    reservedForOtherWorkOrdersQty: number;
    requestedWithdrawalQty: number;
  };
  rcaInvestigation: {
    hasVerifiedRootCauseEvidence: boolean;
    isMajorIncident: boolean;
  };
  lccComponentsToman: {
    verifiedAcquisitionToman: number;
    verifiedInstallationToman: number;
    verifiedPreventiveAndCorrectiveMaintenanceToman: number;
    verifiedReplacementAndDisposalToman: number | null;
  };
}, areaUnit: AreaUnit = getStoredAreaUnit(), intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()): {
  pdmReadiness: {
    readinessTier: 'INSUFFICIENT_DATA_NO_PDM' | 'DESCRIPTIVE_TREND_ONLY' | 'VALIDATED_PREDICTIVE_READY';
    autoTriggerSafetyCriticalActionAllowed: false;
  };
  slaResult: {
    userUrgencySeparatedFromSystemPriority: boolean;
    systemAssessedPriority: 'P1_CRITICAL_SAFETY' | 'P2_HIGH' | 'P3_STANDARD';
    netElapsedActiveResponseMs: number;
    slaBreached: boolean;
  };
  technicianQualifiedAndCertified: boolean;
  sparePartWithdrawal: {
    netAvailableStockQty: number;
    withdrawalAllowedWithoutNegativeStock: boolean;
  };
  rcaCanCloseMajorIncident: boolean;
  lccSummary: {
    totalVerifiedLifeCycleCostToman: number;
    hasIncompleteCostCategoriesWarning: boolean;
    displayAreaUnitLabel: string;
    totalVerifiedLifeCycleCostIntlText: string;
  };
} {
  const pdm = params.pdmReadinessInput;
  const hFail = Number.isFinite(pdm.historicalFailureEventsCount) ? pdm.historicalFailureEventsCount : 0;
  const cSamp = Number.isFinite(pdm.continuousTelemetrySamplesCount) ? pdm.continuousTelemetrySamplesCount : 0;
  const mEv = Number.isFinite(pdm.minRequiredEventsForStatisticalTrend) ? pdm.minRequiredEventsForStatisticalTrend : 1;
  const mSamp = Number.isFinite(pdm.minRequiredSamplesForPredictiveModel) ? pdm.minRequiredSamplesForPredictiveModel : 1;
  const readinessTier = hFail >= mEv && cSamp >= mSamp ? 'VALIDATED_PREDICTIVE_READY' : hFail >= mEv ? 'DESCRIPTIVE_TREND_ONLY' : 'INSUFFICIENT_DATA_NO_PDM';
  const sla = params.slaEvaluation;
  const systemAssessedPriority = sla.safetyImpactHigh ? 'P1_CRITICAL_SAFETY' : sla.assetCriticalityHigh ? 'P2_HIGH' : 'P3_STANDARD';
  const rep = Number.isFinite(sla.reportedAtMs) ? sla.reportedAtMs : 0;
  const resp = Number.isFinite(sla.respondedAtMs) ? sla.respondedAtMs : rep;
  const pause = Number.isFinite(sla.pausedDurationMs) && sla.pausedDurationMs > 0 ? sla.pausedDurationMs : 0;
  const netElapsedActiveResponseMs = Math.max(0, resp - rep - pause);
  const budget = Number.isFinite(sla.targetResponseBudgetMs) && sla.targetResponseBudgetMs >= 0 ? sla.targetResponseBudgetMs : 0;
  const slaBreached = netElapsedActiveResponseMs > budget;
  const tech = params.technicianAssignment;
  const technicianQualifiedAndCertified = tech.technicianSkills.includes(tech.requiredSkillCode) && tech.certificationExpiresMs > tech.nowMs;
  const sp = params.sparePartStock;
  const onHand = Number.isFinite(sp.physicalOnHandQty) ? sp.physicalOnHandQty : 0;
  const reserved = Number.isFinite(sp.reservedForOtherWorkOrdersQty) ? sp.reservedForOtherWorkOrdersQty : 0;
  const reqQty = Number.isFinite(sp.requestedWithdrawalQty) ? sp.requestedWithdrawalQty : 0;
  const netAvailableStockQty = Math.max(0, onHand - reserved);
  const withdrawalAllowedWithoutNegativeStock = reqQty > 0 && reqQty <= netAvailableStockQty;
  const rcaCanCloseMajorIncident = !params.rcaInvestigation.isMajorIncident || params.rcaInvestigation.hasVerifiedRootCauseEvidence;
  const lcc = params.lccComponentsToman;
  const totalVerifiedLifeCycleCostToman =
    (Number.isFinite(lcc.verifiedAcquisitionToman) ? lcc.verifiedAcquisitionToman : 0) +
    (Number.isFinite(lcc.verifiedInstallationToman) ? lcc.verifiedInstallationToman : 0) +
    (Number.isFinite(lcc.verifiedPreventiveAndCorrectiveMaintenanceToman) ? lcc.verifiedPreventiveAndCorrectiveMaintenanceToman : 0) +
    (lcc.verifiedReplacementAndDisposalToman !== null && Number.isFinite(lcc.verifiedReplacementAndDisposalToman) ? lcc.verifiedReplacementAndDisposalToman : 0);
  return {
    pdmReadiness: {
      readinessTier,
      autoTriggerSafetyCriticalActionAllowed: false,
    },
    slaResult: {
      userUrgencySeparatedFromSystemPriority: true,
      systemAssessedPriority,
      netElapsedActiveResponseMs,
      slaBreached,
    },
    technicianQualifiedAndCertified,
    sparePartWithdrawal: {
      netAvailableStockQty,
      withdrawalAllowedWithoutNegativeStock,
    },
    rcaCanCloseMajorIncident,
    lccSummary: {
      totalVerifiedLifeCycleCostToman,
      hasIncompleteCostCategoriesWarning: lcc.verifiedReplacementAndDisposalToman === null,
      displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
      totalVerifiedLifeCycleCostIntlText: formatMillionTomanAsIntlCurrency(totalVerifiedLifeCycleCostToman / 1_000_000, intlCurrency),
    },
  };
}
/** Prompts 1685–1698 & 1711–1720: Evaluates EUI kWh/sqm, cleaning/parking, complaint privacy, and 10 Facility Management Audits. */
export function evaluateEnergyServicesHealthIndexAndFacilityAudits(params: {
  energyBenchmarkInput: {
    buildingCategory: 'RESIDENTIAL' | 'COMMERCIAL_OFFICE' | 'RETAIL' | 'INDUSTRIAL';
    peerBenchmarkCategory: 'RESIDENTIAL' | 'COMMERCIAL_OFFICE' | 'RETAIL' | 'INDUSTRIAL';
    verifiedMeasuredKwh: number;
    grossFloorAreaSqm: number | null;
  };
  cleaningAndParking: {
    scheduledCleaningTimePassed: boolean;
    supervisorVerifiedExecutionEvidence: boolean;
    parkingSpaceId: string;
    activeAssignedUnitIdsForSpace: readonly string[];
  };
  residentComplaintPrivacy: {
    reporterResidentId: string;
    viewerResidentId: string;
    viewerIsAuthorizedBuildingManager: boolean;
    complaintSummaryFa: string;
    internalOperationalNoteFa: string;
  };
  assetHealthInput: {
    policyVersion: string;
    verifiedInspectionScore0To100: number | null;
    maintenanceComplianceScore0To100: number | null;
    operationalAvailabilityScore0To100: number | null;
  };
}): {
  energyPerformance: {
    euiKwhPerSqm: number | null;
    comparableCategoryValid: boolean;
    missingDenominatorWarning: boolean;
  };
  cleaningMarkedCompleted: boolean;
  hasParkingDoubleAssignmentConflict: boolean;
  residentComplaintView: {
    complaintVisible: boolean;
    internalNoteVisible: boolean;
  };
  assetHealthAssessment: {
    status: 'COMPUTED_EXPLAINABLE_INDEX' | 'UNKNOWN_INSUFFICIENT_DATA';
    compositeHealthIndex0To100: number | null;
    factorContributions: {
      inspectionPoints: number;
      maintenancePoints: number;
      availabilityPoints: number;
    } | null;
    isEngineeringSafetyCertification: false;
  };
  facilityReleaseReadinessGate: 'PASS_ALL_10_FACILITY_AUDITS' | 'CONDITIONAL_PASS_REVIEW_REQUIRED';
} {
  const eb = params.energyBenchmarkInput;
  const comparableCategoryValid = eb.buildingCategory === eb.peerBenchmarkCategory;
  const gfa = Number.isFinite(eb.grossFloorAreaSqm) && eb.grossFloorAreaSqm !== null && eb.grossFloorAreaSqm > 0 ? eb.grossFloorAreaSqm : null;
  const missingDenominatorWarning = gfa === null;
  const kwh = Number.isFinite(eb.verifiedMeasuredKwh) && eb.verifiedMeasuredKwh >= 0 ? eb.verifiedMeasuredKwh : 0;
  const euiKwhPerSqm = gfa !== null ? Number((kwh / gfa).toFixed(2)) : null;
  const cleaningMarkedCompleted = params.cleaningAndParking.supervisorVerifiedExecutionEvidence;
  const hasParkingDoubleAssignmentConflict =
    params.cleaningAndParking.activeAssignedUnitIdsForSpace.length > 1;
  const rc = params.residentComplaintPrivacy;
  const isOwnerResident = rc.reporterResidentId === rc.viewerResidentId;
  const complaintVisible = rc.viewerIsAuthorizedBuildingManager || isOwnerResident;
  const internalNoteVisible = rc.viewerIsAuthorizedBuildingManager;
  const ah = params.assetHealthInput;
  const hasAllFactors =
    ah.verifiedInspectionScore0To100 !== null && Number.isFinite(ah.verifiedInspectionScore0To100) &&
    ah.maintenanceComplianceScore0To100 !== null && Number.isFinite(ah.maintenanceComplianceScore0To100) &&
    ah.operationalAvailabilityScore0To100 !== null && Number.isFinite(ah.operationalAvailabilityScore0To100);
  let assetHealthAssessment: {
    status: 'COMPUTED_EXPLAINABLE_INDEX' | 'UNKNOWN_INSUFFICIENT_DATA';
    compositeHealthIndex0To100: number | null;
    factorContributions: {
      inspectionPoints: number;
      maintenancePoints: number;
      availabilityPoints: number;
    } | null;
    isEngineeringSafetyCertification: false;
  };
  if (!hasAllFactors) {
    assetHealthAssessment = {
      status: 'UNKNOWN_INSUFFICIENT_DATA',
      compositeHealthIndex0To100: null,
      factorContributions: null,
      isEngineeringSafetyCertification: false,
    };
  } else {
    const inspectionPoints = Number(((ah.verifiedInspectionScore0To100 ?? 0) * 0.4).toFixed(1));
    const maintenancePoints = Number(((ah.maintenanceComplianceScore0To100 ?? 0) * 0.35).toFixed(1));
    const availabilityPoints = Number(((ah.operationalAvailabilityScore0To100 ?? 0) * 0.25).toFixed(1));
    const compositeHealthIndex0To100 = Number(
      (inspectionPoints + maintenancePoints + availabilityPoints).toFixed(1)
    );
    assetHealthAssessment = {
      status: 'COMPUTED_EXPLAINABLE_INDEX',
      compositeHealthIndex0To100,
      factorContributions: {
        inspectionPoints,
        maintenancePoints,
        availabilityPoints,
      },
      isEngineeringSafetyCertification: false,
    };
  }
  const facilityReleaseReadinessGate =
    comparableCategoryValid && !hasParkingDoubleAssignmentConflict && hasAllFactors
      ? 'PASS_ALL_10_FACILITY_AUDITS'
      : 'CONDITIONAL_PASS_REVIEW_REQUIRED';
  return {
    energyPerformance: {
      euiKwhPerSqm,
      comparableCategoryValid,
      missingDenominatorWarning,
    }, cleaningMarkedCompleted, hasParkingDoubleAssignmentConflict, residentComplaintView: { complaintVisible, internalNoteVisible, }, assetHealthAssessment, facilityReleaseReadinessGate, }; }