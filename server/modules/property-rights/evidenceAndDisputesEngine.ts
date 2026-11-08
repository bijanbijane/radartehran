import crypto from 'node:crypto';
import { MediaEvidenceReferenceAdapter } from './adapters';
import {
  assertNonEmptyString,
  assertRequiredRole,
  assertValidIsoTimestamp,
  buildMultiDimensionalStatusVector,
  PropertyRightsError,
} from './sharesAndValidation';
import { PropertyRightsStore } from './store';
import {
  DisputeCategory,
  EvidenceCategory,
  EvidenceSourceReliability,
  InterestVerificationStatus,
  OwnershipDisputeRecord,
  OwnershipEvidenceRecord,
  PropertyRightsActorContext,
} from './types';

export interface RegisterEvidenceReferenceInput {
  id?: string;
  propertyId: string;
  evidenceCategory: EvidenceCategory;
  issuingSourceAuthority: string;
  documentReferenceNumber: string;
  issueDateIso: string;
  effectiveDateIso: string;
  recordedAtIso?: string;
  sourceReliability: EvidenceSourceReliability;
  verificationMethod: OwnershipEvidenceRecord['verificationMethod'];
  verificationStatus?: InterestVerificationStatus;
  mediaFileObjectId?: string | null;
  dueDiligenceAssessmentId?: string | null;
  knownLimitations?: string[];
  isSyntheticTestFixture?: boolean;
}

export interface RecordDisputeInput {
  id?: string;
  propertyId: string;
  affectedInterestOrRightIds: string[];
  competingPartyIds: string[];
  disputeCategory: DisputeCategory;
  supportingEvidenceIds: string[];
  relatedLegalCaseReference?: string;
  initialReviewNote: string;
  attemptPlatformAdjudication?: boolean;
  attemptSilentDeleteHistoricalInterest?: boolean;
}

export async function executeRegisterEvidenceReference(
  store: PropertyRightsStore,
  mediaAdapter: MediaEvidenceReferenceAdapter | undefined,
  input: RegisterEvidenceReferenceInput,
  actor: PropertyRightsActorContext,
): Promise<OwnershipEvidenceRecord> {
  assertRequiredRole(actor, [
    'AUTHENTICATED_PARTY',
    'AUTHORIZED_REGISTRAR',
    'RIGHTS_VERIFICATION_OFFICER',
    'REGISTRY_ADMIN',
  ]);

  const duplicate = await store.findEvidenceBySourceAndReference(
    input.propertyId,
    input.issuingSourceAuthority,
    input.documentReferenceNumber,
  );
  if (duplicate) {
    throw new PropertyRightsError(
      'DUPLICATE_SOURCE_EVIDENCE',
      `Evidence document '${input.documentReferenceNumber}' from '${input.issuingSourceAuthority}' is already registered for property '${input.propertyId}' as '${duplicate.id}'.`,
      409,
      { existingEvidenceId: duplicate.id },
    );
  }

  if (input.mediaFileObjectId && mediaAdapter) {
    const mediaCheck = await mediaAdapter.verifyMediaObjectExists(input.mediaFileObjectId);
    if (!mediaCheck.exists) {
      throw new PropertyRightsError(
        'VALIDATION_ERROR',
        `Referenced mediaFileObjectId '${input.mediaFileObjectId}' does not exist in Media module.`,
        404,
      );
    }
  }

  const issueDateIso = assertValidIsoTimestamp(input.issueDateIso, 'issueDateIso');
  const effectiveDateIso = assertValidIsoTimestamp(input.effectiveDateIso, 'effectiveDateIso');
  const recordedAtIso = input.recordedAtIso
    ? assertValidIsoTimestamp(input.recordedAtIso, 'recordedAtIso')
    : new Date().toISOString();

  const verificationStatus: InterestVerificationStatus =
    input.verificationStatus ??
    (input.verificationMethod === 'OFFICIAL_REGISTRY_INQUIRY_CONFIRMED' ? 'VERIFIED' : 'DOCUMENTED');

  const record: OwnershipEvidenceRecord = {
    id: input.id?.trim() || `ev_${crypto.randomUUID()}`,
    propertyId: assertNonEmptyString(input.propertyId, 'propertyId', 120),
    evidenceCategory: input.evidenceCategory,
    issuingSourceAuthority: assertNonEmptyString(input.issuingSourceAuthority, 'issuingSourceAuthority', 300),
    documentReferenceNumber: assertNonEmptyString(input.documentReferenceNumber, 'documentReferenceNumber', 200),
    issueDateIso,
    effectiveDateIso,
    recordedAtIso,
    sourceReliability: input.sourceReliability,
    verificationMethod: input.verificationMethod,
    verificationStatus,
    verifiedByReviewerId: verificationStatus === 'VERIFIED' ? actor.actorId : undefined,
    verifiedAtIso: verificationStatus === 'VERIFIED' ? recordedAtIso : null,
    mediaFileObjectId: input.mediaFileObjectId ?? null,
    dueDiligenceAssessmentId: input.dueDiligenceAssessmentId ?? null,
    provenance: {
      submittedByActorId: actor.actorId,
      submittedAtIso: recordedAtIso,
      isSyntheticTestFixture: Boolean(input.isSyntheticTestFixture),
    },
    knownLimitations: input.knownLimitations
      ? [...input.knownLimitations]
      : ['Document reference alone does not substitute for live Notarial/Sabt clearance at closing.'],
    version: 1,
  };

  return store.saveEvidence(record, 0);
}

export async function executeRecordInterestDispute(
  store: PropertyRightsStore,
  input: RecordDisputeInput,
  actor: PropertyRightsActorContext,
): Promise<OwnershipDisputeRecord> {
  assertRequiredRole(actor, [
    'AUTHENTICATED_PARTY',
    'AUTHORIZED_REGISTRAR',
    'RIGHTS_VERIFICATION_OFFICER',
    'REGISTRY_ADMIN',
  ]);

  if (input.attemptPlatformAdjudication || input.attemptSilentDeleteHistoricalInterest) {
    throw new PropertyRightsError(
      'DISPUTE_ADJUDICATION_PROHIBITED',
      'The Property Ownership & Rights Registry module is strictly prohibited from adjudicating legal disputes or silently deleting disputed historical interests.',
      422,
    );
  }

  if (input.affectedInterestOrRightIds.length === 0 || input.competingPartyIds.length < 2) {
    throw new PropertyRightsError(
      'VALIDATION_ERROR',
      'A dispute must reference at least one affected interest/right and at least two competing party IDs.',
      400,
    );
  }

  const nowIso = new Date().toISOString();
  const disputeId = input.id?.trim() || `disp_${crypto.randomUUID()}`;

  for (const interestId of input.affectedInterestOrRightIds) {
    const interest = await store.getOwnershipInterestById(interestId);
    if (interest) {
      await store.saveOwnershipInterest(
        {
          ...interest,
          activeDisputeIds: Array.from(new Set([...interest.activeDisputeIds, disputeId])),
          statusVector: buildMultiDimensionalStatusVector({
            ...interest.statusVector,
            verificationStatus: 'DISPUTED',
          }),
          version: interest.version + 1,
          updatedAtIso: nowIso,
        },
        interest.version,
      );
    }
  }

  const dispute: OwnershipDisputeRecord = {
    id: disputeId,
    propertyId: assertNonEmptyString(input.propertyId, 'propertyId', 120),
    affectedInterestOrRightIds: [...input.affectedInterestOrRightIds],
    competingPartyIds: [...input.competingPartyIds],
    disputeCategory: input.disputeCategory,
    supportingEvidenceIds: [...input.supportingEvidenceIds],
    disputeStatus: 'OPEN_UNRESOLVED',
    relatedLegalCaseReference: input.relatedLegalCaseReference?.trim(),
    reviewHistory: [
      {
        reviewedAtIso: nowIso,
        reviewerActorId: actor.actorId,
        note: assertNonEmptyString(input.initialReviewNote, 'initialReviewNote', 1500),
        statusAfterReview: 'OPEN_UNRESOLVED',
      },
    ],
    adjudicatedByPlatform: false,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    version: 1,
  };

  const saved = await store.saveDispute(dispute, 0);
  await store.appendHistoryEvent({
    id: `hist_${crypto.randomUUID()}`,
    propertyId: saved.propertyId,
    affectedEntityType: 'DISPUTE',
    affectedEntityId: saved.id,
    relatedEntityIds: saved.affectedInterestOrRightIds,
    previousPartyIds: [],
    newPartyIds: saved.competingPartyIds,
    eventCategory: 'DISPUTE_OPENED',
    effectiveDateIso: nowIso,
    recordedAtIso: nowIso,
    sourceVerifiedAtIso: null,
    learnedAfterEffectiveDateDays: 0,
    evidenceIds: saved.supportingEvidenceIds,
    verificationStatusAtEvent: 'DISPUTED',
    authorizedActorId: actor.actorId,
    actorRole: actor.role,
    entityVersionAfterEvent: 1,
    summary: `Opened dispute ${saved.id} (${saved.disputeCategory}) affecting [${saved.affectedInterestOrRightIds.join(', ')}]`,
  });
  return saved;
}
