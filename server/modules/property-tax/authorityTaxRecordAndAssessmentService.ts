import { PropertyTaxCrossModuleAdapters, TransactionalPropertyTaxStore } from './store';
import {
  PropertyTaxActorContext,
  PropertyTaxCategory,
  PropertyTaxError,
  PropertyTaxRecord,
  TaxAssessmentClassification,
  TaxAssessmentRecord,
  TaxAuthorityReferenceRecord,
  TaxAuthorityType,
  TaxAuthorityVerificationStatus,
  TaxDocumentCategory,
  TaxDocumentReferenceRecord,
  TaxJurisdictionRef,
  TaxPartyRelationshipRecord,
  TaxPeriodRange,
  TaxRecordVerificationStatus,
  TaxResponsiblePartyRole,
} from './types';

function makeTaxId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function assertPropertyTaxAccess(
  store: TransactionalPropertyTaxStore,
  actor: PropertyTaxActorContext,
  propertyId: string
): void {
  if (actor.role === 'UNRELATED_USER') {
    throw new PropertyTaxError(
      'UNAUTHORIZED_TAX_ACCESS',
      `Actor "${actor.userId}" is not authorized to access private property tax records for property "${propertyId}".`,
      403
    );
  }
  if (actor.role === 'AUTHORITY_VERIFIER_OR_ADMIN' || actor.authorizedPropertyIds?.includes(propertyId)) {
    return;
  }
  if (store.listTaxRecordsByProperty(propertyId).some((r) => r.taxpayerPartyId === actor.partyId)) {
    return;
  }
  if (store.listPartyRelationshipsByProperty(propertyId).some((rel) => rel.partyId === actor.partyId)) {
    return;
  }
  throw new PropertyTaxError(
    'UNAUTHORIZED_TAX_ACCESS',
    `Actor "${actor.userId}" (party "${actor.partyId}") lacks verified authorization for property "${propertyId}".`,
    403
  );
}

export class AuthorityTaxRecordAndAssessmentService {
  constructor(
    private readonly store: TransactionalPropertyTaxStore,
    private readonly adapters: PropertyTaxCrossModuleAdapters
  ) {}

  public async registerTaxAuthorityReference(
    actor: PropertyTaxActorContext,
    input: {
      authorityName: string;
      authorityType: TaxAuthorityType;
      jurisdiction: TaxJurisdictionRef;
      officialSourceReference?: string;
      verifiedContactReference?: string;
      requestedVerificationStatus?: TaxAuthorityVerificationStatus;
      sourceProvenance: string;
      isSyntheticTestFixture?: boolean;
      idempotencyKey?: string;
    }
  ): Promise<TaxAuthorityReferenceRecord> {
    if (actor.role === 'UNRELATED_USER') {
      throw new PropertyTaxError('UNAUTHORIZED_TAX_ACCESS', 'Unrelated user cannot register tax authority references.', 403);
    }
    if (!input.authorityName.trim() || !input.jurisdiction.citySlug.trim()) {
      throw new PropertyTaxError('INVALID_AUTHORITY_REFERENCE', 'Authority name and jurisdiction citySlug are required.');
    }

    const verificationStatus: TaxAuthorityVerificationStatus =
      input.requestedVerificationStatus ?? 'USER_REPORTED_AUTHORITY';

    if (verificationStatus === 'VERIFIED_AUTHORITY') {
      if (actor.role !== 'AUTHORITY_VERIFIER_OR_ADMIN' || !input.officialSourceReference) {
        throw new PropertyTaxError(
          'INVALID_AUTHORITY_REFERENCE',
          'VERIFIED_AUTHORITY requires AUTHORITY_VERIFIER_OR_ADMIN role and an officialSourceReference.'
        );
      }
      const ruleValid = await this.adapters.legalRegulatory.verifyJurisdictionTaxRuleRef(
        input.jurisdiction.citySlug,
        input.officialSourceReference
      );
      if (!ruleValid) {
        throw new PropertyTaxError(
          'INVALID_AUTHORITY_REFERENCE',
          `Legal & Regulatory Intelligence could not verify officialSourceReference "${input.officialSourceReference}".`
        );
      }
    }

    return this.store.runTransaction((tx) => {
      const existingId = tx.getIdempotentEntityId('authority', input.idempotencyKey);
      if (existingId) {
        const existing = tx.getAuthority(existingId);
        if (existing) return existing;
      }
      const now = new Date().toISOString();
      const record: TaxAuthorityReferenceRecord = {
        id: makeTaxId('tax_auth'),
        authorityName: input.authorityName.trim(),
        authorityType: input.authorityType,
        jurisdiction: input.jurisdiction,
        officialSourceReference: input.officialSourceReference,
        verifiedContactReference: input.verifiedContactReference,
        verificationStatus,
        sourceProvenance: input.sourceProvenance,
        isSyntheticTestFixture: Boolean(input.isSyntheticTestFixture),
        createdAt: now,
        updatedAt: now,
      };
      tx.saveAuthority(record);
      tx.setIdempotentEntityId('authority', input.idempotencyKey, record.id);
      return record;
    });
  }

  public async registerPropertyTaxRecord(
    actor: PropertyTaxActorContext,
    input: {
      propertyId: string;
      taxAuthorityId: string;
      jurisdiction: TaxJurisdictionRef;
      taxCategory: PropertyTaxCategory;
      taxpayerPartyId: string;
      taxPeriod: TaxPeriodRange;
      taxAccountReference?: string;
      sourceDocumentId?: string;
      isOfficiallyVerified?: boolean;
      isSyntheticTestFixture?: boolean;
      idempotencyKey?: string;
    }
  ): Promise<PropertyTaxRecord> {
    if (actor.role === 'UNRELATED_USER') {
      throw new PropertyTaxError('UNAUTHORIZED_TAX_ACCESS', 'Unrelated user cannot register a property tax record.', 403);
    }
    const propertyValid = await this.adapters.propertyRegistry.verifyCanonicalPropertyExists(input.propertyId);
    if (!propertyValid) {
      throw new PropertyTaxError(
        'INVALID_PROPERTY_REFERENCE',
        `Canonical property "${input.propertyId}" does not exist in Property Registry.`
      );
    }

    return this.store.runTransaction((tx) => {
      const existingId = tx.getIdempotentEntityId('tax_record', input.idempotencyKey);
      if (existingId) {
        const existing = tx.getTaxRecord(existingId);
        if (existing) return existing;
      }
      if (!tx.getAuthority(input.taxAuthorityId)) {
        throw new PropertyTaxError('INVALID_AUTHORITY_REFERENCE', `Tax authority "${input.taxAuthorityId}" not found.`);
      }

      const verificationStatus: TaxRecordVerificationStatus =
        input.isOfficiallyVerified && actor.role === 'AUTHORITY_VERIFIER_OR_ADMIN'
          ? 'OFFICIALLY_VERIFIED'
          : input.sourceDocumentId
            ? 'DOCUMENT_SUPPORTED_UNVERIFIED'
            : 'UNVERIFIED_USER_REPORTED';

      const now = new Date().toISOString();
      const record: PropertyTaxRecord = {
        id: makeTaxId('ptax_rec'),
        propertyId: input.propertyId,
        taxAuthorityId: input.taxAuthorityId,
        jurisdiction: input.jurisdiction,
        taxCategory: input.taxCategory,
        taxpayerPartyId: input.taxpayerPartyId,
        taxPeriod: input.taxPeriod,
        taxAccountReference: input.taxAccountReference,
        recordStatus: 'ACTIVE',
        sourceDocumentId: input.sourceDocumentId,
        verificationStatus,
        provesLegalOwnership: false,
        isSyntheticTestFixture: Boolean(input.isSyntheticTestFixture),
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveTaxRecord(record);
      tx.setIdempotentEntityId('tax_record', input.idempotencyKey, record.id);
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: record.propertyId,
        entityType: 'TAX_RECORD',
        entityId: record.id,
        historyClassification: 'ORIGINAL_RECORD',
        actionSummary: `Registered property tax record (${record.taxCategory}) for period ${record.taxPeriod.fiscalYearLabel}.`,
        actorUserId: actor.userId,
        newSnapshot: { ...record },
        provenanceReference: input.sourceDocumentId ?? 'USER_SUBMISSION',
        recordedAtIso: now,
      });
      return record;
    });
  }

  public retrievePropertyTaxRecord(actor: PropertyTaxActorContext, taxRecordId: string): PropertyTaxRecord {
    const record = this.store.getTaxRecord(taxRecordId);
    if (!record) {
      throw new PropertyTaxError('RESOURCE_NOT_FOUND', `Property tax record "${taxRecordId}" not found.`, 404);
    }
    assertPropertyTaxAccess(this.store, actor, record.propertyId);
    return record;
  }

  public async registerTaxPartyRelationship(
    actor: PropertyTaxActorContext,
    input: {
      propertyTaxRecordId: string;
      partyId: string;
      role: TaxResponsiblePartyRole;
      effectiveStartIso: string;
      effectiveEndIso?: string;
      authorizationReference: string;
      legalOrContractualLiabilityBasisRef?: string;
      sourceDocumentId?: string;
    }
  ): Promise<TaxPartyRelationshipRecord> {
    const taxRecord = this.store.getTaxRecord(input.propertyTaxRecordId);
    if (!taxRecord) {
      throw new PropertyTaxError('RESOURCE_NOT_FOUND', `Tax record "${input.propertyTaxRecordId}" not found.`, 404);
    }
    assertPropertyTaxAccess(this.store, actor, taxRecord.propertyId);

    if (input.role === 'TENANT_LEGALLY_RELEVANT' && !input.legalOrContractualLiabilityBasisRef) {
      throw new PropertyTaxError(
        'TENANT_LIABILITY_REQUIRES_LEGAL_SOURCE',
        'A tenant cannot be assigned tax responsibility without an explicit legal or contractual basis reference.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const rel: TaxPartyRelationshipRecord = {
        id: makeTaxId('tax_party'),
        propertyTaxRecordId: taxRecord.id,
        propertyId: taxRecord.propertyId,
        partyId: input.partyId,
        role: input.role,
        effectiveStartIso: input.effectiveStartIso,
        effectiveEndIso: input.effectiveEndIso,
        authorizationReference: input.authorizationReference,
        legalOrContractualLiabilityBasisRef: input.legalOrContractualLiabilityBasisRef,
        verificationStatus:
          actor.role === 'AUTHORITY_VERIFIER_OR_ADMIN'
            ? 'OFFICIALLY_VERIFIED'
            : input.sourceDocumentId
              ? 'DOCUMENT_SUPPORTED_UNVERIFIED'
              : 'UNVERIFIED_USER_REPORTED',
        sourceDocumentId: input.sourceDocumentId,
        inferredLiabilityFromOwnershipAlone: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.savePartyRelationship(rel);
      return rel;
    });
  }

  public async registerTaxAssessment(
    actor: PropertyTaxActorContext,
    input: {
      propertyTaxRecordId: string;
      assessmentPeriod: TaxPeriodRange;
      assessmentDateIso: string;
      documentedTaxableValueRials?: number;
      assessedAmountRials: number;
      assessmentBasis: string;
      assessmentMethodReference?: string;
      officialAssessmentIdentifier?: string;
      sourceDocumentId?: string;
      classification: TaxAssessmentClassification;
      derivedFromPlatformValuationModel?: boolean;
      idempotencyKey?: string;
    }
  ): Promise<TaxAssessmentRecord> {
    const taxRecord = this.store.getTaxRecord(input.propertyTaxRecordId);
    if (!taxRecord) {
      throw new PropertyTaxError('RESOURCE_NOT_FOUND', `Tax record "${input.propertyTaxRecordId}" not found.`, 404);
    }
    assertPropertyTaxAccess(this.store, actor, taxRecord.propertyId);

    if (input.derivedFromPlatformValuationModel && input.classification === 'OFFICIAL_ASSESSMENT') {
      throw new PropertyTaxError(
        'PLATFORM_VALUATION_NOT_OFFICIAL_ASSESSMENT',
        'Platform property valuation models must never be recorded as an OFFICIAL_ASSESSMENT.'
      );
    }
    if (input.classification === 'OFFICIAL_ASSESSMENT' && !input.officialAssessmentIdentifier) {
      throw new PropertyTaxError('VALIDATION_FAILED', 'OFFICIAL_ASSESSMENT requires an officialAssessmentIdentifier.');
    }

    return this.store.runTransaction((tx) => {
      const existingId = tx.getIdempotentEntityId('assessment', input.idempotencyKey);
      if (existingId) {
        const existing = tx.getAssessment(existingId);
        if (existing) return existing;
      }
      const verificationStatus: TaxRecordVerificationStatus =
        input.classification === 'OFFICIAL_ASSESSMENT' && actor.role === 'AUTHORITY_VERIFIER_OR_ADMIN'
          ? 'OFFICIALLY_VERIFIED'
          : input.sourceDocumentId
            ? 'DOCUMENT_SUPPORTED_UNVERIFIED'
            : 'UNVERIFIED_USER_REPORTED';

      const now = new Date().toISOString();
      const assessment: TaxAssessmentRecord = {
        id: makeTaxId('tax_assess'),
        propertyTaxRecordId: taxRecord.id,
        propertyId: taxRecord.propertyId,
        taxAuthorityId: taxRecord.taxAuthorityId,
        assessmentPeriod: input.assessmentPeriod,
        assessmentDateIso: input.assessmentDateIso,
        documentedTaxableValueRials: input.documentedTaxableValueRials,
        assessedAmountRials: input.assessedAmountRials,
        currency: 'IRR',
        assessmentBasis: input.assessmentBasis,
        assessmentMethodReference: input.assessmentMethodReference,
        officialAssessmentIdentifier: input.officialAssessmentIdentifier,
        sourceDocumentId: input.sourceDocumentId,
        classification: input.classification,
        verificationStatus,
        status: input.classification === 'PRELIMINARY_ASSESSMENT' ? 'PRELIMINARY' : 'ACTIVE',
        usesPlatformValuationAsOfficialAssessment: false,
        assumesMarketValueEqualsTaxableValue: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveAssessment(assessment);
      tx.saveTaxRecord({
        ...taxRecord,
        latestAssessmentId: assessment.id,
        version: taxRecord.version + 1,
        updatedAt: now,
      });
      tx.setIdempotentEntityId('assessment', input.idempotencyKey, assessment.id);
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: taxRecord.propertyId,
        entityType: 'ASSESSMENT',
        entityId: assessment.id,
        historyClassification: 'ORIGINAL_RECORD',
        actionSummary: `Registered ${assessment.classification} (${assessment.assessedAmountRials} IRR).`,
        actorUserId: actor.userId,
        newSnapshot: { ...assessment },
        provenanceReference: input.officialAssessmentIdentifier ?? input.sourceDocumentId ?? 'USER_REPORTED',
        recordedAtIso: now,
      });
      return assessment;
    });
  }

  public async correctOrSupersedeTaxAssessment(
    actor: PropertyTaxActorContext,
    input: {
      priorAssessmentId: string;
      expectedVersion: number;
      newAssessedAmountRials: number;
      newDocumentedTaxableValueRials?: number;
      newOfficialAssessmentIdentifier?: string;
      correctionReason: string;
      classification: TaxAssessmentClassification;
    }
  ): Promise<{ supersededAssessment: TaxAssessmentRecord; replacementAssessment: TaxAssessmentRecord }> {
    const prior = this.store.getAssessment(input.priorAssessmentId);
    if (!prior) {
      throw new PropertyTaxError('RESOURCE_NOT_FOUND', `Assessment "${input.priorAssessmentId}" not found.`, 404);
    }
    assertPropertyTaxAccess(this.store, actor, prior.propertyId);
    if (prior.version !== input.expectedVersion) {
      throw new PropertyTaxError(
        'CONCURRENCY_CONFLICT',
        `Assessment "${prior.id}" version mismatch: expected ${input.expectedVersion}, found ${prior.version}.`,
        409
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const replacementId = makeTaxId('tax_assess');
      const supersededAssessment: TaxAssessmentRecord = {
        ...prior,
        status: 'SUPERSEDED',
        supersededByAssessmentId: replacementId,
        version: prior.version + 1,
        updatedAt: now,
      };
      const replacementAssessment: TaxAssessmentRecord = {
        ...prior,
        id: replacementId,
        assessedAmountRials: input.newAssessedAmountRials,
        documentedTaxableValueRials: input.newDocumentedTaxableValueRials ?? prior.documentedTaxableValueRials,
        officialAssessmentIdentifier: input.newOfficialAssessmentIdentifier ?? prior.officialAssessmentIdentifier,
        classification: input.classification,
        status: 'CORRECTED',
        supersedesAssessmentId: prior.id,
        supersededByAssessmentId: undefined,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveAssessment(supersededAssessment);
      tx.saveAssessment(replacementAssessment);
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: prior.propertyId,
        entityType: 'ASSESSMENT',
        entityId: prior.id,
        historyClassification: 'SUPERSEDED_RECORD',
        actionSummary: `Superseded assessment ${prior.id} with ${replacementId}: ${input.correctionReason}`,
        actorUserId: actor.userId,
        previousSnapshot: { ...prior },
        newSnapshot: { ...supersededAssessment },
        provenanceReference: input.correctionReason,
        recordedAtIso: now,
      });
      tx.appendHistory({
        id: makeTaxId('thist'),
        propertyId: prior.propertyId,
        entityType: 'ASSESSMENT',
        entityId: replacementId,
        historyClassification: 'CORRECTED_RECORD',
        actionSummary: `Created corrected replacement assessment ${replacementId} (${replacementAssessment.assessedAmountRials} IRR).`,
        actorUserId: actor.userId,
        newSnapshot: { ...replacementAssessment },
        provenanceReference: input.correctionReason,
        recordedAtIso: now,
      });
      return { supersededAssessment, replacementAssessment };
    });
  }

  public async registerTaxDocumentReference(
    actor: PropertyTaxActorContext,
    input: {
      propertyId: string;
      relatedTaxRecordId: string;
      documentCategory: TaxDocumentCategory;
      issuingAuthorityName: string;
      issueDateIso?: string;
      sourceProvenance: string;
      mediaReferenceId: string;
      restrictedConfidentiality?: boolean;
    }
  ): Promise<TaxDocumentReferenceRecord> {
    assertPropertyTaxAccess(this.store, actor, input.propertyId);
    if (!(await this.adapters.media.verifyMediaReferenceExists(input.mediaReferenceId))) {
      throw new PropertyTaxError('VALIDATION_FAILED', `Media reference "${input.mediaReferenceId}" not found.`);
    }
    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const doc: TaxDocumentReferenceRecord = {
        id: makeTaxId('tax_doc'),
        propertyId: input.propertyId,
        relatedTaxRecordId: input.relatedTaxRecordId,
        documentCategory: input.documentCategory,
        issuingAuthorityName: input.issuingAuthorityName,
        issueDateIso: input.issueDateIso,
        sourceProvenance: input.sourceProvenance,
        verificationStatus: 'DOCUMENT_SUPPORTED_UNVERIFIED',
        mediaReferenceId: input.mediaReferenceId,
        restrictedConfidentiality: Boolean(input.restrictedConfidentiality),
        isAuthenticWithoutVerification: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveDocument(doc);
      return doc;
    });
  }

  public retrieveTaxDocumentReference(actor: PropertyTaxActorContext, documentId: string): TaxDocumentReferenceRecord {
    const doc = this.store.getDocument(documentId);
    if (!doc) {
      throw new PropertyTaxError('RESOURCE_NOT_FOUND', `Tax document "${documentId}" not found.`, 404);
    }
    assertPropertyTaxAccess(this.store, actor, doc.propertyId);
    if (
      doc.restrictedConfidentiality &&
      actor.role !== 'PROPERTY_OWNER' &&
      actor.role !== 'TAXPAYER' &&
      actor.role !== 'AUTHORITY_VERIFIER_OR_ADMIN'
    ) {
      throw new PropertyTaxError(
        'RESTRICTED_TAX_DOCUMENT_DENIED',
        `Actor "${actor.userId}" with role "${actor.role}" is not permitted to view restricted tax document "${documentId}".`,
        403
      );
    }
    return doc;
  }
}
