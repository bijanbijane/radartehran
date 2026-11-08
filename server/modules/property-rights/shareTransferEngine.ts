import crypto from 'node:crypto';
import {
  assertValidPropertyAndPartyReferences,
  PartyIdentityReferenceAdapter,
  PropertyRegistryReferenceAdapter,
} from './adapters';
import {
  addExactFractions,
  assertRequiredRole,
  assertValidIsoTimestamp,
  buildMultiDimensionalStatusVector,
  computeDaysBetweenEffectiveAndRecorded,
  PropertyRightsError,
  subtractExactFractions,
  validateAndFormatOwnershipShare,
} from './sharesAndValidation';
import { PropertyRightsStore } from './store';
import {
  EvidenceSourceReliability,
  InterestVerificationStatus,
  OwnershipInterestRecord,
  PartyReference,
  PropertyRightsActorContext,
  ShareCalculationBasis,
} from './types';

export interface TransferOwnershipShareInput {
  fromInterestId: string;
  recipientPartyRef: PartyReference;
  transferFraction: {
    numerator: number;
    denominator: number;
    calculationBasis?: ShareCalculationBasis;
  };
  transferCategory:
    | 'SALE_OR_FULL_TRANSFER'
    | 'PARTIAL_SHARE_TRANSFER'
    | 'INHERITANCE_TRANSMISSION'
    | 'GIFT_OR_DONATION_HEBEH';
  effectiveDateIso: string;
  recordedAtIso?: string;
  evidenceIds: string[];
  sourceReliability: EvidenceSourceReliability;
  expectedFromVersion?: number;
  idempotencyKey?: string;
}

export interface ConsolidateSharesInput {
  propertyId: string;
  partyId: string;
  sourceInterestIds: string[];
  effectiveDateIso: string;
  recordedAtIso?: string;
  evidenceIds: string[];
  idempotencyKey?: string;
}

export async function executeTransferOwnershipShare(
  store: PropertyRightsStore,
  propertyAdapter: PropertyRegistryReferenceAdapter | undefined,
  partyAdapter: PartyIdentityReferenceAdapter | undefined,
  input: TransferOwnershipShareInput,
  actor: PropertyRightsActorContext,
): Promise<{
  supersededSourceInterest: OwnershipInterestRecord;
  retainedSourceInterest: OwnershipInterestRecord | null;
  recipientNewInterest: OwnershipInterestRecord;
}> {
  assertRequiredRole(actor, [
    'AUTHORIZED_REGISTRAR',
    'RIGHTS_VERIFICATION_OFFICER',
    'REGISTRY_ADMIN',
  ]);

  if (input.idempotencyKey) {
    const cached = await store.getIdempotentResult<{
      supersededSourceInterest: OwnershipInterestRecord;
      retainedSourceInterest: OwnershipInterestRecord | null;
      recipientNewInterest: OwnershipInterestRecord;
    }>(input.idempotencyKey, 'transferOwnershipShare', actor.actorId);
    if (cached) return cached;
  }

  const fromInterest = await store.getOwnershipInterestById(input.fromInterestId);
  if (!fromInterest) {
    throw new PropertyRightsError('NOT_FOUND', `Source interest '${input.fromInterestId}' not found.`, 404);
  }
  if (
    fromInterest.terminatedAtIso ||
    fromInterest.statusVector.verificationStatus === 'SUPERSEDED' ||
    fromInterest.statusVector.verificationStatus === 'REJECTED'
  ) {
    throw new PropertyRightsError(
      'INVALID_STATE_TRANSITION',
      `Cannot transfer share from terminated or superseded interest '${fromInterest.id}'.`,
      422,
    );
  }
  if (fromInterest.ownershipShare.shareState !== 'KNOWN_EXACT_SHARE') {
    throw new PropertyRightsError(
      'INVALID_OWNERSHIP_SHARE',
      'Cannot execute a mathematical share transfer from an interest with UNKNOWN_SHARE or ZERO_NO_OWNERSHIP.',
      400,
    );
  }

  const { verifiedPartyRef: verifiedRecipient } = await assertValidPropertyAndPartyReferences({
    propertyRef: fromInterest.propertyRef,
    partyRef: input.recipientPartyRef,
    propertyAdapter,
    partyAdapter,
  });

  const transferShare = validateAndFormatOwnershipShare({
    shareState: 'KNOWN_EXACT_SHARE',
    numerator: input.transferFraction.numerator,
    denominator: input.transferFraction.denominator,
    calculationBasis: input.transferFraction.calculationBasis ?? fromInterest.ownershipShare.calculationBasis,
  });

  const remainder = subtractExactFractions(
    {
      numerator: fromInterest.ownershipShare.numerator!,
      denominator: fromInterest.ownershipShare.denominator!,
    },
    {
      numerator: transferShare.numerator!,
      denominator: transferShare.denominator!,
    },
  );

  const effectiveDateIso = assertValidIsoTimestamp(input.effectiveDateIso, 'effectiveDateIso');
  const recordedAtIso = input.recordedAtIso
    ? assertValidIsoTimestamp(input.recordedAtIso, 'recordedAtIso')
    : new Date().toISOString();

  const recipientInterestId = `own_int_${crypto.randomUUID()}`;
  const retainedInterestId = remainder.numerator > 0 ? `own_int_${crypto.randomUUID()}` : null;
  const supersededByIds = retainedInterestId
    ? [retainedInterestId, recipientInterestId]
    : [recipientInterestId];

  const supersededSource: OwnershipInterestRecord = {
    ...fromInterest,
    terminatedAtIso: effectiveDateIso,
    supersededByInterestIds: supersededByIds,
    statusVector: buildMultiDimensionalStatusVector({
      identityConfidence: fromInterest.statusVector.identityConfidence,
      sourceReliability: fromInterest.statusVector.sourceReliability,
      verificationStatus: 'SUPERSEDED',
    }),
    version: fromInterest.version + 1,
    updatedAtIso: recordedAtIso,
  };

  const savedSuperseded = await store.saveOwnershipInterest(
    supersededSource,
    input.expectedFromVersion ?? fromInterest.version,
  );

  let savedRetained: OwnershipInterestRecord | null = null;
  if (retainedInterestId && remainder.numerator > 0) {
    const retainedShare = validateAndFormatOwnershipShare({
      shareState: 'KNOWN_EXACT_SHARE',
      numerator: remainder.numerator,
      denominator: remainder.denominator,
      calculationBasis: fromInterest.ownershipShare.calculationBasis,
    });
    const retainedRecord: OwnershipInterestRecord = {
      ...fromInterest,
      id: retainedInterestId,
      interestType: 'UNDIVIDED_CO_OWNERSHIP_MOSHA',
      ownershipShare: retainedShare,
      effectiveFromIso: effectiveDateIso,
      recordedAtIso,
      terminatedAtIso: null,
      previousInterestIds: [fromInterest.id],
      supersededByInterestIds: [],
      version: 1,
      createdAtIso: recordedAtIso,
      updatedAtIso: recordedAtIso,
    };
    savedRetained = await store.saveOwnershipInterest(retainedRecord, 0);
  }

  const recipientStatus: InterestVerificationStatus =
    input.evidenceIds.length > 0 ? 'DOCUMENTED' : 'CLAIMED';
  const recipientRecord: OwnershipInterestRecord = {
    id: recipientInterestId,
    propertyRef: structuredClone(fromInterest.propertyRef),
    partyRef: verifiedRecipient,
    interestType:
      transferShare.numerator === 1 && transferShare.denominator === 1
        ? 'FULL_OWNERSHIP_6_DANG'
        : 'UNDIVIDED_CO_OWNERSHIP_MOSHA',
    ownershipShare: transferShare,
    effectiveFromIso: effectiveDateIso,
    recordedAtIso,
    sourceVerifiedAtIso: null,
    expirationDateIso: null,
    terminatedAtIso: null,
    evidenceIds: [...input.evidenceIds],
    statusVector: buildMultiDimensionalStatusVector({
      identityConfidence: verifiedRecipient.identityConfidence,
      sourceReliability: input.sourceReliability,
      verificationStatus: recipientStatus,
    }),
    jurisdictionCountryCode: 'IR',
    jurisdictionCityId: fromInterest.jurisdictionCityId,
    restrictions: [...fromInterest.restrictions],
    previousInterestIds: [fromInterest.id],
    supersededByInterestIds: [],
    activeDisputeIds: [],
    recordedByActorId: actor.actorId,
    version: 1,
    createdAtIso: recordedAtIso,
    updatedAtIso: recordedAtIso,
  };

  const savedRecipient = await store.saveOwnershipInterest(recipientRecord, 0);

  await store.appendHistoryEvent({
    id: `hist_${crypto.randomUUID()}`,
    propertyId: fromInterest.propertyRef.propertyId,
    affectedEntityType: 'OWNERSHIP_INTEREST',
    affectedEntityId: savedRecipient.id,
    relatedEntityIds: supersededByIds.concat(fromInterest.id),
    previousPartyIds: [fromInterest.partyRef.partyId],
    newPartyIds: [verifiedRecipient.partyId],
    eventCategory: remainder.numerator > 0 ? 'PARTIAL_SHARE_TRANSFER' : input.transferCategory,
    effectiveDateIso,
    recordedAtIso,
    sourceVerifiedAtIso: null,
    learnedAfterEffectiveDateDays: computeDaysBetweenEffectiveAndRecorded(effectiveDateIso, recordedAtIso),
    evidenceIds: [...input.evidenceIds],
    verificationStatusAtEvent: savedRecipient.statusVector.verificationStatus,
    authorizedActorId: actor.actorId,
    actorRole: actor.role,
    entityVersionAfterEvent: 1,
    summary: `Transferred ${transferShare.numerator}/${transferShare.denominator} from ${fromInterest.partyRef.partyId} to ${verifiedRecipient.partyId}`,
  });

  const result = {
    supersededSourceInterest: savedSuperseded,
    retainedSourceInterest: savedRetained,
    recipientNewInterest: savedRecipient,
  };
  if (input.idempotencyKey) {
    await store.saveIdempotentResult(input.idempotencyKey, 'transferOwnershipShare', actor.actorId, result);
  }
  return result;
}

export async function executeConsolidateOwnershipShares(
  store: PropertyRightsStore,
  input: ConsolidateSharesInput,
  actor: PropertyRightsActorContext,
): Promise<OwnershipInterestRecord> {
  assertRequiredRole(actor, [
    'AUTHORIZED_REGISTRAR',
    'RIGHTS_VERIFICATION_OFFICER',
    'REGISTRY_ADMIN',
  ]);
  if (input.sourceInterestIds.length < 2) {
    throw new PropertyRightsError(
      'VALIDATION_ERROR',
      'Share consolidation requires at least two active interests owned by the same party.',
      400,
    );
  }

  const sourceRecords: OwnershipInterestRecord[] = [];
  let combinedFraction = { numerator: 0, denominator: 1 };

  for (const id of input.sourceInterestIds) {
    const rec = await store.getOwnershipInterestById(id);
    if (!rec) throw new PropertyRightsError('NOT_FOUND', `Interest '${id}' not found.`, 404);
    if (rec.propertyRef.propertyId !== input.propertyId || rec.partyRef.partyId !== input.partyId) {
      throw new PropertyRightsError(
        'VALIDATION_ERROR',
        `All consolidated interests must belong to property '${input.propertyId}' and party '${input.partyId}'.`,
        400,
      );
    }
    if (rec.terminatedAtIso || rec.statusVector.verificationStatus === 'SUPERSEDED') {
      throw new PropertyRightsError('INVALID_STATE_TRANSITION', `Interest '${id}' is already superseded.`, 422);
    }
    if (rec.ownershipShare.shareState !== 'KNOWN_EXACT_SHARE') {
      throw new PropertyRightsError('INVALID_OWNERSHIP_SHARE', `Interest '${id}' does not have an exact share.`, 400);
    }
    combinedFraction = addExactFractions(combinedFraction, {
      numerator: rec.ownershipShare.numerator!,
      denominator: rec.ownershipShare.denominator!,
    });
    sourceRecords.push(rec);
  }

  const effectiveDateIso = assertValidIsoTimestamp(input.effectiveDateIso, 'effectiveDateIso');
  const recordedAtIso = input.recordedAtIso
    ? assertValidIsoTimestamp(input.recordedAtIso, 'recordedAtIso')
    : new Date().toISOString();

  const consolidatedId = `own_int_${crypto.randomUUID()}`;
  for (const src of sourceRecords) {
    await store.saveOwnershipInterest(
      {
        ...src,
        terminatedAtIso: effectiveDateIso,
        supersededByInterestIds: [consolidatedId],
        statusVector: buildMultiDimensionalStatusVector({
          ...src.statusVector,
          verificationStatus: 'SUPERSEDED',
        }),
        version: src.version + 1,
        updatedAtIso: recordedAtIso,
      },
      src.version,
    );
  }

  const template = sourceRecords[0];
  const consolidatedShare = validateAndFormatOwnershipShare({
    shareState: 'KNOWN_EXACT_SHARE',
    numerator: combinedFraction.numerator,
    denominator: combinedFraction.denominator,
    calculationBasis: template.ownershipShare.calculationBasis,
  });

  const allVerified = sourceRecords.every((r) => r.statusVector.verificationStatus === 'VERIFIED');
  const consolidatedRecord: OwnershipInterestRecord = {
    ...template,
    id: consolidatedId,
    interestType:
      consolidatedShare.numerator === 1 && consolidatedShare.denominator === 1
        ? 'FULL_OWNERSHIP_6_DANG'
        : 'UNDIVIDED_CO_OWNERSHIP_MOSHA',
    ownershipShare: consolidatedShare,
    effectiveFromIso: effectiveDateIso,
    recordedAtIso,
    terminatedAtIso: null,
    evidenceIds: Array.from(new Set([...input.evidenceIds, ...sourceRecords.flatMap((s) => s.evidenceIds)])),
    statusVector: buildMultiDimensionalStatusVector({
      identityConfidence: template.statusVector.identityConfidence,
      sourceReliability: template.statusVector.sourceReliability,
      verificationStatus: allVerified ? 'VERIFIED' : 'DOCUMENTED',
    }),
    previousInterestIds: sourceRecords.map((s) => s.id),
    supersededByInterestIds: [],
    version: 1,
    createdAtIso: recordedAtIso,
    updatedAtIso: recordedAtIso,
  };

  const saved = await store.saveOwnershipInterest(consolidatedRecord, 0);
  await store.appendHistoryEvent({
    id: `hist_${crypto.randomUUID()}`,
    propertyId: input.propertyId,
    affectedEntityType: 'OWNERSHIP_INTEREST',
    affectedEntityId: saved.id,
    relatedEntityIds: sourceRecords.map((s) => s.id),
    previousPartyIds: [input.partyId],
    newPartyIds: [input.partyId],
    eventCategory: 'SHARE_CONSOLIDATION',
    effectiveDateIso,
    recordedAtIso,
    sourceVerifiedAtIso: allVerified ? recordedAtIso : null,
    learnedAfterEffectiveDateDays: computeDaysBetweenEffectiveAndRecorded(effectiveDateIso, recordedAtIso),
    evidenceIds: saved.evidenceIds,
    verificationStatusAtEvent: saved.statusVector.verificationStatus,
    authorizedActorId: actor.actorId,
    actorRole: actor.role,
    entityVersionAfterEvent: 1,
    summary: `Consolidated ${sourceRecords.length} interests into ${saved.id} (${consolidatedShare.dangDisplayLabel})`,
  });

  return saved;
}
