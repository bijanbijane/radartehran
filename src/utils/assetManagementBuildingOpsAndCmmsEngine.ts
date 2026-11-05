import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type AssetLifecycleStage = 'ACQUISITION' | 'ACTIVATION' | 'OPERATION' | 'REFURBISHMENT' | 'DISPOSAL' | 'RETIREMENT'; export interface ManagedRealEstateAsset { assetId: string; workspaceId: string; assetCode: string; titleFa: string; hierarchyType: 'STANDALONE_PROPERTY' | 'BUILDING' | 'UNIT' | 'PORTFOLIO_GROUP'; parentAssetId: string | null; legalOwnerId: string; operationalResponsibilityHolderId: string; lifecycleStage: AssetLifecycleStage; revisionHistory: Array<{ changedAtIso: string; fromStage: AssetLifecycleStage | null; toStage: AssetLifecycleStage; actorId: string }>; }
const VALID_ASSET_TRANSITIONS: Record<AssetLifecycleStage, AssetLifecycleStage[]> = { ACQUISITION: ['ACTIVATION', 'DISPOSAL'], ACTIVATION: ['OPERATION', 'REFURBISHMENT'], OPERATION: ['REFURBISHMENT', 'DISPOSAL', 'RETIREMENT'], REFURBISHMENT: ['OPERATION', 'DISPOSAL', 'RETIREMENT'], DISPOSAL: ['RETIREMENT'], RETIREMENT: [], }; export function createAndTransitionManagedAsset(params: { assetId: string; workspaceId: string; assetCode: string; titleFa: string; hierarchyType: ManagedRealEstateAsset['hierarchyType']; parentAssetId?: string | null; legalOwnerId: string; operationalResponsibilityHolderId: string; initialStage?: AssetLifecycleStage; requestedNextStage?: AssetLifecycleStage; actorId: string; actorWorkspaceId: string; nowIso: string; }) { if (params.workspaceId !== params.actorWorkspaceId) return { allowed: false as const, errorCode: 'CROSS_WORKSPACE_ACCESS_DENIED' as const }; const initial = params.initialStage ?? 'ACQUISITION'; let currentStage = initial; const history: ManagedRealEstateAsset['revisionHistory'] = [{ changedAtIso: params.nowIso, fromStage: null, toStage: initial, actorId: params.actorId }];
  if (params.requestedNextStage && params.requestedNextStage !== initial) { const allowedNext = VALID_ASSET_TRANSITIONS[initial] || []; if (!allowedNext.includes(params.requestedNextStage)) return { allowed: false as const, errorCode: 'INVALID_ASSET_LIFECYCLE_TRANSITION' as const }; currentStage = params.requestedNextStage; history.push({ changedAtIso: params.nowIso, fromStage: initial, toStage: currentStage, actorId: params.actorId }); }
  const asset: ManagedRealEstateAsset = { assetId: params.assetId, workspaceId: params.workspaceId, assetCode: params.assetCode, titleFa: params.titleFa, hierarchyType: params.hierarchyType, parentAssetId: params.parentAssetId ?? null, legalOwnerId: params.legalOwnerId, operationalResponsibilityHolderId: params.operationalResponsibilityHolderId, lifecycleStage: currentStage, revisionHistory: history, }; return { allowed: true as const, asset, legalAndOperationalSeparated: params.legalOwnerId !== params.operationalResponsibilityHolderId }; }
export function buildTechnicalBuildingProfile(params: { buildingId: string; constructionYearJalali: number; structuralSystem: 'STEEL_MOMENT_FRAME' | 'RC_SHEAR_WALL' | 'MASONRY' | 'HYBRID'; floorsAboveGround: number; basementsCount: number; commonAreas: string[]; technicalRooms: string[]; hasOfficialStructuralCertificateDocument: boolean; reviewerEngineerId?: string | null; updatedAtIso: string; }) { const isVerifiedEngineering =
    params.hasOfficialStructuralCertificateDocument && Boolean(params.reviewerEngineerId); return { buildingId: params.buildingId, constructionYearJalali: params.constructionYearJalali, structuralSystem: params.structuralSystem, floorsAboveGround: params.floorsAboveGround,
    basementsCount: params.basementsCount, commonAreas: params.commonAreas, technicalRooms: params.technicalRooms, verificationStatus: isVerifiedEngineering ? ('CERTIFIED_ENGINEERING_VERIFIED' as const) : ('USER_PROVIDED_UNVERIFIED' as const), structuralSafetyCertified: isVerifiedEngineering, safetyDisclaimerFa: isVerifiedEngineering
      ? 'مستندات فنی توسط مهندس ناظر و گواهی رسمی تایید شده است.'
      : 'مشخصات فنی صرفاً اظهار کاربر است و به منزله تاییدیه ایمنی سازه‌ای نیست.', updatedAtIso: params.updatedAtIso, }; }
export function registerAndReplaceBuildingEquipment(params: { existingRegistry: Array<{ equipmentId: string; buildingId: string; category: 'ELEVATOR' | 'BOOSTER_PUMP' | 'GENERATOR' | 'HVAC_CHILLER' | 'FIRE_ALARM' | 'ELECTRICAL_PANEL';
    serialNumber: string; equipmentOwnerId: string; serviceResponsiblePartyId: string; warrantyExpiresIso: string; status: 'ACTIVE' | 'REPLACED_HISTORICAL' | 'DECOMMISSIONED'; replacedByEquipmentId?: string | null; }>;
  newEquipment: { equipmentId: string; buildingId: string; category: 'ELEVATOR' | 'BOOSTER_PUMP' | 'GENERATOR' | 'HVAC_CHILLER' | 'FIRE_ALARM' | 'ELECTRICAL_PANEL'; serialNumber: string; equipmentOwnerId: string; serviceResponsiblePartyId: string; warrantyExpiresIso: string; replacesEquipmentId?: string | null; }; nowIso: string; }) {
  const normalizedSerial = params.newEquipment.serialNumber.trim().toUpperCase(); const duplicate = params.existingRegistry.find(
    (e) => e.serialNumber.trim().toUpperCase() === normalizedSerial && e.status === 'ACTIVE' ); if (duplicate) { return { registered: false as const, errorCode: 'DUPLICATE_EQUIPMENT_SERIAL' as const, registry: params.existingRegistry };
  }
  const nextRegistry = params.existingRegistry.map((item) =>
    params.newEquipment.replacesEquipmentId && item.equipmentId === params.newEquipment.replacesEquipmentId
      ? { ...item, status: 'REPLACED_HISTORICAL' as const, replacedByEquipmentId: params.newEquipment.equipmentId }
      : item );
  const warrantyExpired = Date.parse(params.newEquipment.warrantyExpiresIso) < Date.parse(params.nowIso); nextRegistry.push({
    equipmentId: params.newEquipment.equipmentId, buildingId: params.newEquipment.buildingId, category: params.newEquipment.category, serialNumber: normalizedSerial,
    equipmentOwnerId: params.newEquipment.equipmentOwnerId, serviceResponsiblePartyId: params.newEquipment.serviceResponsiblePartyId,
    warrantyExpiresIso: params.newEquipment.warrantyExpiresIso, status: 'ACTIVE', replacedByEquipmentId: null,
  });
  return {
    registered: true as const,
    warrantyExpired,
    historicalCountPreserved: nextRegistry.filter((e) => e.status === 'REPLACED_HISTORICAL').length,
    registry: nextRegistry,
  };
}
export function calculateAssetAccountingDepreciation(params: {
  assetId: string; accountingPolicyVersion: string; totalAcquisitionCostToman: number; nonDepreciableLandAllocationToman: number;
  capitalizedImprovementsToman: number; residualSalvageValueToman: number; usefulLifeMonths: number; elapsedServiceMonths: number;
  currentPeriodMonths: number; method: 'STRAIGHT_LINE' | 'DECLINING_BALANCE_DOUBLE'; currentMarketValuationToman: number;
  alreadyPostedPeriodKeys: ReadonlySet<string>; periodKey: string; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode;
}) {
  const areaUnit = params.areaUnit ?? getStoredAreaUnit();
  const intlCurrency = params.intlCurrency ?? getStoredIntlCurrency();
  const depreciableBase = Math.max(
    0,
    params.totalAcquisitionCostToman - params.nonDepreciableLandAllocationToman + params.capitalizedImprovementsToman - params.residualSalvageValueToman
  );
  const safeLife = Math.max(1, params.usefulLifeMonths);
  const monthlyStraightLine = depreciableBase / safeLife;
  let periodDepreciation = 0;
  let accumulatedPrior = 0;
  if (params.method === 'STRAIGHT_LINE') {
    accumulatedPrior = Math.min(depreciableBase, Math.round(monthlyStraightLine * params.elapsedServiceMonths));
    const remainingDepreciable = Math.max(0, depreciableBase - accumulatedPrior);
    periodDepreciation = Math.min(remainingDepreciable, Math.round(monthlyStraightLine * params.currentPeriodMonths));
  } else {
    const monthlyRate = 2 / safeLife;
    const grossDepreciableComponent =
      params.totalAcquisitionCostToman - params.nonDepreciableLandAllocationToman + params.capitalizedImprovementsToman;
    const bookBefore = grossDepreciableComponent * Math.pow(1 - monthlyRate, params.elapsedServiceMonths);
    const bookAfter = Math.max(params.residualSalvageValueToman, bookBefore * Math.pow(1 - monthlyRate, params.currentPeriodMonths));
    accumulatedPrior = Math.max(0, Math.round(grossDepreciableComponent - bookBefore));
    periodDepreciation = Math.max(0, Math.round(bookBefore - bookAfter));
  }
  const totalAccumulatedDepreciationToman = accumulatedPrior + periodDepreciation;
  const accountingCarryingValueToman = params.totalAcquisitionCostToman + params.capitalizedImprovementsToman - totalAccumulatedDepreciationToman;
  const isDuplicatePosting = params.alreadyPostedPeriodKeys.has(params.periodKey);
  return {
    assetId: params.assetId,
    accountingPolicyVersion: params.accountingPolicyVersion,
    nonDepreciableLandAllocationToman: params.nonDepreciableLandAllocationToman,
    depreciableBuildingBaseToman: depreciableBase,
    periodDepreciationToman: periodDepreciation,
    totalAccumulatedDepreciationToman,
    accountingCarryingValueToman,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    accountingCarryingValueIntlText: formatMillionTomanAsIntlCurrency(accountingCarryingValueToman / 1_000_000, intlCurrency),
    currentMarketValuationToman: params.currentMarketValuationToman,
    marketVsCarryingSpreadToman: params.currentMarketValuationToman - accountingCarryingValueToman,
    journalPostingStatus: isDuplicatePosting
      ? ('SKIPPED_DUPLICATE_PERIOD_ENTRY' as const)
      : ('READY_FOR_LEDGER_POSTING' as const),
  };
}
export function evaluateBuildingOperatorAssignment(params: {
  buildingId: string;
  existingAssignments: Array<{
    assignmentId: string;
    buildingId: string;
    operatorUserId: string;
    role: 'BUILDING_OPERATOR' | 'FACILITY_MANAGER' | 'SERVICE_CONTRACTOR';
    effectiveFromIso: string;
    effectiveToIso: string;
  }>;
  proposedAssignment: {
    buildingId: string;
    operatorUserId: string;
    role: 'BUILDING_OPERATOR' | 'FACILITY_MANAGER' | 'SERVICE_CONTRACTOR';
    effectiveFromIso: string;
    effectiveToIso: string;
  };
  targetActionBuildingId: string;
}) {
  const propStart = Date.parse(params.proposedAssignment.effectiveFromIso);
  const propEnd = Date.parse(params.proposedAssignment.effectiveToIso);
  const hasOverlap = params.existingAssignments.some((a) => {
    if (a.buildingId !== params.proposedAssignment.buildingId || a.role !== params.proposedAssignment.role) return false;
    return propStart < Date.parse(a.effectiveToIso) && propEnd > Date.parse(a.effectiveFromIso);
  });
  return {
    hasRoleOverlapConflict: hasOverlap,
    authorizedForTargetBuilding: params.proposedAssignment.buildingId === params.targetActionBuildingId,
    systemWideAccessGranted: false as const,
  };
}
export function allocateBuildingServiceCharges(params: {
  buildingId: string;
  billingPeriodKey: string;
  allocationRuleVersion: string;
  allocationMethod: 'AREA_SQM' | 'OWNERSHIP_SHARE' | 'EQUAL_FIXED' | 'VACANT_DISCOUNTED_AREA';
  approvedBudgetToman: number;
  actualOperatingExpenseToman: number;
  alreadyIssuedPeriodKeys: ReadonlySet<string>;
  units: Array<{
    unitId: string;
    areaSqm: number;
    ownershipSharePercent: number;
    isVacant: boolean;
    collectedPaymentToman: number;
  }>;
}) {
  const duplicateKey = `${params.buildingId}:${params.billingPeriodKey}:${params.allocationMethod}`;
  if (params.alreadyIssuedPeriodKeys.has(duplicateKey)) {
    return { status: 'DUPLICATE_BILLING_PERIOD_BLOCKED' as const, unitCharges: [], reconciliationDeltaToman: 0 };
  }
  const weights = params.units.map((u) => {
    if (params.allocationMethod === 'AREA_SQM') return Math.max(1, u.areaSqm);
    if (params.allocationMethod === 'OWNERSHIP_SHARE') return Math.max(0.01, u.ownershipSharePercent);
    if (params.allocationMethod === 'VACANT_DISCOUNTED_AREA') return Math.max(1, u.areaSqm) * (u.isVacant ? 0.5 : 1.0);
    return 1;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  let runningAllocated = 0;
  const unitCharges = params.units.map((u, idx) => {
    const isLast = idx === params.units.length - 1;
    const allocatedChargeToman = isLast
      ? params.actualOperatingExpenseToman - runningAllocated
      : Math.round((params.actualOperatingExpenseToman * weights[idx]) / totalWeight);
    runningAllocated += allocatedChargeToman;
    const outstandingReceivableToman = Math.max(0, allocatedChargeToman - u.collectedPaymentToman);
    return {
      unitId: u.unitId,
      isVacant: u.isVacant,
      allocatedChargeToman,
      collectedPaymentToman: u.collectedPaymentToman,
      outstandingReceivableToman,
      paymentStatus:
        u.collectedPaymentToman >= allocatedChargeToman
          ? ('PAID_CONFIRMED' as const)
          : u.collectedPaymentToman > 0
          ? ('PARTIALLY_PAID' as const)
          : ('ISSUED_UNPAID' as const),
    };
  });
  const totalAllocatedToman = unitCharges.reduce((s, u) => s + u.allocatedChargeToman, 0);
  const totalCollectedToman = unitCharges.reduce((s, u) => s + u.collectedPaymentToman, 0);
  return {
    status: 'ISSUED_AND_RECONCILED' as const,
    allocationRuleVersion: params.allocationRuleVersion,
    approvedBudgetToman: params.approvedBudgetToman,
    actualOperatingExpenseToman: params.actualOperatingExpenseToman,
    totalAllocatedToman,
    totalCollectedToman,
    totalOutstandingReceivablesToman: totalAllocatedToman - totalCollectedToman,
    reconciliationDeltaToman: params.actualOperatingExpenseToman - totalAllocatedToman,
    unitCharges,
  };
}
export function validateMeterAndAllocateUtilityCosts(params: {
  buildingMasterConsumptionUnits: number | null;
  tariffPerUnitToman: number;
  fixedBaseFeePerUnitToman: number;
  missingReadingPolicy: 'FLAG_UNBILLED_PENDING_READING' | 'EXPLICIT_HISTORICAL_AVERAGE_ESTIMATE';
  unitMeters: Array<{
    unitId: string;
    meterSerial: string;
    previousReading: number;
    currentReading: number | null;
    historicalAverageConsumption?: number;
    isMeterRollover?: boolean;
    maxDialValue?: number;
  }>;
}) {
  let totalSubmeterConsumption = 0;
  const unitAllocations = params.unitMeters.map((m) => {
    if (m.currentReading === null || !Number.isFinite(m.currentReading)) {
      if (params.missingReadingPolicy === 'EXPLICIT_HISTORICAL_AVERAGE_ESTIMATE' && m.historicalAverageConsumption) {
        const est = m.historicalAverageConsumption;
        totalSubmeterConsumption += est;
        return {
          unitId: m.unitId,
          consumptionUnits: est,
          measurementType: 'ESTIMATED_BY_EXPLICIT_POLICY' as const,
          anomalyFlag: 'MISSING_CURRENT_READING' as const,
          chargeToman: Math.round(est * params.tariffPerUnitToman + params.fixedBaseFeePerUnitToman),
        };
      }
      return {
        unitId: m.unitId,
        consumptionUnits: null,
        measurementType: 'UNAVAILABLE_MISSING_READING' as const,
        anomalyFlag: 'MISSING_CURRENT_READING' as const,
        chargeToman: null,
      };
    }
    let delta = m.currentReading - m.previousReading;
    if (delta < 0 && m.isMeterRollover && m.maxDialValue) {
      delta = m.maxDialValue - m.previousReading + m.currentReading;
    }
    if (delta < 0) {
      return {
        unitId: m.unitId,
        consumptionUnits: null,
        measurementType: 'REJECTED_INVALID_SEQUENCE' as const,
        anomalyFlag: 'NEGATIVE_CONSUMPTION_DELTA' as const,
        chargeToman: null,
      };
    }
    totalSubmeterConsumption += delta;
    return {
      unitId: m.unitId,
      consumptionUnits: delta,
      measurementType: 'MEASURED_CONSECUTIVE_READINGS' as const,
      anomalyFlag: delta > 5000 ? ('IMPLAUSIBLE_SPIKE_WARNING' as const) : ('NONE' as const),
      chargeToman: Math.round(delta * params.tariffPerUnitToman + params.fixedBaseFeePerUnitToman),
    };
  });
  const masterVsSubmeterUnexplainedDelta =
    params.buildingMasterConsumptionUnits !== null
      ? Number((params.buildingMasterConsumptionUnits - totalSubmeterConsumption).toFixed(2))
      : null;
  return { totalSubmeterConsumption, masterVsSubmeterUnexplainedDelta, unitAllocations };
}
export function evaluateTenantServiceCmmsAndReliability(params: {
  viewerRole: 'TENANT' | 'BUILDING_STAFF';
  viewerTenantId: string;
  authorizedTenantIdForUnit: string;
  ticket: {
    ticketId: string;
    unitId: string;
    tenantVisibleMessages: string[];
    internalStaffNotes: string[];
  };
  workOrderCompletionAttempt: {
    workOrderId: string;
    hasBeforePhotoEvidence: boolean;
    hasAfterPhotoEvidence: boolean;
    inspectorVerified: boolean;
  };
  equipmentReliabilityInput: {
    equipmentId: string;
    verifiedOperatingHours: number | null;
    failureCount: number;
    totalDowntimeHours: number;
  };
}) {
  const tenantAuthorizedForUnit =
    params.viewerRole === 'BUILDING_STAFF' || params.viewerTenantId === params.authorizedTenantIdForUnit;
  const sanitizedTicketView = !tenantAuthorizedForUnit
    ? null
    : { ticketId: params.ticket.ticketId, unitId: params.ticket.unitId, tenantVisibleMessages: params.ticket.tenantVisibleMessages, internalStaffNotes: params.viewerRole === 'BUILDING_STAFF' ? params.ticket.internalStaffNotes : [], }; const canMarkWorkOrderCompleted =
    params.workOrderCompletionAttempt.hasBeforePhotoEvidence &&
    params.workOrderCompletionAttempt.hasAfterPhotoEvidence &&
    params.workOrderCompletionAttempt.inspectorVerified; const rel = params.equipmentReliabilityInput; const hasValidOperatingBasis =
    rel.verifiedOperatingHours !== null && Number.isFinite(rel.verifiedOperatingHours) && rel.verifiedOperatingHours > 0; const mtbfHours =
    hasValidOperatingBasis && rel.failureCount > 0
      ? Number(((rel.verifiedOperatingHours! - rel.totalDowntimeHours) / rel.failureCount).toFixed(1))
      : null; return { tenantAuthorizedForUnit, sanitizedTicketView, workOrderCompletionAllowed: canMarkWorkOrderCompleted, workOrderStatusReason: canMarkWorkOrderCompleted
      ? ('EVIDENCE_AND_INSPECTION_VERIFIED' as const)
      : ('BLOCKED_MISSING_COMPLETION_EVIDENCE' as const), reliabilityReport: { equipmentId: rel.equipmentId, failureCount: rel.failureCount, totalDowntimeHours: rel.totalDowntimeHours, mtbfHours, mtbfBasisStatus: hasValidOperatingBasis
        ? ('OBSERVED_VERIFIED_OPERATING_TIME' as const)
        : ('INSUFFICIENT_OPERATING_TIME_BASIS' as const), }, }; }