import { calculateHedonicValuation, FAST_SALE_FACTOR, } from './hedonicPricingEngine'; import { MULTI_CITY_CONFIGS, type CityId } from './multiCityData'; import type { Neighborhood } from './neighborhoods'; import { isValidCityId } from '../types/models'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit'; import { buildExternalDivarUrl, sanitizeInput } from '../utils/security'; export interface MultiCityIsolationResolution { validCity: boolean; resolvedCityId: CityId | null; silentFallbackToTehranUsed: false; matchedNeighborhood: Neighborhood | null; scopedCacheKey: string | null; scopedExternalDivarUrl: string | null; rejectionReason: string | null; }
export function auditMultiCityMarketIsolationAndResolveHood(input: { rawCityParam: unknown; hoodId: number; mode: 'buy' | 'rent'; }): MultiCityIsolationResolution {
  if (typeof input.rawCityParam !== 'string' || !isValidCityId(input.rawCityParam.trim().toLowerCase())) { return { validCity: false, resolvedCityId: null, silentFallbackToTehranUsed: false, matchedNeighborhood: null, scopedCacheKey: null, scopedExternalDivarUrl: null,
      rejectionReason: `REJECTED_UNSUPPORTED_OR_MISSING_CITY:${String(input.rawCityParam ?? '')}`,
    }; }
  const cityId = input.rawCityParam.trim().toLowerCase() as CityId; const cityConfig = MULTI_CITY_CONFIGS[cityId]; const matched = cityConfig.neighborhoods.find((h) => h.id === input.hoodId) ?? null; if (!matched) { return { validCity: true, resolvedCityId: cityId, silentFallbackToTehranUsed: false,
      matchedNeighborhood: null, scopedCacheKey: null, scopedExternalDivarUrl: null,
      rejectionReason: `HOOD_ID_${input.hoodId}_DOES_NOT_BELONG_TO_CITY_${cityId.toUpperCase()}`,
    }; }
  return { validCity: true, resolvedCityId: cityId, silentFallbackToTehranUsed: false, matchedNeighborhood: matched,
    scopedCacheKey: `city:${cityId}:mode:${input.mode}:hood:${matched.id}`,
    scopedExternalDivarUrl: buildExternalDivarUrl(cityId, input.mode, matched.name), rejectionReason: null, }; }
export const CANONICAL_RAHN_TO_MONTHLY_RENT_RATE = 0.03; // 3% monthly (30M rent per 1,000M Rahn)
export interface CalculatorParityAuditInput { neighborhood: Neighborhood; sqm: number; buildYear: number;
  floor: number; buyerBudgetMillion: number; rahnSharePercent: number; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode;
}
export interface CalculatorParityAuditReport { hedonicEstimatedTotalMillion: number; hedonicFastSaleTotalMillion: number;
  fastSaleParityVerified: boolean; scaledFullRahnMillion: number; splitRahnMillion: number; splitMonthlyRentMillion: number;
  rahnRentRoundTripReconciled: boolean; buyModeBudgetDiffMillion: number; statutoryCommissionPerSideMillion: number;
  allCalculatorsReconciled: boolean; displayAreaUnitLabel?: string; hedonicEstimatedTotalIntlText?: string;
}
export function verifyCalculatorSuiteFormulaParity(
  input: CalculatorParityAuditInput,
): CalculatorParityAuditReport {
  const hedonic = calculateHedonicValuation({
    neighborhood: input.neighborhood, sqm: input.sqm, buildYear: input.buildYear,
    renovationStatus: 'standard', floor: input.floor, hasElevator: true, hasParking: true, hasStorage: true,
  });
  const expectedFastSale = Math.round(hedonic.hedonicTotalMillion * FAST_SALE_FACTOR);
  const fastSaleParityVerified = hedonic.fastSaleTotalMillion === expectedFastSale;
  const scaledFullRahnMillion = Math.round(input.neighborhood.rahn80m * (input.sqm / 80));
  const clampedShare = Math.min(100, Math.max(0, input.rahnSharePercent)) / 100;
  const splitRahnMillion = Math.round(scaledFullRahnMillion * clampedShare);
  const remainingRahnToConvert = scaledFullRahnMillion - splitRahnMillion;
  const splitMonthlyRentMillion = Number(
    (remainingRahnToConvert * CANONICAL_RAHN_TO_MONTHLY_RENT_RATE).toFixed(2),
  );
  const reconstructedFullRahn = Math.round(
    splitRahnMillion + splitMonthlyRentMillion / CANONICAL_RAHN_TO_MONTHLY_RENT_RATE,
  );
  const rahnRentRoundTripReconciled = Math.abs(reconstructedFullRahn - scaledFullRahnMillion) <= 1;
  const buyModeBudgetDiffMillion = input.buyerBudgetMillion - hedonic.hedonicTotalMillion;
  const statutoryCommissionPerSideMillion = Number(
    (hedonic.hedonicTotalMillion * 0.005 * 1.1).toFixed(2),
  );
  const activeUnit = input.areaUnit ?? getStoredAreaUnit();
  const activeCurrency = input.intlCurrency ?? getStoredIntlCurrency();
  return {
    hedonicEstimatedTotalMillion: hedonic.hedonicTotalMillion,
    hedonicFastSaleTotalMillion: hedonic.fastSaleTotalMillion,
    fastSaleParityVerified,
    scaledFullRahnMillion,
    splitRahnMillion,
    splitMonthlyRentMillion,
    rahnRentRoundTripReconciled,
    buyModeBudgetDiffMillion,
    statutoryCommissionPerSideMillion,
    allCalculatorsReconciled: fastSaleParityVerified && rahnRentRoundTripReconciled,
    displayAreaUnitLabel: formatAreaUnitLabel(activeUnit),
    hedonicEstimatedTotalIntlText: formatMillionTomanAsIntlCurrency(hedonic.hedonicTotalMillion, activeCurrency),
  };
}
export interface PropertyPhysicalMeasurementInput {
  propertyCategory: 'residential_apartment' | 'villa' | 'commercial_office';
  netUsableUnitSqm: number | null;
  grossBuildingSqm?: number | null;
  landParcelSqm?: number | null;
  unitFloor: number;
  totalBuildingFloors: number;
  constructionYearJalali: number;
  renovationYearJalali?: number | null;
  areaProvenance: 'USER_ENTERED_UNVERIFIED' | 'DEED_VERIFIED_AREA';
}
export interface PropertyMeasurementSemanticAudit {
  validSemantics: boolean;
  authoritativeValuationSqm: number | null;
  legallyCertifiedDeedArea: boolean;
  violations: string[];
}
export function validatePropertyMeasurementSemantics(
  input: PropertyPhysicalMeasurementInput,
): PropertyMeasurementSemanticAudit {
  const violations: string[] = [];
  if (input.netUsableUnitSqm === null || !Number.isFinite(input.netUsableUnitSqm) || input.netUsableUnitSqm < 20) {
    violations.push('MISSING_OR_INVALID_NET_USABLE_UNIT_SQM');
  }
  if (
    typeof input.grossBuildingSqm === 'number' &&
    typeof input.netUsableUnitSqm === 'number' &&
    input.netUsableUnitSqm > input.grossBuildingSqm
  ) {
    violations.push('IMPOSSIBLE_NET_UNIT_AREA_EXCEEDS_GROSS_BUILDING_AREA');
  }
  if (
    input.propertyCategory === 'residential_apartment' &&
    typeof input.landParcelSqm === 'number' &&
    input.netUsableUnitSqm === input.landParcelSqm &&
    input.landParcelSqm > 350
  ) {
    violations.push('CONFLATED_LAND_PARCEL_AREA_WITH_APARTMENT_UNIT_AREA');
  }
  if (input.unitFloor > input.totalBuildingFloors) {
    violations.push('IMPOSSIBLE_UNIT_FLOOR_EXCEEDS_TOTAL_BUILDING_FLOORS');
  }
  if (
    typeof input.renovationYearJalali === 'number' &&
    input.renovationYearJalali < input.constructionYearJalali
  ) {
    violations.push('IMPOSSIBLE_RENOVATION_YEAR_BEFORE_CONSTRUCTION_YEAR');
  }
  return {
    validSemantics: violations.length === 0,
    authoritativeValuationSqm: violations.length === 0 ? input.netUsableUnitSqm : null,
    legallyCertifiedDeedArea: input.areaProvenance === 'DEED_VERIFIED_AREA',
    violations,
  };
}
export type ComplaintCategory =
  | 'SUSPECTED_FRAUDULENT_LISTING'
  | 'INCORRECT_PROPERTY_INFORMATION'
  | 'ADVERTISER_CONTACT_DISPUTE'
  | 'PRIVACY_CONCERN'
  | 'CALCULATION_DISCREPANCY';
export type ComplaintStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'REOPENED';
export interface ComplaintCaseRecord {
  caseId: string;
  reporterUid: string;
  targetEntityId: string;
  subjectOwnerUid: string;
  category: ComplaintCategory;
  status: ComplaintStatus;
  assignedReviewerUid: string | null;
  internalReviewerNotes: string[];
  userVisibleResolutionFa: string | null;
  preservedTargetSnapshot: Record<string, unknown>;
}
export class DisputeAndComplaintResolutionWorkflow {
  private readonly casesById = new Map<string, ComplaintCaseRecord>();
  private readonly dedupeKeys = new Map<string, string>();
  submitComplaint(input: {
    caseId: string;
    reporterUid: string;
    targetEntityId: string;
    subjectOwnerUid: string;
    category: ComplaintCategory;
    targetSnapshot: Record<string, unknown>;
  }): { created: boolean; deduplicated: boolean; record: ComplaintCaseRecord } {
    const key = `${input.reporterUid}:${input.targetEntityId}:${input.category}`;
    const existingId = this.dedupeKeys.get(key);
    if (existingId) {
      return {
        created: false,
        deduplicated: true,
        record: this.casesById.get(existingId)!,
      };
    }
    const rec: ComplaintCaseRecord = {
      caseId: input.caseId,
      reporterUid: input.reporterUid,
      targetEntityId: input.targetEntityId,
      subjectOwnerUid: input.subjectOwnerUid,
      category: input.category,
      status: 'OPEN',
      assignedReviewerUid: null,
      internalReviewerNotes: [],
      userVisibleResolutionFa: null,
      preservedTargetSnapshot: { ...input.targetSnapshot },
    };
    this.casesById.set(rec.caseId, rec);
    this.dedupeKeys.set(key, rec.caseId);
    return { created: true, deduplicated: false, record: rec };
  }
  assignAndResolveCase(input: {
    caseId: string;
    reviewerUid: string;
    internalNote: string;
    userVisibleResolutionFa: string;
  }): {
    resolved: boolean;
    rejectionReason: string | null;
  } {
    const rec = this.casesById.get(input.caseId);
    if (!rec) return { resolved: false, rejectionReason: 'CASE_NOT_FOUND' };
    if (input.reviewerUid === rec.subjectOwnerUid || input.reviewerUid === rec.reporterUid) {
      return {
        resolved: false,
        rejectionReason: 'CONFLICT_OF_INTEREST_REVIEWER_IS_PARTY_TO_DISPUTE',
      };
    }
    if (!input.userVisibleResolutionFa || input.userVisibleResolutionFa.trim().length < 5) {
      return {
        resolved: false,
        rejectionReason: 'RESOLUTION_SUMMARY_REQUIRED',
      };
    }
    rec.assignedReviewerUid = input.reviewerUid;
    rec.internalReviewerNotes.push(sanitizeInput(input.internalNote, 300));
    rec.userVisibleResolutionFa = sanitizeInput(input.userVisibleResolutionFa, 300);
    rec.status = 'RESOLVED';
    return { resolved: true, rejectionReason: null };
  }
  getPublicViewForReporter(caseId: string, requesterUid: string): {
    authorized: boolean;
    caseId?: string;
    status?: ComplaintStatus;
    userVisibleResolutionFa?: string | null;
    internalNotesExposed: false;
  } {
    const rec = this.casesById.get(caseId);
    if (!rec || rec.reporterUid !== requesterUid) {
      return { authorized: false, internalNotesExposed: false };
    }
    return {
      authorized: true,
      caseId: rec.caseId,
      status: rec.status,
      userVisibleResolutionFa: rec.userVisibleResolutionFa,
      internalNotesExposed: false,
    };
  }
}
export interface ExternalDataSourceLicenseEntry {
  sourceId: string;
  providerName: string;
  licenseIdentifier: string;
  requiresVisibleAttribution: boolean;
  requiredAttributionText: string;
  bulkRawRedistributionPermitted: boolean;
}
export const EXTERNAL_DATA_SOURCE_LICENSING_REGISTRY: readonly ExternalDataSourceLicenseEntry[] = [
  {
    sourceId: 'osm-map-tiles',
    providerName: 'OpenStreetMap Contributors',
    licenseIdentifier: 'ODbL-1.0',
    requiresVisibleAttribution: true,
    requiredAttributionText: '© OpenStreetMap contributors',
    bulkRawRedistributionPermitted: false,
  },
  {
    sourceId: 'carto-dark-basemap',
    providerName: 'CARTO',
    licenseIdentifier: 'CC-BY-4.0 / CARTO Basemap ToS',
    requiresVisibleAttribution: true,
    requiredAttributionText: '© CARTO',
    bulkRawRedistributionPermitted: false,
  },
  {
    sourceId: 'vazirmatn-font',
    providerName: 'Saber Rastikerdar / Vazirmatn Project',
    licenseIdentifier: 'OFL-1.1',
    requiresVisibleAttribution: false,
    requiredAttributionText: 'Vazirmatn Font (OFL-1.1)',
    bulkRawRedistributionPermitted: true,
  },
] as const;
export function auditDataAttributionAndRedistributionCompliance(input: {
  renderedMapAttributionHtml: string;
  requestedExportSourceId: string;
  isBulkRawDatasetRedistribution: boolean;
}): {
  mapAttributionCompliant: boolean;
  missingAttributions: string[];
  exportPermittedByLicense: boolean;
  licenseRestrictionReason: string | null;
} {
  const missingAttributions: string[] = [];
  for (const src of EXTERNAL_DATA_SOURCE_LICENSING_REGISTRY) {
    if (
      src.requiresVisibleAttribution &&
      !input.renderedMapAttributionHtml.includes(src.requiredAttributionText)
    ) {
      missingAttributions.push(src.requiredAttributionText);
    }
  }
  const targetSource = EXTERNAL_DATA_SOURCE_LICENSING_REGISTRY.find(
    (s) => s.sourceId === input.requestedExportSourceId,
  );
  if (targetSource && input.isBulkRawDatasetRedistribution && !targetSource.bulkRawRedistributionPermitted) {
    return {
      mapAttributionCompliant: missingAttributions.length === 0, missingAttributions, exportPermittedByLicense: false,
      licenseRestrictionReason: `BULK_REDISTRIBUTION_PROHIBITED_BY_${targetSource.licenseIdentifier}`,
    }; } return { mapAttributionCompliant: missingAttributions.length === 0, missingAttributions, exportPermittedByLicense: true, licenseRestrictionReason: null, }; }