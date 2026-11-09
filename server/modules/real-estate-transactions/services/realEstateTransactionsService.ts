import crypto from 'crypto';
import {
  authorizePrincipal,
  CoreApiError,
  createFirestoreIdempotencyStoreAdapter,
  decodePaginationCursor,
  encodePaginationCursor,
  executeIdempotentMutation,
  normalizeFirestoreTimestamp,
  normalizePaginationParams,
  requireSafeFirestoreId,
  runDurableTransaction,
  sanitizeTextInput,
  type AuthenticatedPrincipal,
  type NormalizedTimestamp,
  type PaginationParams,
  type TransactionContextLike,
} from '../../core';
import type {
  RealEstateTransactionsModuleDependencies,
  TransactionCurrencyCode,
} from '../contracts/externalAdapters';
import type {
  ContractWorkflowLifecycleState,
  MilestoneVerificationStage,
  ParticipantPermissionScope,
  RealEstateTransactionCaseStatus,
  RealEstateTransactionRecord,
  RealEstateTransactionType,
  TransactionCancellationOrDisputeRecord,
  TransactionContractMetadataRecord,
  TransactionFinancialTermsUnion,
  TransactionHistoryEntryRecord,
  TransactionMilestoneRecord,
  TransactionMilestoneType,
  TransactionOfferRecord,
  TransactionParticipantRecord,
  TransactionParticipantRole,
  TransactionPaymentReferenceRecord,
} from '../domain/types';
import {
  ALLOWED_PARTICIPANT_ROLES,
  assertValidOfferTransition,
  validateFinancialTermsIntegrity,
  verifyTransactionCompletionPrerequisites,
} from '../state-machines/negotiationAndCompletionStateMachine';

function requireValidId(raw: unknown, fieldName: string): string {
  const res = requireSafeFirestoreId()(raw, fieldName);
  if (!res.ok || !res.value) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Invalid Firestore ID for "${fieldName}".`,
      res.issues,
    );
  }
  return res.value;
}

async function appendToIndex(
  tx: TransactionContextLike,
  indexPath: string,
  id: string,
): Promise<void> {
  const snap = await tx.get<{ ids?: string[] }>(indexPath);
  const existing = snap.exists && Array.isArray(snap.data?.ids) ? snap.data!.ids : [];
  if (!existing.includes(id)) {
    tx.set(indexPath, { ids: [id, ...existing] });
  }
}

async function loadIndexedDocs<T>(
  tx: TransactionContextLike,
  indexPath: string,
  collectionPrefix: string,
): Promise<T[]> {
  const snap = await tx.get<{ ids?: string[] }>(indexPath);
  const ids = snap.exists && Array.isArray(snap.data?.ids) ? snap.data!.ids : [];
  const out: T[] = [];
  for (const id of ids) {
    const docSnap = await tx.get<T>(`${collectionPrefix}/${id}`);
    if (docSnap.exists && docSnap.data) out.push(docSnap.data);
  }
  return out;
}

function paginateItems<T extends { id: string; sortEpochMs: number }>(
  items: T[],
  pagination: PaginationParams,
): { items: T[]; hasMore: boolean; nextCursor: string | null; totalCount: number } {
  const sorted = [...items].sort((a, b) => {
    const diff =
      pagination.direction === 'asc'
        ? a.sortEpochMs - b.sortEpochMs
        : b.sortEpochMs - a.sortEpochMs;
    if (diff !== 0) return diff;
    return pagination.direction === 'asc'
      ? a.id.localeCompare(b.id)
      : b.id.localeCompare(a.id);
  });

  let filtered = sorted;
  if (pagination.cursor) {
    const decoded = decodePaginationCursor(pagination.cursor);
    if (!decoded) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid pagination cursor token.');
    }
    const cursorEpoch = Number(decoded.sortValue);
    filtered = sorted.filter((item) =>
      pagination.direction === 'asc'
        ? item.sortEpochMs > cursorEpoch ||
          (item.sortEpochMs === cursorEpoch && item.id > decoded.docId)
        : item.sortEpochMs < cursorEpoch ||
          (item.sortEpochMs === cursorEpoch && item.id < decoded.docId),
    );
  }

  const slice = filtered.slice(0, pagination.limit);
  const hasMore = filtered.length > pagination.limit;
  const lastItem = slice[slice.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodePaginationCursor({
          sortValue: lastItem.sortEpochMs,
          docId: lastItem.id,
          direction: pagination.direction,
        })
      : null;

  return { items: slice, hasMore, nextCursor, totalCount: sorted.length };
}

export function createRealEstateTransactionsService(
  deps: RealEstateTransactionsModuleDependencies,
) {
  const nowEpochMs = () => (deps.nowFn ? deps.nowFn() : Date.now());
  const nowTs = (): NormalizedTimestamp => normalizeFirestoreTimestamp(nowEpochMs())!;

  const retrySafeTxRunner = {
    runTransaction: <T>(workFn: (tx: TransactionContextLike) => Promise<T>) =>
      runDurableTransaction(
        deps.txRunner,
        {
          operationName: 'real_estate_transactions_idempotency_tx',
          maxAttempts: 4,
          baseBackoffMs: 5,
        },
        workFn,
      ),
  };

  const idempotencyStore =
    deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(retrySafeTxRunner);

  async function requireVerifiedPrincipal(
    principal: AuthenticatedPrincipal | null | undefined,
  ): Promise<AuthenticatedPrincipal> {
    const decision = await authorizePrincipal(
      principal,
      { minimumRole: 'verified_user' },
      deps.adminStore,
      deps.primaryAdminEmails,
    );
    if (!decision.allowed || !principal) {
      throw new CoreApiError(
        decision.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
        decision.status === 401 ? 401 : 403,
        decision.reason ?? 'Authenticated verified user required.',
      );
    }
    return principal;
  }

  function findActiveParticipant(
    txRecord: RealEstateTransactionRecord,
    uid: string,
  ): TransactionParticipantRecord | undefined {
    return txRecord.participants.find(
      (p) => p.userOrOrganizationUid === uid && p.participationStatus === 'ACCEPTED_ACTIVE',
    );
  }

  function isAdminOrCoordinator(principal: AuthenticatedPrincipal): boolean {
    const isAdmin =
      principal.emailVerified &&
      Boolean(principal.email) &&
      (deps.primaryAdminEmails ?? ['admin@radartehran.ir'])
        .map((e) => e.toLowerCase())
        .includes(principal.email!.toLowerCase());
    if (isAdmin) return true;
    if ((deps.authorizedCoordinatorUids ?? []).includes(principal.uid)) return true;
    return false;
  }

  async function assertTransactionParticipantAccess(
    txRecord: RealEstateTransactionRecord,
    principal: AuthenticatedPrincipal | null | undefined,
    options?: {
      allowInvitedPending?: boolean;
      requireNegotiationScope?: boolean;
    },
  ): Promise<{ actor: AuthenticatedPrincipal; participant?: TransactionParticipantRecord }> {
    const actor = await requireVerifiedPrincipal(principal);
    if (isAdminOrCoordinator(actor)) {
      return { actor, participant: findActiveParticipant(txRecord, actor.uid) };
    }

    const participant = txRecord.participants.find(
      (p) =>
        p.userOrOrganizationUid === actor.uid &&
        (p.participationStatus === 'ACCEPTED_ACTIVE' ||
          (options?.allowInvitedPending && p.participationStatus === 'INVITED_PENDING')),
    );

    if (!participant) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Actor is not an authorized participant in this real estate transaction.',
      );
    }

    if (
      options?.requireNegotiationScope &&
      participant.permissionScope !== 'PROPOSE_AND_ACCEPT_TERMS' &&
      participant.permissionScope !== 'NEGOTIATE_ON_BEHALF_WITH_AUTHORITY'
    ) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        `Participant role "${participant.role}" with scope "${participant.permissionScope}" is not authorized to propose or accept financial terms.`,
      );
    }

    return { actor, participant };
  }

  function assertExpectedRevision(
    txRecord: RealEstateTransactionRecord,
    expectedRevision?: number,
  ): void {
    if (
      typeof expectedRevision === 'number' &&
      txRecord.revisionNumber !== expectedRevision
    ) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        `OPTIMISTIC_CONCURRENCY_CONFLICT: Expected transaction revision ${expectedRevision}, but current revision is ${txRecord.revisionNumber}.`,
      );
    }
  }

  async function appendHistoryEntry(
    tx: TransactionContextLike,
    transactionId: string,
    canonicalPropertyId: string,
    actorUid: string,
    eventCategory: TransactionHistoryEntryRecord['eventCategory'],
    summary: string,
    revisionNumber: number,
    ts: NormalizedTimestamp,
  ): Promise<void> {
    const historyId = `rthist_${crypto.randomBytes(6).toString('hex')}`;
    const entry: TransactionHistoryEntryRecord = {
      historyId,
      transactionId,
      canonicalPropertyId,
      actorUid,
      eventCategory,
      summary,
      revisionNumber,
      occurredAt: ts,
    };
    tx.set(`ret_history/${historyId}`, entry as unknown as Record<string, unknown>);
    await appendToIndex(tx, `ret_tx_history_index/${transactionId}`, historyId);
  }

  /**
   * 1. Create real estate transaction case
   */
  async function createTransaction(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    idempotencyKey: string;
    canonicalPropertyId: string;
    transactionType: RealEstateTransactionType;
    initiatingRole: TransactionParticipantRole;
    counterpartyUid: string;
    counterpartyRole: TransactionParticipantRole;
    initialFinancialTerms: TransactionFinancialTermsUnion;
    listingOriginRefId?: string | null;
    dueDiligenceCaseRefId?: string | null;
    authorityEvidenceRefId?: string | null;
  }): Promise<RealEstateTransactionRecord> {
    const actor = await requireVerifiedPrincipal(params.principal);
    const canonicalPropertyId = requireValidId(
      params.canonicalPropertyId,
      'canonicalPropertyId',
    );
    const counterpartyUid = requireValidId(params.counterpartyUid, 'counterpartyUid');

    if (
      !ALLOWED_PARTICIPANT_ROLES.includes(params.initiatingRole) ||
      !ALLOWED_PARTICIPANT_ROLES.includes(params.counterpartyRole)
    ) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid transaction participant role.');
    }

    if (
      params.initiatingRole === 'AUTHORIZED_REPRESENTATIVE' &&
      !params.authorityEvidenceRefId
    ) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'An AUTHORIZED_REPRESENTATIVE must provide an authorityEvidenceRefId.',
      );
    }

    validateFinancialTermsIntegrity(params.transactionType, params.initialFinancialTerms);

    const outcome = await executeIdempotentMutation<RealEstateTransactionRecord>({
      store: idempotencyStore,
      idempotencyKey: params.idempotencyKey,
      operation: 'real-estate-transactions:tx.create',
      actorUid: actor.uid,
      requestPayload: {
        canonicalPropertyId,
        transactionType: params.transactionType,
        initiatingRole: params.initiatingRole,
        counterpartyUid,
        counterpartyRole: params.counterpartyRole,
        initialFinancialTerms: params.initialFinancialTerms,
      },
      nowEpochMs: nowEpochMs(),
      mutationFn: async () => {
        const propSnap = await deps.propertyRegistry.getCanonicalPropertyById(
          canonicalPropertyId,
        );
        if (!propSnap) {
          throw new CoreApiError(
            'NOT_FOUND',
            404,
            `Canonical property "${canonicalPropertyId}" not found in Property Registry.`,
          );
        }

        const ts = nowTs();
        const transactionId = `retx_${crypto.randomBytes(6).toString('hex')}`;

        const initiatorParticipant: TransactionParticipantRecord = {
          participantId: `part_${crypto.randomBytes(4).toString('hex')}`,
          userOrOrganizationUid: actor.uid,
          role: params.initiatingRole,
          participationStatus: 'ACCEPTED_ACTIVE',
          authorityEvidenceRefId: params.authorityEvidenceRefId ?? null,
          permissionScope:
            params.initiatingRole === 'AUTHORIZED_REPRESENTATIVE'
              ? 'NEGOTIATE_ON_BEHALF_WITH_AUTHORITY'
              : 'PROPOSE_AND_ACCEPT_TERMS',
          invitedByUid: actor.uid,
          invitedAt: ts,
          respondedAt: ts,
        };

        const counterpartyParticipant: TransactionParticipantRecord = {
          participantId: `part_${crypto.randomBytes(4).toString('hex')}`,
          userOrOrganizationUid: counterpartyUid,
          role: params.counterpartyRole,
          participationStatus: 'ACCEPTED_ACTIVE',
          authorityEvidenceRefId: null,
          permissionScope: 'PROPOSE_AND_ACCEPT_TERMS',
          invitedByUid: actor.uid,
          invitedAt: ts,
          respondedAt: ts,
        };

        const txRecord: RealEstateTransactionRecord = {
          transactionId,
          canonicalPropertyId,
          listingOriginRefId: params.listingOriginRefId ?? null,
          dueDiligenceCaseRefId: params.dueDiligenceCaseRefId ?? null,
          transactionType: params.transactionType,
          initiatingPartyUid: actor.uid,
          status: 'DRAFT_INITIATED',
          currency: params.initialFinancialTerms.currency,
          participants: [initiatorParticipant, counterpartyParticipant],
          currentFinancialTerms: structuredClone(params.initialFinancialTerms),
          financialTermsHistory: [
            {
              revisionNumber: 1,
              sourceOfferId: null,
              recordedByUid: actor.uid,
              classification: 'INITIAL_PROPOSAL',
              terms: structuredClone(params.initialFinancialTerms),
              recordedAt: ts,
            },
          ],
          activeOfferId: null,
          acceptedOfferId: null,
          offerIds: [],
          contractMetadata: null,
          milestoneIds: [],
          paymentReferenceIds: [],
          cancellationOrDisputeIds: [],
          completionMetadata: null,
          revisionNumber: 1,
          createdAt: ts,
          updatedAt: ts,
        };

        await runDurableTransaction(
          deps.txRunner,
          { operationName: 'ret.tx.create', maxAttempts: 4, baseBackoffMs: 5 },
          async (tx) => {
            tx.set(
              `ret_transactions/${transactionId}`,
              txRecord as unknown as Record<string, unknown>,
            );
            await appendHistoryEntry(
              tx,
              transactionId,
              canonicalPropertyId,
              actor.uid,
              'TRANSACTION_CREATED',
              `Created ${params.transactionType} transaction case.`,
              1,
              ts,
            );
          },
        );

        return { statusCode: 201, body: txRecord };
      },
    });

    return outcome.body;
  }

  /**
   * 2. Retrieve transaction
   */
  async function retrieveTransaction(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    transactionId: string;
  }): Promise<RealEstateTransactionRecord> {
    const tId = requireValidId(params.transactionId, 'transactionId');
    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'ret.tx.get', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<RealEstateTransactionRecord>(`ret_transactions/${tId}`);
        if (!snap.exists || !snap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Transaction "${tId}" not found.`);
        }
        await assertTransactionParticipantAccess(snap.data, params.principal, {
          allowInvitedPending: true,
        });
        return snap.data;
      },
    );
  }

  /**
   * 3. Invite participant to transaction
   */
  async function inviteParticipant(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    transactionId: string;
    inviteeUid: string;
    role: TransactionParticipantRole;
    permissionScope: ParticipantPermissionScope;
    authorityEvidenceRefId?: string | null;
  }): Promise<RealEstateTransactionRecord> {
    const tId = requireValidId(params.transactionId, 'transactionId');
    const inviteeUid = requireValidId(params.inviteeUid, 'inviteeUid');
    if (!ALLOWED_PARTICIPANT_ROLES.includes(params.role)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Invalid role "${params.role}".`);
    }
    if (
      params.role === 'AUTHORIZED_REPRESENTATIVE' &&
      !params.authorityEvidenceRefId
    ) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'Inviting an AUTHORIZED_REPRESENTATIVE requires authorityEvidenceRefId.',
      );
    }

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'ret.participant.invite', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<RealEstateTransactionRecord>(`ret_transactions/${tId}`);
        if (!snap.exists || !snap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Transaction "${tId}" not found.`);
        }
        const { actor } = await assertTransactionParticipantAccess(
          snap.data,
          params.principal,
          { requireNegotiationScope: true },
        );

        const ts = nowTs();
        const nextRev = snap.data.revisionNumber + 1;
        const newParticipant: TransactionParticipantRecord = {
          participantId: `part_${crypto.randomBytes(4).toString('hex')}`,
          userOrOrganizationUid: inviteeUid,
          role: params.role,
          participationStatus: 'INVITED_PENDING',
          authorityEvidenceRefId: params.authorityEvidenceRefId ?? null,
          permissionScope: params.permissionScope,
          invitedByUid: actor.uid,
          invitedAt: ts,
          respondedAt: null,
        };

        const updated: RealEstateTransactionRecord = {
          ...snap.data,
          participants: [...snap.data.participants, newParticipant],
          revisionNumber: nextRev,
          updatedAt: ts,
        };

        tx.set(`ret_transactions/${tId}`, updated as unknown as Record<string, unknown>);
        await appendHistoryEntry(
          tx,
          tId,
          snap.data.canonicalPropertyId,
          actor.uid,
          'PARTICIPANT_CHANGE',
          `Invited participant ${inviteeUid} with role ${params.role}.`,
          nextRev,
          ts,
        );
        return updated;
      },
    );
  }

  /**
   * 4. Accept or decline participant invitation
   */
  async function respondToParticipantInvitation(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    transactionId: string;
    decision: 'ACCEPT' | 'DECLINE';
  }): Promise<RealEstateTransactionRecord> {
    const actor = await requireVerifiedPrincipal(params.principal);
    const tId = requireValidId(params.transactionId, 'transactionId');

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'ret.participant.respond', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<RealEstateTransactionRecord>(`ret_transactions/${tId}`);
        if (!snap.exists || !snap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Transaction "${tId}" not found.`);
        }
        const idx = snap.data.participants.findIndex(
          (p) =>
            p.userOrOrganizationUid === actor.uid &&
            p.participationStatus === 'INVITED_PENDING',
        );
        if (idx === -1) {
          throw new CoreApiError(
            'NOT_FOUND',
            404,
            'No pending invitation found for the authenticated user on this transaction.',
          );
        }

        const ts = nowTs();
        const nextRev = snap.data.revisionNumber + 1;
        const updatedParticipants = [...snap.data.participants];
        updatedParticipants[idx] = {
          ...updatedParticipants[idx]!,
          participationStatus:
            params.decision === 'ACCEPT' ? 'ACCEPTED_ACTIVE' : 'DECLINED',
          respondedAt: ts,
        };

        const updated: RealEstateTransactionRecord = {
          ...snap.data,
          participants: updatedParticipants,
          revisionNumber: nextRev,
          updatedAt: ts,
        };

        tx.set(`ret_transactions/${tId}`, updated as unknown as Record<string, unknown>);
        await appendHistoryEntry(
          tx,
          tId,
          snap.data.canonicalPropertyId,
          actor.uid,
          'PARTICIPANT_CHANGE',
          `Participant ${actor.uid} ${params.decision === 'ACCEPT' ? 'accepted' : 'declined'} transaction invitation.`,
          nextRev,
          ts,
        );
        return updated;
      },
    );
  }

  /**
   * 5. Submit initial or revised offer (Preserves all prior offers; never overwrites)
   */
  async function submitOffer(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    idempotencyKey: string;
    transactionId: string;
    recipientParticipantUid: string;
    financialTerms: TransactionFinancialTermsUnion;
    proposedConditions?: string[];
    validUntilIso: string;
    expectedTransactionRevision?: number;
  }): Promise<{ offer: TransactionOfferRecord; transaction: RealEstateTransactionRecord }> {
    const tId = requireValidId(params.transactionId, 'transactionId');
    const recipientUid = requireValidId(
      params.recipientParticipantUid,
      'recipientParticipantUid',
    );
    const txCheck = await retrieveTransaction({
      principal: params.principal,
      transactionId: tId,
    });
    const { actor, participant } = await assertTransactionParticipantAccess(
      txCheck,
      params.principal,
      { requireNegotiationScope: true },
    );

    validateFinancialTermsIntegrity(txCheck.transactionType, params.financialTerms);

    const outcome = await executeIdempotentMutation<{
      offer: TransactionOfferRecord;
      transaction: RealEstateTransactionRecord;
    }>({
      store: idempotencyStore,
      idempotencyKey: params.idempotencyKey,
      operation: 'real-estate-transactions:offer.submit',
      actorUid: actor.uid,
      requestPayload: {
        transactionId: tId,
        recipientUid,
        financialTerms: params.financialTerms,
        validUntilIso: params.validUntilIso,
      },
      nowEpochMs: nowEpochMs(),
      mutationFn: async () => {
        return runDurableTransaction(
          deps.txRunner,
          { operationName: 'ret.offer.submit', maxAttempts: 4, baseBackoffMs: 5 },
          async (tx) => {
            const snap = await tx.get<RealEstateTransactionRecord>(`ret_transactions/${tId}`);
            if (!snap.exists || !snap.data) {
              throw new CoreApiError('NOT_FOUND', 404, `Transaction "${tId}" not found.`);
            }
            assertExpectedRevision(snap.data, params.expectedTransactionRevision);

            if (
              snap.data.status !== 'DRAFT_INITIATED' &&
              snap.data.status !== 'NEGOTIATION_ACTIVE'
            ) {
              throw new CoreApiError(
                'CONFLICT',
                409,
                `Cannot submit a new offer when transaction is in status "${snap.data.status}".`,
              );
            }

            const ts = nowTs();
            const offerId = `rtoff_${crypto.randomBytes(6).toString('hex')}`;
            const offerVersion = snap.data.offerIds.length + 1;

            const offer: TransactionOfferRecord = {
              offerId,
              transactionId: tId,
              canonicalPropertyId: snap.data.canonicalPropertyId,
              offerVersion,
              previousOfferId: snap.data.activeOfferId,
              proposingParticipantUid: actor.uid,
              proposingRole: participant?.role ?? 'BUYER',
              recipientParticipantUid: recipientUid,
              financialTerms: structuredClone(params.financialTerms),
              proposedConditions: (params.proposedConditions ?? []).map((c) =>
                sanitizeTextInput(c).slice(0, 300),
              ),
              validUntilIso: params.validUntilIso,
              status: 'SUBMITTED',
              createdAt: ts,
              updatedAt: ts,
            };

            const nextRev = snap.data.revisionNumber + 1;
            const updatedTx: RealEstateTransactionRecord = {
              ...snap.data,
              status: 'NEGOTIATION_ACTIVE',
              currentFinancialTerms: structuredClone(params.financialTerms),
              financialTermsHistory: [
                ...snap.data.financialTermsHistory,
                {
                  revisionNumber: snap.data.financialTermsHistory.length + 1,
                  sourceOfferId: offerId,
                  recordedByUid: actor.uid,
                  classification: 'INITIAL_PROPOSAL',
                  terms: structuredClone(params.financialTerms),
                  recordedAt: ts,
                },
              ],
              activeOfferId: offerId,
              offerIds: [...snap.data.offerIds, offerId],
              revisionNumber: nextRev,
              updatedAt: ts,
            };

            tx.set(`ret_offers/${offerId}`, offer as unknown as Record<string, unknown>);
            tx.set(`ret_transactions/${tId}`, updatedTx as unknown as Record<string, unknown>);
            await appendToIndex(tx, `ret_tx_offers_index/${tId}`, offerId);
            await appendHistoryEntry(
              tx,
              tId,
              snap.data.canonicalPropertyId,
              actor.uid,
              'OFFER_LIFECYCLE',
              `Submitted offer v${offerVersion} (${offerId}).`,
              nextRev,
              ts,
            );

            return { statusCode: 201, body: { offer, transaction: updatedTx } };
          },
        );
      },
    });

    return outcome.body;
  }

  /**
   * 6. Submit counteroffer (Marks previous offer as COUNTEROFFERED without overwriting its terms; creates a new offer version)
   */
  async function submitCounteroffer(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    idempotencyKey: string;
    transactionId: string;
    previousOfferId: string;
    financialTerms: TransactionFinancialTermsUnion;
    proposedConditions?: string[];
    validUntilIso: string;
    expectedTransactionRevision?: number;
  }): Promise<{
    supersededOffer: TransactionOfferRecord;
    counteroffer: TransactionOfferRecord;
    transaction: RealEstateTransactionRecord;
  }> {
    const tId = requireValidId(params.transactionId, 'transactionId');
    const prevId = requireValidId(params.previousOfferId, 'previousOfferId');
    const txCheck = await retrieveTransaction({
      principal: params.principal,
      transactionId: tId,
    });
    const { actor, participant } = await assertTransactionParticipantAccess(
      txCheck,
      params.principal,
      { requireNegotiationScope: true },
    );

    validateFinancialTermsIntegrity(txCheck.transactionType, params.financialTerms);

    const outcome = await executeIdempotentMutation<{
      supersededOffer: TransactionOfferRecord;
      counteroffer: TransactionOfferRecord;
      transaction: RealEstateTransactionRecord;
    }>({
      store: idempotencyStore,
      idempotencyKey: params.idempotencyKey,
      operation: 'real-estate-transactions:offer.counter',
      actorUid: actor.uid,
      requestPayload: {
        transactionId: tId,
        previousOfferId: prevId,
        financialTerms: params.financialTerms,
        validUntilIso: params.validUntilIso,
      },
      nowEpochMs: nowEpochMs(),
      mutationFn: async () => {
        return runDurableTransaction(
          deps.txRunner,
          { operationName: 'ret.offer.counter', maxAttempts: 4, baseBackoffMs: 5 },
          async (tx) => {
            const snap = await tx.get<RealEstateTransactionRecord>(`ret_transactions/${tId}`);
            if (!snap.exists || !snap.data) {
              throw new CoreApiError('NOT_FOUND', 404, `Transaction "${tId}" not found.`);
            }
            assertExpectedRevision(snap.data, params.expectedTransactionRevision);

            if (snap.data.activeOfferId !== prevId) {
              throw new CoreApiError(
                'CONFLICT',
                409,
                `STALE_OFFER_CONFLICT: Offer "${prevId}" is no longer the active offer on this transaction.`,
              );
            }

            const prevSnap = await tx.get<TransactionOfferRecord>(`ret_offers/${prevId}`);
            if (!prevSnap.exists || !prevSnap.data) {
              throw new CoreApiError('NOT_FOUND', 404, `Offer "${prevId}" not found.`);
            }

            const ts = nowTs();
            assertValidOfferTransition({
              offer: prevSnap.data,
              targetState: 'COUNTEROFFERED',
              actorUid: actor.uid,
              nowEpochMs: ts.epochMs,
              transactionStatus: snap.data.status,
            });

            // Preserve original offer terms untouched; only update status to COUNTEROFFERED
            const supersededOffer: TransactionOfferRecord = {
              ...prevSnap.data,
              status: 'COUNTEROFFERED',
              updatedAt: ts,
            };

            const counterofferId = `rtoff_${crypto.randomBytes(6).toString('hex')}`;
            const offerVersion = snap.data.offerIds.length + 1;
            const counteroffer: TransactionOfferRecord = {
              offerId: counterofferId,
              transactionId: tId,
              canonicalPropertyId: snap.data.canonicalPropertyId,
              offerVersion,
              previousOfferId: prevId,
              proposingParticipantUid: actor.uid,
              proposingRole: participant?.role ?? 'SELLER',
              recipientParticipantUid: prevSnap.data.proposingParticipantUid,
              financialTerms: structuredClone(params.financialTerms),
              proposedConditions: (params.proposedConditions ?? []).map((c) =>
                sanitizeTextInput(c).slice(0, 300),
              ),
              validUntilIso: params.validUntilIso,
              status: 'SUBMITTED',
              createdAt: ts,
              updatedAt: ts,
            };

            const nextRev = snap.data.revisionNumber + 1;
            const updatedTx: RealEstateTransactionRecord = {
              ...snap.data,
              status: 'NEGOTIATION_ACTIVE',
              currentFinancialTerms: structuredClone(params.financialTerms),
              financialTermsHistory: [
                ...snap.data.financialTermsHistory,
                {
                  revisionNumber: snap.data.financialTermsHistory.length + 1,
                  sourceOfferId: counterofferId,
                  recordedByUid: actor.uid,
                  classification: 'COUNTEROFFER_REVISION',
                  terms: structuredClone(params.financialTerms),
                  recordedAt: ts,
                },
              ],
              activeOfferId: counterofferId,
              offerIds: [...snap.data.offerIds, counterofferId],
              revisionNumber: nextRev,
              updatedAt: ts,
            };

            tx.set(
              `ret_offers/${prevId}`,
              supersededOffer as unknown as Record<string, unknown>,
            );
            tx.set(
              `ret_offers/${counterofferId}`,
              counteroffer as unknown as Record<string, unknown>,
            );
            tx.set(`ret_transactions/${tId}`, updatedTx as unknown as Record<string, unknown>);
            await appendToIndex(tx, `ret_tx_offers_index/${tId}`, counterofferId);
            await appendHistoryEntry(
              tx,
              tId,
              snap.data.canonicalPropertyId,
              actor.uid,
              'OFFER_LIFECYCLE',
              `Countered offer ${prevId} with new counteroffer v${offerVersion} (${counterofferId}).`,
              nextRev,
              ts,
            );

            return {
              statusCode: 201,
              body: { supersededOffer, counteroffer, transaction: updatedTx },
            };
          },
        );
      },
    });

    return outcome.body;
  }

  /**
   * 7, 8, 9. Accept, Reject, or Withdraw an offer (Concurrency-safe, prevents simultaneous conflicting acceptance)
   */
  async function transitionOfferDecision(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    idempotencyKey: string;
    transactionId: string;
    offerId: string;
    decision: 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
    expectedTransactionRevision?: number;
  }): Promise<{ offer: TransactionOfferRecord; transaction: RealEstateTransactionRecord }> {
    const tId = requireValidId(params.transactionId, 'transactionId');
    const offId = requireValidId(params.offerId, 'offerId');
    const txCheck = await retrieveTransaction({
      principal: params.principal,
      transactionId: tId,
    });
    const { actor } = await assertTransactionParticipantAccess(txCheck, params.principal, {
      requireNegotiationScope: true,
    });

    const outcome = await executeIdempotentMutation<{
      offer: TransactionOfferRecord;
      transaction: RealEstateTransactionRecord;
    }>({
      store: idempotencyStore,
      idempotencyKey: params.idempotencyKey,
      operation: `real-estate-transactions:offer.${params.decision.toLowerCase()}`,
      actorUid: actor.uid,
      requestPayload: {
        transactionId: tId,
        offerId: offId,
        decision: params.decision,
      },
      nowEpochMs: nowEpochMs(),
      mutationFn: async () => {
        return runDurableTransaction(
          deps.txRunner,
          { operationName: 'ret.offer.decision', maxAttempts: 4, baseBackoffMs: 5 },
          async (tx) => {
            const snap = await tx.get<RealEstateTransactionRecord>(`ret_transactions/${tId}`);
            if (!snap.exists || !snap.data) {
              throw new CoreApiError('NOT_FOUND', 404, `Transaction "${tId}" not found.`);
            }
            assertExpectedRevision(snap.data, params.expectedTransactionRevision);

            if (snap.data.activeOfferId !== offId) {
              throw new CoreApiError(
                'CONFLICT',
                409,
                `STALE_OFFER_CONFLICT: Offer "${offId}" is no longer the active offer.`,
              );
            }
            if (snap.data.acceptedOfferId !== null) {
              throw new CoreApiError(
                'CONFLICT',
                409,
                `SIMULTANEOUS_ACCEPTANCE_CONFLICT: Transaction already has an accepted offer ("${snap.data.acceptedOfferId}").`,
              );
            }

            const offSnap = await tx.get<TransactionOfferRecord>(`ret_offers/${offId}`);
            if (!offSnap.exists || !offSnap.data) {
              throw new CoreApiError('NOT_FOUND', 404, `Offer "${offId}" not found.`);
            }

            const ts = nowTs();
            assertValidOfferTransition({
              offer: offSnap.data,
              targetState: params.decision,
              actorUid: actor.uid,
              nowEpochMs: ts.epochMs,
              transactionStatus: snap.data.status,
            });

            const updatedOffer: TransactionOfferRecord = {
              ...offSnap.data,
              status: params.decision,
              updatedAt: ts,
            };

            let agreedTerms = structuredClone(offSnap.data.financialTerms);
            if (
              params.decision === 'ACCEPTED' &&
              agreedTerms.termMode === 'PURCHASE_OR_SALE'
            ) {
              agreedTerms = {
                ...agreedTerms,
                agreedPurchasePrice: agreedTerms.proposedPurchasePrice,
              };
            }

            const nextRev = snap.data.revisionNumber + 1;
            const updatedTx: RealEstateTransactionRecord = {
              ...snap.data,
              // Offer acceptance transitions to TERMS_ACCEPTED_PENDING_CLOSING — NEVER directly to COMPLETED (Section 3I)
              status:
                params.decision === 'ACCEPTED'
                  ? 'TERMS_ACCEPTED_PENDING_CLOSING'
                  : snap.data.status,
              currentFinancialTerms:
                params.decision === 'ACCEPTED' ? agreedTerms : snap.data.currentFinancialTerms,
              financialTermsHistory:
                params.decision === 'ACCEPTED'
                  ? [
                      ...snap.data.financialTermsHistory,
                      {
                        revisionNumber: snap.data.financialTermsHistory.length + 1,
                        sourceOfferId: offId,
                        recordedByUid: actor.uid,
                        classification: 'ACCEPTED_AGREED_TERMS',
                        terms: agreedTerms,
                        recordedAt: ts,
                      },
                    ]
                  : snap.data.financialTermsHistory,
              acceptedOfferId: params.decision === 'ACCEPTED' ? offId : null,
              revisionNumber: nextRev,
              updatedAt: ts,
            };

            tx.set(`ret_offers/${offId}`, updatedOffer as unknown as Record<string, unknown>);
            tx.set(`ret_transactions/${tId}`, updatedTx as unknown as Record<string, unknown>);
            await appendHistoryEntry(
              tx,
              tId,
              snap.data.canonicalPropertyId,
              actor.uid,
              'OFFER_LIFECYCLE',
              `Offer ${offId} marked ${params.decision} by ${actor.uid}.`,
              nextRev,
              ts,
            );

            return { statusCode: 200, body: { offer: updatedOffer, transaction: updatedTx } };
          },
        );
      },
    });

    return outcome.body;
  }

  /**
   * 10. Record or update transaction milestone
   */
  async function recordTransactionMilestone(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    transactionId: string;
    milestoneType: TransactionMilestoneType;
    stage: MilestoneVerificationStage;
    responsibleParticipantUid: string;
    dueDateIso?: string | null;
    evidenceRefIds?: string[];
    notes?: string;
  }): Promise<TransactionMilestoneRecord> {
    const tId = requireValidId(params.transactionId, 'transactionId');
    const txCheck = await retrieveTransaction({
      principal: params.principal,
      transactionId: tId,
    });
    const { actor } = await assertTransactionParticipantAccess(txCheck, params.principal);

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'ret.milestone.record', maxAttempts: 4, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<RealEstateTransactionRecord>(`ret_transactions/${tId}`);
        if (!snap.exists || !snap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Transaction "${tId}" not found.`);
        }

        const ts = nowTs();
        const milestoneId = `rtms_${crypto.randomBytes(6).toString('hex')}`;
        const milestone: TransactionMilestoneRecord = {
          milestoneId,
          transactionId: tId,
          milestoneType: params.milestoneType,
          stage: params.stage,
          responsibleParticipantUid: requireValidId(
            params.responsibleParticipantUid,
            'responsibleParticipantUid',
          ),
          dueDateIso: params.dueDateIso ?? null,
          completedAt:
            params.stage === 'COMPLETED' || params.stage === 'VERIFIED' ? ts : null,
          evidenceRefIds: params.evidenceRefIds ?? [],
          notes: sanitizeTextInput(params.notes ?? '').slice(0, 400),
          recordedByUid: actor.uid,
          updatedAt: ts,
        };

        const nextRev = snap.data.revisionNumber + 1;
        const updatedTx: RealEstateTransactionRecord = {
          ...snap.data,
          milestoneIds: [...snap.data.milestoneIds, milestoneId],
          revisionNumber: nextRev,
          updatedAt: ts,
        };

        tx.set(`ret_milestones/${milestoneId}`, milestone as unknown as Record<string, unknown>);
        tx.set(`ret_transactions/${tId}`, updatedTx as unknown as Record<string, unknown>);
        await appendToIndex(tx, `ret_tx_milestones_index/${tId}`, milestoneId);
        await appendHistoryEntry(
          tx,
          tId,
          snap.data.canonicalPropertyId,
          actor.uid,
          'MILESTONE_UPDATE',
          `Recorded milestone ${params.milestoneType} (${params.stage}).`,
          nextRev,
          ts,
        );
        return milestone;
      },
    );
  }

  /**
   * 11. Update contract workflow metadata (Verifies file in Media module; includes non-legal-validity disclaimer)
   */
  async function updateContractWorkflowMetadata(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    transactionId: string;
    contractRefId: string;
    contractVersion: number;
    mediaDocumentRefId: string;
    workflowState: ContractWorkflowLifecycleState;
    approvedByParticipantUids?: string[];
    signedByParticipantUids?: string[];
    effectiveDateIso?: string | null;
    expirationDateIso?: string | null;
  }): Promise<RealEstateTransactionRecord> {
    const tId = requireValidId(params.transactionId, 'transactionId');
    const mediaId = requireValidId(params.mediaDocumentRefId, 'mediaDocumentRefId');
    const txCheck = await retrieveTransaction({
      principal: params.principal,
      transactionId: tId,
    });
    const { actor } = await assertTransactionParticipantAccess(txCheck, params.principal);

    let checksum = 'UNVERIFIED_MEDIA_CHECKSUM';
    if (deps.media) {
      const mediaSnap = await deps.media.verifyDocumentReference(mediaId);
      if (!mediaSnap) {
        throw new CoreApiError(
          'NOT_FOUND',
          404,
          `Contract media document "${mediaId}" not found in Media module.`,
        );
      }
      checksum = mediaSnap.sha256Checksum;
    }

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'ret.contract.update', maxAttempts: 4, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<RealEstateTransactionRecord>(`ret_transactions/${tId}`);
        if (!snap.exists || !snap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Transaction "${tId}" not found.`);
        }

        const ts = nowTs();
        const contractMetadata: TransactionContractMetadataRecord = {
          contractRefId: requireValidId(params.contractRefId, 'contractRefId'),
          contractVersion: params.contractVersion,
          mediaDocumentRefId: mediaId,
          mediaSha256Checksum: checksum,
          workflowState: params.workflowState,
          approvedByParticipantUids: params.approvedByParticipantUids ?? [],
          signedByParticipantUids: params.signedByParticipantUids ?? [],
          effectiveDateIso: params.effectiveDateIso ?? null,
          expirationDateIso: params.expirationDateIso ?? null,
          amendmentRefIds: snap.data.contractMetadata?.amendmentRefIds ?? [],
          terminationRefId: snap.data.contractMetadata?.terminationRefId ?? null,
          nonLegalValidityDisclaimer:
            'CONTRACT_WORKFLOW_DISCLAIMER: Platform contract metadata tracks workflow steps and document references only; clicking approval or acceptance buttons does not by itself constitute a legally binding statutory registration.',
          updatedAt: ts,
        };

        const nextRev = snap.data.revisionNumber + 1;
        const updatedTx: RealEstateTransactionRecord = {
          ...snap.data,
          status:
            snap.data.status === 'TERMS_ACCEPTED_PENDING_CLOSING'
              ? 'CLOSING_IN_PROGRESS'
              : snap.data.status,
          contractMetadata,
          revisionNumber: nextRev,
          updatedAt: ts,
        };

        tx.set(`ret_transactions/${tId}`, updatedTx as unknown as Record<string, unknown>);
        await appendHistoryEntry(
          tx,
          tId,
          snap.data.canonicalPropertyId,
          actor.uid,
          'CONTRACT_METADATA_UPDATE',
          `Updated contract workflow metadata to ${params.workflowState} (v${params.contractVersion}).`,
          nextRev,
          ts,
        );
        return updatedTx;
      },
    );
  }

  /**
   * 12. Record payment reference (Rejects client-supplied CONFIRMED claims unless verified by authoritative payment adapter)
   */
  async function recordPaymentReference(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    idempotencyKey: string;
    transactionId: string;
    externalPaymentReferenceId: string;
    purpose: TransactionPaymentReferenceRecord['purpose'];
    amount: number;
    currency: TransactionCurrencyCode;
    clientClaimedPaymentState?: string;
  }): Promise<TransactionPaymentReferenceRecord> {
    if (params.clientClaimedPaymentState === 'CONFIRMED') {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'Client-supplied CONFIRMED payment claims are forbidden; payment confirmation is only accepted from an authoritative payment verification adapter.',
      );
    }

    const tId = requireValidId(params.transactionId, 'transactionId');
    const extPayId = requireValidId(
      params.externalPaymentReferenceId,
      'externalPaymentReferenceId',
    );
    const txCheck = await retrieveTransaction({
      principal: params.principal,
      transactionId: tId,
    });
    const { actor } = await assertTransactionParticipantAccess(txCheck, params.principal);

    const outcome = await executeIdempotentMutation<TransactionPaymentReferenceRecord>({
      store: idempotencyStore,
      idempotencyKey: params.idempotencyKey,
      operation: 'real-estate-transactions:payment.record',
      actorUid: actor.uid,
      requestPayload: {
        transactionId: tId,
        externalPaymentReferenceId: extPayId,
        purpose: params.purpose,
        amount: params.amount,
      },
      nowEpochMs: nowEpochMs(),
      mutationFn: async () => {
        const authVerification = deps.payments
          ? await deps.payments.verifyAuthoritativePaymentReference(extPayId)
          : null;

        const ts = nowTs();
        const paymentRefRecordId = `rtpay_${crypto.randomBytes(6).toString('hex')}`;
        const payRecord: TransactionPaymentReferenceRecord = {
          paymentRefRecordId,
          transactionId: tId,
          externalPaymentReferenceId: extPayId,
          purpose: params.purpose,
          state: authVerification
            ? authVerification.paymentState
            : 'PENDING_CONFIRMATION',
          verifiedByAuthoritativeSource: Boolean(
            authVerification?.verifiedByPaymentModule &&
              authVerification.paymentState === 'CONFIRMED',
          ),
          amount: authVerification?.confirmedAmount ?? params.amount,
          currency: authVerification?.currency ?? params.currency,
          providerReferenceCode: authVerification?.providerReferenceCode ?? null,
          recordedByUid: actor.uid,
          recordedAt: ts,
        };

        await runDurableTransaction(
          deps.txRunner,
          { operationName: 'ret.payment.record', maxAttempts: 4, baseBackoffMs: 5 },
          async (tx) => {
            const snap = await tx.get<RealEstateTransactionRecord>(`ret_transactions/${tId}`);
            if (!snap.exists || !snap.data) {
              throw new CoreApiError('NOT_FOUND', 404, `Transaction "${tId}" not found.`);
            }
            const nextRev = snap.data.revisionNumber + 1;
            const updatedTx: RealEstateTransactionRecord = {
              ...snap.data,
              paymentReferenceIds: [...snap.data.paymentReferenceIds, paymentRefRecordId],
              revisionNumber: nextRev,
              updatedAt: ts,
            };

            tx.set(
              `ret_payments/${paymentRefRecordId}`,
              payRecord as unknown as Record<string, unknown>,
            );
            tx.set(`ret_transactions/${tId}`, updatedTx as unknown as Record<string, unknown>);
            await appendToIndex(tx, `ret_tx_payments_index/${tId}`, paymentRefRecordId);
            await appendHistoryEntry(
              tx,
              tId,
              snap.data.canonicalPropertyId,
              actor.uid,
              'PAYMENT_REFERENCE_UPDATE',
              `Recorded payment reference ${extPayId} (state=${payRecord.state}, verified=${payRecord.verifiedByAuthoritativeSource}).`,
              nextRev,
              ts,
            );
          },
        );

        return { statusCode: 201, body: payRecord };
      },
    });

    return outcome.body;
  }

  /**
   * 13 & 14. Complete transaction (Enforces all completion prerequisites; never infers completion from offer acceptance alone)
   */
  async function completeTransaction(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    idempotencyKey: string;
    transactionId: string;
    expectedTransactionRevision?: number;
  }): Promise<RealEstateTransactionRecord> {
    const tId = requireValidId(params.transactionId, 'transactionId');
    const txCheck = await retrieveTransaction({
      principal: params.principal,
      transactionId: tId,
    });
    const { actor, participant } = await assertTransactionParticipantAccess(
      txCheck,
      params.principal,
    );

    if (
      !isAdminOrCoordinator(actor) &&
      participant?.permissionScope !== 'PROPOSE_AND_ACCEPT_TERMS' &&
      participant?.permissionScope !== 'COORDINATE_AND_RECORD_MILESTONES'
    ) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Participant is not authorized to finalize transaction completion.',
      );
    }

    let dueDiligenceBlocking = false;
    let ddVersion: number | null = null;
    if (txCheck.dueDiligenceCaseRefId && deps.dueDiligence) {
      const ddSnap = await deps.dueDiligence.getDueDiligenceCaseReadiness(
        txCheck.dueDiligenceCaseRefId,
      );
      if (!ddSnap || ddSnap.hasBlockingFindings || ddSnap.overallState === 'BLOCKED') {
        dueDiligenceBlocking = true;
      } else {
        ddVersion = ddSnap.assessmentVersion;
      }
    }

    const outcome = await executeIdempotentMutation<RealEstateTransactionRecord>({
      store: idempotencyStore,
      idempotencyKey: params.idempotencyKey,
      operation: 'real-estate-transactions:tx.complete',
      actorUid: actor.uid,
      requestPayload: { transactionId: tId },
      nowEpochMs: nowEpochMs(),
      mutationFn: async () => {
        return runDurableTransaction(
          deps.txRunner,
          { operationName: 'ret.tx.complete', maxAttempts: 4, baseBackoffMs: 5 },
          async (tx) => {
            const snap = await tx.get<RealEstateTransactionRecord>(`ret_transactions/${tId}`);
            if (!snap.exists || !snap.data) {
              throw new CoreApiError('NOT_FOUND', 404, `Transaction "${tId}" not found.`);
            }
            assertExpectedRevision(snap.data, params.expectedTransactionRevision);

            const [milestones, paymentRefs] = await Promise.all([
              loadIndexedDocs<TransactionMilestoneRecord>(
                tx,
                `ret_tx_milestones_index/${tId}`,
                'ret_milestones',
              ),
              loadIndexedDocs<TransactionPaymentReferenceRecord>(
                tx,
                `ret_tx_payments_index/${tId}`,
                'ret_payments',
              ),
            ]);

            const readiness = verifyTransactionCompletionPrerequisites({
              transaction: snap.data,
              milestones,
              paymentReferences: paymentRefs,
              dueDiligenceBlocking,
            });

            if (!readiness.eligibleForCompletion) {
              throw new CoreApiError(
                'VALIDATION_FAILED',
                400,
                `COMPLETION_PREREQUISITES_NOT_MET: ${readiness.unmetPrerequisites.join(', ')}`,
                { unmetPrerequisites: readiness.unmetPrerequisites },
              );
            }

            const ts = nowTs();
            const nextRev = snap.data.revisionNumber + 1;
            const confirmedPayIds = paymentRefs
              .filter((p) => p.verifiedByAuthoritativeSource && p.state === 'CONFIRMED')
              .map((p) => p.paymentRefRecordId);

            const updatedTx: RealEstateTransactionRecord = {
              ...snap.data,
              status: 'COMPLETED',
              completionMetadata: {
                completedAt: ts,
                completedByUid: actor.uid,
                acceptedOfferId: snap.data.acceptedOfferId!,
                contractRefId: snap.data.contractMetadata!.contractRefId,
                verifiedPaymentRecordIds: confirmedPayIds,
                dueDiligenceAssessmentVersion: ddVersion,
              },
              revisionNumber: nextRev,
              updatedAt: ts,
            };

            tx.set(`ret_transactions/${tId}`, updatedTx as unknown as Record<string, unknown>);
            await appendHistoryEntry(
              tx,
              tId,
              snap.data.canonicalPropertyId,
              actor.uid,
              'COMPLETION_RECORDED',
              `Transaction marked COMPLETED after verifying all contract, payment, and handover prerequisites.`,
              nextRev,
              ts,
            );

            return { statusCode: 200, body: updatedTx };
          },
        );
      },
    });

    return outcome.body;
  }

  /**
   * 15 & 16. Cancel transaction or record dispute reference (Never adjudicates legal entitlement to deposits)
   */
  async function recordCancellationOrDispute(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    transactionId: string;
    recordKind: TransactionCancellationOrDisputeRecord['recordKind'];
    reasonCategory: TransactionCancellationOrDisputeRecord['reasonCategory'];
    explanation: string;
    supportingEvidenceRefIds?: string[];
  }): Promise<{
    record: TransactionCancellationOrDisputeRecord;
    transaction: RealEstateTransactionRecord;
  }> {
    const tId = requireValidId(params.transactionId, 'transactionId');
    const txCheck = await retrieveTransaction({
      principal: params.principal,
      transactionId: tId,
    });
    const { actor } = await assertTransactionParticipantAccess(txCheck, params.principal);

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'ret.tx.cancel_or_dispute', maxAttempts: 4, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<RealEstateTransactionRecord>(`ret_transactions/${tId}`);
        if (!snap.exists || !snap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Transaction "${tId}" not found.`);
        }
        if (snap.data.status === 'COMPLETED' && params.recordKind === 'CANCELLATION') {
          throw new CoreApiError(
            'CONFLICT',
            409,
            'Cannot cancel an already COMPLETED transaction; record a DISPUTE_REFERENCE or TERMINATION instead.',
          );
        }

        const ts = nowTs();
        const recordId = `rtdisp_${crypto.randomBytes(6).toString('hex')}`;
        const record: TransactionCancellationOrDisputeRecord = {
          recordId,
          transactionId: tId,
          recordKind: params.recordKind,
          initiatingParticipantUid: actor.uid,
          reasonCategory: params.reasonCategory,
          explanation: sanitizeTextInput(params.explanation).slice(0, 600),
          supportingEvidenceRefIds: params.supportingEvidenceRefIds ?? [],
          reviewStatus: 'OPEN_RECORDED',
          externalResolutionReferenceId: null,
          nonAdjudicationDisclaimer:
            'DISPUTE_BOUNDARY_DISCLAIMER: This module records cancellation and dispute references for workflow tracking only and never adjudicates legal disputes or deposit retention rights.',
          effectiveAt: ts,
        };

        const nextStatus: RealEstateTransactionCaseStatus =
          params.recordKind === 'DISPUTE_REFERENCE'
            ? 'DISPUTED'
            : params.recordKind === 'TERMINATION'
              ? 'TERMINATED'
              : 'CANCELLED';

        const nextRev = snap.data.revisionNumber + 1;
        const updatedTx: RealEstateTransactionRecord = {
          ...snap.data,
          status: nextStatus,
          cancellationOrDisputeIds: [...snap.data.cancellationOrDisputeIds, recordId],
          revisionNumber: nextRev,
          updatedAt: ts,
        };

        tx.set(`ret_disputes/${recordId}`, record as unknown as Record<string, unknown>);
        tx.set(`ret_transactions/${tId}`, updatedTx as unknown as Record<string, unknown>);
        await appendHistoryEntry(
          tx,
          tId,
          snap.data.canonicalPropertyId,
          actor.uid,
          'CANCELLATION_OR_DISPUTE',
          `Recorded ${params.recordKind} (${params.reasonCategory}) -> status ${nextStatus}.`,
          nextRev,
          ts,
        );

        return { record, transaction: updatedTx };
      },
    );
  }

  /**
   * 17. Retrieve transaction history and offers (Cursor Paginated)
   */
  async function retrieveTransactionHistory(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    transactionId: string;
    limit?: number;
    cursor?: string;
    direction?: 'asc' | 'desc';
  }) {
    const txCheck = await retrieveTransaction({
      principal: params.principal,
      transactionId: params.transactionId,
    });
    const pagination = normalizePaginationParams({
      limit: params.limit,
      cursor: params.cursor,
      direction: params.direction ?? 'desc',
    });

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'ret.history.list', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const [historyDocs, offerDocs] = await Promise.all([
          loadIndexedDocs<TransactionHistoryEntryRecord>(
            tx,
            `ret_tx_history_index/${txCheck.transactionId}`,
            'ret_history',
          ),
          loadIndexedDocs<TransactionOfferRecord>(
            tx,
            `ret_tx_offers_index/${txCheck.transactionId}`,
            'ret_offers',
          ),
        ]);

        const mapped = historyDocs.map((h, idx) => ({
          ...h,
          id: h.historyId,
          sortEpochMs: h.occurredAt.epochMs + idx,
        }));
        const page = paginateItems(mapped, pagination);

        return {
          items: page.items.map(({ id: _id, sortEpochMs: _s, ...rest }) => rest),
          offersHistory: offerDocs.sort((a, b) => a.offerVersion - b.offerVersion),
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
          totalCount: page.totalCount,
        };
      },
    );
  }

  return {
    createTransaction,
    retrieveTransaction,
    inviteParticipant,
    respondToParticipantInvitation,
    submitOffer,
    submitCounteroffer,
    transitionOfferDecision,
    recordTransactionMilestone,
    updateContractWorkflowMetadata,
    recordPaymentReference,
    completeTransaction,
    recordCancellationOrDispute,
    retrieveTransactionHistory,
  };
}
