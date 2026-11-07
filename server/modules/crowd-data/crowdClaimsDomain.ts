/**
 * @fileoverview Domain 1: Crowd Claims Backend Service (`server/modules/crowd-data/crowdClaimsDomain.ts`).
 */

import {
  DEFAULT_INITIAL_TRUST_WEIGHT,
  evaluateClaimPlausibility,
  normalizeStreetName,
} from '../../../src/cells/knowledge-crowd/crowdClaimsEngine';
import { CORRECTABLE_FIELD_METADATA } from '../../../src/utils/buyerCorrectionAndAdminGovernance';
import { sanitizeInput } from '../../../src/utils/security';
import {
  CROWD_CLAIM_ALLOWED_TRANSITIONS,
  detectDuplicateCrowdClaims,
  VALID_CLAIM_CATEGORIES,
  validateEvidenceReferences,
} from './crowdClaimsValidators';
import {
  assertAdminPrivilege,
  assertAuthenticatedActor,
  assertOwnerPrivilege,
  CrowdDataDomainError,
  type CrowdDataPersistenceStore,
  validateAuthoritativeNeighborhoodReference,
} from './persistenceAdapter';
import type {
  ActorContext,
  ClaimAuditEvent,
  CrowdClaimRecord,
  ModerateCrowdClaimRequest,
  SubmitCrowdClaimRequest,
  UpdateOwnCrowdClaimRequest,
} from './types';

export {
  CROWD_CLAIM_ALLOWED_TRANSITIONS,
  detectDuplicateCrowdClaims,
  validateEvidenceReferences,
} from './crowdClaimsValidators';

export class CrowdClaimsDomainService {
  private readonly store: CrowdDataPersistenceStore;

  constructor(store: CrowdDataPersistenceStore) {
    this.store = store;
  }

  public async submitClaim(
    actorInput: ActorContext,
    request: SubmitCrowdClaimRequest,
    nowMs = Date.now()
  ): Promise<CrowdClaimRecord> {
    const actor = assertAuthenticatedActor(actorInput);
    const hoodRef = validateAuthoritativeNeighborhoodReference(request.cityId, request.hoodId);

    if (!VALID_CLAIM_CATEGORIES.has(request.category)) {
      throw new CrowdDataDomainError('VALIDATION_FAILED', `Unsupported claim category: '${String(request.category)}'.`);
    }
    const streetDisplayFa = sanitizeInput(request.streetName, 120);
    const streetKeyNormalized = normalizeStreetName(streetDisplayFa);
    if (streetKeyNormalized.length < 2) {
      throw new CrowdDataDomainError('VALIDATION_FAILED', 'Street name must be at least 2 characters.');
    }
    const narrativeFa = sanitizeInput(request.narrativeFa, 1000);
    if (narrativeFa.length < 10) {
      throw new CrowdDataDomainError('VALIDATION_FAILED', 'Claim narrative must be at least 10 characters.');
    }
    if (request.category === 'NEIGHBORHOOD_ATTRIBUTE_CORRECTION' && request.correctedFieldKey) {
      if (!(request.correctedFieldKey in CORRECTABLE_FIELD_METADATA)) {
        throw new CrowdDataDomainError(
          'VALIDATION_FAILED',
          `Field '${request.correctedFieldKey}' is not a valid correctable neighborhood attribute.`
        );
      }
    }

    const buySqm = request.assertedBuyPerSqmMillionToman;
    if (request.category === 'DEAL_PRICE_REPORT') {
      if (typeof buySqm !== 'number' || !Number.isFinite(buySqm) || buySqm <= 0) {
        throw new CrowdDataDomainError('VALIDATION_FAILED', 'DEAL_PRICE_REPORT requires a positive assertedBuyPerSqmMillionToman.');
      }
    }

    const nowIso = new Date(nowMs).toISOString();
    const evidenceRefs = validateEvidenceReferences(request.evidenceRefs, nowIso);
    const plausibility = evaluateClaimPlausibility({
      category: buySqm !== undefined ? 'PRICE_OBSERVATION' : 'DATA_CORRECTION',
      estimatedPriceSqm: buySqm,
      baseHoodPriceSqm: hoodRef.baseBuyPerSqmMillionToman,
      narrativeText: narrativeFa,
      evidenceMediaObjectIds: evidenceRefs.map((e) => e.evidenceId),
    });
    const devRatio = plausibility.deviationRatio ?? 0;
    const plausibilityStatus = plausibility.flaggedUnverifiedPriceOutlier
      ? 'rejected_outlier'
      : devRatio > 0.15
        ? 'needs_review'
        : 'plausible';

    const existingInHood = await this.store.listClaimsByNeighborhood(hoodRef.cityId, hoodRef.hoodId);
    const duplicateCheck = detectDuplicateCrowdClaims(
      {
        cityId: hoodRef.cityId,
        hoodId: hoodRef.hoodId,
        streetKeyNormalized,
        category: request.category,
        assertedBuyPerSqmMillionToman: buySqm,
        narrativeFa,
      },
      existingInHood
    );

    const claimId = `cclaim_${hoodRef.cityId}_${hoodRef.hoodId}_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const initialAudit: ClaimAuditEvent = {
      eventId: `audit_${claimId}_1`,
      claimId,
      eventType: 'CLAIM_SUBMITTED',
      fromState: null,
      toState: 'SUBMITTED',
      actorUid: actor.uid,
      actorRole: 'OWNER',
      occurredAtIso: nowIso,
      reason: duplicateCheck.isDuplicate
        ? `Submitted (flagged potential duplicate of ${duplicateCheck.primaryDuplicateClaimId})`
        : 'Initial user claim submission',
      revision: 1,
    };

    const record: CrowdClaimRecord = {
      claimId,
      epistemicClass: 'UNVERIFIED_CROWD_CLAIM',
      authoritativeDataEligible: false,
      cityId: hoodRef.cityId,
      hoodId: hoodRef.hoodId,
      hoodName: hoodRef.hoodName,
      streetKeyNormalized,
      streetDisplayFa,
      category: request.category,
      state: 'SUBMITTED',
      assertedBuyPerSqmMillionToman: buySqm,
      assertedRahn80mMillionToman: request.assertedRahn80mMillionToman,
      sqm: request.sqm,
      narrativeFa,
      correctedFieldKey: request.correctedFieldKey,
      evidenceRefs,
      provenance: {
        authorUid: actor.uid,
        submissionChannel: request.submissionChannel ?? 'WEB_APP',
        submittedAtIso: nowIso,
        sourceObservationDateIso: request.sourceObservationDateIso ?? nowIso,
        contributorTrustWeightAtSubmission: DEFAULT_INITIAL_TRUST_WEIGHT,
        clientSessionRef: actor.sessionId,
      },
      plausibilityStatus,
      plausibilityDeviationRatio: devRatio,
      plausibilityReason: plausibility.reasonFa,
      duplicateCheck,
      disputeCount: 0,
      disputeReasons: [],
      revision: 1,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      auditHistory: [initialAudit],
    };

    return this.store.createClaim(record);
  }

  public async updateOwnClaim(
    actorInput: ActorContext,
    request: UpdateOwnCrowdClaimRequest,
    nowMs = Date.now()
  ): Promise<CrowdClaimRecord> {
    const actor = assertAuthenticatedActor(actorInput);
    const nowIso = new Date(nowMs).toISOString();

    return this.store.updateClaimAtomically(request.claimId, request.expectedRevision, (current) => {
      assertOwnerPrivilege(actor, current.provenance.authorUid);
      if (current.state !== 'SUBMITTED' && current.state !== 'UNDER_REVIEW' && current.state !== 'DISPUTED') {
        throw new CrowdDataDomainError('INVALID_STATE_TRANSITION', `Owner cannot modify claim in state '${current.state}'.`, 409);
      }
      const nextNarrative =
        request.narrativeFa !== undefined ? sanitizeInput(request.narrativeFa, 1000) : current.narrativeFa;
      if (nextNarrative.length < 10) {
        throw new CrowdDataDomainError('VALIDATION_FAILED', 'Updated narrative must be at least 10 characters.');
      }
      const nextEvidence =
        request.evidenceRefs !== undefined ? validateEvidenceReferences(request.evidenceRefs, nowIso) : current.evidenceRefs;
      const nextRevision = current.revision + 1;
      const auditEvent: ClaimAuditEvent = {
        eventId: `audit_${current.claimId}_${nextRevision}`,
        claimId: current.claimId,
        eventType: 'CLAIM_UPDATED_BY_OWNER',
        fromState: current.state,
        toState: current.state,
        actorUid: actor.uid,
        actorRole: 'OWNER',
        occurredAtIso: nowIso,
        reason: 'Owner updated claim details/evidence',
        revision: nextRevision,
      };
      return {
        ...current,
        narrativeFa: nextNarrative,
        assertedBuyPerSqmMillionToman: request.assertedBuyPerSqmMillionToman ?? current.assertedBuyPerSqmMillionToman,
        assertedRahn80mMillionToman: request.assertedRahn80mMillionToman ?? current.assertedRahn80mMillionToman,
        evidenceRefs: nextEvidence,
        revision: nextRevision,
        updatedAtIso: nowIso,
        auditHistory: [...current.auditHistory, auditEvent],
      };
    });
  }

  public async withdrawOwnClaim(
    actorInput: ActorContext,
    claimId: string,
    reason: string,
    expectedRevision?: number,
    nowMs = Date.now()
  ): Promise<CrowdClaimRecord> {
    const actor = assertAuthenticatedActor(actorInput);
    const nowIso = new Date(nowMs).toISOString();
    return this.store.updateClaimAtomically(claimId, expectedRevision, (current) => {
      assertOwnerPrivilege(actor, current.provenance.authorUid);
      if (!CROWD_CLAIM_ALLOWED_TRANSITIONS[current.state].includes('WITHDRAWN')) {
        throw new CrowdDataDomainError('INVALID_STATE_TRANSITION', `Cannot withdraw claim from state '${current.state}'.`, 409);
      }
      const nextRevision = current.revision + 1;
      const auditEvent: ClaimAuditEvent = {
        eventId: `audit_${current.claimId}_${nextRevision}`,
        claimId: current.claimId,
        eventType: 'CLAIM_WITHDRAWN_BY_OWNER',
        fromState: current.state,
        toState: 'WITHDRAWN',
        actorUid: actor.uid,
        actorRole: 'OWNER',
        occurredAtIso: nowIso,
        reason: sanitizeInput(reason || 'Withdrawn by claim author', 240),
        revision: nextRevision,
      };
      return {
        ...current,
        state: 'WITHDRAWN',
        epistemicClass: 'UNVERIFIED_CROWD_CLAIM',
        revision: nextRevision,
        updatedAtIso: nowIso,
        auditHistory: [...current.auditHistory, auditEvent],
      };
    });
  }

  public async moderateClaim(
    actorInput: ActorContext,
    request: ModerateCrowdClaimRequest,
    nowMs = Date.now()
  ): Promise<CrowdClaimRecord> {
    assertAdminPrivilege(actorInput);
    const cleanReason = sanitizeInput(request.reason, 400);
    if (cleanReason.length < 4) {
      throw new CrowdDataDomainError('VALIDATION_FAILED', 'Moderation reason must be at least 4 characters.');
    }
    const nowIso = new Date(nowMs).toISOString();

    return this.store.updateClaimAtomically(request.claimId, request.expectedRevision, (current) => {
      if (current.provenance.authorUid === actorInput.uid && request.targetState === 'ACCEPTED') {
        throw new CrowdDataDomainError('FORBIDDEN_ADMIN_REQUIRED', 'Conflict of interest: claim author cannot self-accept their own crowd claim.', 403);
      }
      if (!CROWD_CLAIM_ALLOWED_TRANSITIONS[current.state].includes(request.targetState)) {
        throw new CrowdDataDomainError('INVALID_STATE_TRANSITION', `Illegal claim state transition from '${current.state}' to '${request.targetState}'.`, 409);
      }
      if (request.targetState === 'ACCEPTED' && current.plausibilityStatus === 'rejected_outlier' && current.evidenceRefs.length === 0) {
        throw new CrowdDataDomainError('VALIDATION_FAILED', 'Outlier claims (>45% deviation from baseline) cannot be ACCEPTED without supporting evidence references.', 422);
      }

      const nextRevision = current.revision + 1;
      const eventTypeMap = {
        UNDER_REVIEW: 'CLAIM_MOVED_TO_REVIEW',
        ACCEPTED: 'CLAIM_ACCEPTED_BY_MODERATOR',
        REJECTED: 'CLAIM_REJECTED_BY_MODERATOR',
        DISPUTED: 'CLAIM_DISPUTED',
      } as const;

      const auditEvent: ClaimAuditEvent = {
        eventId: `audit_${current.claimId}_${nextRevision}`,
        claimId: current.claimId,
        eventType: eventTypeMap[request.targetState],
        fromState: current.state,
        toState: request.targetState,
        actorUid: actorInput.uid,
        actorRole: 'MODERATOR',
        occurredAtIso: nowIso,
        reason: cleanReason,
        revision: nextRevision,
      };

      return {
        ...current,
        state: request.targetState,
        epistemicClass: request.targetState === 'ACCEPTED' ? 'MODERATED_CROWD_CLAIM' : 'UNVERIFIED_CROWD_CLAIM',
        authoritativeDataEligible: false,
        moderationNote: cleanReason,
        moderatedByUid: actorInput.uid,
        moderatedAtIso: nowIso,
        revision: nextRevision,
        updatedAtIso: nowIso,
        auditHistory: [...current.auditHistory, auditEvent],
      };
    });
  }

  public async disputeClaim(
    actorInput: ActorContext,
    claimId: string,
    disputeReason: string,
    expectedRevision?: number,
    nowMs = Date.now()
  ): Promise<CrowdClaimRecord> {
    const actor = assertAuthenticatedActor(actorInput);
    const cleanReason = sanitizeInput(disputeReason, 300);
    if (cleanReason.length < 6) {
      throw new CrowdDataDomainError('VALIDATION_FAILED', 'Dispute reason must be at least 6 characters.');
    }
    const nowIso = new Date(nowMs).toISOString();

    return this.store.updateClaimAtomically(claimId, expectedRevision, (current) => {
      if (!CROWD_CLAIM_ALLOWED_TRANSITIONS[current.state].includes('DISPUTED')) {
        throw new CrowdDataDomainError('INVALID_STATE_TRANSITION', `Claim in state '${current.state}' cannot transition to DISPUTED.`, 409);
      }
      const nextRevision = current.revision + 1;
      const auditEvent: ClaimAuditEvent = {
        eventId: `audit_${current.claimId}_${nextRevision}`,
        claimId: current.claimId,
        eventType: 'CLAIM_DISPUTED',
        fromState: current.state,
        toState: 'DISPUTED',
        actorUid: actor.uid,
        actorRole: actor.isAdmin ? 'MODERATOR' : 'COMMUNITY_DISPUTER',
        occurredAtIso: nowIso,
        reason: cleanReason,
        revision: nextRevision,
      };
      return {
        ...current,
        state: 'DISPUTED',
        epistemicClass: 'UNVERIFIED_CROWD_CLAIM',
        disputeCount: current.disputeCount + 1,
        disputeReasons: [...current.disputeReasons, cleanReason],
        revision: nextRevision,
        updatedAtIso: nowIso,
        auditHistory: [...current.auditHistory, auditEvent],
      };
    });
  }

  public async getClaimById(claimId: string): Promise<CrowdClaimRecord | null> {
    return this.store.getClaim(claimId);
  }

  public async listNeighborhoodClaims(cityId: unknown, hoodId: unknown): Promise<CrowdClaimRecord[]> {
    const hoodRef = validateAuthoritativeNeighborhoodReference(cityId, hoodId);
    return this.store.listClaimsByNeighborhood(hoodRef.cityId, hoodRef.hoodId);
  }
}
