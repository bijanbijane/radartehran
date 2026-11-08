import assert from 'node:assert/strict';
import {
  createDisputeResolutionModuleFacade,
  DisputeActorContext,
  DisputeResolutionError,
} from '../index';

const claimantActor: DisputeActorContext = {
  userId: 'user-claimant-1',
  partyId: 'party-claimant-1',
  role: 'CASE_PARTY',
};
const respondentActor: DisputeActorContext = {
  userId: 'user-respondent-1',
  partyId: 'party-respondent-1',
  role: 'CASE_PARTY',
};
const mediatorActor: DisputeActorContext = {
  userId: 'user-mediator-1',
  partyId: 'party-mediator-1',
  role: 'MEDIATOR_OR_COORDINATOR',
};
const unrelatedActor: DisputeActorContext = {
  userId: 'user-stranger-99',
  partyId: 'party-stranger-99',
  role: 'UNRELATED_USER',
};

async function runDisputeResolutionTests(): Promise<void> {
  const facade = createDisputeResolutionModuleFacade();
  const { intakePartyClaimAndEvidenceService, mediationSettlementResolutionAndHistoryService, store } = facade;

  const disputeCase = await intakePartyClaimAndEvidenceService.createDisputeCase(claimantActor, {
    category: 'DEPOSIT_AND_REFUND_DISPUTE',
    subtype: 'SECURITY_DEPOSIT_RETENTION',
    propertyId: 'prop-tehran-404',
    relatedReferences: { transactionRef: 'retx-404' },
    claimantPartyIds: [claimantActor.partyId],
    respondentPartyIds: [respondentActor.partyId],
    allegedIssueDescription: 'Security deposit of 5B IRR not returned after lease expiration.',
    requestedResolutionSummary: 'Full return of 5B IRR deposit.',
    chronology: [{ occurredAtIso: '2026-04-01T00:00:00.000Z', summary: 'Lease ended', reportedByPartyId: claimantActor.partyId }],
    submissionChannel: 'WEB_PORTAL',
    isSyntheticTestFixture: true,
    idempotencyKey: 'idem-disp-1',
  });
  assert.equal(disputeCase.allegationEstablishedAsTrueByFilingAlone, false);
  assert.equal(disputeCase.isJudicialOrArbitralRuling, false);

  await assert.rejects(
    () =>
      intakePartyClaimAndEvidenceService.registerDisputeParty(claimantActor, {
        caseId: disputeCase.id,
        partyId: 'party-lawyer-1',
        role: 'AUTHORIZED_REPRESENTATIVE',
        representingPartyId: claimantActor.partyId,
      }),
    (err: unknown) =>
      err instanceof DisputeResolutionError && err.code === 'REPRESENTATION_AUTHORITY_EVIDENCE_REQUIRED'
  );

  const claimV1 = await intakePartyClaimAndEvidenceService.submitDisputeClaim(claimantActor, {
    caseId: disputeCase.id,
    claimClassification: 'DEPOSIT_RETENTION_OR_RETURN',
    statementOfClaim: 'Claiming 5B IRR deposit return',
    claimedAmountRials: 5_000_000_000,
    requestedRemedy: 'Refund',
  });
  assert.equal(claimV1.epistemicState, 'UNVERIFIED_ALLEGATION');

  const { updatedClaim } = await intakePartyClaimAndEvidenceService.submitDisputeResponse(respondentActor, {
    caseId: disputeCase.id,
    claimId: claimV1.id,
    stance: 'DENIED',
    responseSummary: 'Deduction claimed for unpaid utility bills',
  });
  assert.equal(updatedClaim.epistemicState, 'DISPUTED_BY_RESPONDENT');

  await mediationSettlementResolutionAndHistoryService.recordCaseCommunication(claimantActor, {
    caseId: disputeCase.id,
    visibility: 'CAUCUS_PRIVATE_MEDIATION_NOTE',
    subject: 'Private settlement floor',
    messageBody: 'Would settle for 4.5B IRR',
  });
  const respondentComms = mediationSettlementResolutionAndHistoryService.retrieveCaseCommunications(
    respondentActor,
    disputeCase.id
  );
  assert.equal(respondentComms.length, 0);

  const proposal = await mediationSettlementResolutionAndHistoryService.submitSettlementProposal(claimantActor, {
    caseId: disputeCase.id,
    proposedTermsSummary: 'Return 4.7B IRR within 5 days',
    proposedSettlementAmountRials: 4_700_000_000,
    expirationDateIso: '2027-01-01T00:00:00.000Z',
  });
  assert.equal(proposal.status, 'PARTIALLY_ACCEPTED');

  await assert.rejects(
    () =>
      mediationSettlementResolutionAndHistoryService.recordResolutionOutcome(mediatorActor, {
        caseId: disputeCase.id,
        outcomeType: 'MUTUAL_SETTLEMENT_AGREEMENT',
        linkedSettlementProposalId: proposal.id,
        resolutionSummary: 'Premature resolution before respondent acceptance',
      }),
    (err: unknown) =>
      err instanceof DisputeResolutionError && err.code === 'SETTLEMENT_REQUIRES_MUTUAL_PARTY_ACCEPTANCE'
  );

  await mediationSettlementResolutionAndHistoryService.acceptSettlementProposal(respondentActor, {
    proposalId: proposal.id,
  });
  const resolved = await mediationSettlementResolutionAndHistoryService.recordResolutionOutcome(mediatorActor, {
    caseId: disputeCase.id,
    outcomeType: 'MUTUAL_SETTLEMENT_AGREEMENT',
    linkedSettlementProposalId: proposal.id,
    resolutionSummary: 'Mutual settlement reached at 4.7B IRR',
    agreedSettlementAmountRials: 4_700_000_000,
  });
  assert.equal(resolved.outcome.isCourtOrArbitrationJudgment, false);
  assert.equal(resolved.outcome.executesPaymentDirectly, false);
  assert.equal(resolved.updatedCase.status, 'RESOLVED');

  assert.throws(
    () => intakePartyClaimAndEvidenceService.retrieveDisputeCase(unrelatedActor, disputeCase.id),
    (err: unknown) => err instanceof DisputeResolutionError && err.code === 'UNAUTHORIZED_CASE_ACCESS'
  );
  assert.throws(
    () => store.attemptDirectCrossModuleWrite('properties'),
    (err: unknown) => err instanceof DisputeResolutionError && err.code === 'CROSS_MODULE_WRITE_FORBIDDEN'
  );
  console.log('All Dispute Resolution & Case Management Backend tests passed!');
}

runDisputeResolutionTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
