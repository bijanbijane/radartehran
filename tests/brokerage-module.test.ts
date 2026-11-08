import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  TransactionContextLike,
  TransactionRunnerAdapter,
  createFirestoreIdempotencyStoreAdapter,
  AuthenticatedPrincipal,
} from '../server/modules/core';
import {
  createBrokerageService,
  createBrokerageRouter,
  BrokerageDependencies,
} from '../server/modules/brokerage';

function createInMemoryHarness() {
  const store = new Map<string, Record<string, unknown>>();
  const notifications: Array<Record<string, unknown>> = [];
  const telemetryEvents: Array<Record<string, unknown>> = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  let idCounter = 2000;

  const txRunner: TransactionRunnerAdapter = {
    async runTransaction<T>(fn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<Doc = Record<string, unknown>>(docPath: string) {
          const val = staged.has(docPath) ? staged.get(docPath) : store.get(docPath);
          if (!val) return { exists: false };
          return { exists: true, data: structuredClone(val) as unknown as Doc };
        },
        set(docPath: string, data: Record<string, unknown>, options?: { merge?: boolean }) {
          if (options?.merge) {
            const existing = staged.get(docPath) ?? store.get(docPath) ?? {};
            staged.set(docPath, { ...structuredClone(existing), ...structuredClone(data) });
          } else {
            staged.set(docPath, structuredClone(data));
          }
        },
        update(docPath: string, partialData: Record<string, unknown>) {
          const existing = staged.get(docPath) ?? store.get(docPath) ?? {};
          staged.set(docPath, { ...structuredClone(existing), ...structuredClone(partialData) });
        },
        delete(docPath: string) {
          staged.set(docPath, null);
        },
      };
      const res = await fn(tx);
      for (const [k, v] of staged.entries()) {
        if (v === null) store.delete(k);
        else store.set(k, v);
      }
      return res;
    },
  };

  const idempotencyStore = createFirestoreIdempotencyStoreAdapter(txRunner);

  const deps: BrokerageDependencies = {
    txRunner,
    idempotencyStore,
    tokenVerifier: {
      async verifyIdToken(token: string) {
        const map: Record<string, { uid: string; email: string }> = {
          token_brk_owner_00001: { uid: 'uid_brk_owner', email: 'brkowner@example.com' },
          token_agent_a_0000001: { uid: 'uid_agent_a', email: 'agenta@example.com' },
          token_agent_b_0000001: { uid: 'uid_agent_b', email: 'agentb@example.com' },
          token_other_brk_00001: { uid: 'uid_other_brk', email: 'other@example.com' },
          token_client_user_001: { uid: 'uid_client_1', email: 'client1@example.com' },
          token_admin_platform1: { uid: 'uid_platform_admin', email: 'admin@tehranradar.ir' },
        };
        const hit = map[token];
        if (!hit) throw new Error('Invalid token');
        return { uid: hit.uid, email: hit.email, email_verified: true };
      },
    },
    adminStore: {
      async getDelegatedAdminByUid() {
        return null;
      },
    },
    auditSink: {
      async writeAuditEvent(event) {
        auditEvents.push(event as unknown as Record<string, unknown>);
      },
    },
    primaryAdminEmails: ['admin@tehranradar.ir'],
    notificationEmitter: async (ev: unknown) => {
      notifications.push(ev as Record<string, unknown>);
    },
    telemetryEmitter: (ev: unknown) => {
      telemetryEvents.push(ev as Record<string, unknown>);
    },
    idGenerator: (prefix: string) => `${prefix}_${++idCounter}`,
    nowFn: () => Date.parse('2026-11-08T10:00:00.000Z'),
  };

  return { store, deps, notifications, telemetryEvents, auditEvents };
}

const brkOwner: AuthenticatedPrincipal = {
  uid: 'uid_brk_owner',
  email: 'brkowner@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  claims: {},
};

const agentA: AuthenticatedPrincipal = {
  uid: 'uid_agent_a',
  email: 'agenta@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  claims: {},
};

const agentB: AuthenticatedPrincipal = {
  uid: 'uid_agent_b',
  email: 'agentb@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  claims: {},
};

const otherBrokerageOwner: AuthenticatedPrincipal = {
  uid: 'uid_other_brk',
  email: 'other@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  claims: {},
};

const clientPrincipal: AuthenticatedPrincipal = {
  uid: 'uid_client_1',
  email: 'client1@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  claims: {},
};

describe('Employee 57 — Real Estate Brokerage, Agent Operations and Commission Management Backend', () => {
  it('manages brokerage creation, agent profiles, memberships, role authorization, teams, and client access isolation', async () => {
    const { deps } = createInMemoryHarness();
    const service = createBrokerageService(deps);

    const { brokerage } = await service.createBrokerageOrganization(
      brkOwner,
      {
        legalName: 'Shemiranat Royal Real Estate Co.',
        displayName: 'Shemiranat Royal Brokerage',
        cityId: 'tehran',
        officeIds: ['office_niavaran_1'],
      },
      'idem_brk_1',
    );
    assert.equal(brokerage.status, 'ACTIVE');
    assert.equal(brokerage.verificationStatus, 'UNVERIFIED');

    const replay = await service.createBrokerageOrganization(
      brkOwner,
      {
        legalName: 'Shemiranat Royal Real Estate Co.',
        displayName: 'Shemiranat Royal Brokerage',
        cityId: 'tehran',
        officeIds: ['office_niavaran_1'],
      },
      'idem_brk_1',
    );
    assert.equal(replay.brokerage.brokerageId, brokerage.brokerageId);

    await assert.rejects(
      () =>
        service.updateBrokerageOrganization(brkOwner, {
          brokerageId: brokerage.brokerageId,
          verificationStatus: 'VERIFIED',
        }),
      /Only platform administrators can mark a brokerage organization as VERIFIED/,
    );

    const { agent: profileA } = await service.upsertAgentProfile(agentA, {
      userUid: 'uid_agent_a',
      displayName: 'Reza Tehrani',
      yearsOfExperience: 7,
      serviceNeighborhoodIds: ['niavaran', 'farmanieh'],
      propertyCategories: ['RESIDENTIAL', 'COMMERCIAL'],
      transactionCategories: ['SALE', 'RENTAL'],
    });
    const { agent: profileB } = await service.upsertAgentProfile(agentB, {
      userUid: 'uid_agent_b',
      displayName: 'Sara Kamali',
      yearsOfExperience: 4,
      serviceNeighborhoodIds: ['saadat_abad'],
      propertyCategories: ['OFFICE'],
      transactionCategories: ['RENTAL', 'LEASE'],
    });

    const { membership: memA } = await service.inviteMember(brkOwner, {
      brokerageId: brokerage.brokerageId,
      agentId: profileA.agentId,
      userUid: 'uid_agent_a',
      role: 'SENIOR_AGENT',
    });
    const { membership: memB } = await service.inviteMember(brkOwner, {
      brokerageId: brokerage.brokerageId,
      agentId: profileB.agentId,
      userUid: 'uid_agent_b',
      role: 'AGENT',
    });

    await assert.rejects(
      () =>
        service.inviteMember(brkOwner, {
          brokerageId: brokerage.brokerageId,
          agentId: profileA.agentId,
          userUid: 'uid_agent_a',
          role: 'AGENT',
        }),
      /already has an active or pending membership/,
    );

    await assert.rejects(
      () =>
        service.transitionMembership(agentA, {
          membershipId: memA.membershipId,
          status: 'ACTIVE',
          role: 'BROKERAGE_ADMIN',
        }),
      /cannot elevate or change their own brokerage role/,
    );

    await service.transitionMembership(agentA, {
      membershipId: memA.membershipId,
      status: 'ACTIVE',
    });
    await service.transitionMembership(agentB, {
      membershipId: memB.membershipId,
      status: 'ACTIVE',
    });

    const { team: teamNorth } = await service.createTeam(brkOwner, {
      brokerageId: brokerage.brokerageId,
      name: 'Niavaran Luxury Team',
      leaderUid: 'uid_agent_a',
      memberUids: ['uid_agent_a'],
    });
    const { team: teamWest } = await service.createTeam(brkOwner, {
      brokerageId: brokerage.brokerageId,
      name: 'West Commercial Team',
      leaderUid: 'uid_agent_b',
      memberUids: ['uid_agent_b'],
    });

    const transferRes = await service.transferTeamMember(brkOwner, {
      brokerageId: brokerage.brokerageId,
      fromTeamId: teamWest.teamId,
      toTeamId: teamNorth.teamId,
      userUid: 'uid_agent_b',
    });
    assert.ok(transferRes.toTeam.memberUids.includes('uid_agent_b'));

    const { client: clientA } = await service.createClient(agentA, {
      brokerageId: brokerage.brokerageId,
      clientUserUid: 'uid_client_1',
      displayName: 'Dr. Kaviani',
      categories: ['BUYER', 'INVESTOR'],
      assignedAgentUid: 'uid_agent_a',
      teamId: teamNorth.teamId,
    });

    await assert.rejects(
      () => service.getClient(agentB, clientA.clientId),
      /Access denied to another agent or team private client record/,
    );

    await assert.rejects(
      () => service.getClient(otherBrokerageOwner, clientA.clientId),
      /does not belong to this brokerage organization/,
    );
  });

  it('executes deterministic lead distribution, prevents duplicate assignment, manages follow-ups, viewings, and communications', async () => {
    const { deps } = createInMemoryHarness();
    const service = createBrokerageService(deps);

    const { brokerage } = await service.createBrokerageOrganization(brkOwner, {
      displayName: 'Tehran Prime Brokerage',
      cityId: 'tehran',
    });

    const { agent: agtA } = await service.upsertAgentProfile(agentA, {
      userUid: 'uid_agent_a',
      displayName: 'Agent A',
      yearsOfExperience: 5,
      serviceNeighborhoodIds: ['niavaran'],
      propertyCategories: ['RESIDENTIAL'],
      transactionCategories: ['SALE'],
    });
    const { agent: agtB } = await service.upsertAgentProfile(agentB, {
      userUid: 'uid_agent_b',
      displayName: 'Agent B',
      yearsOfExperience: 5,
      serviceNeighborhoodIds: ['saadat_abad'],
      propertyCategories: ['COMMERCIAL'],
      transactionCategories: ['SALE'],
    });

    const { membership: mA } = await service.inviteMember(brkOwner, {
      brokerageId: brokerage.brokerageId,
      agentId: agtA.agentId,
      userUid: 'uid_agent_a',
      role: 'AGENT',
    });
    const { membership: mB } = await service.inviteMember(brkOwner, {
      brokerageId: brokerage.brokerageId,
      agentId: agtB.agentId,
      userUid: 'uid_agent_b',
      role: 'AGENT',
    });
    await service.transitionMembership(brkOwner, { membershipId: mA.membershipId, status: 'ACTIVE' });
    await service.transitionMembership(brkOwner, { membershipId: mB.membershipId, status: 'ACTIVE' });

    const { lead: lead1 } = await service.createLead(brkOwner, {
      brokerageId: brokerage.brokerageId,
      source: 'WEBSITE',
      category: 'BUYER',
      propertyCategory: 'RESIDENTIAL',
      neighborhoodId: 'niavaran',
      priority: 'HIGH',
    });

    const dist1 = await service.distributeLead(brkOwner, {
      leadId: lead1.leadId,
      strategy: 'SERVICE_AREA_MATCH',
    });
    assert.equal(dist1.lead.assignedAgentUid, 'uid_agent_a');
    assert.equal(dist1.lead.status, 'ASSIGNED');

    await assert.rejects(
      () =>
        service.distributeLead(brkOwner, {
          leadId: lead1.leadId,
          strategy: 'MANUAL',
          targetAgentUid: 'uid_agent_b',
        }),
      /already assigned/,
    );

    const { lead: lead2 } = await service.createLead(brkOwner, {
      brokerageId: brokerage.brokerageId,
      source: 'PROPERTY_LISTING_INQUIRY',
      category: 'BUYER',
    });
    const dist2 = await service.distributeLead(brkOwner, {
      leadId: lead2.leadId,
      strategy: 'WORKLOAD_AWARE',
    });
    assert.equal(dist2.lead.assignedAgentUid, 'uid_agent_b');

    const { task } = await service.createFollowUpTask(agentA, {
      brokerageId: brokerage.brokerageId,
      leadId: lead1.leadId,
      assignedAgentUid: 'uid_agent_a',
      title: 'Initial qualification call',
      dueAtIso: '2026-11-09T10:00:00.000Z',
    });
    await assert.rejects(
      () =>
        service.createFollowUpTask(agentA, {
          brokerageId: brokerage.brokerageId,
          leadId: lead1.leadId,
          assignedAgentUid: 'uid_agent_a',
          title: 'Initial qualification call',
          dueAtIso: '2026-11-09T10:00:00.000Z',
        }),
      /already exists/,
    );
    await service.updateFollowUpTask(agentA, {
      taskId: task.taskId,
      status: 'COMPLETED',
      incrementContactAttempt: true,
      outcome: 'Client confirmed budget and preferred floor plan.',
    });

    const { client } = await service.createClient(agentA, {
      brokerageId: brokerage.brokerageId,
      clientUserUid: 'uid_client_1',
      displayName: 'Ms. Bahrami',
      categories: ['BUYER'],
      assignedAgentUid: 'uid_agent_a',
    });

    await service.recordClientCommunication(agentA, {
      brokerageId: brokerage.brokerageId,
      clientId: client.clientId,
      eventType: 'SCHEDULED_MEETING',
      visibility: 'CLIENT_VISIBLE',
      summary: 'Viewing scheduled for Tuesday at 14:00.',
    });
    await service.recordClientCommunication(agentA, {
      brokerageId: brokerage.brokerageId,
      clientId: client.clientId,
      eventType: 'INTERNAL_NOTE',
      visibility: 'INTERNAL_PRIVATE',
      summary: 'Confidential negotiation reserve note.',
    });

    const clientVisibleComms = await service.listClientCommunications(
      clientPrincipal,
      brokerage.brokerageId,
      client.clientId,
      true,
    );
    assert.equal(clientVisibleComms.communications.length, 1);
    assert.equal(clientVisibleComms.communications[0].visibility, 'CLIENT_VISIBLE');

    const { viewing } = await service.scheduleViewing(agentA, {
      brokerageId: brokerage.brokerageId,
      propertyId: 'prop_niavaran_1',
      clientId: client.clientId,
      assignedAgentUid: 'uid_agent_a',
      startTimeIso: '2026-11-10T14:00:00.000Z',
      endTimeIso: '2026-11-10T15:00:00.000Z',
    });

    await assert.rejects(
      () =>
        service.scheduleViewing(agentA, {
          brokerageId: brokerage.brokerageId,
          propertyId: 'prop_niavaran_2',
          clientId: client.clientId,
          assignedAgentUid: 'uid_agent_a',
          startTimeIso: '2026-11-10T14:30:00.000Z',
          endTimeIso: '2026-11-10T15:30:00.000Z',
        }),
      /overlapping viewing appointment/,
    );

    await service.updateViewing(agentA, {
      viewingId: viewing.viewingId,
      status: 'COMPLETED',
      feedbackSummary: 'Very positive impression of south terrace.',
      clientInterestRating: 5,
    });
  });

  it('integrates representation, listing acquisition, Employee 53 transactions, agreements, Employee 54 ledger commissions, referrals, and HTTP endpoints', async () => {
    const { deps, store } = createInMemoryHarness();
    const service = createBrokerageService(deps);

    const { brokerage } = await service.createBrokerageOrganization(brkOwner, {
      displayName: 'Atlas Real Estate Group',
      cityId: 'tehran',
    });
    const { agent: agtA } = await service.upsertAgentProfile(agentA, {
      userUid: 'uid_agent_a',
      displayName: 'Agent A',
      yearsOfExperience: 8,
      serviceNeighborhoodIds: ['fereshteh'],
      propertyCategories: ['RESIDENTIAL'],
      transactionCategories: ['SALE'],
    });
    const { membership: mA } = await service.inviteMember(brkOwner, {
      brokerageId: brokerage.brokerageId,
      agentId: agtA.agentId,
      userUid: 'uid_agent_a',
      role: 'SENIOR_AGENT',
    });
    await service.transitionMembership(brkOwner, { membershipId: mA.membershipId, status: 'ACTIVE' });

    const { client: sellerClient } = await service.createClient(agentA, {
      brokerageId: brokerage.brokerageId,
      clientUserUid: 'uid_client_1',
      displayName: 'Seller Principal',
      categories: ['SELLER'],
      assignedAgentUid: 'uid_agent_a',
    });

    store.set('properties/prop_fereshteh_1', {
      propertyId: 'prop_fereshteh_1',
      ownerUid: 'uid_client_1',
    });

    const { representation } = await service.createPropertyRepresentation(agentA, {
      brokerageId: brokerage.brokerageId,
      responsibleAgentUid: 'uid_agent_a',
      representationType: 'SELLER_REPRESENTATION',
      exclusivity: 'EXCLUSIVE',
      propertyId: 'prop_fereshteh_1',
      clientId: sellerClient.clientId,
      principalUserUid: 'uid_client_1',
      startDateIso: '2026-11-01T00:00:00.000Z',
      expirationDateIso: '2027-05-01T00:00:00.000Z',
    });

    const { acquisition } = await service.createListingAcquisition(agentA, {
      brokerageId: brokerage.brokerageId,
      propertyId: 'prop_fereshteh_1',
      representationId: representation.representationId,
      assignedAgentUid: 'uid_agent_a',
      ownerAuthorizationReferenceId: 'auth_doc_1',
      expirationDateIso: '2027-05-01T00:00:00.000Z',
    });
    assert.equal(acquisition.status, 'PENDING_APPROVAL');

    await assert.rejects(
      () =>
        service.updateListingAcquisition(agentA, {
          acquisitionId: acquisition.acquisitionId,
          status: 'ACTIVE',
        }),
      /Only brokerage administrators or managers can approve, activate/,
    );

    const activeAcq = await service.updateListingAcquisition(brkOwner, {
      acquisitionId: acquisition.acquisitionId,
      status: 'ACTIVE',
    });
    assert.equal(activeAcq.acquisition.status, 'ACTIVE');

    // Seed Employee 53 transaction & participants for Employee 54 ledger verification
    store.set('transactions/tx_sale_57', {
      transactionId: 'tx_sale_57',
      transactionType: 'PROPERTY_PURCHASE',
      status: 'UNDER_CONTRACT',
      propertyId: 'prop_fereshteh_1',
      initiatorUid: 'uid_client_1',
      activeParticipantUids: ['uid_client_1', 'uid_brk_owner'],
      invitedParticipantUids: [],
      monetary: { currency: 'IRT', offerAmount: 10_000_000_000 },
      adminHold: { isSuspended: false },
      version: 1,
      createdAtIso: '2026-11-05T00:00:00.000Z',
      updatedAtIso: '2026-11-05T00:00:00.000Z',
    });
    store.set('transactionParticipants/prt_tx_sale_57_uid_client_1', {
      participantId: 'prt_tx_sale_57_uid_client_1',
      transactionId: 'tx_sale_57',
      userId: 'uid_client_1',
      role: 'SELLER',
      status: 'ACTIVE',
    });
    store.set('transactionParticipants/prt_tx_sale_57_uid_brk_owner', {
      participantId: 'prt_tx_sale_57_uid_brk_owner',
      transactionId: 'tx_sale_57',
      userId: 'uid_brk_owner',
      role: 'BROKER',
      status: 'ACTIVE',
    });

    await service.registerTransactionParticipation(agentA, {
      brokerageId: brokerage.brokerageId,
      transactionId: 'tx_sale_57',
      representationId: representation.representationId,
      side: 'SELLER_REPRESENTATION',
      assignedAgentUid: 'uid_agent_a',
    });

    await assert.rejects(
      () =>
        service.createBrokerageAgreement(agentA, {
          brokerageId: brokerage.brokerageId,
          clientId: sellerClient.clientId,
          agentUid: 'uid_agent_a',
          propertyId: 'prop_fereshteh_1',
          transactionId: 'tx_sale_57',
          agreementType: 'COMMISSION_AGREEMENT',
          effectiveDateIso: '2026-11-05T00:00:00.000Z',
          expirationDateIso: '2027-05-01T00:00:00.000Z',
          serviceScope: 'Full seller brokerage representation',
          commissionStructure: 'PERCENTAGE_OF_BASE',
          commissionRateBasisPoints: 100,
          currency: 'IRT',
          status: 'EXECUTED',
        }),
      /without verified executionDocumentIds/,
    );

    const { agreement } = await service.createBrokerageAgreement(agentA, {
      brokerageId: brokerage.brokerageId,
      clientId: sellerClient.clientId,
      agentUid: 'uid_agent_a',
      propertyId: 'prop_fereshteh_1',
      transactionId: 'tx_sale_57',
      agreementType: 'COMMISSION_AGREEMENT',
      effectiveDateIso: '2026-11-05T00:00:00.000Z',
      expirationDateIso: '2027-05-01T00:00:00.000Z',
      serviceScope: 'Full seller brokerage representation',
      commissionStructure: 'PERCENTAGE_OF_BASE',
      commissionRateBasisPoints: 100,
      currency: 'IRT',
      executionDocumentIds: ['exec_signed_pdf_1'],
      status: 'EXECUTED',
    });

    const amended = await service.amendBrokerageAgreement(brkOwner, {
      agreementId: agreement.agreementId,
      commissionRateBasisPoints: 150,
      status: 'EXECUTED',
      reason: 'Mutually agreed marketing upgrade addendum',
    });
    assert.equal(amended.agreement.versionNumber, 2);
    assert.equal(amended.agreement.amendments.length, 1);

    await assert.rejects(
      () =>
        service.calculateAndAllocateCommission(brkOwner, {
          brokerageId: brokerage.brokerageId,
          transactionId: 'tx_sale_57',
          agreementId: agreement.agreementId,
          payerUid: 'uid_client_1',
          contractualBaseAmount: 10_000_000_000,
          dueDateIso: '2026-11-30T00:00:00.000Z',
          allocations: [
            { recipientType: 'BROKERAGE', recipientUid: 'uid_brk_owner', allocatedAmount: 100_000_000 },
            { recipientType: 'AGENT', recipientUid: 'uid_agent_a', allocatedAmount: 60_000_000 },
          ],
        }),
      /exceeds authorized distributable amount/,
    );

    const { commission } = await service.calculateAndAllocateCommission(
      brkOwner,
      {
        brokerageId: brokerage.brokerageId,
        transactionId: 'tx_sale_57',
        agreementId: agreement.agreementId,
        payerUid: 'uid_client_1',
        contractualBaseAmount: 10_000_000_000,
        dueDateIso: '2026-11-30T00:00:00.000Z',
        allocations: [
          { recipientType: 'BROKERAGE', recipientUid: 'uid_brk_owner', allocatedAmount: 75_000_000 },
          { recipientType: 'AGENT', recipientUid: 'uid_agent_a', allocatedAmount: 75_000_000 },
        ],
      },
      'idem_comm_57',
    );
    assert.equal(commission.totalCommissionAmount, 150_000_000);
    assert.equal(commission.status, 'POSTED_TO_LEDGER');
    assert.ok(commission.ledgerCommissionId);

    const { referral } = await service.createReferral(agentA, {
      referringBrokerageId: brokerage.brokerageId,
      receivingBrokerageId: brokerage.brokerageId,
      referringAgentUid: 'uid_agent_a',
      receivingAgentUid: 'uid_agent_b',
      referralTermsSummary: '10% referral fee on closed transaction',
      referralBasisPoints: 1000,
      currency: 'IRT',
      expiresAtIso: '2027-01-01T00:00:00.000Z',
    });
    const convRef = await service.updateReferralStatus(brkOwner, {
      referralId: referral.referralId,
      status: 'CONVERTED',
      convertedTransactionId: 'tx_sale_57',
      brokerageCommissionId: commission.brokerageCommissionId,
    });
    assert.equal(convRef.referral.status, 'CONVERTED');

    const app = express();
    app.use(express.json());
    app.use('/api/brokerage', createBrokerageRouter(deps));
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}/api/brokerage`;

    try {
      const perfRes = await fetch(
        `${baseUrl}/organizations/${brokerage.brokerageId}/agents/uid_agent_a/performance`,
        {
          headers: { authorization: 'Bearer token_agent_a_0000001' },
        },
      );
      assert.equal(perfRes.status, 200);
      const perfBody = (await perfRes.json()) as {
        data: { activeListings: number; commissionTotalAmount: number };
      };
      assert.equal(perfBody.data.activeListings, 1);
      assert.equal(perfBody.data.commissionTotalAmount, 75_000_000);

      const repRes = await fetch(
        `${baseUrl}/organizations/${brokerage.brokerageId}/reports/operational`,
        {
          headers: { authorization: 'Bearer token_brk_owner_00001' },
        },
      );
      assert.equal(repRes.status, 200);
      const repBody = (await repRes.json()) as {
        data: { totalCommissionPostedAmount: number; convertedReferrals: number };
      };
      assert.equal(repBody.data.totalCommissionPostedAmount, 150_000_000);
      assert.equal(repBody.data.convertedReferrals, 1);
    } finally {
      server.close();
    }
  });
});
