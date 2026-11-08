import crypto from 'node:crypto';
import { GeographyLookupAdapter, PropertyContextReferenceAdapter } from './adapters';
import {
  evaluateJurisdictionHierarchyMatch,
  evaluateSingleApplicabilityRule,
} from './applicabilityEngine';
import {
  executeRecordNonAuthoritativeAiSuggestion,
  executeSearchProvisions,
  LegalRegulatorySearchQuery,
  RecordNonAuthoritativeAiSuggestionInput,
} from './searchAndAiEngine';
import { LegalRegulatoryStore } from './store';
import {
  ApplicabilityOutcomeState,
  ApplicabilityRuleCondition,
  ApplicabilityRuleEvaluationResult,
  ComplianceRequirementRecord,
  GeographicJurisdictionScope,
  LegalRegulatoryActorContext,
  NonAuthoritativeAiSummaryRecord,
  PaginatedResult,
  PropertyCategoryType,
  PropertyComplianceRequirementStatusView,
  PropertyRegulatoryEvaluationInput,
  PropertyRegulatoryProfile,
  PublicRegulatoryProvisionView,
  RegulatoryApplicabilityRuleRecord,
  RegulatoryVerificationStatus,
  TransactionContextType,
} from './types';
import {
  assertAdminOrReviewerActor,
  assertNonEmptyText,
  assertValidIsoDate,
  LegalRegulatoryError,
  toPublicComplianceRequirement,
  validateDateWindow,
  validateJurisdictionScopeStructure,
} from './validationAndAuthz';

export type { LegalRegulatorySearchQuery, RecordNonAuthoritativeAiSuggestionInput };

export interface CreateApplicabilityRuleInput {
  id?: string;
  provisionId: string;
  sourceId: string;
  ruleName: string;
  jurisdictionScope?: GeographicJurisdictionScope;
  conditions: ApplicabilityRuleCondition;
  restrictionOrObligationSummary: string;
  mandatoryClassification: 'MANDATORY_STATUTORY' | 'CONDITIONAL_ON_PERMIT' | 'ADVISORY_GUIDELINE';
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  verificationStatus?: RegulatoryVerificationStatus;
  idempotencyKey?: string;
}

export interface CreateComplianceRequirementInput {
  id?: string;
  requirementCode: string;
  sourceId: string;
  provisionId: string;
  jurisdictionScope?: GeographicJurisdictionScope;
  applicablePropertyCategories: PropertyCategoryType[];
  applicableTransactionContexts: TransactionContextType[];
  titleFa: string;
  requirementDescription: string;
  mandatoryVersionClassification: 'MANDATORY_STATUTORY' | 'CONDITIONAL_TRIGGERED';
  conditionTriggerDescription?: string;
  requiredEvidenceTypes: string[];
  verificationMethodDescription: string;
  responsibleAuthorityName: string;
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  internalReviewerNotes?: string;
  idempotencyKey?: string;
}

export class RegulatoryApplicabilityAndProfileService {
  constructor(
    private readonly store: LegalRegulatoryStore,
    private readonly geographyAdapter: GeographyLookupAdapter,
    private readonly propertyContextAdapter?: PropertyContextReferenceAdapter,
  ) {}

  public evaluateJurisdictionHierarchyMatch = evaluateJurisdictionHierarchyMatch;
  public evaluateSingleRule = evaluateSingleApplicabilityRule;

  async createApplicabilityRule(
    input: CreateApplicabilityRuleInput,
    actor: LegalRegulatoryActorContext,
  ): Promise<RegulatoryApplicabilityRuleRecord> {
    assertAdminOrReviewerActor(actor, ['LEGAL_REVIEWER', 'REGULATORY_ADMIN']);
    if (input.idempotencyKey) {
      const cached = await this.store.getIdempotentResult<RegulatoryApplicabilityRuleRecord>(
        input.idempotencyKey,
        'createApplicabilityRule',
        actor.actorId,
      );
      if (cached) return cached;
    }

    const [provision, source] = await Promise.all([
      this.store.getProvisionById(input.provisionId),
      this.store.getSourceById(input.sourceId),
    ]);
    if (!provision) throw new LegalRegulatoryError('NOT_FOUND', `Provision '${input.provisionId}' not found.`, 404);
    if (!source) throw new LegalRegulatoryError('NOT_FOUND', `Source '${input.sourceId}' not found.`, 404);

    const scope = input.jurisdictionScope ?? provision.jurisdictionScope;
    validateJurisdictionScopeStructure(scope);
    const geoValidation = this.geographyAdapter.validateJurisdictionScope(scope);
    if (!geoValidation.valid) {
      throw new LegalRegulatoryError(
        'VALIDATION_ERROR',
        `Invalid applicability rule geography: ${geoValidation.warnings.join('; ')}`,
        400,
      );
    }

    const effectiveFromIso = assertValidIsoDate(input.effectiveFromIso, 'effectiveFromIso');
    validateDateWindow(effectiveFromIso, input.effectiveToIso);

    const nowIso = new Date().toISOString();
    const record: RegulatoryApplicabilityRuleRecord = {
      id: input.id?.trim() || `reg_rule_${crypto.randomUUID()}`,
      provisionId: provision.id,
      sourceId: source.id,
      ruleName: assertNonEmptyText(input.ruleName, 'ruleName', 250),
      jurisdictionScope: structuredClone(scope),
      conditions: structuredClone(input.conditions),
      restrictionOrObligationSummary: assertNonEmptyText(
        input.restrictionOrObligationSummary,
        'restrictionOrObligationSummary',
        2000,
      ),
      mandatoryClassification: input.mandatoryClassification,
      effectiveFromIso,
      effectiveToIso: input.effectiveToIso ?? null,
      verificationStatus: input.verificationStatus ?? provision.verificationStatus,
      version: 1,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const saved = await this.store.saveApplicabilityRule(record, 0);
    if (input.idempotencyKey) {
      await this.store.saveIdempotentResult(input.idempotencyKey, 'createApplicabilityRule', actor.actorId, saved);
    }
    return saved;
  }

  async createComplianceRequirement(
    input: CreateComplianceRequirementInput,
    actor: LegalRegulatoryActorContext,
  ): Promise<ComplianceRequirementRecord> {
    assertAdminOrReviewerActor(actor, ['LEGAL_REVIEWER', 'REGULATORY_ADMIN']);
    if (input.idempotencyKey) {
      const cached = await this.store.getIdempotentResult<ComplianceRequirementRecord>(
        input.idempotencyKey,
        'createComplianceRequirement',
        actor.actorId,
      );
      if (cached) return cached;
    }

    const [source, provision] = await Promise.all([
      this.store.getSourceById(input.sourceId),
      this.store.getProvisionById(input.provisionId),
    ]);
    if (!source || !provision) {
      throw new LegalRegulatoryError(
        'NOT_FOUND',
        'Both sourceId and provisionId must exist to create a compliance requirement.',
        404,
      );
    }

    const scope = input.jurisdictionScope ?? provision.jurisdictionScope;
    validateJurisdictionScopeStructure(scope);
    const effectiveFromIso = assertValidIsoDate(input.effectiveFromIso, 'effectiveFromIso');
    validateDateWindow(effectiveFromIso, input.effectiveToIso);

    if (!Array.isArray(input.requiredEvidenceTypes) || input.requiredEvidenceTypes.length === 0) {
      throw new LegalRegulatoryError(
        'VALIDATION_ERROR',
        'Compliance requirement must specify at least one requiredEvidenceType.',
        400,
      );
    }

    const nowIso = new Date().toISOString();
    const record: ComplianceRequirementRecord = {
      id: input.id?.trim() || `comp_req_${crypto.randomUUID()}`,
      requirementCode: assertNonEmptyText(input.requirementCode, 'requirementCode', 100),
      sourceId: source.id,
      provisionId: provision.id,
      jurisdictionScope: structuredClone(scope),
      applicablePropertyCategories: [...input.applicablePropertyCategories],
      applicableTransactionContexts: [...input.applicableTransactionContexts],
      titleFa: assertNonEmptyText(input.titleFa, 'titleFa', 400),
      requirementDescription: assertNonEmptyText(input.requirementDescription, 'requirementDescription', 2000),
      mandatoryClassification: input.mandatoryVersionClassification,
      conditionTriggerDescription: input.conditionTriggerDescription?.trim(),
      requiredEvidenceTypes: [...input.requiredEvidenceTypes],
      verificationMethodDescription: assertNonEmptyText(
        input.verificationMethodDescription,
        'verificationMethodDescription',
        1000,
      ),
      responsibleAuthorityName: assertNonEmptyText(
        input.responsibleAuthorityName,
        'responsibleAuthorityName',
        300,
      ),
      effectiveFromIso,
      effectiveToIso: input.effectiveToIso ?? null,
      status: 'ACTIVE',
      verificationStatus: provision.verificationStatus,
      provenance: structuredClone(source.provenance),
      internalReviewerNotes: input.internalReviewerNotes,
      version: 1,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const saved = await this.store.saveComplianceRequirement(record, 0);
    if (input.idempotencyKey) {
      await this.store.saveIdempotentResult(
        input.idempotencyKey,
        'createComplianceRequirement',
        actor.actorId,
        saved,
      );
    }
    return saved;
  }

  async buildPropertyRegulatoryProfile(
    rawInput: PropertyRegulatoryEvaluationInput,
    actor?: LegalRegulatoryActorContext,
  ): Promise<PropertyRegulatoryProfile> {
    let mergedInput: PropertyRegulatoryEvaluationInput = { ...rawInput };
    const incompleteWarnings: string[] = [];
    const unverifiedSourceWarnings: string[] = [];

    if (rawInput.propertyId && this.propertyContextAdapter) {
      const snapshot = await this.propertyContextAdapter.getPropertyCharacteristicsById(rawInput.propertyId);
      if (snapshot) {
        mergedInput = { ...snapshot, ...rawInput };
      } else {
        incompleteWarnings.push(
          `Property ID '${rawInput.propertyId}' was not found in PropertyContextReferenceAdapter; evaluating with caller-supplied attributes only.`,
        );
      }
    }

    const asOfDateIso = mergedInput.asOfDateIso ?? new Date().toISOString();
    const asOfMs = Date.parse(assertValidIsoDate(asOfDateIso, 'asOfDateIso'));

    const resolvedGeo = this.geographyAdapter.resolvePropertyGeography({
      provinceId: mergedInput.provinceId,
      cityId: mergedInput.cityId,
      districtNumber: mergedInput.districtNumber,
      neighborhoodId: mergedInput.neighborhoodId,
    });

    if (resolvedGeo.provinceId && !mergedInput.provinceId) mergedInput.provinceId = resolvedGeo.provinceId;
    if (resolvedGeo.districtNumber !== undefined && mergedInput.districtNumber === undefined) {
      mergedInput.districtNumber = resolvedGeo.districtNumber;
    }

    const [allRules, allProvisions, allSources, allConflicts, allRequirements] = await Promise.all([
      this.store.listApplicabilityRules(),
      this.store.listProvisions(),
      this.store.listSources(),
      this.store.listConflictRecords(),
      this.store.listComplianceRequirements(),
    ]);

    const provisionMap = new Map(allProvisions.map((p) => [p.id, p]));
    const sourceMap = new Map(allSources.map((s) => [s.id, s]));

    const landUseRestrictions: ApplicabilityRuleEvaluationResult[] = [];
    const constructionAndDevelopmentRules: ApplicabilityRuleEvaluationResult[] = [];
    const buildingUseAndSafetyRules: ApplicabilityRuleEvaluationResult[] = [];
    const transactionAndOwnershipObligations: ApplicabilityRuleEvaluationResult[] = [];
    const activeProvisionIds = new Set<string>();

    for (const rule of allRules) {
      const prov = provisionMap.get(rule.provisionId);
      const src = sourceMap.get(rule.sourceId);
      if (!prov || !src) continue;

      const evalResult = evaluateSingleApplicabilityRule(
        rule,
        prov.citationLabel,
        prov.documentCategory,
        src.reliabilityTier,
        src.verificationStatus,
        prov.lifecycleStatus,
        prov.repealedAtIso,
        mergedInput,
        asOfMs,
      );

      if (evalResult.outcomeState === 'NOT_APPLICABLE_VERIFIED_EXCLUSION') continue;
      activeProvisionIds.add(prov.id);

      if (evalResult.missingRequiredFields.length > 0) {
        incompleteWarnings.push(
          `Rule '${rule.ruleName}' (${prov.citationLabel}) is ${evalResult.outcomeState} because fields [${evalResult.missingRequiredFields.join(', ')}] are missing.`,
        );
      }
      if (src.verificationStatus !== 'VERIFIED') {
        unverifiedSourceWarnings.push(
          `Source '${src.officialReferenceNumber}' for rule '${rule.ruleName}' has verificationStatus '${src.verificationStatus}'.`,
        );
      }

      if (
        prov.documentCategory === 'LAND_USE_AND_ZONING' ||
        prov.documentCategory === 'HERITAGE_AND_ENVIRONMENTAL_RESTRICTION'
      ) {
        landUseRestrictions.push(evalResult);
      } else if (prov.documentCategory === 'CONSTRUCTION_AND_DENSITY') {
        constructionAndDevelopmentRules.push(evalResult);
      } else if (prov.documentCategory === 'BUILDING_CODE_SAFETY') {
        buildingUseAndSafetyRules.push(evalResult);
      } else {
        transactionAndOwnershipObligations.push(evalResult);
      }
    }

    const applicableComplianceRequirements: PropertyComplianceRequirementStatusView[] = [];
    for (const req of allRequirements) {
      if (req.status !== 'ACTIVE') continue;
      const geoMatch = evaluateJurisdictionHierarchyMatch(req.jurisdictionScope, {
        countryCode: mergedInput.countryCode ?? 'IR',
        provinceId: mergedInput.provinceId,
        cityId: mergedInput.cityId,
        districtNumber: mergedInput.districtNumber,
        neighborhoodId: mergedInput.neighborhoodId,
        designatedZoneCode: mergedInput.designatedZoneCode,
      });
      if (geoMatch.status === 'EXCLUDED') continue;

      let reqOutcome: ApplicabilityOutcomeState = 'CONFIRMED_APPLICABLE';
      if (geoMatch.status === 'MISSING_GEOGRAPHY_DATA') {
        reqOutcome = 'UNKNOWN_APPLICABILITY_MISSING_DATA';
      } else if (
        req.applicablePropertyCategories.length > 0 &&
        mergedInput.propertyCategory &&
        !req.applicablePropertyCategories.includes(mergedInput.propertyCategory)
      ) {
        continue;
      } else if (req.applicablePropertyCategories.length > 0 && !mergedInput.propertyCategory) {
        reqOutcome = 'POTENTIALLY_APPLICABLE_NEEDS_INFO';
      } else if (
        req.applicableTransactionContexts.length > 0 &&
        mergedInput.transactionContext &&
        !req.applicableTransactionContexts.includes(mergedInput.transactionContext)
      ) {
        continue;
      } else if (req.applicableTransactionContexts.length > 0 && !mergedInput.transactionContext) {
        reqOutcome = 'POTENTIALLY_APPLICABLE_NEEDS_INFO';
      }

      applicableComplianceRequirements.push({
        requirement: toPublicComplianceRequirement(req, actor),
        applicabilityState: reqOutcome,
        complianceEstablished: false,
        complianceDisclaimer:
          'Existence of this statutory/regulatory requirement does NOT constitute proof or verification that the property satisfies the requirement.',
        requiredOfficialEvidenceTypes: [...req.requiredEvidenceTypes],
      });
    }

    const detectedRegulatoryConflicts = allConflicts.filter(
      (c) =>
        c.status === 'OPEN_UNRESOLVED' &&
        (activeProvisionIds.has(c.provisionIdA) || activeProvisionIds.has(c.provisionIdB)),
    );

    return {
      profileGeneratedAtIso: new Date().toISOString(),
      evaluatedAsOfDateIso: asOfDateIso,
      propertyId: mergedInput.propertyId,
      resolvedGeography: {
        countryCode: 'IR',
        provinceId: resolvedGeo.provinceId,
        cityId: resolvedGeo.cityId,
        districtNumber: resolvedGeo.districtNumber,
        neighborhoodId: resolvedGeo.neighborhoodId,
        neighborhoodNameFa: resolvedGeo.neighborhoodNameFa,
        geographyVerified: resolvedGeo.valid,
        geographyWarnings: resolvedGeo.warnings,
      },
      landUseRestrictions,
      constructionAndDevelopmentRules,
      buildingUseAndSafetyRules,
      transactionAndOwnershipObligations,
      applicableComplianceRequirements,
      detectedRegulatoryConflicts,
      incompleteOrMissingDataWarnings: Array.from(new Set(incompleteWarnings)),
      unverifiedSourceWarnings: Array.from(new Set(unverifiedSourceWarnings)),
      nonAuthoritativeDisclaimer:
        'This Property Regulatory Profile provides structured regulatory intelligence and does not constitute formal legal counsel or official municipal clearance (Estelam-e Shahrdari / Sabt).',
    };
  }

  searchProvisions(
    query: LegalRegulatorySearchQuery,
    actor?: LegalRegulatoryActorContext,
  ): Promise<PaginatedResult<PublicRegulatoryProvisionView>> {
    return executeSearchProvisions(this.store, query, actor);
  }

  recordNonAuthoritativeAiSuggestion(
    input: RecordNonAuthoritativeAiSuggestionInput,
    actor: LegalRegulatoryActorContext,
  ): Promise<NonAuthoritativeAiSummaryRecord> {
    return executeRecordNonAuthoritativeAiSuggestion(this.store, input, actor);
  }
}
