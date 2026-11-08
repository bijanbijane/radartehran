import crypto from 'node:crypto';
import {
  assertValidPropertyAndPartyReferences,
  PartyIdentityReferenceAdapter,
  PropertyRegistryReferenceAdapter,
} from './adapters';
import {
  ConsolidateSharesInput,
  executeConsolidateOwnershipShares,
  executeTransferOwnershipShare,
  TransferOwnershipShareInput,
} from './shareTransferEngine';
import {
  addExactFractions,
  assertAuthorizedForPropertyInterestsQuery,
  assertNonEmptyString,
  assertRequiredRole,
  assertValidIsoTimestamp,
  buildMultiDimensionalStatusVector,
  canReadFullConfidentialOwnership,
  compareExactFractions,
  computeDaysBetweenEffectiveAndRecorded,
  PropertyRightsError,
  toRedactedOwnershipInterest,
  validateAndFormatOwnershipShare,
  validateVerificationStateTransition,
} from './sharesAndValidation';
import { PropertyRightsStore } from './store';
import {
  EvidenceSourceReliability,
  ExactOwnershipShare,
  InterestVerificationStatus,
  OwnershipArrangementType,
  OwnershipInterestRecord,
  PartyReference,
  PropertyEntityReference,
  PropertyRightsActorContext,
  PublicOrRedactedOwnershipInterestView,
  ShareCalculationBasis,
} from './types';

export type { TransferOwnershipShareInput, ConsolidateSharesInput };

export interface RegisterOwnershipInterestInput {
  id?: string;
  propertyRef: PropertyEntityReference;
  partyRef: PartyReference;
  interestType: OwnershipArrangementType;
  share: {
    shareState: ExactOwnershipShare['shareState'];
    numerator?: number | null;
    denominator?: number | null;
    calculationBasis?: ShareCalculationBasis;
  };
  effectiveFromIso: string;
  recordedAtIso?: string;
  expirationDateIso?: string | null;
  evidenceIds?: string[];
  sourceReliability?: EvidenceSourceReliability;
  initialVerificationStatus?: 'CLAIMED' | 'DOCUMENTED' | 'PENDING_VERIFICATION' | 'UNKNOWN';
  restrictions?: string[];
  previousInterestIds?: string[];
  internalReviewNotes?: string;
  allowDisputedShareOverflow?: boolean;
  idempotencyKey?: string;
}

export class OwnershipAndSharesService {
  constructor(
    private readonly store: PropertyRightsStore,
    private readonly propertyAdapter?: PropertyRegistryReferenceAdapter,
    private readonly partyAdapter?: PartyIdentityReferenceAdapter,
  ) {}

  async registerOwnershipInterest(
    input: RegisterOwnershipInterestInput,
    actor: PropertyRightsActorContext,
  ): Promise<OwnershipInterestRecord> {
    assertRequiredRole(actor, [
      'AUTHENTICATED_PARTY',
      'AUTHORIZED_REGISTRAR',
      'RIGHTS_VERIFICATION_OFFICER',
      'REGISTRY_ADMIN',
    ]);

    if (input.idempotencyKey) {
      const cached = await this.store.getIdempotentResult<OwnershipInterestRecord>(
        input.idempotencyKey,
        'registerOwnershipInterest',
        actor.actorId,
      );
      if (cached) return cached;
    }

    const { verifiedPropertyRef, verifiedPartyRef } = await assertValidPropertyAndPartyReferences({
      propertyRef: input.propertyRef,
      partyRef: input.partyRef,
      propertyAdapter: this.propertyAdapter,
      partyAdapter: this.partyAdapter,
    });

    const ownershipShare = validateAndFormatOwnershipShare(input.share);
    if (
      input.interestType === 'FULL_OWNERSHIP_6_DANG' &&
      ownershipShare.shareState === 'KNOWN_EXACT_SHARE' &&
      (ownershipShare.numerator !== 1 || ownershipShare.denominator !== 1)
    ) {
      throw new PropertyRightsError(
        'INVALID_OWNERSHIP_SHARE',
        'FULL_OWNERSHIP_6_DANG requires a 100% (6/6 Dang) share.',
        400,
      );
    }

    const effectiveFromIso = assertValidIsoTimestamp(input.effectiveFromIso, 'effectiveFromIso');
    const recordedAtIso = input.recordedAtIso
      ? assertValidIsoTimestamp(input.recordedAtIso, 'recordedAtIso')
      : new Date().toISOString();

    const evidenceIds = input.evidenceIds ?? [];
    const initialStatus: InterestVerificationStatus =
      input.initialVerificationStatus ?? (evidenceIds.length > 0 ? 'DOCUMENTED' : 'CLAIMED');
    const sourceReliability: EvidenceSourceReliability =
      input.sourceReliability ??
      (evidenceIds.length > 0 ? 'ORDINARY_CONTRACT_MABAYENAMEH' : 'UNVERIFIED_PARTY_ASSERTION_OR_UPLOAD');

    const existingInterests = await this.store.listOwnershipInterestsByProperty(verifiedPropertyRef.propertyId);
    const activeKnownShares = existingInterests.filter(
      (i) =>
        !i.terminatedAtIso &&
        i.statusVector.verificationStatus !== 'SUPERSEDED' &&
        i.statusVector.verificationStatus !== 'REJECTED' &&
        i.statusVector.verificationStatus !== 'EXPIRED' &&
        i.statusVector.verificationStatus !== 'DISPUTED' &&
        i.ownershipShare.shareState === 'KNOWN_EXACT_SHARE',
    );

    if (ownershipShare.shareState === 'KNOWN_EXACT_SHARE' && !input.allowDisputedShareOverflow) {
      let runningSum = {
        numerator: ownershipShare.numerator!,
        denominator: ownershipShare.denominator!,
      };
      for (const item of activeKnownShares) {
        runningSum = addExactFractions(runningSum, {
          numerator: item.ownershipShare.numerator!,
          denominator: item.ownershipShare.denominator!,
        });
      }
      if (compareExactFractions(runningSum, { numerator: 1, denominator: 1 }) > 0) {
        throw new PropertyRightsError(
          'SHARE_OVERFLOW_CONFLICT',
          `Adding share ${ownershipShare.numerator}/${ownershipShare.denominator} causes total non-disputed active shares to exceed 100% (${runningSum.numerator}/${runningSum.denominator}).`,
          409,
          { resultingTotalShare: runningSum },
        );
      }
    }

    const statusVector = buildMultiDimensionalStatusVector({
      identityConfidence: verifiedPartyRef.identityConfidence,
      sourceReliability,
      verificationStatus: initialStatus,
    });

    const id = input.id?.trim() || `own_int_${crypto.randomUUID()}`;
    const record: OwnershipInterestRecord = {
      id,
      propertyRef: verifiedPropertyRef,
      partyRef: verifiedPartyRef,
      interestType: input.interestType,
      ownershipShare,
      effectiveFromIso,
      recordedAtIso,
      sourceVerifiedAtIso: null,
      expirationDateIso: input.expirationDateIso ?? null,
      terminatedAtIso: null,
      evidenceIds: [...evidenceIds],
      statusVector,
      jurisdictionCountryCode: 'IR',
      jurisdictionCityId: verifiedPropertyRef.cityId,
      restrictions: input.restrictions ? [...input.restrictions] : [],
      previousInterestIds: input.previousInterestIds ? [...input.previousInterestIds] : [],
      supersededByInterestIds: [],
      activeDisputeIds: [],
      recordedByActorId: actor.actorId,
      internalReviewNotes: input.internalReviewNotes,
      version: 1,
      createdAtIso: recordedAtIso,
      updatedAtIso: recordedAtIso,
    };

    const saved = await this.store.saveOwnershipInterest(record, 0);
    await this.store.appendHistoryEvent({
      id: `hist_${crypto.randomUUID()}`,
      propertyId: verifiedPropertyRef.propertyId,
      affectedEntityType: 'OWNERSHIP_INTEREST',
      affectedEntityId: saved.id,
      relatedEntityIds: saved.previousInterestIds,
      previousPartyIds: [],
      newPartyIds: [verifiedPartyRef.partyId],
      eventCategory: 'INITIAL_INTEREST_RECORDED',
      effectiveDateIso: effectiveFromIso,
      recordedAtIso,
      sourceVerifiedAtIso: null,
      learnedAfterEffectiveDateDays: computeDaysBetweenEffectiveAndRecorded(effectiveFromIso, recordedAtIso),
      evidenceIds: saved.evidenceIds,
      verificationStatusAtEvent: saved.statusVector.verificationStatus,
      authorizedActorId: actor.actorId,
      actorRole: actor.role,
      entityVersionAfterEvent: 1,
      summary: `Recorded ownership interest ${saved.id} (${saved.ownershipShare.dangDisplayLabel}) for party ${verifiedPartyRef.partyId}`,
    });

    if (input.idempotencyKey) {
      await this.store.saveIdempotentResult(
        input.idempotencyKey,
        'registerOwnershipInterest',
        actor.actorId,
        saved,
      );
    }
    return saved;
  }

  transferOwnershipShare(input: TransferOwnershipShareInput, actor: PropertyRightsActorContext) {
    return executeTransferOwnershipShare(
      this.store,
      this.propertyAdapter,
      this.partyAdapter,
      input,
      actor,
    );
  }

  consolidateOwnershipShares(input: ConsolidateSharesInput, actor: PropertyRightsActorContext) {
    return executeConsolidateOwnershipShares(this.store, input, actor);
  }

  async submitInterestForVerification(
    interestId: string,
    evidenceIds: string[],
    actor: PropertyRightsActorContext,
  ): Promise<OwnershipInterestRecord> {
    assertRequiredRole(actor, [
      'AUTHENTICATED_PARTY',
      'AUTHORIZED_REGISTRAR',
      'RIGHTS_VERIFICATION_OFFICER',
      'REGISTRY_ADMIN',
    ]);
    const existing = await this.store.getOwnershipInterestById(interestId);
    if (!existing) throw new PropertyRightsError('NOT_FOUND', `Interest '${interestId}' not found.`, 404);
    if (evidenceIds.length === 0 && existing.evidenceIds.length === 0) {
      throw new PropertyRightsError(
        'VALIDATION_ERROR',
        'Cannot submit an ownership interest for verification without supporting evidence references.',
        400,
      );
    }
    validateVerificationStateTransition(existing.statusVector.verificationStatus, 'PENDING_VERIFICATION', actor);
    const nowIso = new Date().toISOString();
    const mergedEvidence = Array.from(new Set([...existing.evidenceIds, ...evidenceIds]));
    const updated: OwnershipInterestRecord = {
      ...existing,
      evidenceIds: mergedEvidence,
      statusVector: buildMultiDimensionalStatusVector({
        ...existing.statusVector,
        verificationStatus: 'PENDING_VERIFICATION',
      }),
      version: existing.version + 1,
      updatedAtIso: nowIso,
    };
    return this.store.saveOwnershipInterest(updated, existing.version);
  }

  async recordVerificationDecision(
    params: {
      interestId: string;
      decision: 'VERIFIED' | 'REJECTED';
      sourceReliability: EvidenceSourceReliability;
      reviewerNotes: string;
      expectedVersion?: number;
    },
    actor: PropertyRightsActorContext,
  ): Promise<OwnershipInterestRecord> {
    assertRequiredRole(actor, ['RIGHTS_VERIFICATION_OFFICER', 'REGISTRY_ADMIN']);
    const existing = await this.store.getOwnershipInterestById(params.interestId);
    if (!existing) throw new PropertyRightsError('NOT_FOUND', `Interest '${params.interestId}' not found.`, 404);

    validateVerificationStateTransition(existing.statusVector.verificationStatus, params.decision, actor);
    if (params.decision === 'VERIFIED' && existing.evidenceIds.length === 0) {
      throw new PropertyRightsError(
        'VALIDATION_ERROR',
        'Cannot mark an ownership interest VERIFIED without at least one verified evidence reference.',
        400,
      );
    }

    const nowIso = new Date().toISOString();
    const updated: OwnershipInterestRecord = {
      ...existing,
      sourceVerifiedAtIso: params.decision === 'VERIFIED' ? nowIso : existing.sourceVerifiedAtIso,
      verifiedByReviewerId: actor.actorId,
      internalReviewNotes: assertNonEmptyString(params.reviewerNotes, 'reviewerNotes', 2000),
      statusVector: buildMultiDimensionalStatusVector({
        identityConfidence: existing.statusVector.identityConfidence,
        sourceReliability: params.sourceReliability,
        verificationStatus: params.decision,
      }),
      version: existing.version + 1,
      updatedAtIso: nowIso,
    };

    const saved = await this.store.saveOwnershipInterest(updated, params.expectedVersion ?? existing.version);
    await this.store.appendHistoryEvent({
      id: `hist_${crypto.randomUUID()}`,
      propertyId: saved.propertyRef.propertyId,
      affectedEntityType: 'OWNERSHIP_INTEREST',
      affectedEntityId: saved.id,
      relatedEntityIds: [],
      previousPartyIds: [saved.partyRef.partyId],
      newPartyIds: [saved.partyRef.partyId],
      eventCategory: 'VERIFICATION_DECISION_RECORDED',
      effectiveDateIso: saved.effectiveFromIso,
      recordedAtIso: nowIso,
      sourceVerifiedAtIso: saved.sourceVerifiedAtIso,
      learnedAfterEffectiveDateDays: computeDaysBetweenEffectiveAndRecorded(saved.effectiveFromIso, nowIso),
      evidenceIds: saved.evidenceIds,
      verificationStatusAtEvent: saved.statusVector.verificationStatus,
      authorizedActorId: actor.actorId,
      actorRole: actor.role,
      entityVersionAfterEvent: saved.version,
      summary: `Verification decision '${params.decision}' recorded on ${saved.id}`,
    });
    return saved;
  }

  async retrievePropertyInterestsForViewer(
    propertyId: string,
    actor: PropertyRightsActorContext,
  ): Promise<Array<OwnershipInterestRecord | PublicOrRedactedOwnershipInterestView>> {
    const all = await this.store.listOwnershipInterestsByProperty(propertyId);
    const partyIds = all.map((i) => i.partyRef.partyId);
    assertAuthorizedForPropertyInterestsQuery(actor, partyIds);
    return all.map((i) => toRedactedOwnershipInterest(i, actor));
  }

  async retrievePartyInterestsForViewer(
    partyId: string,
    actor: PropertyRightsActorContext,
  ): Promise<Array<OwnershipInterestRecord | PublicOrRedactedOwnershipInterestView>> {
    if (!canReadFullConfidentialOwnership(actor, partyId)) {
      throw new PropertyRightsError(
        'UNAUTHORIZED_ENUMERATION',
        `Actor '${actor.actorId}' is not authorized to enumerate ownership interests for party '${partyId}'.`,
        403,
      );
    }
    const all = await this.store.listOwnershipInterestsByParty(partyId);
    return all.map((i) => toRedactedOwnershipInterest(i, actor));
  }
}
