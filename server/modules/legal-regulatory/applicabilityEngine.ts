import { ProvinceId, SupportedCityId } from '../geography/types';
import {
  ApplicabilityOutcomeState,
  ApplicabilityRuleEvaluationResult,
  GeographicJurisdictionScope,
  PropertyRegulatoryEvaluationInput,
  RegulatoryApplicabilityRuleRecord,
  RegulatoryDocumentCategory,
  RegulatoryVerificationStatus,
  SourceReliabilityTier,
} from './types';

export function evaluateJurisdictionHierarchyMatch(
  ruleScope: GeographicJurisdictionScope,
  target: {
    countryCode?: 'IR';
    provinceId?: ProvinceId;
    cityId?: SupportedCityId;
    municipalityCode?: string;
    districtNumber?: number;
    neighborhoodId?: string;
    designatedZoneCode?: string;
  },
): { status: 'MATCH' | 'EXCLUDED' | 'MISSING_GEOGRAPHY_DATA'; reason: string } {
  if (target.countryCode && target.countryCode !== ruleScope.countryCode) {
    return { status: 'EXCLUDED', reason: `Country mismatch (${target.countryCode} !== ${ruleScope.countryCode}).` };
  }
  if (ruleScope.level === 'NATIONAL') {
    return { status: 'MATCH', reason: 'National statute/regulation applies across all IR jurisdictions.' };
  }
  if (ruleScope.provinceId) {
    if (!target.provinceId) {
      return {
        status: 'MISSING_GEOGRAPHY_DATA',
        reason: `Province ID is required to evaluate provincial/local scope (${ruleScope.provinceId}).`,
      };
    }
    if (target.provinceId !== ruleScope.provinceId) {
      return {
        status: 'EXCLUDED',
        reason: `Rule applies to province '${ruleScope.provinceId}', not '${target.provinceId}'.`,
      };
    }
  }
  if (ruleScope.level === 'PROVINCIAL') {
    return { status: 'MATCH', reason: `Matches province '${ruleScope.provinceId}'.` };
  }
  if (ruleScope.cityId) {
    if (!target.cityId) {
      return {
        status: 'MISSING_GEOGRAPHY_DATA',
        reason: `City ID is required to evaluate municipal scope (${ruleScope.cityId}).`,
      };
    }
    if (target.cityId !== ruleScope.cityId) {
      return {
        status: 'EXCLUDED',
        reason: `Rule applies to city '${ruleScope.cityId}', not '${target.cityId}'.`,
      };
    }
  }
  if (ruleScope.level === 'CITY' || ruleScope.level === 'MUNICIPALITY_REGION') {
    return { status: 'MATCH', reason: `Matches city/municipality '${ruleScope.cityId}'.` };
  }
  if (ruleScope.level === 'DISTRICT') {
    if (target.districtNumber === undefined) {
      return {
        status: 'MISSING_GEOGRAPHY_DATA',
        reason: `District number is required to evaluate District ${ruleScope.districtNumber} rule in '${ruleScope.cityId}'.`,
      };
    }
    if (target.districtNumber !== ruleScope.districtNumber) {
      return {
        status: 'EXCLUDED',
        reason: `Rule applies to District ${ruleScope.districtNumber}, not District ${target.districtNumber}.`,
      };
    }
    return { status: 'MATCH', reason: `Matches city '${ruleScope.cityId}' District ${ruleScope.districtNumber}.` };
  }
  if (ruleScope.level === 'NEIGHBORHOOD') {
    if (!target.neighborhoodId) {
      return {
        status: 'MISSING_GEOGRAPHY_DATA',
        reason: `Neighborhood ID is required to evaluate neighborhood-specific rule ('${ruleScope.neighborhoodId}').`,
      };
    }
    if (target.neighborhoodId !== ruleScope.neighborhoodId) {
      return {
        status: 'EXCLUDED',
        reason: `Rule applies to neighborhood '${ruleScope.neighborhoodId}', not '${target.neighborhoodId}'.`,
      };
    }
    return { status: 'MATCH', reason: `Matches neighborhood '${ruleScope.neighborhoodId}' in '${ruleScope.cityId}'.` };
  }
  if (ruleScope.level === 'DESIGNATED_ZONE') {
    if (!target.designatedZoneCode) {
      return {
        status: 'MISSING_GEOGRAPHY_DATA',
        reason: `designatedZoneCode is required to evaluate special zone '${ruleScope.designatedZoneCode}'.`,
      };
    }
    if (target.designatedZoneCode !== ruleScope.designatedZoneCode) {
      return {
        status: 'EXCLUDED',
        reason: `Rule applies to zone '${ruleScope.designatedZoneCode}', not '${target.designatedZoneCode}'.`,
      };
    }
    return { status: 'MATCH', reason: `Matches designated zone '${ruleScope.designatedZoneCode}'.` };
  }
  return { status: 'MISSING_GEOGRAPHY_DATA', reason: 'Unrecognized jurisdiction scope.' };
}

export function evaluateSingleApplicabilityRule(
  rule: RegulatoryApplicabilityRuleRecord,
  provisionCitationLabel: string,
  documentCategory: RegulatoryDocumentCategory,
  sourceReliabilityTier: SourceReliabilityTier,
  sourceVerificationStatus: RegulatoryVerificationStatus,
  provisionLifecycleStatus: string,
  provisionRepealedAtIso: string | null | undefined,
  input: PropertyRegulatoryEvaluationInput,
  asOfMs: number,
): ApplicabilityRuleEvaluationResult {
  const matchedReasons: string[] = [];
  const missingRequiredFields: string[] = [];
  const exclusionReasons: string[] = [];

  const ruleFromMs = Date.parse(rule.effectiveFromIso);
  const ruleToMs = rule.effectiveToIso ? Date.parse(rule.effectiveToIso) : Number.POSITIVE_INFINITY;
  const repealMs = provisionRepealedAtIso ? Date.parse(provisionRepealedAtIso) : Number.POSITIVE_INFINITY;

  const buildResult = (outcomeState: ApplicabilityOutcomeState): ApplicabilityRuleEvaluationResult => ({
    ruleId: rule.id,
    provisionId: rule.provisionId,
    sourceId: rule.sourceId,
    citationLabel: provisionCitationLabel,
    documentCategory,
    outcomeState,
    mandatoryClassification: rule.mandatoryClassification,
    restrictionOrObligationSummary: rule.restrictionOrObligationSummary,
    matchedReasons,
    missingRequiredFields,
    exclusionReasons,
    sourceVerificationStatus,
    sourceReliabilityTier,
  });

  if (asOfMs < ruleFromMs || asOfMs >= ruleToMs || asOfMs >= repealMs || provisionLifecycleStatus === 'REPEALED') {
    exclusionReasons.push('Rule or underlying provision is not in force on the evaluated asOfDate.');
    return buildResult('NOT_APPLICABLE_VERIFIED_EXCLUSION');
  }

  const geoEval = evaluateJurisdictionHierarchyMatch(rule.jurisdictionScope, {
    countryCode: input.countryCode ?? 'IR',
    provinceId: input.provinceId,
    cityId: input.cityId,
    municipalityCode: input.municipalityCode,
    districtNumber: input.districtNumber,
    neighborhoodId: input.neighborhoodId,
    designatedZoneCode: input.designatedZoneCode,
  });

  if (geoEval.status === 'EXCLUDED') {
    exclusionReasons.push(geoEval.reason);
    return buildResult('NOT_APPLICABLE_VERIFIED_EXCLUSION');
  }
  if (geoEval.status === 'MISSING_GEOGRAPHY_DATA') {
    missingRequiredFields.push(geoEval.reason);
    return buildResult('UNKNOWN_APPLICABILITY_MISSING_DATA');
  }

  matchedReasons.push(geoEval.reason);
  const cond = rule.conditions;

  if (cond.excludedPropertyCategories && input.propertyCategory) {
    if (cond.excludedPropertyCategories.includes(input.propertyCategory)) {
      exclusionReasons.push(`Property category '${input.propertyCategory}' is explicitly excluded.`);
    }
  }

  if (cond.requiredPropertyCategories?.length) {
    if (!input.propertyCategory) missingRequiredFields.push('propertyCategory');
    else if (!cond.requiredPropertyCategories.includes(input.propertyCategory)) {
      exclusionReasons.push(`Requires property category in [${cond.requiredPropertyCategories.join(', ')}].`);
    } else matchedReasons.push(`Matches propertyCategory '${input.propertyCategory}'.`);
  }

  if (cond.requiredLandUseCategories?.length) {
    if (!input.landUseCategory) missingRequiredFields.push('landUseCategory');
    else if (!cond.requiredLandUseCategories.includes(input.landUseCategory)) {
      exclusionReasons.push(`Requires landUseCategory in [${cond.requiredLandUseCategories.join(', ')}].`);
    } else matchedReasons.push(`Matches landUseCategory '${input.landUseCategory}'.`);
  }

  if (cond.requiredConstructionStages?.length) {
    if (!input.constructionStage) missingRequiredFields.push('constructionStage');
    else if (!cond.requiredConstructionStages.includes(input.constructionStage)) {
      exclusionReasons.push(`Requires constructionStage in [${cond.requiredConstructionStages.join(', ')}].`);
    } else matchedReasons.push(`Matches constructionStage '${input.constructionStage}'.`);
  }

  if (cond.requiredTransactionContexts?.length) {
    if (!input.transactionContext) missingRequiredFields.push('transactionContext');
    else if (!cond.requiredTransactionContexts.includes(input.transactionContext)) {
      exclusionReasons.push(`Requires transactionContext in [${cond.requiredTransactionContexts.join(', ')}].`);
    } else matchedReasons.push(`Matches transactionContext '${input.transactionContext}'.`);
  }

  if (cond.minFloors !== undefined) {
    if (input.floorsCount === undefined) missingRequiredFields.push('floorsCount');
    else if (input.floorsCount < cond.minFloors) {
      exclusionReasons.push(`Requires at least ${cond.minFloors} floors.`);
    } else matchedReasons.push(`Floors count (${input.floorsCount}) >= ${cond.minFloors}.`);
  }

  if (cond.maxFloors !== undefined) {
    if (input.floorsCount === undefined) {
      if (!missingRequiredFields.includes('floorsCount')) missingRequiredFields.push('floorsCount');
    } else if (input.floorsCount > cond.maxFloors) {
      exclusionReasons.push(`Requires at most ${cond.maxFloors} floors.`);
    } else matchedReasons.push(`Floors count (${input.floorsCount}) <= ${cond.maxFloors}.`);
  }

  if (cond.minPlotAreaSqm !== undefined) {
    if (input.plotAreaSqm === undefined) missingRequiredFields.push('plotAreaSqm');
    else if (input.plotAreaSqm < cond.minPlotAreaSqm) {
      exclusionReasons.push(`Requires plotAreaSqm >= ${cond.minPlotAreaSqm}.`);
    } else matchedReasons.push(`Plot area (${input.plotAreaSqm} sqm) >= ${cond.minPlotAreaSqm} sqm.`);
  }

  if (cond.requiresWornOutTextureBaftFarsoodeh !== undefined) {
    if (input.isWornOutTextureBaftFarsoodeh === undefined) {
      missingRequiredFields.push('isWornOutTextureBaftFarsoodeh');
    } else if (input.isWornOutTextureBaftFarsoodeh !== cond.requiresWornOutTextureBaftFarsoodeh) {
      exclusionReasons.push('Baft-e Farsoodeh condition did not match.');
    } else matchedReasons.push('Matches Baft-e Farsoodeh condition.');
  }

  if (cond.requiresFaultLineProximity !== undefined) {
    if (input.isNearActiveFaultLine === undefined) {
      missingRequiredFields.push('isNearActiveFaultLine');
    } else if (input.isNearActiveFaultLine !== cond.requiresFaultLineProximity) {
      exclusionReasons.push('Active fault line proximity condition did not match.');
    } else matchedReasons.push('Matches active fault line proximity condition.');
  }

  for (const reqField of cond.requiredContextFields ?? []) {
    if (input[reqField] === undefined && !missingRequiredFields.includes(reqField)) {
      missingRequiredFields.push(reqField);
    }
  }

  if (exclusionReasons.length > 0) return buildResult('NOT_APPLICABLE_VERIFIED_EXCLUSION');

  if (sourceVerificationStatus === 'UNVERIFIED' || sourceReliabilityTier === 'UNVERIFIED_EXTERNAL_REFERENCE') {
    missingRequiredFields.push('verifiedRegulatorySource');
    return buildResult('UNKNOWN_APPLICABILITY_MISSING_DATA');
  }

  if (missingRequiredFields.length > 0) {
    const hasPrimaryMatch =
      matchedReasons.length > 1 ||
      (input.propertyCategory !== undefined &&
        Boolean(cond.requiredPropertyCategories?.includes(input.propertyCategory)));
    return buildResult(
      hasPrimaryMatch ? 'POTENTIALLY_APPLICABLE_NEEDS_INFO' : 'UNKNOWN_APPLICABILITY_MISSING_DATA',
    );
  }

  return buildResult('CONFIRMED_APPLICABLE');
}
