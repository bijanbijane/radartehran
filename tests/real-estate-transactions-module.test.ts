import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  CoreApiError,
  type AuditEventSink,
  type AuthenticatedPrincipal,
  type DelegatedAdminStoreAdapter,
  type FirebaseTokenVerifierAdapter,
  type StructuredAuditEvent,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../server/modules/core';
import {
  createTransactionsRouter,
  createTransactionsService,
  type NegotiationEntryRecord,
  type StoredTransactionDocument,
  type TransactionContractReferenceRecord,
  type TransactionHistoryEventRecord,
  type TransactionMilestoneRecord,
  type TransactionNotificationEvent,
  type TransactionOfferRecord,
  type TransactionsQueryAdapter,
  type TransactionTelemetryEvent,
} from '../server/modules/transactions';

function createMockFirestoreTxEnvironment() {
  const store = new Map<string, Record<string, unknown>>();
  const auditEvents: StructuredAuditEvent[] = [];
  const notifications: TransactionNotificationEvent[] = [];
  const telemetryEvents: TransactionTelemetryEvent[] = [];

  const txRunner: TransactionRunnerAdapter = {
    async runTransaction<T>(updateFn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<D = Record<string, unknown>>(docPath: string) {
          const val = staged.has(docPath) ? staged.get(docPath) : store.get(docPath);
          return val ? { exists: true, data: structuredClone(val) as unknown as D } : { exists: false };
        },
        set(docPath: string, data: Record<string, unknown>, options?: { merge?: boolean }) {
          if (options?.merge && store.has(docPath)) {
            staged.set(docPath, { ...(store.get(docPath) ?? {}), ...structuredClone(data) });
          } else {
            staged.set(docPath, structuredClone(data));
          }
        },
        update(docPath: string, data: Record<string, unknown>) {
          const existing = staged.has(docPath) ? staged.get(docPath) : store.get(docPath);
          if (!existing) throw new Error(`Document ${docPath} does not exist`);
          staged.set(docPath, { ...existing, ...structuredClone(data) });
        },
        delete(docPath: string) {
          staged.set(docPath, null);
        },
      };
      const result = await updateFn(tx);
      for (const [k, v] of staged.entries()) {
        if (v === null) store.delete(k);
        else store.set(k, v);
      }
      return result;
    },
  };

  const queryAdapter: TransactionsQueryAdapter = {
    async listByParticipantUid({ userId, status, transactionType, limit }) {
      const out: StoredTransactionDocument[] = [];
      for (const [path, raw] of store.entries()) {
        if (!path.startsWith('transactions/')) continue;
        const doc = structuredClone(raw) as unknown as StoredTransactionDocument;
        if (!doc.activeParticipantUids.includes(userId)) continue;
        if (status && doc.status !== status) continue;
        if (transactionType && doc.transactionType !== transactionType) continue;
        out.push(doc);
      }
      return out.slice(0, limit);
    },
    async listAllForAdmin({ status, transactionType, suspendedOnly, limit }) {
      const out: StoredTransactionDocument[] = [];
      for (const [path, raw] of store.entries()) {
        if (!path.startsWith('transactions/')) continue;
        const doc = structuredClone(raw) as unknown as StoredTransactionDocument;
        if (status && doc.status !== status) continue;
        if (transactionType && doc.transactionType !== transactionType) continue;
        if (suspendedOnly && !doc.suspendedByAdmin) continue;
        out.push(doc);
      }
      return out.slice(0, limit);
    },
    async listOffersByTransaction(transactionId) {
      const out: TransactionOfferRecord[] = [];
      for (const [path, raw] of store.entries()) {
        if (path.startsWith(`transactionOffers/${transactionId}_`)) {
          out.push(structuredClone(raw) as unknown as TransactionOfferRecord);
        }
      }
      return out;
    },
    async listNegotiationByTransaction(transactionId) {
      const out: NegotiationEntryRecord[] = [];
      for (const [path, raw] of store.entries()) {
        if (path.startsWith(`transactionNegotiations/${transactionId}_`)) {
          out.push(structuredClone(raw) as unknown as NegotiationEntryRecord);
        }
      }
      return out;
    },
    async listMilestonesByTransaction(transactionId) {
      const out: TransactionMilestoneRecord[] = [];
      for (const [path, raw] of store.entries()) {
        if (path.startsWith(`transactionMilestones/${transactionId}_`)) {
          out.push(structuredClone(raw) as unknown as TransactionMilestoneRecord);
        }
      }
      return out;
    },
    async listContractsByTransaction(transactionId) {
      const out: TransactionContractReferenceRecord[] = [];
      for (const [path, raw] of store.entries()) {
        if (path.startsWith(`transactionContracts/${transactionId}_`)) {
          out.push(structuredClone(raw) as unknown as TransactionContractReferenceRecord);
        }
      }
      return out;
    },
    async listHistoryByTransaction(transactionId) {
      const out: TransactionHistoryEventRecord[] = [];
      for (const [path, raw] of store.entries()) {
        if (path.startsWith(`transactionHistory/hst_${transactionId}_`)) {
          out.push(structuredClone(raw) as unknown as TransactionHistoryEventRecord);
        }
      }
      return out.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    },
  };

  const auditSink: AuditEventSink = {
    async writeAuditEvent(event) {
      auditEvents.push(event);
    },
  };

  return {
    store,
    txRunner,
    queryAdapter,
    auditSink,
    auditEvents,
    notifications,
    telemetryEvents,
  };
}

const sellerPrincipal: AuthenticatedPrincipal = {
  uid: 'seller_uid_01',
  email: 'seller01@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  claims: {},
};

const buyerPrincipal: AuthenticatedPrincipal = {
  uid: 'buyer_uid_02',
  email: 'buyer02@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  claims: {},
};

const brokerPrincipal: AuthenticatedPrincipal = {
  uid: 'broker_uid_03',
  email: 'broker03@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  claims: {},
};

const outsiderPrincipal: AuthenticatedPrincipal = {
  uid: 'outsider_uid_99',
  email: 'outsider99@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  claims: {},
};

const adminPrincipal: AuthenticatedPrincipal = {
  uid: 'admin_uid_01',
  email: 'radio837isf@gmail.com',
  emailVerified: true,
  role: 'primary_admin',
  authMode: 'firebase_id_token',
  claims: {},
};

const adminStore: DelegatedAdminStoreAdapter = {
  async getDelegatedAdminByUid() {
    return null;
  },
};

const tokenVerifier: FirebaseTokenVerifierAdapter = {
  async verifyIdToken(token: string) {
    if (token === 'token_seller_valid_12345') {
      return { uid: sellerPrincipal.uid, email: sellerPrincipal.email, email_verified: true };
    }
    if (token === 'token_buyer_valid_123456') {
      return { uid: buyerPrincipal.uid, email: buyerPrincipal.email, email_verified: true };
    }
    if (token === 'token_admin_valid_123456') {
      return { uid: adminPrincipal.uid, email: adminPrincipal.email, email_verified: true };
    }
    throw new Error('Invalid token');
  },
};

async function runTests() {
  const env = createMockFirestoreTxEnvironment();
  let currentTimeMs = Date.parse('2026-11-08T10:00:00.000Z');
  const validSha256 = 'a'.repeat(64);

  const service = createTransactionsService({
    tokenVerifier,
    adminStore,
    txRunner: env.txRunner,
    queryAdapter: env.queryAdapter,
    auditSink: env.auditSink,
    primaryAdminEmails: ['radio837isf@gmail.com'],
    propertyVerifier: async (propId) => ({ exists: propId !== 'prop_missing_404' }),
    mediaVerifier: async (mediaId) => ({
      valid: mediaId !== 'media_quarantined',
      sha256: validSha256,
    }),
    notificationEmitter: async (ev) => {
      env.notifications.push(ev);
    },
    telemetryEmitter: (ev) => {
      env.telemetryEvents.push(ev);
    },
    nowFn: () => currentTimeMs,
  });

  // 1. Transaction Creation, Idempotency & Input Validation
  const created1 = await service.createTransaction({
    principal: sellerPrincipal,
    idempotencyKey: 'idem_tx_sale_create_001',
    rawBody: {
      transactionId: 'tx_sale_tehran_101',
      transactionType: 'SALE',
      propertyId: 'prop_niavaran_88',
      cityId: 'tehran',
      hoodId: 1,
      initiatorRole: 'SELLER',
      askingAmount: 185_000_000_000,
      currency: 'IRR',
      brokerUid: brokerPrincipal.uid,
    },
    correlationId: 'corr_tx_1',
  });
  assert.equal(created1.statusCode, 201);
  assert.equal(created1.replayed, false);
  assert.equal(created1.transaction.id, 'tx_sale_tehran_101');
  assert.equal(created1.transaction.status, 'DRAFT');
  assert.equal(created1.transaction.version, 1);

  const replay1 = await service.createTransaction({
    principal: sellerPrincipal,
    idempotencyKey: 'idem_tx_sale_create_001',
    rawBody: {
      transactionId: 'tx_sale_tehran_101',
      transactionType: 'SALE',
      propertyId: 'prop_niavaran_88',
      cityId: 'tehran',
      hoodId: 1,
      initiatorRole: 'SELLER',
      askingAmount: 185_000_000_000,
      currency: 'IRR',
      brokerUid: brokerPrincipal.uid,
    },
    correlationId: 'corr_tx_1_replay',
  });
  assert.equal(replay1.replayed, true);
  assert.equal(replay1.transaction.id, 'tx_sale_tehran_101');

  // Reject negative amounts, incompatible roles, and untrusted identity fields
  await assert.rejects(
    () =>
      service.createTransaction({
        principal: sellerPrincipal,
        idempotencyKey: 'idem_invalid_role_002',
        rawBody: {
          transactionType: 'SALE',
          propertyId: 'prop_niavaran_88',
          cityId: 'tehran',
          hoodId: 1,
          initiatorRole: 'LANDLORD',
          askingAmount: 100_000,
          currency: 'IRR',
        },
        correlationId: 'corr_invalid',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED',
  );

  await assert.rejects(
    () =>
      service.createTransaction({
        principal: sellerPrincipal,
        idempotencyKey: 'idem_spoof_uid_003',
        rawBody: {
          transactionType: 'SALE',
          propertyId: 'prop_niavaran_88',
          cityId: 'tehran',
          hoodId: 1,
          initiatorRole: 'SELLER',
          askingAmount: 100_000,
          currency: 'IRR',
          ownerUid: 'spoofed_uid',
        },
        correlationId: 'corr_spoof',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED',
  );

  // 2. Authorization & ID Enumeration Protection
  await assert.rejects(
    () =>
      service.getTransaction({
        principal: outsiderPrincipal,
        transactionId: 'tx_sale_tehran_101',
        correlationId: 'corr_enum_guard',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN' && err.status === 403,
  );

  // 3. Transition DRAFT -> OPEN & Block Direct Jump to COMPLETED
  await assert.rejects(
    () =>
      service.transitionStatus({
        principal: sellerPrincipal,
        transactionId: 'tx_sale_tehran_101',
        rawBody: { targetStatus: 'COMPLETED', expectedVersion: 1 },
        correlationId: 'corr_illegal_jump',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT',
  );

  const openedView = await service.transitionStatus({
    principal: sellerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: { targetStatus: 'OPEN', expectedVersion: 1, reason: 'Ready for buyer offers' },
    correlationId: 'corr_open',
  });
  assert.equal(openedView.status, 'OPEN');
  assert.equal(openedView.version, 2);

  // 4. Participant Invitation, Acceptance, Role Modification & Revocation
  const invitedBuyer = await service.inviteParticipant({
    principal: sellerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: {
      targetUserId: buyerPrincipal.uid,
      role: 'BUYER',
      expectedVersion: 2,
    },
    correlationId: 'corr_inv_buyer',
  });
  assert.equal(invitedBuyer.participant.status, 'INVITED');
  assert.equal(invitedBuyer.transactionVersion, 3);

  const acceptedBuyer = await service.respondToInvitation({
    principal: buyerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: { decision: 'ACCEPT', expectedVersion: 3 },
    correlationId: 'corr_acc_buyer',
  });
  assert.equal(acceptedBuyer.participant.status, 'ACTIVE');
  assert.equal(acceptedBuyer.transactionVersion, 4);

  // Broker accepts invitation initialized during transaction creation
  const acceptedBroker = await service.respondToInvitation({
    principal: brokerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: { decision: 'ACCEPT', expectedVersion: 4 },
    correlationId: 'corr_acc_broker',
  });
  assert.equal(acceptedBroker.participant.status, 'ACTIVE');
  assert.equal(acceptedBroker.transactionVersion, 5);

  // 5. Offer, Counteroffer, Acceptance & Concurrent Acceptance Guard
  const offer1 = await service.submitOffer({
    principal: buyerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: {
      amount: 175_000_000_000,
      currency: 'IRR',
      conditions: 'Cash settlement within 14 days',
      expectedVersion: 5,
    },
    correlationId: 'corr_off_1',
  });
  assert.equal(offer1.offer.status, 'SUBMITTED');
  assert.equal(offer1.transactionVersion, 6);

  // Author cannot accept their own offer
  await assert.rejects(
    () =>
      service.decideOffer({
        principal: buyerPrincipal,
        transactionId: 'tx_sale_tehran_101',
        offerId: offer1.offer.offerId,
        rawBody: { decision: 'ACCEPT', expectedVersion: 6 },
        correlationId: 'corr_self_accept',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN',
  );

  // Seller submits counteroffer against offer1
  const counter1 = await service.submitOffer({
    principal: sellerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: {
      amount: 180_000_000_000,
      currency: 'IRR',
      conditions: 'Counteroffer at 180B IRR with 10-day handover',
      parentOfferId: offer1.offer.offerId,
      expectedVersion: 6,
    },
    correlationId: 'corr_counter_1',
  });
  assert.equal(counter1.offer.revision, 2);
  assert.equal(counter1.transactionVersion, 7);

  // Structured negotiation message referencing the counteroffer
  const negEntry = await service.postNegotiationEntry({
    principal: buyerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: {
      entryType: 'MESSAGE',
      message: 'We agree to the 180B IRR terms and schedule.',
      referencedOfferId: counter1.offer.offerId,
      expectedVersion: 7,
    },
    correlationId: 'corr_neg_1',
  });
  assert.equal(negEntry.transactionVersion, 8);

  // Buyer accepts Seller's counteroffer
  const acceptedOfferRes = await service.decideOffer({
    principal: buyerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    offerId: counter1.offer.offerId,
    rawBody: { decision: 'ACCEPT', expectedVersion: 8, note: 'Accepted counteroffer' },
    correlationId: 'corr_accept_counter',
  });
  assert.equal(acceptedOfferRes.offer.status, 'ACCEPTED');
  assert.equal(acceptedOfferRes.transactionStatus, 'AGREEMENT_PENDING');
  assert.equal(acceptedOfferRes.transactionVersion, 9);

  // Prevent subsequent offers or duplicate acceptance after offer is accepted
  await assert.rejects(
    () =>
      service.submitOffer({
        principal: buyerPrincipal,
        transactionId: 'tx_sale_tehran_101',
        rawBody: {
          amount: 170_000_000_000,
          currency: 'IRR',
          conditions: 'Attempt to silently replace accepted offer',
          expectedVersion: 9,
        },
        correlationId: 'corr_replace_accepted',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT',
  );

  // 6. Contract Reference, Signature Execution Status & Replacement Protection
  await assert.rejects(
    () =>
      service.attachContractReference({
        principal: sellerPrincipal,
        transactionId: 'tx_sale_tehran_101',
        rawBody: {
          title: 'Quarantined Contract File',
          mediaObjectId: 'media_quarantined',
          sha256Checksum: validSha256,
          expectedVersion: 9,
        },
        correlationId: 'corr_bad_media',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN',
  );

  const attachedContract = await service.attachContractReference({
    principal: sellerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: {
      title: 'Official Sale Contract (Mabayenameh)',
      mediaObjectId: 'media_contract_v1',
      sha256Checksum: validSha256,
      officialTrackingCode: 'TRK-99887766',
      expectedVersion: 9,
    },
    correlationId: 'corr_contract_1',
  });
  assert.equal(attachedContract.transactionStatus, 'CONTRACT_PENDING');
  assert.equal(attachedContract.transactionVersion, 10);

  // Seller records signature status
  const sigSeller = await service.updateContractStatus({
    principal: sellerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    contractId: attachedContract.contract.contractId,
    rawBody: {
      recordPartySignature: {
        executionStatus: 'EXTERNAL_REGISTRY_RECORDED',
        externalRegistryRef: 'REG-SELLER-01',
      },
      expectedVersion: 10,
    },
    correlationId: 'corr_sig_seller',
  });
  assert.equal(sigSeller.contract.status, 'PARTIALLY_SIGNED');
  assert.equal(sigSeller.transactionStatus, 'CONTRACT_PENDING');
  assert.equal(sigSeller.transactionVersion, 11);

  // Buyer records signature status -> automatically completes contract execution & transitions to CONTRACT_SIGNED
  const sigBuyer = await service.updateContractStatus({
    principal: buyerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    contractId: attachedContract.contract.contractId,
    rawBody: {
      recordPartySignature: {
        executionStatus: 'EXTERNAL_REGISTRY_RECORDED',
        externalRegistryRef: 'REG-BUYER-02',
      },
      expectedVersion: 11,
    },
    correlationId: 'corr_sig_buyer',
  });
  assert.equal(sigBuyer.contract.status, 'EXECUTED');
  assert.equal(sigBuyer.transactionStatus, 'CONTRACT_SIGNED');
  assert.equal(sigBuyer.transactionVersion, 12);

  // 7. Milestone Completion
  const msUpdate = await service.updateMilestone({
    principal: sellerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: {
      milestoneType: 'DEPOSIT_CONFIRMED',
      status: 'COMPLETED',
      expectedVersion: 12,
    },
    correlationId: 'corr_ms_deposit',
  });
  assert.equal(msUpdate.milestone.status, 'COMPLETED');
  assert.equal(msUpdate.transactionVersion, 13);

  // 8. Dispute Initiation & Administrative Resolution / Suspension Controls
  const disputed = await service.initiateDispute({
    principal: buyerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: {
      reasonCategory: 'DOCUMENT_DISCREPANCY',
      description: 'Parking space number in annex needs clarification before closing.',
      expectedVersion: 13,
    },
    correlationId: 'corr_dispute_1',
  });
  assert.equal(disputed.transactionStatus, 'DISPUTED');
  assert.equal(disputed.transactionVersion, 14);

  // Non-admin cannot resolve dispute or intervene
  await assert.rejects(
    () =>
      service.executeAdminIntervention({
        principal: sellerPrincipal,
        transactionId: 'tx_sale_tehran_101',
        rawBody: {
          action: 'RESOLVE_DISPUTE',
          reason: 'Unauthorized attempt',
          expectedVersion: 14,
        },
        correlationId: 'corr_unauth_admin',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN',
  );

  // Admin resolves dispute back to CONTRACT_SIGNED
  const resolvedAdminView = await service.executeAdminIntervention({
    principal: adminPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: {
      action: 'RESOLVE_DISPUTE',
      targetStatusAfterRestore: 'CONTRACT_SIGNED',
      reason: 'Annex parking number verified by both parties.',
      expectedVersion: 14,
    },
    correlationId: 'corr_admin_resolve',
  });
  assert.equal(resolvedAdminView.status, 'CONTRACT_SIGNED');
  assert.equal(resolvedAdminView.version, 15);

  // 9. Closing Workflow (Initiate -> Settlement Ref -> Party Confirmations -> Complete)
  const closingInit = await service.executeClosingOperation({
    principal: sellerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: { operation: 'INITIATE', expectedVersion: 15 },
    correlationId: 'corr_close_init',
  });
  assert.equal(closingInit.transactionStatus, 'CLOSING');
  assert.equal(closingInit.transactionVersion, 16);

  // Cannot complete closing before settlement & confirmations
  await assert.rejects(
    () =>
      service.executeClosingOperation({
        principal: sellerPrincipal,
        transactionId: 'tx_sale_tehran_101',
        rawBody: { operation: 'COMPLETE', expectedVersion: 16 },
        correlationId: 'corr_premature_complete',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT',
  );

  const settlementRec = await service.executeClosingOperation({
    principal: buyerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: {
      operation: 'RECORD_SETTLEMENT_REF',
      settlementReferenceId: 'settle_ref_bank_990011',
      settlementStatus: 'CONFIRMED_BY_PARTIES',
      expectedVersion: 16,
    },
    correlationId: 'corr_settle_ref',
  });
  assert.equal(settlementRec.transactionVersion, 17);

  const confirmBuyer = await service.executeClosingOperation({
    principal: buyerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: {
      operation: 'CONFIRM_PARTY',
      handoverConfirmed: true,
      expectedVersion: 17,
    },
    correlationId: 'corr_conf_buyer',
  });
  assert.equal(confirmBuyer.transactionVersion, 18);

  const confirmSeller = await service.executeClosingOperation({
    principal: sellerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: {
      operation: 'CONFIRM_PARTY',
      handoverConfirmed: true,
      expectedVersion: 18,
    },
    correlationId: 'corr_conf_seller',
  });
  assert.equal(confirmSeller.transactionVersion, 19);

  const completedClosing = await service.executeClosingOperation({
    principal: sellerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    rawBody: {
      operation: 'COMPLETE',
      expectedVersion: 19,
    },
    correlationId: 'corr_close_complete',
  });
  assert.equal(completedClosing.transactionStatus, 'COMPLETED');
  assert.equal(completedClosing.closing.status, 'COMPLETED');
  assert.equal(completedClosing.transactionVersion, 20);

  // 10. Append-Only Transaction History & Analytics Verification
  const history = (await service.getTransactionSubresourceList({
    principal: sellerPrincipal,
    transactionId: 'tx_sale_tehran_101',
    resource: 'history',
  })) as TransactionHistoryEventRecord[];
  assert.equal(history.length, 20);
  assert.equal(history[0].eventType, 'TRANSACTION_CREATED');
  assert.equal(history[history.length - 1].eventType, 'CLOSING_COMPLETED');

  const analytics = await service.getAnalyticsSnapshot({ principal: adminPrincipal });
  assert.equal(analytics.totalCreated, 1);
  assert.equal(analytics.saleCount, 1);
  assert.equal(analytics.completedCount, 1);
  assert.equal(analytics.completionRate, 1);
  assert.ok(env.notifications.length >= 4);
  assert.ok(env.telemetryEvents.length >= 3);
  assert.ok(env.auditEvents.length >= 2);

  // 11. Express Router Integration Test (Rental Transaction & Cancellation)
  const app = express();
  app.use(express.json());
  app.use(
    '/api/transactions',
    createTransactionsRouter({
      tokenVerifier,
      adminStore,
      txRunner: env.txRunner,
      queryAdapter: env.queryAdapter,
      auditSink: env.auditSink,
      primaryAdminEmails: ['radio837isf@gmail.com'],
      nowFn: () => currentTimeMs,
    }),
  );

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}/api/transactions`;

  try {
    const createRentalRes = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_seller_valid_12345',
        'Idempotency-Key': 'idem_http_rental_001',
      },
      body: JSON.stringify({
        transactionId: 'tx_rental_tehran_202',
        transactionType: 'RENTAL',
        propertyId: 'prop_vanak_22',
        cityId: 'tehran',
        hoodId: 3,
        initiatorRole: 'LANDLORD',
        askingAmount: 15_000_000_000,
        depositAmount: 15_000_000_000,
        monthlyRentAmount: 350_000_000,
        currency: 'IRR',
      }),
    });
    assert.equal(createRentalRes.status, 201);
    const rentalJson = (await createRentalRes.json()) as { ok: boolean; data: { id: string; status: string; version: number } };
    assert.equal(rentalJson.ok, true);
    assert.equal(rentalJson.data.id, 'tx_rental_tehran_202');

    // Cancel rental transaction via HTTP
    const cancelRes = await fetch(`${baseUrl}/tx_rental_tehran_202/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_seller_valid_12345',
      },
      body: JSON.stringify({
        targetStatus: 'CANCELLED',
        expectedVersion: 1,
        reason: 'Landlord withdrew rental listing',
      }),
    });
    assert.equal(cancelRes.status, 200);
    const cancelJson = (await cancelRes.json()) as { ok: boolean; data: { status: string } };
    assert.equal(cancelJson.data.status, 'CANCELLED');

    // Verify terminal state locking (cannot reopen CANCELLED transaction)
    const reopenRes = await fetch(`${baseUrl}/tx_rental_tehran_202/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_seller_valid_12345',
      },
      body: JSON.stringify({
        targetStatus: 'OPEN',
        expectedVersion: 2,
      }),
    });
    assert.equal(reopenRes.status, 409);
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
