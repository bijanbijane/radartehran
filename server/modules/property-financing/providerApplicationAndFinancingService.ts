import { PropertyFinancingCrossModuleAdapters, TransactionalPropertyFinancingStore } from './store';
import {
  FinancingApplicationRecord,
  FinancingApplicationStatus,
  FinancingInterestRateRecord,
  FinancingPartyRelationshipRecord,
  FinancingPartyRole,
  FinancingProviderReferenceRecord,
  FinancingProviderType,
  FinancingProviderVerificationStatus,
  FinancingTermCategory,
  FinancingTermEpistemicStage,
  FinancingTermRecord,
  FinancingVerificationStatus,
  InterestRateEpistemicStage,
  PropertyFinancingActorContext,
  PropertyFinancingError,
  PropertyFinancingRecord,
  PropertyFinancingType,
} from './types';

function makeFinId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function assertFinancingAccess(
  store: TransactionalPropertyFinancingStore,
  actor: PropertyFinancingActorContext,
  propertyId: string,
  financingId?: string
): void {
  if (actor.role === 'UNRELATED_USER') {
    throw new PropertyFinancingError(
      'UNAUTHORIZED_FINANCING_ACCESS',
      `Actor "${actor.userId}" is not authorized to access private financing records for property "${propertyId}".`,
      403
    );
  }
  if (actor.role === 'LENDER_OR_VERIFIER' || actor.authorizedPropertyIds?.includes(propertyId)) {
    return;
  }
  if (financingId) {
    const fin = store.getFinancing(financingId);
    if (fin && (fin.primaryBorrowerPartyId === actor.partyId || fin.coBorrowerPartyIds.includes(actor.partyId))) {
      return;
    }
    if (store.listPartyRelationshipsByFinancing(financingId).some((r) => r.partyId === actor.partyId)) {
      return;
    }
  }
  throw new PropertyFinancingError(
    'UNAUTHORIZED_FINANCING_ACCESS',
    `Actor "${actor.userId}" (party "${actor.partyId}") lacks verified authorization for property "${propertyId}".`,
    403
  );
}

const VALID_APPLICATION_TRANSITIONS: Record<FinancingApplicationStatus, FinancingApplicationStatus[]> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN', 'CANCELLED'],
  SUBMITTED: ['DOCUMENTS_REQUIRED', 'UNDER_REVIEW', 'WITHDRAWN', 'CANCELLED'],
  DOCUMENTS_REQUIRED: ['UNDER_REVIEW', 'WITHDRAWN', 'EXPIRED', 'CANCELLED'],
  UNDER_REVIEW: ['DOCUMENTS_REQUIRED', 'PRE_APPROVED', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  PRE_APPROVED: ['APPROVED', 'OFFER_ISSUED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  APPROVED: ['OFFER_ISSUED', 'CONTRACT_PENDING', 'WITHDRAWN', 'EXPIRED'],
  OFFER_ISSUED: ['OFFER_ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  OFFER_ACCEPTED: ['CONTRACT_PENDING', 'FUNDED', 'WITHDRAWN'],
  CONTRACT_PENDING: ['FUNDED', 'WITHDRAWN', 'CANCELLED'],
  FUNDED: [],
  REJECTED: [],
  WITHDRAWN: [],
  EXPIRED: [],
  CANCELLED: [],
  UNKNOWN: ['UNDER_REVIEW', 'CANCELLED'],
};

export class ProviderApplicationAndFinancingService {
  constructor(
    private readonly store: TransactionalPropertyFinancingStore,
    private readonly adapters: PropertyFinancingCrossModuleAdapters
  ) {}

  public async registerFinancingProviderReference(
    actor: PropertyFinancingActorContext,
    input: {
      providerName: string;
      providerType: FinancingProviderType;
      jurisdictionCitySlug: string;
      officialRegistrationReference?: string;
      contactReference?: string;
      requestedVerificationStatus?: FinancingProviderVerificationStatus;
      sourceProvenance: string;
      isSyntheticTestFixture?: boolean;
      idempotencyKey?: string;
    }
  ): Promise<FinancingProviderReferenceRecord> {
    if (actor.role === 'UNRELATED_USER') {
      throw new PropertyFinancingError('UNAUTHORIZED_FINANCING_ACCESS', 'Unauthorized user cannot register a provider.', 403);
    }
    if (!input.providerName.trim() || !input.jurisdictionCitySlug.trim()) {
      throw new PropertyFinancingError('INVALID_PROVIDER_REFERENCE', 'Provider name and jurisdictionCitySlug are required.');
    }
    const verificationStatus: FinancingProviderVerificationStatus =
      input.requestedVerificationStatus ?? 'USER_REPORTED_PROVIDER';

    if (verificationStatus === 'VERIFIED_PROVIDER') {
      if (actor.role !== 'LENDER_OR_VERIFIER' || !input.officialRegistrationReference) {
        throw new PropertyFinancingError(
          'INVALID_PROVIDER_REFERENCE',
          'VERIFIED_PROVIDER requires LENDER_OR_VERIFIER role and an officialRegistrationReference.'
        );
      }
      const regOk = await this.adapters.legalRegulatory.verifyLenderRegistrationRef(
        input.jurisdictionCitySlug,
        input.officialRegistrationReference
      );
      if (!regOk) {
        throw new PropertyFinancingError(
          'INVALID_PROVIDER_REFERENCE',
          `Legal & Regulatory Intelligence rejected provider registration "${input.officialRegistrationReference}".`
        );
      }
    }

    return this.store.runTransaction((tx) => {
      const existingId = tx.getIdempotentEntityId('provider', input.idempotencyKey);
      if (existingId) {
        const existing = tx.getProvider(existingId);
        if (existing) return existing;
      }
      const now = new Date().toISOString();
      const provider: FinancingProviderReferenceRecord = {
        id: makeFinId('fin_prov'),
        providerName: input.providerName.trim(),
        providerType: input.providerType,
        jurisdictionCitySlug: input.jurisdictionCitySlug,
        officialRegistrationReference: input.officialRegistrationReference,
        contactReference: input.contactReference,
        verificationStatus,
        sourceProvenance: input.sourceProvenance,
        isSyntheticTestFixture: Boolean(input.isSyntheticTestFixture),
        createdAt: now,
        updatedAt: now,
      };
      tx.saveProvider(provider);
      tx.setIdempotentEntityId('provider', input.idempotencyKey, provider.id);
      return provider;
    });
  }

  public async createFinancingApplication(
    actor: PropertyFinancingActorContext,
    input: {
      propertyId: string;
      providerId: string;
      applicantPartyId: string;
      financingType: PropertyFinancingType;
      jurisdictionCitySlug: string;
      requestedPrincipalRials: number;
      expirationDateIso?: string;
      notes?: string;
      isSyntheticTestFixture?: boolean;
      idempotencyKey?: string;
    }
  ): Promise<FinancingApplicationRecord> {
    if (!(await this.adapters.propertyRegistry.verifyCanonicalPropertyExists(input.propertyId))) {
      throw new PropertyFinancingError('INVALID_PROPERTY_REFERENCE', `Property "${input.propertyId}" does not exist.`);
    }
    assertFinancingAccess(this.store, actor, input.propertyId);

    return this.store.runTransaction((tx) => {
      const existingId = tx.getIdempotentEntityId('application', input.idempotencyKey);
      if (existingId) {
        const existing = tx.getApplication(existingId);
        if (existing) return existing;
      }
      if (!tx.getProvider(input.providerId)) {
        throw new PropertyFinancingError('INVALID_PROVIDER_REFERENCE', `Provider "${input.providerId}" not found.`);
      }
      const now = new Date().toISOString();
      const app: FinancingApplicationRecord = {
        id: makeFinId('fin_app'),
        propertyId: input.propertyId,
        providerId: input.providerId,
        applicantPartyId: input.applicantPartyId,
        financingType: input.financingType,
        jurisdictionCitySlug: input.jurisdictionCitySlug,
        requestedPrincipalRials: input.requestedPrincipalRials,
        currency: 'IRR',
        status: 'DRAFT',
        statusOrigin: 'PLATFORM_WORKFLOW_STATUS',
        expirationDateIso: input.expirationDateIso,
        notes: input.notes,
        preApprovalGuaranteesFinancing: false,
        isSyntheticTestFixture: Boolean(input.isSyntheticTestFixture),
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveApplication(app);
      tx.setIdempotentEntityId('application', input.idempotencyKey, app.id);
      tx.appendHistory({
        id: makeFinId('fhist'),
        propertyId: app.propertyId,
        financingOrApplicationId: app.id,
        entityType: 'APPLICATION',
        actionSummary: `Created financing application (${app.financingType}, ${app.requestedPrincipalRials} IRR).`,
        actorUserId: actor.userId,
        provenanceReference: 'APPLICATION_CREATION',
        recordedAtIso: now,
      });
      return app;
    });
  }

  public retrieveFinancingApplication(
    actor: PropertyFinancingActorContext,
    applicationId: string
  ): FinancingApplicationRecord {
    const app = this.store.getApplication(applicationId);
    if (!app) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Application "${applicationId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, app.propertyId);
    return app;
  }

  public async updatePermittedApplicationMetadata(
    actor: PropertyFinancingActorContext,
    input: { applicationId: string; notes?: string; expirationDateIso?: string }
  ): Promise<FinancingApplicationRecord> {
    const app = this.retrieveFinancingApplication(actor, input.applicationId);
    return this.store.runTransaction((tx) => {
      const updated: FinancingApplicationRecord = {
        ...app,
        notes: input.notes ?? app.notes,
        expirationDateIso: input.expirationDateIso ?? app.expirationDateIso,
        version: app.version + 1,
        updatedAt: new Date().toISOString(),
      };
      tx.saveApplication(updated);
      return updated;
    });
  }

  public async recordApplicationStatus(
    actor: PropertyFinancingActorContext,
    input: {
      applicationId: string;
      targetStatus: FinancingApplicationStatus;
      lenderConfirmationReference?: string;
      reason: string;
    }
  ): Promise<FinancingApplicationRecord> {
    const app = this.retrieveFinancingApplication(actor, input.applicationId);
    const allowed = VALID_APPLICATION_TRANSITIONS[app.status] ?? [];
    if (!allowed.includes(input.targetStatus)) {
      throw new PropertyFinancingError(
        'INVALID_APPLICATION_TRANSITION',
        `Cannot transition financing application from "${app.status}" to "${input.targetStatus}".`
      );
    }
    if (
      (input.targetStatus === 'APPROVED' || input.targetStatus === 'FUNDED') &&
      (actor.role !== 'LENDER_OR_VERIFIER' || !input.lenderConfirmationReference)
    ) {
      throw new PropertyFinancingError(
        'LENDER_CONFIRMATION_REQUIRED_FOR_APPROVAL_OR_FUNDING',
        `Transition to "${input.targetStatus}" requires LENDER_OR_VERIFIER role and a lenderConfirmationReference.`,
        403
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const updated: FinancingApplicationRecord = {
        ...app,
        status: input.targetStatus,
        statusOrigin: actor.role === 'LENDER_OR_VERIFIER' ? 'LENDER_CONFIRMED_STATUS' : 'USER_REPORTED_STATUS',
        lenderConfirmationReference: input.lenderConfirmationReference ?? app.lenderConfirmationReference,
        version: app.version + 1,
        updatedAt: now,
      };
      tx.saveApplication(updated);
      tx.appendHistory({
        id: makeFinId('fhist'),
        propertyId: updated.propertyId,
        financingOrApplicationId: updated.id,
        entityType: 'APPLICATION',
        actionSummary: `Transitioned application from ${app.status} to ${updated.status}: ${input.reason}`,
        actorUserId: actor.userId,
        provenanceReference: input.lenderConfirmationReference ?? input.reason,
        recordedAtIso: now,
      });
      return updated;
    });
  }

  public async registerFinancingRecord(
    actor: PropertyFinancingActorContext,
    input: {
      propertyId: string;
      providerId: string;
      applicationId?: string;
      primaryBorrowerPartyId: string;
      coBorrowerPartyIds?: string[];
      financingType: PropertyFinancingType;
      jurisdictionCitySlug: string;
      loanAccountReference?: string;
      originalPrincipalRials: number;
      verifiedCurrentPrincipalBalanceRials?: number;
      durationMonths: number;
      originationDateIso: string;
      maturityDateIso: string;
      sourceDocumentIds?: string[];
      isSyntheticTestFixture?: boolean;
      idempotencyKey?: string;
    }
  ): Promise<PropertyFinancingRecord> {
    if (!(await this.adapters.propertyRegistry.verifyCanonicalPropertyExists(input.propertyId))) {
      throw new PropertyFinancingError('INVALID_PROPERTY_REFERENCE', `Property "${input.propertyId}" does not exist.`);
    }
    assertFinancingAccess(this.store, actor, input.propertyId);

    return this.store.runTransaction((tx) => {
      const existingId = tx.getIdempotentEntityId('financing', input.idempotencyKey);
      if (existingId) {
        const existing = tx.getFinancing(existingId);
        if (existing) return existing;
      }
      if (!tx.getProvider(input.providerId)) {
        throw new PropertyFinancingError('INVALID_PROVIDER_REFERENCE', `Provider "${input.providerId}" not found.`);
      }
      const verificationStatus: FinancingVerificationStatus =
        actor.role === 'LENDER_OR_VERIFIER'
          ? 'LENDER_OR_AUTHORITY_VERIFIED'
          : input.sourceDocumentIds?.length
            ? 'DOCUMENT_SUPPORTED_UNVERIFIED'
            : 'UNVERIFIED_USER_REPORTED';

      const now = new Date().toISOString();
      const record: PropertyFinancingRecord = {
        id: makeFinId('fin_rec'),
        propertyId: input.propertyId,
        providerId: input.providerId,
        applicationId: input.applicationId,
        primaryBorrowerPartyId: input.primaryBorrowerPartyId,
        coBorrowerPartyIds: input.coBorrowerPartyIds ?? [],
        financingType: input.financingType,
        jurisdictionCitySlug: input.jurisdictionCitySlug,
        loanAccountReference: input.loanAccountReference,
        currency: 'IRR',
        originalPrincipalRials: input.originalPrincipalRials,
        verifiedCurrentPrincipalBalanceRials:
          actor.role === 'LENDER_OR_VERIFIER' ? input.verifiedCurrentPrincipalBalanceRials : undefined,
        durationMonths: input.durationMonths,
        originationDateIso: input.originationDateIso,
        maturityDateIso: input.maturityDateIso,
        status: 'ACTIVE',
        sourceDocumentIds: input.sourceDocumentIds ?? [],
        verificationStatus,
        provesPropertyOwnership: false,
        isSyntheticTestFixture: Boolean(input.isSyntheticTestFixture),
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveFinancing(record);
      tx.setIdempotentEntityId('financing', input.idempotencyKey, record.id);
      tx.appendHistory({
        id: makeFinId('fhist'),
        propertyId: record.propertyId,
        financingOrApplicationId: record.id,
        entityType: 'FINANCING_RECORD',
        actionSummary: `Registered property financing record (${record.financingType}, ${record.originalPrincipalRials} IRR).`,
        actorUserId: actor.userId,
        provenanceReference: input.loanAccountReference ?? 'FINANCING_REGISTRATION',
        recordedAtIso: now,
      });
      return record;
    });
  }

  public async updateFinancingPrincipalBalance(
    actor: PropertyFinancingActorContext,
    input: { financingId: string; expectedVersion: number; newVerifiedBalanceRials: number; sourceReference: string }
  ): Promise<PropertyFinancingRecord> {
    const fin = this.store.getFinancing(input.financingId);
    if (!fin) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Financing "${input.financingId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, fin.propertyId, fin.id);
    if (fin.version !== input.expectedVersion) {
      throw new PropertyFinancingError(
        'CONCURRENCY_CONFLICT',
        `Financing "${fin.id}" version mismatch: expected ${input.expectedVersion}, found ${fin.version}.`,
        409
      );
    }
    return this.store.runTransaction((tx) => {
      const updated: PropertyFinancingRecord = {
        ...fin,
        verifiedCurrentPrincipalBalanceRials: input.newVerifiedBalanceRials,
        version: fin.version + 1,
        updatedAt: new Date().toISOString(),
      };
      tx.saveFinancing(updated);
      return updated;
    });
  }

  public async registerBorrowerRelationship(
    actor: PropertyFinancingActorContext,
    input: {
      financingId: string;
      partyId: string;
      role: FinancingPartyRole;
      effectiveStartIso: string;
      authorizationReference: string;
      contractualGuaranteeDocumentId?: string;
    }
  ): Promise<FinancingPartyRelationshipRecord> {
    const fin = this.store.getFinancing(input.financingId);
    if (!fin) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Financing "${input.financingId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, fin.propertyId, fin.id);
    if (input.role === 'GUARANTOR' && !input.contractualGuaranteeDocumentId) {
      throw new PropertyFinancingError(
        'GUARANTOR_REQUIRES_CONTRACTUAL_DOCUMENT',
        'A GUARANTOR relationship cannot be registered without a contractualGuaranteeDocumentId.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const rel: FinancingPartyRelationshipRecord = {
        id: makeFinId('fin_party'),
        financingId: fin.id,
        propertyId: fin.propertyId,
        partyId: input.partyId,
        role: input.role,
        effectiveStartIso: input.effectiveStartIso,
        verificationStatus:
          actor.role === 'LENDER_OR_VERIFIER' ? 'LENDER_OR_AUTHORITY_VERIFIED' : 'UNVERIFIED_USER_REPORTED',
        authorizationReference: input.authorizationReference,
        contractualGuaranteeDocumentId: input.contractualGuaranteeDocumentId,
        assumesOwnerIsBorrower: false,
        assumesBorrowerIsOwner: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.savePartyRelationship(rel);
      return rel;
    });
  }

  public async recordLoanTerms(
    actor: PropertyFinancingActorContext,
    input: {
      financingId: string;
      termCategory: FinancingTermCategory;
      termValue: string | number;
      unitOrCurrency?: string;
      effectiveStartIso: string;
      epistemicStage: FinancingTermEpistemicStage;
      sourceDocumentId?: string;
      attemptOverwriteContractualInPlace?: boolean;
    }
  ): Promise<FinancingTermRecord> {
    const fin = this.store.getFinancing(input.financingId);
    if (!fin) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Financing "${input.financingId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, fin.propertyId, fin.id);

    const hasContractual = this.store
      .listLoanTermsByFinancing(fin.id)
      .some((t) => t.termCategory === input.termCategory && t.epistemicStage === 'CONTRACTUAL_TERMS' && !t.supersededByTermId);
    if (hasContractual && input.attemptOverwriteContractualInPlace) {
      throw new PropertyFinancingError(
        'CONTRACTUAL_TERMS_CANNOT_BE_SILENTLY_OVERWRITTEN',
        'Contractual loan terms must never be silently overwritten by updated lender offers.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const term: FinancingTermRecord = {
        id: makeFinId('fin_term'),
        financingId: fin.id,
        propertyId: fin.propertyId,
        termCategory: input.termCategory,
        termValue: input.termValue,
        unitOrCurrency: input.unitOrCurrency,
        effectiveStartIso: input.effectiveStartIso,
        epistemicStage: input.epistemicStage,
        sourceDocumentId: input.sourceDocumentId,
        verificationStatus:
          actor.role === 'LENDER_OR_VERIFIER' ? 'LENDER_OR_AUTHORITY_VERIFIED' : 'UNVERIFIED_USER_REPORTED',
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveLoanTerm(term);
      return term;
    });
  }

  public async recordInterestRate(
    actor: PropertyFinancingActorContext,
    input: {
      financingId: string;
      annualRatePercent: number;
      rateStructure: 'FIXED' | 'VARIABLE';
      rateBasis: string;
      referenceIndexName?: string;
      spreadPercent?: number;
      effectiveDateIso: string;
      rateResetDateIso?: string;
      epistemicStage: InterestRateEpistemicStage;
      isEstimatedRate?: boolean;
      sourceReference: string;
    }
  ): Promise<FinancingInterestRateRecord> {
    const fin = this.store.getFinancing(input.financingId);
    if (!fin) {
      throw new PropertyFinancingError('RESOURCE_NOT_FOUND', `Financing "${input.financingId}" not found.`, 404);
    }
    assertFinancingAccess(this.store, actor, fin.propertyId, fin.id);
    if (input.isEstimatedRate && input.epistemicStage === 'CONTRACTUAL_RATE') {
      throw new PropertyFinancingError(
        'ESTIMATED_RATE_CANNOT_BE_MARKED_CONTRACTUAL',
        'An estimated interest rate must never be recorded as a CONTRACTUAL_RATE.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const rate: FinancingInterestRateRecord = {
        id: makeFinId('fin_rate'),
        financingId: fin.id,
        propertyId: fin.propertyId,
        annualRatePercent: input.annualRatePercent,
        rateStructure: input.rateStructure,
        rateBasis: input.rateBasis,
        referenceIndexName: input.referenceIndexName,
        spreadPercent: input.spreadPercent,
        effectiveDateIso: input.effectiveDateIso,
        rateResetDateIso: input.rateResetDateIso,
        epistemicStage: input.epistemicStage,
        sourceReference: input.sourceReference,
        verificationStatus:
          actor.role === 'LENDER_OR_VERIFIER' ? 'LENDER_OR_AUTHORITY_VERIFIED' : 'UNVERIFIED_USER_REPORTED',
        createdAt: now,
        updatedAt: now,
      };
      tx.saveInterestRate(rate);
      tx.saveFinancing({ ...fin, activeInterestRateId: rate.id, updatedAt: now });
      return rate;
    });
  }
}
