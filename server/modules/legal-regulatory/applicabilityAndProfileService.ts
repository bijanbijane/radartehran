import crypto from 'node:crypto';
import {
  GeographyLookupAdapter,
  PropertyContextReferenceAdapter,
  validatePropertyCharacteristicsSnapshot,
} from './adapters';
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
import { assertIdempotencyRecordMatches, computeCanonicalPayloadHash } from './transactionalCore';
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
    const ruleName = assertNonEmptyText(input.ruleName, 'ruleName', 250);
    const restrictionOrObligationSummary = assertNonEmptyText(
      input.restrictionOrObligationSummary,
      'restrictionOrObligationSummary',
      2000,
    );
    const effectiveFromIso = assertValidIsoDate(input.effectiveFromIso, 'effectiveFromIso');
    validateDateWindow(effectiveFromIso, input.effectiveToIso);

    const requestHash = input.idempotencyKey ? computeCanonicalPayloadHash({ ...input, idempotencyKey: undefined }) : '';
    const id = input.id?.trim() || `reg_rule_${crypto.randomUUID()}`;

    return this.store.runTransaction(async (tx) => {
      if (input.idempotencyKey) {
        const cached = await tx.getIdempotencyRecord<RegulatoryApplicabilityRuleRecord>(
          input.idempotencyKey,
          'createApplicabilityRule',
          actor.actorId,
        );
        if (cached) {
          return assertIdempotencyRecordMatches(cached, requestHash, 'createApplicabilityRule', input.idempotencyKey);
        }
      }

      const [provision, source, existing] = await Promise.all([
        tx.getProvisionById(input.provisionId),
        tx.getSourceById(input.sourceId),
        tx.getApplicabilityRuleById(id),
      ]);
      if (!provision) throw new LegalRegulatoryError('NOT_FOUND', `Provision '${input.provisionId}' not found.`, 404);
      if (!source) throw new LegalRegulatoryError('NOT_FOUND', `Source '${input.sourceId}' not found.`, 404);
      if (provision.sourceId !== source.id) {
        throw new LegalRegulatoryError('VALIDATION_ERROR', `Provision '${provision.id}' does not belong to source '${source.id}'.`, 400);
      }
      if (existing) {
        throw new LegalRegulatoryError('CONFLICT_OR_DUPLICATE', `Applicability rule '${id}' already exists.`, 409);
      }
      const scope = input.jurisdictionScope ?? provision.jurisdictionScope;
      validateJurisdictionScopeStructure(scope);
      const geoValidation = this.geographyAdapter.validateJurisdictionScope(scope);
      if (!geoValidation.valid) {
        throw new LegalRegulatoryError('VALIDATION_ERROR', `Invalid applicability rule geography: ${geoValidation.warnings.join('; ')}`, 400);
      }
      const nowIso = new Date().toISOString();
      const normalizedConditions = {
        ...structuredClone(input.conditions ?? {}),
        requiredContextFields: Array.isArray(input.conditions?.requiredContextFields)
          ? [...input.conditions.requiredContextFields]
          : [],
      };
      const record: RegulatoryApplicabilityRuleRecord = {
        id, provisionId: provision.id, sourceId: source.id, ruleName,
        jurisdictionScope: structuredClone(scope), conditions: normalizedConditions,
        restrictionOrObligationSummary, mandatoryClassification: input.mandatoryClassification,
        effectiveFromIso, effectiveToIso: input.effectiveToIso ?? null,
        verificationStatus: input.verificationStatus ?? provision.verificationStatus,
        version: 1, createdAtIso: nowIso, updatedAtIso: nowIso,
      };
      tx.putApplicabilityRule(record, 0);
      tx.putAuditRecord({
        id: `audit_${crypto.randomUUID()}`, action: 'CREATE_APPLICABILITY_RULE', targetEntityType: 'RULE',
        targetEntityId: record.id, actorId: actor.actorId, actorRole: actor.role, occurredAtIso: nowIso,
        summary: `Created applicability rule ${record.id} for provision ${provision.id}`,
      });
      if (input.idempotencyKey) {
        tx.putIdempotencyRecord({
          key: input.idempotencyKey, operation: 'createApplicabilityRule', actorId: actor.actorId,
          requestHash, responsePayload: record, createdAtIso: nowIso, schemaVersion: 1,
        });
      }
      return structuredClone(record);
    });
  }

  async createComplianceRequirement(
    input: CreateComplianceRequirementInput,
    actor: LegalRegulatoryActorContext,
  ): Promise<ComplianceRequirementRecord> {
    assertAdminOrReviewerActor(actor, ['LEGAL_REVIEWER', 'REGULATORY_ADMIN']);
    const requirementCode = assertNonEmptyText(input.requirementCode, 'requirementCode', 100);
    const titleFa = assertNonEmptyText(input.titleFa, 'titleFa', 400);
    const requirementDescription = assertNonEmptyText(input.requirementDescription, 'requirementDescription', 2000);
    const verificationMethodDescription = assertNonEmptyText(
      input.verificationMethodDescription,
      'verificationMethodDescription',
      1000,
    );
    const responsibleAuthorityName = assertNonEmptyText(input.responsibleAuthorityName, 'responsibleAuthorityName', 300);
    const effectiveFromIso = assertValidIsoDate(input.effectiveFromIso, 'effectiveFromIso');
    validateDateWindow(effectiveFromIso, input.effectiveToIso);

    if (!Array.isArray(input.requiredEvidenceTypes) || input.requiredEvidenceTypes.length === 0) {
      throw new LegalRegulatoryError(
        'VALIDATION_ERROR',
        'Compliance requirement must specify at least one requiredEvidenceType.',
        400,
      );
    }

    const requestHash = input.idempotencyKey ? computeCanonicalPayloadHash({ ...input, idempotencyKey: undefined }) : '';
    const id = input.id?.trim() || `comp_req_${crypto.randomUUID()}`;

    return this.store.runTransaction(async (tx) => {
      if (input.idempotencyKey) {
        const cached = await tx.getIdempotencyRecord<ComplianceRequirementRecord>(
          input.idempotencyKey,
          'createComplianceRequirement',
          actor.actorId,
        );
        if (cached) {
          return assertIdempotencyRecordMatches(
            cached,
            requestHash,
            'createComplianceRequirement',
            input.idempotencyKey,
          );
        }
      }

      const [source, provision, existing] = await Promise.all([
        tx.getSourceById(input.sourceId),
        tx.getProvisionById(input.provisionId),
        tx.getComplianceRequirementById(id),
      ]);
      if (!source || !provision) {
        throw new LegalRegulatoryError(
          'NOT_FOUND',
          'Both sourceId and provisionId must exist to create a compliance requirement.',
          404,
        );
      }
      if (provision.sourceId !== source.id) {
        throw new LegalRegulatoryError('VALIDATION_ERROR', `Provision '${provision.id}' does not belong to source '${source.id}'.`, 400);
      }
      if (existing) {
        throw new LegalRegulatoryError('CONFLICT_OR_DUPLICATE', `Compliance requirement '${id}' already exists.`, 409);
      }
      const scope = input.jurisdictionScope ?? provision.jurisdictionScope;
      validateJurisdictionScopeStructure(scope);
      const nowIso = new Date().toISOString();
      const record: ComplianceRequirementRecord = {
        id, requirementCode, sourceId: source.id, provisionId: provision.id,
        jurisdictionScope: structuredClone(scope),
        applicablePropertyCategories: [...input.applicablePropertyCategories],
        applicableTransactionContexts: [...input.applicableTransactionContexts],
        titleFa, requirementDescription, mandatoryClassification: input.mandatoryVersionClassification,
        conditionTriggerDescription: input.conditionTriggerDescription?.trim(),
        requiredEvidenceTypes: [...input.requiredEvidenceTypes],
        verificationMethodDescription, responsibleAuthorityName, effectiveFromIso,
        effectiveToIso: input.effectiveToIso ?? null, status: 'ACTIVE',
        verificationStatus: provision.verificationStatus, provenance: structuredClone(source.provenance),
        internalReviewerNotes: input.internalReviewerNotes, version: 1, createdAtIso: nowIso, updatedAtIso: nowIso,
      };
      tx.putComplianceRequirement(record, 0);
      tx.putAuditRecord({
        id: `audit_${crypto.randomUUID()}`, action: 'CREATE_COMPLIANCE_REQUIREMENT', targetEntityType: 'COMPLIANCE_REQ',
        targetEntityId: record.id, actorId: actor.actorId, actorRole: actor.role, occurredAtIso: nowIso,
        summary: `Created compliance requirement ${record.id} (${record.requirementCode})`,
      });
      if (input.idempotencyKey) {
        tx.putIdempotencyRecord({
          key: input.idempotencyKey, operation: 'createComplianceRequirement', actorId: actor.actorId,
          requestHash, responsePayload: record, createdAtIso: nowIso, schemaVersion: 1,
        });
      }
      return structuredClone(record);
    });
  }

  async buildPropertyRegulatoryProfile(
    rawInput: PropertyRegulatoryEvaluationInput,
    actor?: LegalRegulatoryActorContext,
  ): Promise<PropertyRegulatoryProfile> {
    const incompleteWarnings: string[] = [];
    const unverifiedSourceWarnings: string[] = [];
    let mergedInput: PropertyRegulatoryEvaluationInput;
    let blockConfirmedDueToIncompleteSnapshot = false;

    if (rawInput.propertyId) {
      if (!actor || !actor.isAuthenticated || !actor.actorId || actor.role === 'PUBLIC_READER') {
        throw new LegalRegulatoryError('UNAUTHENTICATED', 'Authenticated actor context is required to evaluate a registered property.', 401);
      }
      if (!this.propertyContextAdapter) {
        throw new LegalRegulatoryError('PERSISTENCE_UNAVAILABLE', 'Property Registry read adapter is not configured for propertyId evaluation.', 503);
      }
      const authResult = await this.propertyContextAdapter.getPropertyCharacteristicsById({
        propertyId: rawInput.propertyId,
        actorId: actor.actorId,
      });
      if (authResult.status === 'NOT_FOUND') {
        throw new LegalRegulatoryError('NOT_FOUND', `Property '${rawInput.propertyId}' was not found in Property Registry.`, 404);
      }
      if (authResult.status === 'FORBIDDEN') {
        throw new LegalRegulatoryError('FORBIDDEN', 'Caller is not authorized to access or evaluate this registered property.', 403);
      }

      const snapshot = authResult.snapshot;
      const report = validatePropertyCharacteristicsSnapshot(rawInput.propertyId, snapshot);
      if (!report.identityValid || !report.attributesValid) {
        throw new LegalRegulatoryError('SNAPSHOT_INCONSISTENT', `Property Registry snapshot validation failed: ${report.issues.join(' ')}`, 422);
      }
      if (report.missingCoreFields.length > 0) {
        incompleteWarnings.push(`Authoritative Property Registry snapshot is incomplete; missing fields: [${report.missingCoreFields.join(', ')}].`);
        if ((!snapshot.cityId && !snapshot.provinceId) || !snapshot.propertyCategory) {
          blockConfirmedDueToIncompleteSnapshot = true;
        }
      }

      // Canonical evaluation input built strictly from snapshot + allowed control params (transactionContext, asOfDateIso).
      mergedInput = {
        propertyId: snapshot.propertyId, countryCode: 'IR', provinceId: snapshot.provinceId, cityId: snapshot.cityId,
        municipalityCode: snapshot.municipalityCode, districtNumber: snapshot.districtNumber, neighborhoodId: snapshot.neighborhoodId,
        designatedZoneCode: snapshot.designatedZoneCode, propertyCategory: snapshot.propertyCategory, landUseCategory: snapshot.landUseCategory,
        constructionStage: snapshot.constructionStage, floorsCount: snapshot.floorsCount, plotAreaSqm: snapshot.plotAreaSqm,
        buildingAgeYears: snapshot.buildingAgeYears, isWornOutTextureBaftFarsoodeh: snapshot.isWornOutTextureBaftFarsoodeh,
        isNearActiveFaultLine: snapshot.isNearActiveFaultLine, transactionContext: rawInput.transactionContext, asOfDateIso: rawInput.asOfDateIso,
      };
    } else {
      // Hypothetical / general non-registered regulatory evaluation (strictly isolated from Property Registry).
      mergedInput = { ...rawInput, countryCode: rawInput.countryCode ?? 'IR', propertyId: undefined };
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
      if (blockConfirmedDueToIncompleteSnapshot && evalResult.outcomeState === 'CONFIRMED_APPLICABLE') {
        evalResult.outcomeState = 'UNKNOWN_APPLICABILITY_MISSING_DATA';
      }
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

      if (blockConfirmedDueToIncompleteSnapshot && reqOutcome === 'CONFIRMED_APPLICABLE') {
        reqOutcome = 'UNKNOWN_APPLICABILITY_MISSING_DATA';
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
