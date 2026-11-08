import crypto from 'node:crypto';
import {
  assertValidPropertyAndPartyReferences,
  MediaEvidenceReferenceAdapter,
  PartyIdentityReferenceAdapter,
  PropertyRegistryReferenceAdapter,
} from './adapters';
import {
  executeRecordInterestDispute,
  executeRegisterEvidenceReference,
  RecordDisputeInput,
  RegisterEvidenceReferenceInput,
} from './evidenceAndDisputesEngine';
import {
  assertNonEmptyString,
  assertRequiredRole,
  assertValidIsoTimestamp,
  buildMultiDimensionalStatusVector,
  computeDaysBetweenEffectiveAndRecorded,
  PropertyRightsError,
} from './sharesAndValidation';
import { PropertyRightsStore } from './store';
import {
  EncumbranceClassificationState,
  EncumbranceType,
  EvidenceSourceReliability,
  InterestVerificationStatus,
  NonOwnershipRightCategory,
  OwnershipDisputeRecord,
  OwnershipEvidenceRecord,
  PartyReference,
  PropertyEncumbranceRecord,
  PropertyEntityReference,
  PropertyRightRecord,
  PropertyRightsActorContext,
  TenureCategory,
  TenureInterestRecord,
} from './types';

export type { RegisterEvidenceReferenceInput, RecordDisputeInput };

export interface RegisterPropertyRightInput {
  id?: string;
  propertyRef: PropertyEntityReference;
  beneficiaryParty: PartyReference;
  grantingParty?: PartyReference | null;
  rightCategory: NonOwnershipRightCategory;
  scopeDescription: string;
  physicalOrGeographicScope?: string;
  effectiveFromIso: string;
  recordedAtIso?: string;
  expirationOrTerminationIso?: string | null;
  evidenceIds?: string[];
  sourceReliability?: EvidenceSourceReliability;
  verificationStatus?: InterestVerificationStatus;
  restrictionsAndConditions?: string[];
  idempotencyKey?: string;
}

export interface RegisterTenureInterestInput {
  id?: string;
  propertyRef: PropertyEntityReference;
  tenantOrBeneficiaryParty: PartyReference;
  grantingParty: PartyReference;
  tenureCategory: TenureCategory;
  effectiveFromIso: string;
  effectiveToIso?: string | null;
  recordedAtIso?: string;
  recordedRights: string[];
  restrictions?: string[];
  externalContractReference?: string;
  evidenceIds?: string[];
  sourceReliability?: EvidenceSourceReliability;
  verificationStatus?: InterestVerificationStatus;
}

export interface RegisterEncumbranceInput {
  id?: string;
  propertyRef: PropertyEntityReference;
  beneficiaryOrAuthorityParty: PartyReference;
  affectedOwnershipInterestId?: string | null;
  encumbranceType: EncumbranceType;
  sourceAuthorityName: string;
  registrationReferenceNumber: string;
  effectiveFromIso: string;
  recordedAtIso?: string;
  expirationOrReleaseIso?: string | null;
  classificationState: EncumbranceClassificationState;
  evidenceIds?: string[];
  sourceReliability?: EvidenceSourceReliability;
  idempotencyKey?: string;
}

const ENCUMBRANCE_STATE_TO_VERIFICATION: Record<EncumbranceClassificationState, InterestVerificationStatus> = {
  REPORTED_ENCUMBRANCE: 'CLAIMED',
  DOCUMENTED_UNVERIFIED_ENCUMBRANCE: 'DOCUMENTED',
  VERIFIED_REGISTERED_ENCUMBRANCE: 'VERIFIED',
  DISPUTED_ENCUMBRANCE: 'DISPUTED',
  RELEASED_OR_EXPIRED_WITH_EVIDENCE: 'RELEASED',
  UNKNOWN_ENCUMBRANCE_STATUS: 'UNKNOWN',
};

const MUTATION_ROLES: PropertyRightsActorContext['role'][] = [
  'AUTHENTICATED_PARTY',
  'AUTHORIZED_REGISTRAR',
  'RIGHTS_VERIFICATION_OFFICER',
  'REGISTRY_ADMIN',
];

export class RightsEncumbrancesAndDisputesService {
  constructor(
    private readonly store: PropertyRightsStore,
    private readonly propertyAdapter?: PropertyRegistryReferenceAdapter,
    private readonly partyAdapter?: PartyIdentityReferenceAdapter,
    private readonly mediaAdapter?: MediaEvidenceReferenceAdapter,
  ) {}

  async registerPropertyRight(
    input: RegisterPropertyRightInput,
    actor: PropertyRightsActorContext,
  ): Promise<PropertyRightRecord> {
    assertRequiredRole(actor, MUTATION_ROLES);
    if (input.idempotencyKey) {
      const cached = await this.store.getIdempotentResult<PropertyRightRecord>(
        input.idempotencyKey,
        'registerPropertyRight',
        actor.actorId,
      );
      if (cached) return cached;
    }

    const { verifiedPropertyRef, verifiedPartyRef: verifiedBeneficiary } =
      await assertValidPropertyAndPartyReferences({
        propertyRef: input.propertyRef,
        partyRef: input.beneficiaryParty,
        propertyAdapter: this.propertyAdapter,
        partyAdapter: this.partyAdapter,
      });

    const effectiveFromIso = assertValidIsoTimestamp(input.effectiveFromIso, 'effectiveFromIso');
    const recordedAtIso = input.recordedAtIso
      ? assertValidIsoTimestamp(input.recordedAtIso, 'recordedAtIso')
      : new Date().toISOString();
    const evidenceIds = input.evidenceIds ?? [];
    const verificationStatus: InterestVerificationStatus =
      input.verificationStatus ?? (evidenceIds.length > 0 ? 'DOCUMENTED' : 'CLAIMED');
    const sourceReliability: EvidenceSourceReliability =
      input.sourceReliability ??
      (evidenceIds.length > 0 ? 'ORDINARY_CONTRACT_MABAYENAMEH' : 'UNVERIFIED_PARTY_ASSERTION_OR_UPLOAD');

    const record: PropertyRightRecord = {
      id: input.id?.trim() || `prop_right_${crypto.randomUUID()}`,
      propertyRef: verifiedPropertyRef,
      beneficiaryParty: verifiedBeneficiary,
      grantingParty: input.grantingParty ? structuredClone(input.grantingParty) : null,
      rightCategory: input.rightCategory,
      scopeDescription: assertNonEmptyString(input.scopeDescription, 'scopeDescription', 2000),
      physicalOrGeographicScope: input.physicalOrGeographicScope?.trim(),
      effectiveFromIso,
      recordedAtIso,
      sourceVerifiedAtIso: verificationStatus === 'VERIFIED' ? recordedAtIso : null,
      expirationOrTerminationIso: input.expirationOrTerminationIso ?? null,
      evidenceIds: [...evidenceIds],
      statusVector: buildMultiDimensionalStatusVector({
        identityConfidence: verifiedBeneficiary.identityConfidence,
        sourceReliability,
        verificationStatus,
      }),
      restrictionsAndConditions: input.restrictionsAndConditions ? [...input.restrictionsAndConditions] : [],
      establishesLegalOwnership: false,
      previousRightVersionId: null,
      recordedByActorId: actor.actorId,
      version: 1,
      createdAtIso: recordedAtIso,
      updatedAtIso: recordedAtIso,
    };

    const saved = await this.store.savePropertyRight(record, 0);
    await this.store.appendHistoryEvent({
      id: `hist_${crypto.randomUUID()}`,
      propertyId: verifiedPropertyRef.propertyId,
      affectedEntityType: 'PROPERTY_RIGHT',
      affectedEntityId: saved.id,
      relatedEntityIds: [],
      previousPartyIds: input.grantingParty ? [input.grantingParty.partyId] : [],
      newPartyIds: [verifiedBeneficiary.partyId],
      eventCategory: 'RIGHT_CREATED',
      effectiveDateIso: effectiveFromIso,
      recordedAtIso,
      sourceVerifiedAtIso: saved.sourceVerifiedAtIso,
      learnedAfterEffectiveDateDays: computeDaysBetweenEffectiveAndRecorded(effectiveFromIso, recordedAtIso),
      evidenceIds: saved.evidenceIds,
      verificationStatusAtEvent: saved.statusVector.verificationStatus,
      authorizedActorId: actor.actorId,
      actorRole: actor.role,
      entityVersionAfterEvent: 1,
      summary: `Created non-ownership right ${saved.rightCategory} (${saved.id}) for ${verifiedBeneficiary.partyId}`,
    });

    if (input.idempotencyKey) {
      await this.store.saveIdempotentResult(input.idempotencyKey, 'registerPropertyRight', actor.actorId, saved);
    }
    return saved;
  }

  async amendOrTerminatePropertyRight(
    params: {
      rightId: string;
      newScopeDescription?: string;
      terminationDateIso?: string;
      newVerificationStatus?: InterestVerificationStatus;
      evidenceIds?: string[];
      expectedVersion?: number;
    },
    actor: PropertyRightsActorContext,
  ): Promise<PropertyRightRecord> {
    assertRequiredRole(actor, ['AUTHORIZED_REGISTRAR', 'RIGHTS_VERIFICATION_OFFICER', 'REGISTRY_ADMIN']);
    const existing = await this.store.getPropertyRightById(params.rightId);
    if (!existing) throw new PropertyRightsError('NOT_FOUND', `Property right '${params.rightId}' not found.`, 404);

    const nowIso = new Date().toISOString();
    const isTermination = Boolean(params.terminationDateIso);
    const nextVerificationStatus: InterestVerificationStatus =
      params.newVerificationStatus ?? (isTermination ? 'EXPIRED' : existing.statusVector.verificationStatus);

    const updated: PropertyRightRecord = {
      ...existing,
      scopeDescription: params.newScopeDescription?.trim() || existing.scopeDescription,
      expirationOrTerminationIso: params.terminationDateIso ?? existing.expirationOrTerminationIso,
      evidenceIds: params.evidenceIds
        ? Array.from(new Set([...existing.evidenceIds, ...params.evidenceIds]))
        : existing.evidenceIds,
      statusVector: buildMultiDimensionalStatusVector({
        ...existing.statusVector,
        verificationStatus: nextVerificationStatus,
      }),
      version: existing.version + 1,
      updatedAtIso: nowIso,
    };

    const saved = await this.store.savePropertyRight(updated, params.expectedVersion ?? existing.version);
    await this.store.appendHistoryEvent({
      id: `hist_${crypto.randomUUID()}`,
      propertyId: saved.propertyRef.propertyId,
      affectedEntityType: 'PROPERTY_RIGHT',
      affectedEntityId: saved.id,
      relatedEntityIds: [],
      previousPartyIds: [saved.beneficiaryParty.partyId],
      newPartyIds: [saved.beneficiaryParty.partyId],
      eventCategory: isTermination ? 'RIGHT_TERMINATED_OR_EXPIRED' : 'RIGHT_AMENDED',
      effectiveDateIso: params.terminationDateIso ?? saved.effectiveFromIso,
      recordedAtIso: nowIso,
      sourceVerifiedAtIso: saved.sourceVerifiedAtIso,
      learnedAfterEffectiveDateDays: 0,
      evidenceIds: saved.evidenceIds,
      verificationStatusAtEvent: saved.statusVector.verificationStatus,
      authorizedActorId: actor.actorId,
      actorRole: actor.role,
      entityVersionAfterEvent: saved.version,
      summary: `${isTermination ? 'Terminated' : 'Amended'} property right ${saved.id}`,
    });
    return saved;
  }

  async registerTenureInterest(
    input: RegisterTenureInterestInput,
    actor: PropertyRightsActorContext,
  ): Promise<TenureInterestRecord> {
    assertRequiredRole(actor, MUTATION_ROLES);
    const { verifiedPropertyRef, verifiedPartyRef: verifiedTenant } =
      await assertValidPropertyAndPartyReferences({
        propertyRef: input.propertyRef,
        partyRef: input.tenantOrBeneficiaryParty,
        propertyAdapter: this.propertyAdapter,
        partyAdapter: this.partyAdapter,
      });

    const effectiveFromIso = assertValidIsoTimestamp(input.effectiveFromIso, 'effectiveFromIso');
    const recordedAtIso = input.recordedAtIso
      ? assertValidIsoTimestamp(input.recordedAtIso, 'recordedAtIso')
      : new Date().toISOString();
    const evidenceIds = input.evidenceIds ?? [];
    const verificationStatus = input.verificationStatus ?? (evidenceIds.length > 0 ? 'DOCUMENTED' : 'CLAIMED');
    const sourceReliability =
      input.sourceReliability ??
      (evidenceIds.length > 0 ? 'ORDINARY_CONTRACT_MABAYENAMEH' : 'UNVERIFIED_PARTY_ASSERTION_OR_UPLOAD');

    const record: TenureInterestRecord = {
      id: input.id?.trim() || `tenure_${crypto.randomUUID()}`,
      propertyRef: verifiedPropertyRef,
      tenantOrBeneficiaryParty: verifiedTenant,
      grantingParty: structuredClone(input.grantingParty),
      tenureCategory: input.tenureCategory,
      effectiveFromIso,
      effectiveToIso: input.effectiveToIso ?? null,
      recordedAtIso,
      recordedRights: [...input.recordedRights],
      restrictions: input.restrictions ? [...input.restrictions] : [],
      externalContractReference: input.externalContractReference?.trim(),
      evidenceIds: [...evidenceIds],
      statusVector: buildMultiDimensionalStatusVector({
        identityConfidence: verifiedTenant.identityConfidence,
        sourceReliability,
        verificationStatus,
      }),
      establishesLegalOwnership: false,
      operationalTenancyManagedExternally: true,
      recordedByActorId: actor.actorId,
      version: 1,
      createdAtIso: recordedAtIso,
      updatedAtIso: recordedAtIso,
    };
    return this.store.saveTenureInterest(record, 0);
  }

  async registerEncumbrance(
    input: RegisterEncumbranceInput,
    actor: PropertyRightsActorContext,
  ): Promise<PropertyEncumbranceRecord> {
    assertRequiredRole(actor, MUTATION_ROLES);
    if (input.idempotencyKey) {
      const cached = await this.store.getIdempotentResult<PropertyEncumbranceRecord>(
        input.idempotencyKey,
        'registerEncumbrance',
        actor.actorId,
      );
      if (cached) return cached;
    }

    const { verifiedPropertyRef, verifiedPartyRef: verifiedBeneficiary } =
      await assertValidPropertyAndPartyReferences({
        propertyRef: input.propertyRef,
        partyRef: input.beneficiaryOrAuthorityParty,
        propertyAdapter: this.propertyAdapter,
        partyAdapter: this.partyAdapter,
      });

    const effectiveFromIso = assertValidIsoTimestamp(input.effectiveFromIso, 'effectiveFromIso');
    const recordedAtIso = input.recordedAtIso
      ? assertValidIsoTimestamp(input.recordedAtIso, 'recordedAtIso')
      : new Date().toISOString();

    const verificationStatus = ENCUMBRANCE_STATE_TO_VERIFICATION[input.classificationState];
    const sourceReliability: EvidenceSourceReliability =
      input.sourceReliability ??
      (verificationStatus === 'VERIFIED'
        ? 'AUTHORITATIVE_OFFICIAL_REGISTRY'
        : 'UNVERIFIED_PARTY_ASSERTION_OR_UPLOAD');

    const record: PropertyEncumbranceRecord = {
      id: input.id?.trim() || `enc_${crypto.randomUUID()}`,
      propertyRef: verifiedPropertyRef,
      beneficiaryOrAuthorityParty: verifiedBeneficiary,
      affectedOwnershipInterestId: input.affectedOwnershipInterestId ?? null,
      encumbranceType: input.encumbranceType,
      sourceAuthorityName: assertNonEmptyString(input.sourceAuthorityName, 'sourceAuthorityName', 300),
      registrationReferenceNumber: assertNonEmptyString(
        input.registrationReferenceNumber,
        'registrationReferenceNumber',
        200,
      ),
      effectiveFromIso,
      recordedAtIso,
      sourceVerifiedAtIso: verificationStatus === 'VERIFIED' ? recordedAtIso : null,
      expirationOrReleaseIso: input.expirationOrReleaseIso ?? null,
      classificationState: input.classificationState,
      statusVector: buildMultiDimensionalStatusVector({
        identityConfidence: verifiedBeneficiary.identityConfidence,
        sourceReliability,
        verificationStatus,
      }),
      evidenceIds: input.evidenceIds ? [...input.evidenceIds] : [],
      releaseHistory: [],
      recordedByActorId: actor.actorId,
      version: 1,
      createdAtIso: recordedAtIso,
      updatedAtIso: recordedAtIso,
    };

    const saved = await this.store.saveEncumbrance(record, 0);
    await this.store.appendHistoryEvent({
      id: `hist_${crypto.randomUUID()}`,
      propertyId: verifiedPropertyRef.propertyId,
      affectedEntityType: 'ENCUMBRANCE',
      affectedEntityId: saved.id,
      relatedEntityIds: saved.affectedOwnershipInterestId ? [saved.affectedOwnershipInterestId] : [],
      previousPartyIds: [],
      newPartyIds: [verifiedBeneficiary.partyId],
      eventCategory: 'ENCUMBRANCE_REGISTERED',
      effectiveDateIso: effectiveFromIso,
      recordedAtIso,
      sourceVerifiedAtIso: saved.sourceVerifiedAtIso,
      learnedAfterEffectiveDateDays: computeDaysBetweenEffectiveAndRecorded(effectiveFromIso, recordedAtIso),
      evidenceIds: saved.evidenceIds,
      verificationStatusAtEvent: saved.statusVector.verificationStatus,
      authorizedActorId: actor.actorId,
      actorRole: actor.role,
      entityVersionAfterEvent: 1,
      summary: `Registered encumbrance ${saved.encumbranceType} (${saved.classificationState}) on ${verifiedPropertyRef.propertyId}`,
    });

    if (input.idempotencyKey) {
      await this.store.saveIdempotentResult(input.idempotencyKey, 'registerEncumbrance', actor.actorId, saved);
    }
    return saved;
  }

  async recordEncumbranceRelease(
    params: {
      encumbranceId: string;
      releasedAtEffectiveIso: string;
      releaseReferenceNumber: string;
      releasingAuthorityName: string;
      releaseEvidenceIds: string[];
      expectedVersion?: number;
    },
    actor: PropertyRightsActorContext,
  ): Promise<PropertyEncumbranceRecord> {
    assertRequiredRole(actor, ['AUTHORIZED_REGISTRAR', 'RIGHTS_VERIFICATION_OFFICER', 'REGISTRY_ADMIN']);
    if (params.releaseEvidenceIds.length === 0) {
      throw new PropertyRightsError(
        'VALIDATION_ERROR',
        'Releasing an encumbrance requires at least one supporting release evidence ID.',
        400,
      );
    }
    const existing = await this.store.getEncumbranceById(params.encumbranceId);
    if (!existing) throw new PropertyRightsError('NOT_FOUND', `Encumbrance '${params.encumbranceId}' not found.`, 404);

    const releasedAtEffectiveIso = assertValidIsoTimestamp(
      params.releasedAtEffectiveIso,
      'releasedAtEffectiveIso',
    );
    const recordedAtIso = new Date().toISOString();

    const updated: PropertyEncumbranceRecord = {
      ...existing,
      expirationOrReleaseIso: releasedAtEffectiveIso,
      classificationState: 'RELEASED_OR_EXPIRED_WITH_EVIDENCE',
      statusVector: buildMultiDimensionalStatusVector({
        ...existing.statusVector,
        verificationStatus: 'RELEASED',
      }),
      evidenceIds: Array.from(new Set([...existing.evidenceIds, ...params.releaseEvidenceIds])),
      releaseHistory: [
        ...existing.releaseHistory,
        {
          releasedAtEffectiveIso,
          recordedAtIso,
          releaseReferenceNumber: assertNonEmptyString(params.releaseReferenceNumber, 'releaseReferenceNumber', 200),
          releasingAuthorityName: assertNonEmptyString(params.releasingAuthorityName, 'releasingAuthorityName', 300),
          releaseEvidenceIds: [...params.releaseEvidenceIds],
          recordedByActorId: actor.actorId,
        },
      ],
      version: existing.version + 1,
      updatedAtIso: recordedAtIso,
    };

    const saved = await this.store.saveEncumbrance(updated, params.expectedVersion ?? existing.version);
    await this.store.appendHistoryEvent({
      id: `hist_${crypto.randomUUID()}`,
      propertyId: saved.propertyRef.propertyId,
      affectedEntityType: 'ENCUMBRANCE',
      affectedEntityId: saved.id,
      relatedEntityIds: [],
      previousPartyIds: [saved.beneficiaryOrAuthorityParty.partyId],
      newPartyIds: [],
      eventCategory: 'ENCUMBRANCE_RELEASED',
      effectiveDateIso: releasedAtEffectiveIso,
      recordedAtIso,
      sourceVerifiedAtIso: recordedAtIso,
      learnedAfterEffectiveDateDays: computeDaysBetweenEffectiveAndRecorded(releasedAtEffectiveIso, recordedAtIso),
      evidenceIds: params.releaseEvidenceIds,
      verificationStatusAtEvent: 'RELEASED',
      authorizedActorId: actor.actorId,
      actorRole: actor.role,
      entityVersionAfterEvent: saved.version,
      summary: `Released encumbrance ${saved.id} via ref ${params.releaseReferenceNumber}`,
    });
    return saved;
  }

  registerEvidenceReference(
    input: RegisterEvidenceReferenceInput,
    actor: PropertyRightsActorContext,
  ): Promise<OwnershipEvidenceRecord> {
    return executeRegisterEvidenceReference(this.store, this.mediaAdapter, input, actor);
  }

  recordInterestDispute(
    input: RecordDisputeInput,
    actor: PropertyRightsActorContext,
  ): Promise<OwnershipDisputeRecord> {
    return executeRecordInterestDispute(this.store, input, actor);
  }
}
