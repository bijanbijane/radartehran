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
  ConfidenceClassification,
  DueDiligenceSourceType,
  PropertyDueDiligenceModuleDependencies,
} from '../contracts/externalAdapters';
import type {
  DueDiligenceCaseActivityRecord,
  DueDiligenceCasePurpose,
  DueDiligenceCaseRecord,
  DueDiligenceCompletionAssessmentRecord,
  DueDiligenceEvidenceRecord,
  DueDiligenceFindingRecord,
  EvidenceCategory,
  EvidenceVerificationState,
  FindingCategory,
  FindingSeverityClassification,
  OwnershipAndAuthorityReviewRecord,
  PropertyConsistencyCheckReport,
  PropertyFinancialObligationCheckRecord,
  UntrustedAiExtractionEnvelope,
  VerificationMethodType,
} from '../domain/types';
import {
  assertValidEvidenceStateTransition,
  evaluateDueDiligenceCompletionAssessment,
  evaluatePropertyInformationConsistency,
} from '../verification/verificationAndAssessmentEngine';

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

export function createPropertyDueDiligenceService(
  deps: PropertyDueDiligenceModuleDependencies,
) {
  const nowEpochMs = () => (deps.nowFn ? deps.nowFn() : Date.now());
  const nowTs = (): NormalizedTimestamp => normalizeFirestoreTimestamp(nowEpochMs())!;

  const retrySafeTxRunner = {
    runTransaction: <T>(workFn: (tx: TransactionContextLike) => Promise<T>) =>
      runDurableTransaction(
        deps.txRunner,
        {
          operationName: 'property_due_diligence_idempotency_tx',
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

  function isPrincipalReviewerOrAdmin(
    principal: AuthenticatedPrincipal,
    caseRecord?: DueDiligenceCaseRecord,
  ): boolean {
    const isAdmin =
      principal.emailVerified &&
      Boolean(principal.email) &&
      (deps.primaryAdminEmails ?? ['admin@radartehran.ir'])
        .map((e) => e.toLowerCase())
        .includes(principal.email!.toLowerCase());
    if (isAdmin) return true;
    if ((deps.authorizedReviewerUids ?? []).includes(principal.uid)) return true;
    if (caseRecord?.assignedReviewerUid === principal.uid) return true;
    return false;
  }

  async function assertCaseAccess(
    caseRecord: DueDiligenceCaseRecord,
    principal: AuthenticatedPrincipal | null | undefined,
    requireReviewerRole = false,
  ): Promise<{ actor: AuthenticatedPrincipal; isReviewer: boolean }> {
    const actor = await requireVerifiedPrincipal(principal);
    const isReviewer = isPrincipalReviewerOrAdmin(actor, caseRecord);

    if (requireReviewerRole && !isReviewer) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Operation requires an authorized due-diligence reviewer or administrator.',
      );
    }

    const isParticipant =
      caseRecord.requestingUserUid === actor.uid ||
      caseRecord.authorizedParticipantUids.includes(actor.uid) ||
      isReviewer;

    if (!isParticipant) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Actor is not authorized to access this due diligence case or its private evidence.',
      );
    }

    return { actor, isReviewer };
  }

  async function recordCaseActivity(
    tx: TransactionContextLike,
    caseId: string,
    actorUid: string,
    actionType: DueDiligenceCaseActivityRecord['actionType'],
    summary: string,
    ts: NormalizedTimestamp,
  ): Promise<void> {
    const activityId = `ddact_${crypto.randomBytes(6).toString('hex')}`;
    const entry: DueDiligenceCaseActivityRecord = {
      activityId,
      caseId,
      actorUid,
      actionType,
      summary,
      occurredAt: ts,
    };
    tx.set(`dd_case_activities/${activityId}`, entry as unknown as Record<string, unknown>);
    await appendToIndex(tx, `dd_case_activities_index/${caseId}`, activityId);
  }

  /**
   * 1. Create due diligence case
   */
  async function createDueDiligenceCase(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    idempotencyKey: string;
    canonicalPropertyId: string;
    purpose: DueDiligenceCasePurpose;
    requestedVerificationScope: EvidenceCategory[];
    authorizedParticipantUids?: string[];
    assignedReviewerUid?: string | null;
    notes?: string;
  }): Promise<DueDiligenceCaseRecord> {
    const actor = await requireVerifiedPrincipal(params.principal);
    const canonicalPropertyId = requireValidId(
      params.canonicalPropertyId,
      'canonicalPropertyId',
    );
    if (!params.requestedVerificationScope || params.requestedVerificationScope.length === 0) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'requestedVerificationScope must contain at least one EvidenceCategory.',
      );
    }

    const outcome = await executeIdempotentMutation<DueDiligenceCaseRecord>({
      store: idempotencyStore,
      idempotencyKey: params.idempotencyKey,
      operation: 'property-due-diligence:case.create',
      actorUid: actor.uid,
      requestPayload: {
        canonicalPropertyId,
        purpose: params.purpose,
        requestedVerificationScope: params.requestedVerificationScope,
      },
      nowEpochMs: nowEpochMs(),
      mutationFn: async () => {
        const exists = await deps.propertyRegistry.getCanonicalPropertyExists(
          canonicalPropertyId,
        );
        if (!exists) {
          throw new CoreApiError(
            'NOT_FOUND',
            404,
            `Canonical property "${canonicalPropertyId}" does not exist in Property Registry.`,
          );
        }

        const ts = nowTs();
        const caseId = `ddcase_${crypto.randomBytes(6).toString('hex')}`;
        const caseRecord: DueDiligenceCaseRecord = {
          caseId,
          canonicalPropertyId,
          requestingUserUid: actor.uid,
          authorizedParticipantUids: (params.authorizedParticipantUids ?? []).map((u) =>
            requireValidId(u, 'participantUid'),
          ),
          assignedReviewerUid: params.assignedReviewerUid
            ? requireValidId(params.assignedReviewerUid, 'assignedReviewerUid')
            : null,
          purpose: params.purpose,
          workflowState: 'EVIDENCE_COLLECTION',
          requestedVerificationScope: [...new Set(params.requestedVerificationScope)],
          evidenceIds: [],
          findingIds: [],
          unresolvedFindingIds: [],
          latestAssessmentId: null,
          finalAssessmentStatus: 'NOT_STARTED',
          versionNumber: 1,
          versionHistory: [
            {
              versionNumber: 1,
              workflowState: 'EVIDENCE_COLLECTION',
              finalAssessmentStatus: 'NOT_STARTED',
              changedByUid: actor.uid,
              reason: 'Initial due diligence case created.',
              changedAt: ts,
            },
          ],
          notes: sanitizeTextInput(params.notes ?? '').slice(0, 600),
          createdAt: ts,
          updatedAt: ts,
        };

        await runDurableTransaction(
          deps.txRunner,
          { operationName: 'dd.case.create', maxAttempts: 4, baseBackoffMs: 5 },
          async (tx) => {
            tx.set(`dd_cases/${caseId}`, caseRecord as unknown as Record<string, unknown>);
            await recordCaseActivity(
              tx,
              caseId,
              actor.uid,
              'CASE_CREATED',
              `Created due diligence case for purpose ${params.purpose}.`,
              ts,
            );
          },
        );

        return { statusCode: 201, body: caseRecord };
      },
    });

    return outcome.body;
  }

  /**
   * 2. Retrieve due diligence case
   */
  async function retrieveCase(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    caseId: string;
  }): Promise<DueDiligenceCaseRecord> {
    const cId = requireValidId(params.caseId, 'caseId');
    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'dd.case.get', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<DueDiligenceCaseRecord>(`dd_cases/${cId}`);
        if (!snap.exists || !snap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Due diligence case "${cId}" not found.`);
        }
        await assertCaseAccess(snap.data, params.principal);
        return snap.data;
      },
    );
  }

  /**
   * 3. Update permitted case metadata
   */
  async function updateCaseMetadata(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    caseId: string;
    notes?: string;
    requestedVerificationScope?: EvidenceCategory[];
    assignedReviewerUid?: string | null;
  }): Promise<DueDiligenceCaseRecord> {
    const cId = requireValidId(params.caseId, 'caseId');
    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'dd.case.update_metadata', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<DueDiligenceCaseRecord>(`dd_cases/${cId}`);
        if (!snap.exists || !snap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Due diligence case "${cId}" not found.`);
        }
        const { actor, isReviewer } = await assertCaseAccess(snap.data, params.principal);
        if (snap.data.workflowState === 'CLOSED' || snap.data.workflowState === 'CANCELLED') {
          throw new CoreApiError(
            'CONFLICT',
            409,
            `Cannot update metadata on a ${snap.data.workflowState} case.`,
          );
        }
        if (params.assignedReviewerUid !== undefined && !isReviewer) {
          throw new CoreApiError(
            'FORBIDDEN',
            403,
            'Only an administrator or reviewer may reassign the case reviewer.',
          );
        }

        const ts = nowTs();
        const nextVersion = snap.data.versionNumber + 1;
        const updated: DueDiligenceCaseRecord = {
          ...snap.data,
          ...(params.notes !== undefined
            ? { notes: sanitizeTextInput(params.notes).slice(0, 600) }
            : {}),
          ...(params.requestedVerificationScope
            ? { requestedVerificationScope: [...new Set(params.requestedVerificationScope)] }
            : {}),
          ...(params.assignedReviewerUid !== undefined
            ? { assignedReviewerUid: params.assignedReviewerUid }
            : {}),
          versionNumber: nextVersion,
          versionHistory: [
            ...snap.data.versionHistory,
            {
              versionNumber: nextVersion,
              workflowState: snap.data.workflowState,
              finalAssessmentStatus: snap.data.finalAssessmentStatus,
              changedByUid: actor.uid,
              reason: 'Updated case metadata.',
              changedAt: ts,
            },
          ],
          updatedAt: ts,
        };

        tx.set(`dd_cases/${cId}`, updated as unknown as Record<string, unknown>);
        await recordCaseActivity(
          tx,
          cId,
          actor.uid,
          'CASE_METADATA_UPDATED',
          'Updated permitted due diligence case metadata.',
          ts,
        );
        return updated;
      },
    );
  }

  /**
   * 4. Add evidence reference (uses Media module; rejects arbitrary client verification status; keeps AI OCR separate)
   */
  async function addEvidenceReference(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    idempotencyKey: string;
    caseId: string;
    category: EvidenceCategory;
    mediaDocumentRefId: string;
    sourceType: DueDiligenceSourceType;
    issuingAuthorityOrSource: string;
    documentReferenceNumber: string;
    issueDateIso: string;
    expirationDateIso?: string | null;
    confidenceClassification: ConfidenceClassification;
    limitationsAndWarnings?: string[];
    untrustedAiExtraction?: {
      extractionModelId: string;
      extractedFields: Record<string, string | number | null>;
      extractionConfidenceScore: number;
      extractionLimitations?: string[];
    } | null;
    clientSuppliedVerificationStatus?: unknown;
  }): Promise<DueDiligenceEvidenceRecord> {
    if (params.clientSuppliedVerificationStatus !== undefined) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'Clients are forbidden from supplying arbitrary verification statuses when registering evidence.',
      );
    }
    const cId = requireValidId(params.caseId, 'caseId');
    const mediaId = requireValidId(params.mediaDocumentRefId, 'mediaDocumentRefId');
    const issuingSource = sanitizeTextInput(params.issuingAuthorityOrSource).slice(0, 160);
    const docRefNum = sanitizeTextInput(params.documentReferenceNumber).slice(0, 120);

    if (issuingSource.length < 2 || docRefNum.length < 2) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'Evidence requires valid issuingAuthorityOrSource and documentReferenceNumber.',
      );
    }

    const caseSnap = await retrieveCase({ principal: params.principal, caseId: cId });
    const { actor } = await assertCaseAccess(caseSnap, params.principal);

    const outcome = await executeIdempotentMutation<DueDiligenceEvidenceRecord>({
      store: idempotencyStore,
      idempotencyKey: params.idempotencyKey,
      operation: 'property-due-diligence:evidence.add',
      actorUid: actor.uid,
      requestPayload: {
        caseId: cId,
        category: params.category,
        mediaDocumentRefId: mediaId,
        documentReferenceNumber: docRefNum,
      },
      nowEpochMs: nowEpochMs(),
      mutationFn: async () => {
        const mediaMeta = await deps.media.verifyMediaDocumentReference(mediaId);
        if (!mediaMeta) {
          throw new CoreApiError(
            'NOT_FOUND',
            404,
            `Media document reference "${mediaId}" could not be verified in the Media module.`,
          );
        }

        const ts = nowTs();
        const evidenceId = `ddev_${crypto.randomBytes(6).toString('hex')}`;

        const aiEnvelope: UntrustedAiExtractionEnvelope | null = params.untrustedAiExtraction
          ? {
              extractionModelId: sanitizeTextInput(
                params.untrustedAiExtraction.extractionModelId,
              ).slice(0, 80),
              extractedFields: params.untrustedAiExtraction.extractedFields,
              extractionConfidenceScore: params.untrustedAiExtraction.extractionConfidenceScore,
              isProofOfAuthenticity: false,
              requiresHumanVerification: true,
              extractionLimitations: [
                'AI/OCR extracted fields are untrusted input and do not prove document authenticity or legal validity.',
                ...(params.untrustedAiExtraction.extractionLimitations ?? []),
              ],
            }
          : null;

        const record: DueDiligenceEvidenceRecord = {
          evidenceId,
          caseId: cId,
          canonicalPropertyId: caseSnap.canonicalPropertyId,
          category: params.category,
          mediaDocumentRefId: mediaId,
          mediaSha256Checksum: mediaMeta.sha256Checksum,
          sourceType: params.sourceType,
          issuingAuthorityOrSource: issuingSource,
          documentReferenceNumber: docRefNum,
          issueDateIso: params.issueDateIso,
          expirationDateIso: params.expirationDateIso ?? null,
          receivedAt: ts,
          verificationMethod: 'UNVERIFIED_SUBMISSION',
          verificationStatus: 'NOT_SUBMITTED',
          assignedReviewerUid: caseSnap.assignedReviewerUid,
          confidenceClassification:
            params.sourceType === 'AI_OCR_EXTRACTION_UNTRUSTED'
              ? 'UNTRUSTED_EXTRACTION'
              : params.confidenceClassification,
          limitationsAndWarnings: [
            'A document’s registration or upload does not establish its authenticity or legal validity.',
            ...(params.limitationsAndWarnings ?? []),
          ],
          untrustedAiExtraction: aiEnvelope,
          transitionHistory: [],
          nonLegalAuthenticityDisclaimer:
            'EVIDENCE_DISCLAIMER: Registered evidence reference is subject to reviewer verification and does not constitute official legal certification.',
          createdAt: ts,
          updatedAt: ts,
        };

        await runDurableTransaction(
          deps.txRunner,
          { operationName: 'dd.evidence.add', maxAttempts: 4, baseBackoffMs: 5 },
          async (tx) => {
            const cDoc = await tx.get<DueDiligenceCaseRecord>(`dd_cases/${cId}`);
            if (!cDoc.exists || !cDoc.data) {
              throw new CoreApiError('NOT_FOUND', 404, `Case "${cId}" not found.`);
            }
            const updatedCase: DueDiligenceCaseRecord = {
              ...cDoc.data,
              evidenceIds: [...cDoc.data.evidenceIds, evidenceId],
              updatedAt: ts,
            };
            tx.set(`dd_cases/${cId}`, updatedCase as unknown as Record<string, unknown>);
            tx.set(`dd_evidence/${evidenceId}`, record as unknown as Record<string, unknown>);
            await appendToIndex(tx, `dd_case_evidence_index/${cId}`, evidenceId);
            await recordCaseActivity(
              tx,
              cId,
              actor.uid,
              'EVIDENCE_REGISTERED',
              `Registered evidence ${evidenceId} (${params.category}).`,
              ts,
            );
          },
        );

        return { statusCode: 201, body: record };
      },
    });

    return outcome.body;
  }

  /**
   * 5, 6, 7. Transition evidence verification state (Submit, Review, Record Verification Decision)
   */
  async function transitionEvidenceVerificationState(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    caseId: string;
    evidenceId: string;
    targetState: EvidenceVerificationState;
    verificationMethod: VerificationMethodType;
    reason: string;
  }): Promise<DueDiligenceEvidenceRecord> {
    const cId = requireValidId(params.caseId, 'caseId');
    const evId = requireValidId(params.evidenceId, 'evidenceId');
    const cleanReason = sanitizeTextInput(params.reason).slice(0, 400);
    if (cleanReason.length < 3) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Transition reason is required.');
    }

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'dd.evidence.transition', maxAttempts: 4, baseBackoffMs: 5 },
      async (tx) => {
        const cSnap = await tx.get<DueDiligenceCaseRecord>(`dd_cases/${cId}`);
        if (!cSnap.exists || !cSnap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Case "${cId}" not found.`);
        }
        const { actor, isReviewer } = await assertCaseAccess(cSnap.data, params.principal);

        const evSnap = await tx.get<DueDiligenceEvidenceRecord>(`dd_evidence/${evId}`);
        if (!evSnap.exists || !evSnap.data || evSnap.data.caseId !== cId) {
          throw new CoreApiError('NOT_FOUND', 404, `Evidence "${evId}" not found in case.`);
        }

        const ts = nowTs();
        assertValidEvidenceStateTransition({
          currentState: evSnap.data.verificationStatus,
          targetState: params.targetState,
          verificationMethod: params.verificationMethod,
          isAuthorizedReviewer: isReviewer,
          expirationDateIso: evSnap.data.expirationDateIso,
          nowEpochMs: ts.epochMs,
        });

        const updatedEvidence: DueDiligenceEvidenceRecord = {
          ...evSnap.data,
          verificationStatus: params.targetState,
          verificationMethod: params.verificationMethod,
          assignedReviewerUid: isReviewer ? actor.uid : evSnap.data.assignedReviewerUid,
          transitionHistory: [
            ...evSnap.data.transitionHistory,
            {
              transitionId: `tr_${crypto.randomBytes(4).toString('hex')}`,
              fromState: evSnap.data.verificationStatus,
              toState: params.targetState,
              actorUid: actor.uid,
              verificationMethod: params.verificationMethod,
              reason: cleanReason,
              occurredAt: ts,
            },
          ],
          updatedAt: ts,
        };

        tx.set(`dd_evidence/${evId}`, updatedEvidence as unknown as Record<string, unknown>);
        await recordCaseActivity(
          tx,
          cId,
          actor.uid,
          'EVIDENCE_STATE_TRANSITIONED',
          `Evidence ${evId} transitioned from ${evSnap.data.verificationStatus} to ${params.targetState}.`,
          ts,
        );
        return updatedEvidence;
      },
    );
  }

  /**
   * Section 3D: Record ownership and authority evidence review
   */
  async function evaluateOwnershipAndAuthorityEvidence(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    caseId: string;
    claimedOwnerIdentifier: string;
    actingPartyRole: OwnershipAndAuthorityReviewRecord['actingPartyRole'];
    representativeAuthorizationEvidenceId?: string | null;
    jointOwnershipIndicatorsPresent: boolean;
    allCoOwnersDocumented: boolean;
    conflictingOwnershipClaimsDetected: boolean;
    supportingEvidenceIds: string[];
  }): Promise<{
    review: OwnershipAndAuthorityReviewRecord;
    autoCreatedFinding: DueDiligenceFindingRecord | null;
  }> {
    const cId = requireValidId(params.caseId, 'caseId');
    const caseSnap = await retrieveCase({ principal: params.principal, caseId: cId });
    const { actor } = await assertCaseAccess(caseSnap, params.principal);

    let assessmentStatus: OwnershipAndAuthorityReviewRecord['assessmentStatus'] =
      'EVIDENCE_CONSISTENT_WITH_CLAIM';
    let explanation =
      'Submitted ownership and authority documents are internally consistent within the reviewed scope.';

    if (params.conflictingOwnershipClaimsDetected) {
      assessmentStatus = 'CONFLICTING_OWNERSHIP_CLAIMS_DETECTED';
      explanation = 'Conflicting ownership claims or title references detected across evidence sources.';
    } else if (
      params.actingPartyRole === 'AGENT_OR_REPRESENTATIVE' &&
      !params.representativeAuthorizationEvidenceId
    ) {
      assessmentStatus = 'MISSING_AUTHORIZATION_OR_REPRESENTATIVE_EVIDENCE';
      explanation =
        'Acting party is an agent or representative, but no verified power-of-attorney or representative authorization evidence was provided.';
    } else if (params.jointOwnershipIndicatorsPresent && !params.allCoOwnersDocumented) {
      assessmentStatus = 'JOINT_OWNERSHIP_CO_SIGNER_MISSING';
      explanation =
        'Joint ownership indicators are present, but authorization/documentation from all co-owners is incomplete.';
    }

    const ts = nowTs();
    const reviewId = `ddown_${crypto.randomBytes(6).toString('hex')}`;
    const review: OwnershipAndAuthorityReviewRecord = {
      reviewId,
      caseId: cId,
      canonicalPropertyId: caseSnap.canonicalPropertyId,
      claimedOwnerIdentifier: sanitizeTextInput(params.claimedOwnerIdentifier).slice(0, 120),
      actingPartyRole: params.actingPartyRole,
      representativeAuthorizationEvidenceId: params.representativeAuthorizationEvidenceId ?? null,
      jointOwnershipIndicatorsPresent: params.jointOwnershipIndicatorsPresent,
      allCoOwnersDocumented: params.allCoOwnersDocumented,
      supportingEvidenceIds: params.supportingEvidenceIds,
      assessmentStatus,
      explanation,
      nonLegalTitleDeterminationDisclaimer:
        'OWNERSHIP_REVIEW_BOUNDARY: Represents an evidence-based consistency check only and never replaces official property registries, notaries, or legal title determinations.',
      recordedByUid: actor.uid,
      recordedAt: ts,
    };

    let autoCreatedFinding: DueDiligenceFindingRecord | null = null;
    if (assessmentStatus !== 'EVIDENCE_CONSISTENT_WITH_CLAIM') {
      autoCreatedFinding = await createFinding({
        principal: params.principal,
        caseId: cId,
        category:
          assessmentStatus === 'CONFLICTING_OWNERSHIP_CLAIMS_DETECTED'
            ? 'OWNERSHIP_DISCREPANCY'
            : 'IDENTITY_OR_AUTHORITY_DISCREPANCY',
        supportingEvidenceIds: params.supportingEvidenceIds,
        sourceReferences: [reviewId],
        severityClassification:
          assessmentStatus === 'CONFLICTING_OWNERSHIP_CLAIMS_DETECTED' ? 'CRITICAL' : 'HIGH',
        confidenceClassification: 'CORROBORATED_MULTI_SOURCE',
        verificationStatus: 'CORROBORATED_BY_EVIDENCE',
        explanation,
        recommendedNextVerificationStep:
          'Obtain official registry title inquiry and notarized representative authorization from all co-owners.',
      });
    }

    await runDurableTransaction(
      deps.txRunner,
      { operationName: 'dd.ownership.store', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        tx.set(`dd_ownership_reviews/${reviewId}`, review as unknown as Record<string, unknown>);
        await recordCaseActivity(
          tx,
          cId,
          actor.uid,
          'OWNERSHIP_REVIEW_RECORDED',
          `Recorded ownership/authority review (${assessmentStatus}).`,
          ts,
        );
      },
    );

    return { review, autoCreatedFinding };
  }

  /**
   * Section 3E: Run multi-source property information consistency check
   */
  async function runPropertyConsistencyCheck(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    caseId: string;
  }): Promise<PropertyConsistencyCheckReport> {
    const cId = requireValidId(params.caseId, 'caseId');
    const caseSnap = await retrieveCase({ principal: params.principal, caseId: cId });
    const { actor } = await assertCaseAccess(caseSnap, params.principal);

    const snapshots = await deps.propertyRegistry.listMultiSourcePropertySnapshots(
      caseSnap.canonicalPropertyId,
    );
    const ts = nowTs();
    const report = evaluatePropertyInformationConsistency({
      caseId: cId,
      canonicalPropertyId: caseSnap.canonicalPropertyId,
      snapshots,
      nowTs: ts,
    });

    await runDurableTransaction(
      deps.txRunner,
      { operationName: 'dd.consistency.store', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        tx.set(
          `dd_consistency_reports/${report.reportId}`,
          report as unknown as Record<string, unknown>,
        );
        await recordCaseActivity(
          tx,
          cId,
          actor.uid,
          'CONSISTENCY_CHECK_EXECUTED',
          `Executed multi-source property consistency check (${report.discrepancies.length} discrepancies detected).`,
          ts,
        );
      },
    );

    return report;
  }

  /**
   * Section 3F: Record financial and contractual obligation check
   */
  async function recordFinancialObligationCheck(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    caseId: string;
    obligationType: PropertyFinancialObligationCheckRecord['obligationType'];
    statusClassification: PropertyFinancialObligationCheckRecord['statusClassification'];
    documentedAmount?: number | null;
    currency?: 'TOMAN' | 'IRR' | null;
    supportingEvidenceId?: string | null;
    resolutionEvidenceId?: string | null;
    notes?: string;
  }): Promise<PropertyFinancialObligationCheckRecord> {
    const cId = requireValidId(params.caseId, 'caseId');
    const caseSnap = await retrieveCase({ principal: params.principal, caseId: cId });
    const { actor } = await assertCaseAccess(caseSnap, params.principal);

    if (
      params.statusClassification === 'RESOLVED_OBLIGATION_WITH_EVIDENCE' &&
      !params.resolutionEvidenceId
    ) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'RESOLVED_OBLIGATION_WITH_EVIDENCE requires a resolutionEvidenceId.',
      );
    }

    const ts = nowTs();
    const obligationCheckId = `ddob_${crypto.randomBytes(6).toString('hex')}`;
    const record: PropertyFinancialObligationCheckRecord = {
      obligationCheckId,
      caseId: cId,
      canonicalPropertyId: caseSnap.canonicalPropertyId,
      obligationType: params.obligationType,
      statusClassification: params.statusClassification,
      documentedAmount: params.documentedAmount ?? null,
      currency: params.currency ?? null,
      supportingEvidenceId: params.supportingEvidenceId ?? null,
      resolutionEvidenceId: params.resolutionEvidenceId ?? null,
      notes: sanitizeTextInput(params.notes ?? '').slice(0, 400),
      missingDataDoesNotImplyZeroDebtDisclaimer:
        'OBLIGATION_BOUNDARY_INVARIANT: Missing or unavailable debt records are classified as UNKNOWN_FINANCIAL_STATUS and never imply that zero debt exists.',
      recordedAt: ts,
    };

    await runDurableTransaction(
      deps.txRunner,
      { operationName: 'dd.obligation.store', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        tx.set(
          `dd_obligation_checks/${obligationCheckId}`,
          record as unknown as Record<string, unknown>,
        );
        await appendToIndex(tx, `dd_case_obligations_index/${cId}`, obligationCheckId);
        await recordCaseActivity(
          tx,
          cId,
          actor.uid,
          'OBLIGATION_CHECK_RECORDED',
          `Recorded ${params.obligationType} obligation check (${params.statusClassification}).`,
          ts,
        );
      },
    );

    return record;
  }

  /**
   * 8. Create risk or discrepancy finding (Severity and Confidence strictly separated)
   */
  async function createFinding(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    caseId: string;
    category: FindingCategory;
    supportingEvidenceIds: string[];
    sourceReferences: string[];
    severityClassification: FindingSeverityClassification;
    confidenceClassification: ConfidenceClassification;
    verificationStatus?: DueDiligenceFindingRecord['verificationStatus'];
    explanation: string;
    recommendedNextVerificationStep: string;
  }): Promise<DueDiligenceFindingRecord> {
    const cId = requireValidId(params.caseId, 'caseId');
    const caseSnap = await retrieveCase({ principal: params.principal, caseId: cId });
    const { actor, isReviewer } = await assertCaseAccess(caseSnap, params.principal);

    const ts = nowTs();
    const findingId = `ddfind_${crypto.randomBytes(6).toString('hex')}`;

    // A high-severity allegation is not automatically a verified fact (Section 3H)
    const effectiveVerificationStatus: DueDiligenceFindingRecord['verificationStatus'] =
      params.verificationStatus === 'CONFIRMED_BY_REVIEWER' && !isReviewer
        ? 'ALLEGED_UNVERIFIED'
        : params.verificationStatus ?? 'ALLEGED_UNVERIFIED';

    const finding: DueDiligenceFindingRecord = {
      findingId,
      caseId: cId,
      canonicalPropertyId: caseSnap.canonicalPropertyId,
      category: params.category,
      supportingEvidenceIds: params.supportingEvidenceIds,
      sourceReferences: params.sourceReferences,
      severityClassification: params.severityClassification,
      confidenceClassification: params.confidenceClassification,
      verificationStatus: effectiveVerificationStatus,
      explanation: sanitizeTextInput(params.explanation).slice(0, 600),
      recommendedNextVerificationStep: sanitizeTextInput(
        params.recommendedNextVerificationStep,
      ).slice(0, 400),
      responsibleReviewerUid: caseSnap.assignedReviewerUid,
      resolutionStatus: 'OPEN_UNRESOLVED',
      resolutionEvidenceId: null,
      resolutionNotes: null,
      createdAt: ts,
      updatedAt: ts,
    };

    await runDurableTransaction(
      deps.txRunner,
      { operationName: 'dd.finding.create', maxAttempts: 4, baseBackoffMs: 5 },
      async (tx) => {
        const cDoc = await tx.get<DueDiligenceCaseRecord>(`dd_cases/${cId}`);
        if (!cDoc.exists || !cDoc.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Case "${cId}" not found.`);
        }
        const updatedCase: DueDiligenceCaseRecord = {
          ...cDoc.data,
          findingIds: [...cDoc.data.findingIds, findingId],
          unresolvedFindingIds: [...cDoc.data.unresolvedFindingIds, findingId],
          updatedAt: ts,
        };
        tx.set(`dd_cases/${cId}`, updatedCase as unknown as Record<string, unknown>);
        tx.set(`dd_findings/${findingId}`, finding as unknown as Record<string, unknown>);
        await appendToIndex(tx, `dd_case_findings_index/${cId}`, findingId);
        await recordCaseActivity(
          tx,
          cId,
          actor.uid,
          'FINDING_CREATED',
          `Created finding ${findingId} (${params.category}, severity=${params.severityClassification}, confidence=${params.confidenceClassification}).`,
          ts,
        );
      },
    );

    return finding;
  }

  /**
   * 9. Resolve finding with supporting evidence
   */
  async function resolveFinding(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    caseId: string;
    findingId: string;
    resolutionStatus: 'RESOLVED_WITH_EVIDENCE' | 'ACCEPTED_LIMITATION';
    resolutionEvidenceId: string;
    resolutionNotes: string;
  }): Promise<DueDiligenceFindingRecord> {
    const cId = requireValidId(params.caseId, 'caseId');
    const fId = requireValidId(params.findingId, 'findingId');
    const evId = requireValidId(params.resolutionEvidenceId, 'resolutionEvidenceId');

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'dd.finding.resolve', maxAttempts: 4, baseBackoffMs: 5 },
      async (tx) => {
        const cSnap = await tx.get<DueDiligenceCaseRecord>(`dd_cases/${cId}`);
        if (!cSnap.exists || !cSnap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Case "${cId}" not found.`);
        }
        const { actor } = await assertCaseAccess(cSnap.data, params.principal, true);

        const fSnap = await tx.get<DueDiligenceFindingRecord>(`dd_findings/${fId}`);
        if (!fSnap.exists || !fSnap.data || fSnap.data.caseId !== cId) {
          throw new CoreApiError('NOT_FOUND', 404, `Finding "${fId}" not found in case.`);
        }

        const ts = nowTs();
        const updatedFinding: DueDiligenceFindingRecord = {
          ...fSnap.data,
          resolutionStatus: params.resolutionStatus,
          resolutionEvidenceId: evId,
          resolutionNotes: sanitizeTextInput(params.resolutionNotes).slice(0, 500),
          updatedAt: ts,
        };

        const updatedCase: DueDiligenceCaseRecord = {
          ...cSnap.data,
          unresolvedFindingIds: cSnap.data.unresolvedFindingIds.filter((id) => id !== fId),
          updatedAt: ts,
        };

        tx.set(`dd_findings/${fId}`, updatedFinding as unknown as Record<string, unknown>);
        tx.set(`dd_cases/${cId}`, updatedCase as unknown as Record<string, unknown>);
        await recordCaseActivity(
          tx,
          cId,
          actor.uid,
          'FINDING_RESOLVED',
          `Resolved finding ${fId} with status ${params.resolutionStatus}.`,
          ts,
        );
        return updatedFinding;
      },
    );
  }

  /**
   * 10. Generate versioned due diligence completion assessment
   */
  async function generateCompletionAssessment(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    idempotencyKey: string;
    caseId: string;
  }): Promise<DueDiligenceCompletionAssessmentRecord> {
    const cId = requireValidId(params.caseId, 'caseId');
    const caseSnap = await retrieveCase({ principal: params.principal, caseId: cId });
    const { actor } = await assertCaseAccess(caseSnap, params.principal);

    const outcome = await executeIdempotentMutation<DueDiligenceCompletionAssessmentRecord>({
      store: idempotencyStore,
      idempotencyKey: params.idempotencyKey,
      operation: 'property-due-diligence:assessment.generate',
      actorUid: actor.uid,
      requestPayload: {
        caseId: cId,
        caseVersion: caseSnap.versionNumber,
        evidenceCount: caseSnap.evidenceIds.length,
        unresolvedCount: caseSnap.unresolvedFindingIds.length,
      },
      nowEpochMs: nowEpochMs(),
      mutationFn: async () => {
        return runDurableTransaction(
          deps.txRunner,
          { operationName: 'dd.assessment.generate', maxAttempts: 4, baseBackoffMs: 5 },
          async (tx) => {
            const cDoc = await tx.get<DueDiligenceCaseRecord>(`dd_cases/${cId}`);
            if (!cDoc.exists || !cDoc.data) {
              throw new CoreApiError('NOT_FOUND', 404, `Case "${cId}" not found.`);
            }

            const [evidenceList, findingsList, obligationChecks, existingAssessments] =
              await Promise.all([
                loadIndexedDocs<DueDiligenceEvidenceRecord>(
                  tx,
                  `dd_case_evidence_index/${cId}`,
                  'dd_evidence',
                ),
                loadIndexedDocs<DueDiligenceFindingRecord>(
                  tx,
                  `dd_case_findings_index/${cId}`,
                  'dd_findings',
                ),
                loadIndexedDocs<PropertyFinancialObligationCheckRecord>(
                  tx,
                  `dd_case_obligations_index/${cId}`,
                  'dd_obligation_checks',
                ),
                loadIndexedDocs<DueDiligenceCompletionAssessmentRecord>(
                  tx,
                  `dd_case_assessments_index/${cId}`,
                  'dd_assessments',
                ),
              ]);

            const ts = nowTs();
            const assessmentVersion = existingAssessments.length + 1;
            const assessment = evaluateDueDiligenceCompletionAssessment({
              caseId: cId,
              versionNumber: assessmentVersion,
              canonicalPropertyId: cDoc.data.canonicalPropertyId,
              purpose: cDoc.data.purpose,
              requestedScope: cDoc.data.requestedVerificationScope,
              evidenceList,
              findingsList,
              obligationChecks,
              generatedByUid: actor.uid,
              nowTs: ts,
            });

            const nextCaseVersion = cDoc.data.versionNumber + 1;
            const nextWorkflowState: DueDiligenceCaseRecord['workflowState'] =
              assessment.overallState === 'COMPLETED_WITH_FINDINGS' ||
              assessment.overallState === 'COMPLETED_WITHOUT_IDENTIFIED_FINDINGS'
                ? 'ASSESSMENT_ISSUED'
                : 'UNDER_REVIEW';

            const updatedCase: DueDiligenceCaseRecord = {
              ...cDoc.data,
              workflowState: nextWorkflowState,
              latestAssessmentId: assessment.assessmentId,
              finalAssessmentStatus: assessment.overallState,
              versionNumber: nextCaseVersion,
              versionHistory: [
                ...cDoc.data.versionHistory,
                {
                  versionNumber: nextCaseVersion,
                  workflowState: nextWorkflowState,
                  finalAssessmentStatus: assessment.overallState,
                  changedByUid: actor.uid,
                  reason: `Generated completion assessment v${assessmentVersion} (${assessment.overallState}).`,
                  changedAt: ts,
                },
              ],
              updatedAt: ts,
            };

            tx.set(`dd_cases/${cId}`, updatedCase as unknown as Record<string, unknown>);
            tx.set(
              `dd_assessments/${assessment.assessmentId}`,
              assessment as unknown as Record<string, unknown>,
            );
            await appendToIndex(tx, `dd_case_assessments_index/${cId}`, assessment.assessmentId);
            await recordCaseActivity(
              tx,
              cId,
              actor.uid,
              'ASSESSMENT_GENERATED',
              `Generated completion assessment v${assessmentVersion}: ${assessment.overallState}.`,
              ts,
            );

            return { statusCode: 201, body: assessment };
          },
        );
      },
    });

    return outcome.body;
  }

  /**
   * 11. Retrieve assessment history (Cursor Paginated)
   */
  async function retrieveAssessmentHistory(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    caseId: string;
    limit?: number;
    cursor?: string;
    direction?: 'asc' | 'desc';
  }) {
    const caseSnap = await retrieveCase({ principal: params.principal, caseId: params.caseId });
    const pagination = normalizePaginationParams({
      limit: params.limit,
      cursor: params.cursor,
      direction: params.direction ?? 'desc',
    });

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'dd.assessments.history', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const docs = await loadIndexedDocs<DueDiligenceCompletionAssessmentRecord>(
          tx,
          `dd_case_assessments_index/${caseSnap.caseId}`,
          'dd_assessments',
        );
        const mapped = docs.map((d) => ({
          ...d,
          id: d.assessmentId,
          sortEpochMs: d.generatedAt.epochMs + d.versionNumber,
        }));
        const page = paginateItems(mapped, pagination);
        return {
          items: page.items.map(({ id: _id, sortEpochMs: _s, ...rest }) => rest),
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
          totalCount: page.totalCount,
        };
      },
    );
  }

  /**
   * 12. Retrieve case activity history (Cursor Paginated)
   */
  async function retrieveCaseActivityHistory(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    caseId: string;
    limit?: number;
    cursor?: string;
    direction?: 'asc' | 'desc';
  }) {
    const caseSnap = await retrieveCase({ principal: params.principal, caseId: params.caseId });
    const pagination = normalizePaginationParams({
      limit: params.limit,
      cursor: params.cursor,
      direction: params.direction ?? 'desc',
    });

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'dd.activities.history', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const docs = await loadIndexedDocs<DueDiligenceCaseActivityRecord>(
          tx,
          `dd_case_activities_index/${caseSnap.caseId}`,
          'dd_case_activities',
        );
        const mapped = docs.map((d, idx) => ({
          ...d,
          id: d.activityId,
          sortEpochMs: d.occurredAt.epochMs + idx,
        }));
        const page = paginateItems(mapped, pagination);
        return {
          items: page.items.map(({ id: _id, sortEpochMs: _s, ...rest }) => rest),
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
          totalCount: page.totalCount,
        };
      },
    );
  }

  /**
   * 13. Cancel or close a due diligence case when permitted
   */
  async function cancelOrCloseCase(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    caseId: string;
    targetTerminalState: 'CLOSED' | 'CANCELLED';
    reason: string;
  }): Promise<DueDiligenceCaseRecord> {
    const cId = requireValidId(params.caseId, 'caseId');
    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'dd.case.close_or_cancel', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<DueDiligenceCaseRecord>(`dd_cases/${cId}`);
        if (!snap.exists || !snap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Case "${cId}" not found.`);
        }
        const { actor } = await assertCaseAccess(snap.data, params.principal);

        if (params.targetTerminalState === 'CLOSED' && !snap.data.latestAssessmentId) {
          throw new CoreApiError(
            'VALIDATION_FAILED',
            400,
            'A due diligence case cannot transition to CLOSED before generating a completion assessment; use CANCELLED instead.',
          );
        }

        const ts = nowTs();
        const nextVersion = snap.data.versionNumber + 1;
        const updated: DueDiligenceCaseRecord = {
          ...snap.data,
          workflowState: params.targetTerminalState,
          versionNumber: nextVersion,
          versionHistory: [
            ...snap.data.versionHistory,
            {
              versionNumber: nextVersion,
              workflowState: params.targetTerminalState,
              finalAssessmentStatus: snap.data.finalAssessmentStatus,
              changedByUid: actor.uid,
              reason: sanitizeTextInput(params.reason).slice(0, 300),
              changedAt: ts,
            },
          ],
          updatedAt: ts,
        };

        tx.set(`dd_cases/${cId}`, updated as unknown as Record<string, unknown>);
        await recordCaseActivity(
          tx,
          cId,
          actor.uid,
          'CASE_CLOSED_OR_CANCELLED',
          `Case transitioned to ${params.targetTerminalState}: ${params.reason}`,
          ts,
        );
        return updated;
      },
    );
  }

  return {
    createDueDiligenceCase,
    retrieveCase,
    updateCaseMetadata,
    addEvidenceReference,
    transitionEvidenceVerificationState,
    evaluateOwnershipAndAuthorityEvidence,
    runPropertyConsistencyCheck,
    recordFinancialObligationCheck,
    createFinding,
    resolveFinding,
    generateCompletionAssessment,
    retrieveAssessmentHistory,
    retrieveCaseActivityHistory,
    cancelOrCloseCase,
  };
}
