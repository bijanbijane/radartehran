/**
 * @file server/modules/dispute-resolution/disputeStore.ts
 * @description Storage repository interfaces and memory implementation for Dispute Resolution & Case Management.
 */

import type {
  CaseDeadline,
  CaseStatus,
  CaseTimelineEvent,
  ClaimResponse,
  DisputeCaseRecord,
  DisputeClaim,
  DisputeEvidenceReference,
  EvidenceConfidentiality,
  MediationSession,
  NegotiationProposal,
  SettlementAgreement,
} from './disputeTypes';

export interface DisputeRepository {
  saveCase(c: DisputeCaseRecord): Promise<DisputeCaseRecord>;
  getCaseById(id: string): Promise<DisputeCaseRecord | undefined>;
  getCaseByIdempotencyKey(key: string): Promise<DisputeCaseRecord | undefined>;
  listCasesForUser(userUid: string, options?: { status?: CaseStatus }): Promise<readonly DisputeCaseRecord[]>;

  saveClaim(claim: DisputeClaim): Promise<DisputeClaim>;
  getClaimById(claimId: string): Promise<DisputeClaim | undefined>;
  listClaimsForCase(caseId: string): Promise<readonly DisputeClaim[]>;

  saveResponse(resp: ClaimResponse): Promise<ClaimResponse>;
  listResponsesForClaim(claimId: string): Promise<readonly ClaimResponse[]>;

  saveEvidence(evidence: DisputeEvidenceReference): Promise<DisputeEvidenceReference>;
  listEvidenceForCase(caseId: string, allowedConfidentiality?: readonly EvidenceConfidentiality[]): Promise<readonly DisputeEvidenceReference[]>;

  saveProposal(proposal: NegotiationProposal): Promise<NegotiationProposal>;
  getProposalById(id: string): Promise<NegotiationProposal | undefined>;
  listProposalsForCase(caseId: string): Promise<readonly NegotiationProposal[]>;

  saveSettlement(agreement: SettlementAgreement): Promise<SettlementAgreement>;
  getSettlementById(id: string): Promise<SettlementAgreement | undefined>;

  saveMediationSession(session: MediationSession): Promise<MediationSession>;
  listMediationSessionsForCase(caseId: string): Promise<readonly MediationSession[]>;

  saveDeadline(deadline: CaseDeadline): Promise<CaseDeadline>;
  listDeadlinesForCase(caseId: string): Promise<readonly CaseDeadline[]>;

  appendTimelineEvent(event: CaseTimelineEvent): Promise<CaseTimelineEvent>;
  getTimelineForCase(caseId: string): Promise<readonly CaseTimelineEvent[]>;

  exportPartyDisputes(userUid: string): Promise<{
    readonly cases: readonly DisputeCaseRecord[];
    readonly claims: readonly DisputeClaim[];
    readonly proposals: readonly NegotiationProposal[];
    readonly agreements: readonly SettlementAgreement[];
  }>;
  anonymizePartyData(userUid: string): Promise<{ readonly anonymizedCount: number }>;
}

export class MemoryDisputeStore implements DisputeRepository {
  private readonly cases = new Map<string, DisputeCaseRecord>();
  private readonly idempotencyIndex = new Map<string, string>(); // idempotencyKey -> caseId
  private readonly claims = new Map<string, DisputeClaim[]>(); // caseId -> claims
  private readonly responses = new Map<string, ClaimResponse[]>(); // claimId -> responses
  private readonly evidence = new Map<string, DisputeEvidenceReference[]>(); // caseId -> evidence
  private readonly proposals = new Map<string, NegotiationProposal>();
  private readonly settlements = new Map<string, SettlementAgreement>();
  private readonly sessions = new Map<string, MediationSession[]>(); // caseId -> sessions
  private readonly deadlines = new Map<string, CaseDeadline[]>(); // caseId -> deadlines
  private readonly timeline = new Map<string, CaseTimelineEvent[]>(); // caseId -> timeline

  public async saveCase(c: DisputeCaseRecord): Promise<DisputeCaseRecord> {
    this.cases.set(c.id, c);
    this.idempotencyIndex.set(c.idempotencyKey, c.id);
    return c;
  }

  public async getCaseById(id: string): Promise<DisputeCaseRecord | undefined> {
    return this.cases.get(id);
  }

  public async getCaseByIdempotencyKey(key: string): Promise<DisputeCaseRecord | undefined> {
    const id = this.idempotencyIndex.get(key);
    if (!id) return undefined;
    return this.cases.get(id);
  }

  public async listCasesForUser(userUid: string, options?: { status?: CaseStatus }): Promise<readonly DisputeCaseRecord[]> {
    let list = Array.from(this.cases.values()).filter(
      (c) => c.claimantUid === userUid || c.respondentUid === userUid || c.assignedMediatorUid === userUid || c.assignedCaseHandlerUid === userUid,
    );
    if (options?.status) {
      list = list.filter((c) => c.status === options.status);
    }
    return list.sort((a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime());
  }

  public async saveClaim(claim: DisputeClaim): Promise<DisputeClaim> {
    const list = this.claims.get(claim.caseId) ?? [];
    list.push(claim);
    this.claims.set(claim.caseId, list);
    return claim;
  }

  public async getClaimById(claimId: string): Promise<DisputeClaim | undefined> {
    for (const list of this.claims.values()) {
      const match = list.find((c) => c.claimId === claimId);
      if (match) return match;
    }
    return undefined;
  }

  public async listClaimsForCase(caseId: string): Promise<readonly DisputeClaim[]> {
    return this.claims.get(caseId) ?? [];
  }

  public async saveResponse(resp: ClaimResponse): Promise<ClaimResponse> {
    const list = this.responses.get(resp.claimId) ?? [];
    list.push(resp);
    this.responses.set(resp.claimId, list);
    return resp;
  }

  public async listResponsesForClaim(claimId: string): Promise<readonly ClaimResponse[]> {
    return this.responses.get(claimId) ?? [];
  }

  public async saveEvidence(evidence: DisputeEvidenceReference): Promise<DisputeEvidenceReference> {
    const list = this.evidence.get(evidence.caseId) ?? [];
    list.push(evidence);
    this.evidence.set(evidence.caseId, list);
    return evidence;
  }

  public async listEvidenceForCase(
    caseId: string,
    allowedConfidentiality?: readonly EvidenceConfidentiality[],
  ): Promise<readonly DisputeEvidenceReference[]> {
    const all = this.evidence.get(caseId) ?? [];
    if (!allowedConfidentiality) return all;
    return all.filter((e) => allowedConfidentiality.includes(e.confidentiality));
  }

  public async saveProposal(proposal: NegotiationProposal): Promise<NegotiationProposal> {
    this.proposals.set(proposal.proposalId, proposal);
    return proposal;
  }

  public async getProposalById(id: string): Promise<NegotiationProposal | undefined> {
    return this.proposals.get(id);
  }

  public async listProposalsForCase(caseId: string): Promise<readonly NegotiationProposal[]> {
    return Array.from(this.proposals.values()).filter((p) => p.caseId === caseId);
  }

  public async saveSettlement(agreement: SettlementAgreement): Promise<SettlementAgreement> {
    this.settlements.set(agreement.agreementId, agreement);
    return agreement;
  }

  public async getSettlementById(id: string): Promise<SettlementAgreement | undefined> {
    return this.settlements.get(id);
  }

  public async saveMediationSession(session: MediationSession): Promise<MediationSession> {
    const list = this.sessions.get(session.caseId) ?? [];
    list.push(session);
    this.sessions.set(session.caseId, list);
    return session;
  }

  public async listMediationSessionsForCase(caseId: string): Promise<readonly MediationSession[]> {
    return this.sessions.get(caseId) ?? [];
  }

  public async saveDeadline(deadline: CaseDeadline): Promise<CaseDeadline> {
    const list = this.deadlines.get(deadline.caseId) ?? [];
    list.push(deadline);
    this.deadlines.set(deadline.caseId, list);
    return deadline;
  }

  public async listDeadlinesForCase(caseId: string): Promise<readonly CaseDeadline[]> {
    return this.deadlines.get(caseId) ?? [];
  }

  public async appendTimelineEvent(event: CaseTimelineEvent): Promise<CaseTimelineEvent> {
    const list = this.timeline.get(event.caseId) ?? [];
    list.push(event);
    this.timeline.set(event.caseId, list);
    return event;
  }

  public async getTimelineForCase(caseId: string): Promise<readonly CaseTimelineEvent[]> {
    return this.timeline.get(caseId) ?? [];
  }

  public async exportPartyDisputes(userUid: string): Promise<{
    readonly cases: readonly DisputeCaseRecord[];
    readonly claims: readonly DisputeClaim[];
    readonly proposals: readonly NegotiationProposal[];
    readonly agreements: readonly SettlementAgreement[];
  }> {
    const userCases = await this.listCasesForUser(userUid);
    const caseIds = new Set(userCases.map((c) => c.id));

    const allClaims: DisputeClaim[] = [];
    for (const c of userCases) {
      allClaims.push(...(this.claims.get(c.id) ?? []));
    }

    const allProposals = Array.from(this.proposals.values()).filter((p) => caseIds.has(p.caseId));
    const allAgreements = Array.from(this.settlements.values()).filter((s) => caseIds.has(s.caseId));

    return {
      cases: userCases,
      claims: allClaims,
      proposals: allProposals,
      agreements: allAgreements,
    };
  }

  public async anonymizePartyData(userUid: string): Promise<{ readonly anonymizedCount: number }> {
    let count = 0;
    for (const [id, c] of this.cases.entries()) {
      let modified = false;
      let newClaimant = c.claimantUid;
      let newRespondent = c.respondentUid;

      if (c.claimantUid === userUid) {
        newClaimant = 'ANONYMIZED_USER';
        modified = true;
      }
      if (c.respondentUid === userUid) {
        newRespondent = 'ANONYMIZED_USER';
        modified = true;
      }

      if (modified) {
        this.cases.set(id, {
          ...c,
          claimantUid: newClaimant,
          respondentUid: newRespondent,
          updatedAtIso: new Date().toISOString(),
        });
        count += 1;
      }
    }
    return { anonymizedCount: count };
  }
}
