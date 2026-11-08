import { DisputeResolutionCrossModuleAdapters, TransactionalDisputeResolutionStore } from './store';
import {
  DisputeActorContext,
  DisputeCaseRecord,
  DisputeCategory,
  DisputeChronologyEvent,
  DisputeClaimRecord,
  DisputeEvidenceReferenceRecord,
  DisputePartyParticipationStatus,
  DisputePartyRecord,
  DisputePartyRole,
  DisputeRelatedModuleReferences,
  DisputeResolutionError,
  DisputeResponseRecord,
  DisputeResponseStance,
} from './types';

function makeDispId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function assertDisputeCaseAccess(
  store: TransactionalDisputeResolutionStore,
  actor: DisputeActorContext,
  caseId: string
): DisputeCaseRecord {
  const c = store.getCase(caseId);
  if (!c) {
    throw new DisputeResolutionError('RESOURCE_NOT_FOUND', `Dispute case "${caseId}" not found.`, 404);
  }
  if (actor.role === 'UNRELATED_USER') {
    throw new DisputeResolutionError(
      'UNAUTHORIZED_CASE_ACCESS',
      `Actor "${actor.userId}" is not authorized to access private dispute case "${caseId}".`,
      403
    );
  }
  if (actor.role === 'MEDIATOR_OR_COORDINATOR' || c.allParticipantPartyIds.includes(actor.partyId)) {
    return c;
  }
  const parties = store.listPartiesByCase(caseId);
  if (parties.some((p) => p.partyId === actor.partyId && p.participationStatus !== 'REMOVED')) {
    return c;
  }
  throw new DisputeResolutionError(
    'UNAUTHORIZED_CASE_ACCESS',
    `Party "${actor.partyId}" is not a registered participant or representative on case "${caseId}".`,
    403
  );
}

export class IntakePartyClaimAndEvidenceService {
  constructor(
    private readonly store: TransactionalDisputeResolutionStore,
    private readonly adapters: DisputeResolutionCrossModuleAdapters
  ) {}

  public async createDisputeCase(
    actor: DisputeActorContext,
    input: {
      category: DisputeCategory;
      subtype: string;
      propertyId: string;
      relatedReferences?: DisputeRelatedModuleReferences;
      claimantPartyIds: string[];
      respondentPartyIds: string[];
      allegedIssueDescription: string;
      requestedResolutionSummary: string;
      chronology: DisputeChronologyEvent[];
      submissionChannel: DisputeCaseRecord['submissionChannel'];
      supportingEvidenceIds?: string[];
      isSyntheticTestFixture?: boolean;
      idempotencyKey?: string;
    }
  ): Promise<DisputeCaseRecord> {
    if (actor.role === 'UNRELATED_USER') {
      throw new DisputeResolutionError('UNAUTHORIZED_CASE_ACCESS', 'Unrelated user cannot open a dispute case.', 403);
    }
    if (!(await this.adapters.propertyRegistry.verifyCanonicalPropertyExists(input.propertyId))) {
      throw new DisputeResolutionError(
        'INVALID_PROPERTY_REFERENCE',
        `Canonical property "${input.propertyId}" does not exist in Property Registry.`
      );
    }
    if (
      input.relatedReferences?.transactionRef &&
      !(await this.adapters.transactions.verifyTransactionReferenceExists(input.relatedReferences.transactionRef))
    ) {
      throw new DisputeResolutionError(
        'VALIDATION_FAILED',
        `Related transaction reference "${input.relatedReferences.transactionRef}" could not be verified.`
      );
    }
    if (
      input.claimantPartyIds.length === 0 ||
      input.respondentPartyIds.length === 0 ||
      !input.allegedIssueDescription.trim()
    ) {
      throw new DisputeResolutionError(
        'VALIDATION_FAILED',
        'Dispute intake requires at least one claimant, one respondent, and a non-empty allegedIssueDescription.'
      );
    }

    return this.store.runTransaction((tx) => {
      const existingId = tx.getIdempotentEntityId('case', input.idempotencyKey);
      if (existingId) {
        const existing = tx.getCase(existingId);
        if (existing) return existing;
      }
      const now = new Date().toISOString();
      const allParticipants = Array.from(
        new Set([...input.claimantPartyIds, ...input.respondentPartyIds, actor.partyId])
      );
      const record: DisputeCaseRecord = {
        id: makeDispId('disp_case'),
        category: input.category,
        subtype: input.subtype,
        taxonomyVersion: '2026.1',
        propertyId: input.propertyId,
        relatedReferences: input.relatedReferences ?? {},
        claimantPartyIds: [...input.claimantPartyIds],
        respondentPartyIds: [...input.respondentPartyIds],
        allParticipantPartyIds: allParticipants,
        allegedIssueDescription: input.allegedIssueDescription.trim(),
        requestedResolutionSummary: input.requestedResolutionSummary.trim(),
        chronology: input.chronology,
        submissionChannel: input.submissionChannel,
        supportingEvidenceIds: input.supportingEvidenceIds ?? [],
        status: 'INTAKE_SUBMITTED',
        allegationEstablishedAsTrueByFilingAlone: false,
        isJudicialOrArbitralRuling: false,
        isSyntheticTestFixture: Boolean(input.isSyntheticTestFixture),
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveCase(record);
      tx.setIdempotentEntityId('case', input.idempotencyKey, record.id);
      tx.appendHistory({
        id: makeDispId('dhist'),
        caseId: record.id,
        propertyId: record.propertyId,
        eventType: 'CASE_INTAKE_CREATED',
        actionSummary: `Created dispute case (${record.category}/${record.subtype}); allegations remain unverified until reviewed.`,
        actorUserId: actor.userId,
        actorPartyId: actor.partyId,
        recordedAtIso: now,
      });
      return record;
    });
  }

  public retrieveDisputeCase(actor: DisputeActorContext, caseId: string): DisputeCaseRecord {
    return assertDisputeCaseAccess(this.store, actor, caseId);
  }

  public async registerDisputeParty(
    actor: DisputeActorContext,
    input: {
      caseId: string;
      partyId: string;
      role: DisputePartyRole;
      representingPartyId?: string;
      representationAuthorityEvidenceRef?: string;
      participationStatus?: DisputePartyParticipationStatus;
      contactNotificationRef?: string;
    }
  ): Promise<DisputePartyRecord> {
    const c = assertDisputeCaseAccess(this.store, actor, input.caseId);

    // Do not assume that a person is legally authorized to represent another person merely because they provide a name or email address
    if (input.role === 'AUTHORIZED_REPRESENTATIVE') {
      if (!input.representingPartyId || !input.representationAuthorityEvidenceRef) {
        throw new DisputeResolutionError(
          'REPRESENTATION_AUTHORITY_EVIDENCE_REQUIRED',
          'Registering an AUTHORIZED_REPRESENTATIVE requires both representingPartyId and representationAuthorityEvidenceRef.'
        );
      }
      if (!(await this.adapters.media.verifyMediaReferenceExists(input.representationAuthorityEvidenceRef))) {
        throw new DisputeResolutionError(
          'REPRESENTATION_AUTHORITY_EVIDENCE_REQUIRED',
          `Representation authority evidence "${input.representationAuthorityEvidenceRef}" could not be verified.`
        );
      }
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const party: DisputePartyRecord = {
        id: makeDispId('disp_party'),
        caseId: c.id,
        partyId: input.partyId,
        role: input.role,
        representingPartyId: input.representingPartyId,
        representationAuthorityEvidenceRef: input.representationAuthorityEvidenceRef,
        representationVerified: Boolean(input.representationAuthorityEvidenceRef),
        participationStatus: input.participationStatus ?? 'ACTIVE',
        contactNotificationRef: input.contactNotificationRef,
        assumesAuthorityFromNameOrEmailAlone: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveParty(party);
      tx.saveCase({
        ...c,
        allParticipantPartyIds: Array.from(new Set([...c.allParticipantPartyIds, input.partyId])),
        version: c.version + 1,
        updatedAt: now,
      });
      tx.appendHistory({
        id: makeDispId('dhist'),
        caseId: c.id,
        propertyId: c.propertyId,
        eventType: 'PARTY_REGISTERED',
        actionSummary: `Registered party ${input.partyId} as ${input.role}.`,
        actorUserId: actor.userId,
        actorPartyId: actor.partyId,
        recordedAtIso: now,
      });
      return party;
    });
  }

  public async submitDisputeClaim(
    actor: DisputeActorContext,
    input: {
      caseId: string;
      claimClassification: DisputeClaimRecord['claimClassification'];
      statementOfClaim: string;
      claimedAmountRials?: number;
      requestedRemedy: string;
      supportingEvidenceIds?: string[];
      supersedesClaimId?: string;
    }
  ): Promise<DisputeClaimRecord> {
    const c = assertDisputeCaseAccess(this.store, actor, input.caseId);

    return this.store.runTransaction((tx) => {
      let version = 1;
      if (input.supersedesClaimId) {
        const prior = tx.getClaim(input.supersedesClaimId);
        if (!prior || prior.caseId !== c.id) {
          throw new DisputeResolutionError(
            'RESOURCE_NOT_FOUND',
            `Prior claim "${input.supersedesClaimId}" not found on case "${c.id}".`,
            404
          );
        }
        version = prior.version + 1;
      }
      const now = new Date().toISOString();
      const claim: DisputeClaimRecord = {
        id: makeDispId('disp_claim'),
        caseId: c.id,
        submittedByPartyId: actor.partyId,
        claimClassification: input.claimClassification,
        statementOfClaim: input.statementOfClaim,
        claimedAmountRials: input.claimedAmountRials,
        currency: 'IRR',
        requestedRemedy: input.requestedRemedy,
        supportingEvidenceIds: input.supportingEvidenceIds ?? [],
        epistemicState:
          input.supportingEvidenceIds && input.supportingEvidenceIds.length > 0
            ? 'DOCUMENT_SUPPORTED_CLAIM'
            : 'UNVERIFIED_ALLEGATION',
        supersedesClaimId: input.supersedesClaimId,
        version,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveClaim(claim);
      tx.saveCase({
        ...c,
        status: c.status === 'INTAKE_SUBMITTED' ? 'AWAITING_RESPONSE' : c.status,
        version: c.version + 1,
        updatedAt: now,
      });
      tx.appendHistory({
        id: makeDispId('dhist'),
        caseId: c.id,
        propertyId: c.propertyId,
        eventType: 'CLAIM_SUBMITTED',
        actionSummary: `Submitted claim v${claim.version} (${claim.claimClassification}, state=${claim.epistemicState}).`,
        actorUserId: actor.userId,
        actorPartyId: actor.partyId,
        recordedAtIso: now,
      });
      return claim;
    });
  }

  public async submitDisputeResponse(
    actor: DisputeActorContext,
    input: {
      caseId: string;
      claimId: string;
      stance: DisputeResponseStance;
      responseSummary: string;
      counterclaimSummary?: string;
      supportingEvidenceIds?: string[];
    }
  ): Promise<{ response: DisputeResponseRecord; updatedClaim: DisputeClaimRecord }> {
    const c = assertDisputeCaseAccess(this.store, actor, input.caseId);
    const claim = this.store.getClaim(input.claimId);
    if (!claim || claim.caseId !== c.id) {
      throw new DisputeResolutionError('RESOURCE_NOT_FOUND', `Claim "${input.claimId}" not found on case.`, 404);
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const response: DisputeResponseRecord = {
        id: makeDispId('disp_resp'),
        caseId: c.id,
        claimId: claim.id,
        respondingPartyId: actor.partyId,
        stance: input.stance,
        responseSummary: input.responseSummary,
        counterclaimSummary: input.counterclaimSummary,
        supportingEvidenceIds: input.supportingEvidenceIds ?? [],
        createdAt: now,
      };
      const updatedClaim: DisputeClaimRecord = {
        ...claim,
        epistemicState:
          input.stance === 'ACKNOWLEDGED'
            ? 'MUTUALLY_ACKNOWLEDGED_FACT'
            : 'DISPUTED_BY_RESPONDENT',
        updatedAt: now,
      };
      tx.saveResponse(response);
      tx.saveClaim(updatedClaim);
      tx.appendHistory({
        id: makeDispId('dhist'),
        caseId: c.id,
        propertyId: c.propertyId,
        eventType: 'RESPONSE_SUBMITTED',
        actionSummary: `Respondent ${actor.partyId} responded to claim ${claim.id} with stance ${input.stance}.`,
        actorUserId: actor.userId,
        actorPartyId: actor.partyId,
        recordedAtIso: now,
      });
      return { response, updatedClaim };
    });
  }

  public async submitDisputeEvidenceReference(
    actor: DisputeActorContext,
    input: {
      caseId: string;
      evidenceCategory: string;
      mediaReferenceId: string;
      description: string;
      sourceProvenance: string;
      confidentialityTier?: DisputeEvidenceReferenceRecord['confidentialityTier'];
    }
  ): Promise<DisputeEvidenceReferenceRecord> {
    const c = assertDisputeCaseAccess(this.store, actor, input.caseId);
    if (!(await this.adapters.media.verifyMediaReferenceExists(input.mediaReferenceId))) {
      throw new DisputeResolutionError(
        'VALIDATION_FAILED',
        `Media reference "${input.mediaReferenceId}" could not be verified in the Media module.`
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const ev: DisputeEvidenceReferenceRecord = {
        id: makeDispId('disp_ev'),
        caseId: c.id,
        submittedByPartyId: actor.partyId,
        evidenceCategory: input.evidenceCategory,
        mediaReferenceId: input.mediaReferenceId,
        description: input.description,
        sourceProvenance: input.sourceProvenance,
        confidentialityTier: input.confidentialityTier ?? 'CASE_PARTICIPANTS',
        reviewState: 'SUBMITTED_UNVERIFIED',
        isAuthenticByUploadAlone: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveEvidence(ev);
      tx.appendHistory({
        id: makeDispId('dhist'),
        caseId: c.id,
        propertyId: c.propertyId,
        eventType: 'EVIDENCE_SUBMITTED',
        actionSummary: `Submitted evidence ${ev.id} (${ev.evidenceCategory}); not self-authenticated by upload.`,
        actorUserId: actor.userId,
        actorPartyId: actor.partyId,
        recordedAtIso: now,
      });
      return ev;
    });
  }

  public retrieveDisputeEvidenceReference(
    actor: DisputeActorContext,
    evidenceId: string
  ): DisputeEvidenceReferenceRecord {
    const ev = this.store.getEvidence(evidenceId);
    if (!ev) {
      throw new DisputeResolutionError('RESOURCE_NOT_FOUND', `Evidence "${evidenceId}" not found.`, 404);
    }
    assertDisputeCaseAccess(this.store, actor, ev.caseId);

    if (
      ev.confidentialityTier === 'MEDIATOR_RESTRICTED' &&
      actor.role !== 'MEDIATOR_OR_COORDINATOR' &&
      ev.submittedByPartyId !== actor.partyId
    ) {
      throw new DisputeResolutionError(
        'RESTRICTED_EVIDENCE_ACCESS_DENIED',
        `Actor "${actor.userId}" is not permitted to view mediator-restricted evidence "${evidenceId}".`,
        403
      );
    }
    return ev;
  }
}
