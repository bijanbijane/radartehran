import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CoreApiError,
  type AuthenticatedPrincipal,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../../core';
import {
  createPropertyDueDiligenceService,
  PROPERTY_DUE_DILIGENCE_ROUTE_REGISTRATION_SPEC,
  type MediaDocumentReferenceMetadata,
  type SourcePropertyAttributesSnapshot,
} from '../index';

function makePrincipal(
  uid: string,
  email = `${uid}@radartehran.ir`,
  role: AuthenticatedPrincipal['role'] = 'verified_user',
): AuthenticatedPrincipal {
  return {
    uid,
    email,
    emailVerified: true,
    role,
    authMode: 'firebase_id_token',
    claims: { uid, email, email_verified: true },
  };
}

function createInMemoryDurableTransactionRunner(options?: {
  failAllWrites?: boolean;
  abortFirstAttempts?: number;
}) {
  const store = new Map<string, Record<string, unknown>>();
  let remainingAborts = options?.abortFirstAttempts ?? 0;

  const txRunner: TransactionRunnerAdapter = {
    async runTransaction<T>(workFn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      if (options?.failAllWrites) {
        throw new Error('Firestore durable storage unreachable');
      }
      if (remainingAborts > 0) {
        remainingAborts--;
        const abortErr = new Error('10 ABORTED: cross-transaction contention') as Error & {
          code: string;
        };
        abortErr.code = 'ABORTED';
        throw abortErr;
      }

      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<Doc = Record<string, unknown>>(docPath: string) {
          if (staged.has(docPath)) {
            const val = staged.get(docPath);
            return val
              ? { exists: true, id: docPath.split('/').pop()!, data: structuredClone(val) as Doc }
              : { exists: false, id: docPath.split('/').pop()! };
          }
          const raw = store.get(docPath);
          return raw
            ? { exists: true, id: docPath.split('/').pop()!, data: structuredClone(raw) as Doc }
            : { exists: false, id: docPath.split('/').pop()! };
        },
        set(docPath: string, data: Record<string, unknown>, setOpts?: { merge?: boolean }) {
          if (setOpts?.merge && store.has(docPath)) {
            staged.set(docPath, { ...store.get(docPath)!, ...structuredClone(data) });
          } else {
            staged.set(docPath, structuredClone(data));
          }
        },
        update(docPath: string, partial: Record<string, unknown>) {
          const base = staged.get(docPath) ?? store.get(docPath) ?? {};
          staged.set(docPath, { ...structuredClone(base), ...structuredClone(partial) });
        },
        delete(docPath: string) {
          staged.set(docPath, null);
        },
      };

      const result = await workFn(tx);
      for (const [k, v] of staged.entries()) {
        if (v === null) store.delete(k);
        else store.set(k, v);
      }
      return result;
    },
  };

  return { store, txRunner };
}

function createTestHarness(txOpts?: { failAllWrites?: boolean; abortFirstAttempts?: number }) {
  const { store, txRunner } = createInMemoryDurableTransactionRunner(txOpts);
  const currentEpochMs = Date.parse('2026-04-01T10:00:00.000Z');

  const multiSourceSnapshots = new Map<string, SourcePropertyAttributesSnapshot[]>([
    [
      'prop_tehran_101',
      [
        {
          sourceId: 'src_registry_1',
          sourceType: 'PROPERTY_REGISTRY_RECORD',
          sourceName: 'Canonical Property Registry',
          observedAtIso: '2026-03-01T00:00:00.000Z',
          canonicalPropertyId: 'prop_tehran_101',
          addressText: 'تهران، سعادت‌آباد، خیابان ۲۴، پلاک ۱۰',
          cityId: 'tehran',
          districtId: 'd2',
          propertyType: 'APARTMENT',
          landAreaSqm: 500,
          buildingAreaSqm: 118, // Disagrees with municipal record (112 sqm)
          floorNumber: 3,
          unitNumber: '6',
          constructionYear: 2019,
          buildingUsage: 'RESIDENTIAL',
          claimedOwnerRef: 'owner_ref_alpha',
          registrationPlateRef: '1234/5678',
          occupancyStatus: 'OWNER_OCCUPIED',
        },
        {
          sourceId: 'src_municipal_2',
          sourceType: 'MUNICIPAL_RECORD',
          sourceName: 'Municipal Permit Archive',
          observedAtIso: '2026-02-15T00:00:00.000Z',
          canonicalPropertyId: 'prop_tehran_101',
          addressText: 'تهران، سعادت‌آباد، خیابان ۲۴، پلاک ۱۰',
          cityId: 'tehran',
          districtId: 'd2',
          propertyType: 'APARTMENT',
          landAreaSqm: 500,
          buildingAreaSqm: 112, // Conflicting area!
          floorNumber: 3,
          unitNumber: '6',
          constructionYear: 2019,
          buildingUsage: 'RESIDENTIAL',
          claimedOwnerRef: 'owner_ref_alpha',
          registrationPlateRef: null, // Missing in municipal source
          occupancyStatus: 'TENANT_OCCUPIED', // Conflicting occupancy!
        },
      ],
    ],
  ]);

  const mediaFiles = new Map<string, MediaDocumentReferenceMetadata>([
    [
      'media_deed_1',
      {
        mediaId: 'media_deed_1',
        uploaderUid: 'buyer_1',
        mimeType: 'application/pdf',
        byteSize: 420_000,
        sha256Checksum: 'a'.repeat(64),
        uploadedAtIso: '2026-03-20T00:00:00.000Z',
        accessScope: 'PRIVATE_CASE_EVIDENCE',
      },
    ],
    [
      'media_permit_expired_2',
      {
        mediaId: 'media_permit_expired_2',
        uploaderUid: 'buyer_1',
        mimeType: 'application/pdf',
        byteSize: 310_000,
        sha256Checksum: 'b'.repeat(64),
        uploadedAtIso: '2026-03-21T00:00:00.000Z',
        accessScope: 'PRIVATE_CASE_EVIDENCE',
      },
    ],
    [
      'media_tax_clearance_3',
      {
        mediaId: 'media_tax_clearance_3',
        uploaderUid: 'buyer_1',
        mimeType: 'application/pdf',
        byteSize: 215_000,
        sha256Checksum: 'c'.repeat(64),
        uploadedAtIso: '2026-03-22T00:00:00.000Z',
        accessScope: 'PRIVATE_CASE_EVIDENCE',
      },
    ],
  ]);

  const service = createPropertyDueDiligenceService({
    txRunner,
    primaryAdminEmails: ['admin@radartehran.ir'],
    authorizedReviewerUids: ['reviewer_1'],
    nowFn: () => currentEpochMs,
    propertyRegistry: {
      async getCanonicalPropertyExists(id) {
        return multiSourceSnapshots.has(id);
      },
      async listMultiSourcePropertySnapshots(id) {
        return multiSourceSnapshots.get(id) ?? [];
      },
    },
    media: {
      async verifyMediaDocumentReference(mediaId) {
        return mediaFiles.get(mediaId) ?? null;
      },
    },
  });

  const requesterPrincipal = makePrincipal('buyer_1', 'buyer1@example.com');
  const reviewerPrincipal = makePrincipal('reviewer_1', 'reviewer1@radartehran.ir');
  const outsiderPrincipal = makePrincipal('outsider_1', 'outsider@example.com');

  return {
    service,
    store,
    requesterPrincipal,
    reviewerPrincipal,
    outsiderPrincipal,
  };
}

test('1. Creates due diligence case, enforces case-level access control & privacy, rejects arbitrary client verification status, and isolates untrusted AI OCR extraction from verification', async () => {
  const h = createTestHarness();

  const ddCase = await h.service.createDueDiligenceCase({
    principal: h.requesterPrincipal,
    idempotencyKey: 'idem_case_1',
    canonicalPropertyId: 'prop_tehran_101',
    purpose: 'PURCHASE',
    requestedVerificationScope: ['TITLE_DEED_REFERENCE', 'BUILDING_PERMIT'],
    assignedReviewerUid: 'reviewer_1',
  });

  assert.equal(ddCase.workflowState, 'EVIDENCE_COLLECTION');
  assert.equal(ddCase.finalAssessmentStatus, 'NOT_STARTED');

  // Outsider cannot retrieve private case
  await assert.rejects(
    async () =>
      h.service.retrieveCase({
        principal: h.outsiderPrincipal,
        caseId: ddCase.caseId,
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN',
  );

  // Client attempting to supply arbitrary verification status on evidence registration is rejected
  await assert.rejects(
    async () =>
      h.service.addEvidenceReference({
        principal: h.requesterPrincipal,
        idempotencyKey: 'idem_ev_spoof',
        caseId: ddCase.caseId,
        category: 'TITLE_DEED_REFERENCE',
        mediaDocumentRefId: 'media_deed_1',
        sourceType: 'USER_UPLOADED_DOCUMENT',
        issuingAuthorityOrSource: 'State Deeds Registry',
        documentReferenceNumber: 'DEED-998877',
        issueDateIso: '2024-05-01T00:00:00.000Z',
        confidenceClassification: 'SINGLE_SOURCE_UNVERIFIED',
        clientSuppliedVerificationStatus: 'VERIFIED',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED',
  );

  // Register evidence with AI OCR extraction -> starts as NOT_SUBMITTED, AI extraction marked untrusted
  const evDeed = await h.service.addEvidenceReference({
    principal: h.requesterPrincipal,
    idempotencyKey: 'idem_ev_deed_1',
    caseId: ddCase.caseId,
    category: 'TITLE_DEED_REFERENCE',
    mediaDocumentRefId: 'media_deed_1',
    sourceType: 'AI_OCR_EXTRACTION_UNTRUSTED',
    issuingAuthorityOrSource: 'State Deeds Registry',
    documentReferenceNumber: 'DEED-998877',
    issueDateIso: '2024-05-01T00:00:00.000Z',
    confidenceClassification: 'SINGLE_SOURCE_UNVERIFIED',
    untrustedAiExtraction: {
      extractionModelId: 'doc-ocr-v1',
      extractedFields: { parcelNumber: '1234/5678', areaSqm: 118 },
      extractionConfidenceScore: 0.91,
    },
  });

  assert.equal(evDeed.verificationStatus, 'NOT_SUBMITTED');
  assert.equal(evDeed.confidenceClassification, 'UNTRUSTED_EXTRACTION');
  assert.equal(evDeed.untrustedAiExtraction?.isProofOfAuthenticity, false);
  assert.equal(evDeed.untrustedAiExtraction?.requiresHumanVerification, true);
});

test('2. Enforces verification state machine transitions, blocks non-reviewers from verifying, blocks automated checks from marking VERIFIED, and rejects expired evidence', async () => {
  const h = createTestHarness();

  const ddCase = await h.service.createDueDiligenceCase({
    principal: h.requesterPrincipal,
    idempotencyKey: 'idem_case_sm',
    canonicalPropertyId: 'prop_tehran_101',
    purpose: 'PURCHASE',
    requestedVerificationScope: ['TITLE_DEED_REFERENCE', 'BUILDING_PERMIT'],
    assignedReviewerUid: 'reviewer_1',
  });

  const evDeed = await h.service.addEvidenceReference({
    principal: h.requesterPrincipal,
    idempotencyKey: 'idem_sm_deed',
    caseId: ddCase.caseId,
    category: 'TITLE_DEED_REFERENCE',
    mediaDocumentRefId: 'media_deed_1',
    sourceType: 'USER_UPLOADED_DOCUMENT',
    issuingAuthorityOrSource: 'State Deeds Registry',
    documentReferenceNumber: 'DEED-101',
    issueDateIso: '2025-01-01T00:00:00.000Z',
    expirationDateIso: '2027-01-01T00:00:00.000Z',
    confidenceClassification: 'SINGLE_SOURCE_UNVERIFIED',
  });

  // Invalid state jump NOT_SUBMITTED -> VERIFIED is rejected
  await assert.rejects(
    async () =>
      h.service.transitionEvidenceVerificationState({
        principal: h.reviewerPrincipal,
        caseId: ddCase.caseId,
        evidenceId: evDeed.evidenceId,
        targetState: 'VERIFIED',
        verificationMethod: 'AUTHORIZED_HUMAN_REVIEW',
        reason: 'Jumping directly to verified',
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('INVALID_EVIDENCE_STATE_TRANSITION'),
  );

  // Valid transition: NOT_SUBMITTED -> SUBMITTED -> PENDING_REVIEW
  await h.service.transitionEvidenceVerificationState({
    principal: h.requesterPrincipal,
    caseId: ddCase.caseId,
    evidenceId: evDeed.evidenceId,
    targetState: 'SUBMITTED',
    verificationMethod: 'UNVERIFIED_SUBMISSION',
    reason: 'Submitted by buyer for review',
  });

  await h.service.transitionEvidenceVerificationState({
    principal: h.reviewerPrincipal,
    caseId: ddCase.caseId,
    evidenceId: evDeed.evidenceId,
    targetState: 'PENDING_REVIEW',
    verificationMethod: 'AUTHORIZED_HUMAN_REVIEW',
    reason: 'Assigned to reviewer queue',
  });

  // Non-reviewer requester cannot mark evidence as VERIFIED
  await assert.rejects(
    async () =>
      h.service.transitionEvidenceVerificationState({
        principal: h.requesterPrincipal,
        caseId: ddCase.caseId,
        evidenceId: evDeed.evidenceId,
        targetState: 'VERIFIED',
        verificationMethod: 'AUTHORIZED_HUMAN_REVIEW',
        reason: 'Requester self-verifying',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN',
  );

  // Automated metadata check alone cannot mark evidence as VERIFIED
  await assert.rejects(
    async () =>
      h.service.transitionEvidenceVerificationState({
        principal: h.reviewerPrincipal,
        caseId: ddCase.caseId,
        evidenceId: evDeed.evidenceId,
        targetState: 'VERIFIED',
        verificationMethod: 'AUTOMATED_METADATA_CHECK_ONLY',
        reason: 'Automated check only',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED',
  );

  // Authorized reviewer with AUTHORIZED_HUMAN_REVIEW succeeds
  const verifiedDeed = await h.service.transitionEvidenceVerificationState({
    principal: h.reviewerPrincipal,
    caseId: ddCase.caseId,
    evidenceId: evDeed.evidenceId,
    targetState: 'VERIFIED',
    verificationMethod: 'AUTHORIZED_HUMAN_REVIEW',
    reason: 'Cross-checked against notarized deed copy',
  });
  assert.equal(verifiedDeed.verificationStatus, 'VERIFIED');
  assert.equal(verifiedDeed.transitionHistory.length, 3);

  // Expired document cannot be transitioned to VERIFIED
  const evExpired = await h.service.addEvidenceReference({
    principal: h.requesterPrincipal,
    idempotencyKey: 'idem_sm_expired',
    caseId: ddCase.caseId,
    category: 'BUILDING_PERMIT',
    mediaDocumentRefId: 'media_permit_expired_2',
    sourceType: 'MUNICIPAL_RECORD',
    issuingAuthorityOrSource: 'Tehran Municipality',
    documentReferenceNumber: 'PERMIT-2022',
    issueDateIso: '2022-01-01T00:00:00.000Z',
    expirationDateIso: '2025-01-01T00:00:00.000Z', // Expired prior to 2026-04-01!
    confidenceClassification: 'SINGLE_SOURCE_UNVERIFIED',
  });

  await h.service.transitionEvidenceVerificationState({
    principal: h.requesterPrincipal,
    caseId: ddCase.caseId,
    evidenceId: evExpired.evidenceId,
    targetState: 'SUBMITTED',
    verificationMethod: 'UNVERIFIED_SUBMISSION',
    reason: 'Submitting permit',
  });
  await h.service.transitionEvidenceVerificationState({
    principal: h.reviewerPrincipal,
    caseId: ddCase.caseId,
    evidenceId: evExpired.evidenceId,
    targetState: 'PENDING_REVIEW',
    verificationMethod: 'AUTHORIZED_HUMAN_REVIEW',
    reason: 'Reviewing permit',
  });

  await assert.rejects(
    async () =>
      h.service.transitionEvidenceVerificationState({
        principal: h.reviewerPrincipal,
        caseId: ddCase.caseId,
        evidenceId: evExpired.evidenceId,
        targetState: 'VERIFIED',
        verificationMethod: 'AUTHORIZED_HUMAN_REVIEW',
        reason: 'Attempting to verify expired permit',
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('EXPIRED_EVIDENCE_CANNOT_BE_VERIFIED'),
  );
});

test('3. Detects ownership/authority discrepancies, preserves multi-source conflicting property attributes without overwriting, and classifies financial obligations', async () => {
  const h = createTestHarness();

  const ddCase = await h.service.createDueDiligenceCase({
    principal: h.requesterPrincipal,
    idempotencyKey: 'idem_case_disc',
    canonicalPropertyId: 'prop_tehran_101',
    purpose: 'PURCHASE',
    requestedVerificationScope: ['TITLE_DEED_REFERENCE'],
    assignedReviewerUid: 'reviewer_1',
  });

  // Agent acting without representative authorization evidence triggers discrepancy finding
  const ownReview = await h.service.evaluateOwnershipAndAuthorityEvidence({
    principal: h.reviewerPrincipal,
    caseId: ddCase.caseId,
    claimedOwnerIdentifier: 'owner_ref_alpha',
    actingPartyRole: 'AGENT_OR_REPRESENTATIVE',
    representativeAuthorizationEvidenceId: null, // Missing POA!
    jointOwnershipIndicatorsPresent: true,
    allCoOwnersDocumented: false,
    conflictingOwnershipClaimsDetected: false,
    supportingEvidenceIds: [],
  });

  assert.equal(
    ownReview.review.assessmentStatus,
    'MISSING_AUTHORIZATION_OR_REPRESENTATIVE_EVIDENCE',
  );
  assert.ok(ownReview.autoCreatedFinding);
  assert.equal(
    ownReview.autoCreatedFinding?.category,
    'IDENTITY_OR_AUTHORITY_DISCREPANCY',
  );
  assert.equal(ownReview.autoCreatedFinding?.severityClassification, 'HIGH');

  // Multi-source property consistency check
  const consReport = await h.service.runPropertyConsistencyCheck({
    principal: h.reviewerPrincipal,
    caseId: ddCase.caseId,
  });

  // Must preserve both original source snapshots untouched
  assert.equal(consReport.preservedSnapshots.length, 2);
  assert.equal(consReport.preservedSnapshots[0]!.buildingAreaSqm, 118);
  assert.equal(consReport.preservedSnapshots[1]!.buildingAreaSqm, 112);

  const areaConflict = consReport.discrepancies.find(
    (d) => d.fieldName === 'buildingAreaSqm',
  );
  assert.ok(areaConflict);
  assert.equal(areaConflict?.discrepancyType, 'CONFLICTING_VALUES');

  const plateMissing = consReport.discrepancies.find(
    (d) => d.fieldName === 'registrationPlateRef',
  );
  assert.ok(plateMissing);
  assert.equal(plateMissing?.discrepancyType, 'MISSING_IN_SOME_SOURCES');

  // Financial obligation check: missing debt info recorded as UNKNOWN_FINANCIAL_STATUS (never implies zero debt)
  const obUnknown = await h.service.recordFinancialObligationCheck({
    principal: h.reviewerPrincipal,
    caseId: ddCase.caseId,
    obligationType: 'MUNICIPAL_CHARGE',
    statusClassification: 'UNKNOWN_FINANCIAL_STATUS',
    notes: 'Municipal clearance certificate not yet submitted.',
  });
  assert.equal(obUnknown.statusClassification, 'UNKNOWN_FINANCIAL_STATUS');
  assert.equal(obUnknown.documentedAmount, null);
});

test('4. Separates finding severity from confidence, generates versioned completion assessments (BLOCKED vs COMPLETED_WITHOUT_IDENTIFIED_FINDINGS), and supports pagination & retry safety', async () => {
  const h = createTestHarness({ abortFirstAttempts: 1 });

  const ddCase = await h.service.createDueDiligenceCase({
    principal: h.requesterPrincipal,
    idempotencyKey: 'idem_case_assess',
    canonicalPropertyId: 'prop_tehran_101',
    purpose: 'PURCHASE',
    requestedVerificationScope: ['TITLE_DEED_REFERENCE'],
    assignedReviewerUid: 'reviewer_1',
  });

  // Register and verify the required TITLE_DEED_REFERENCE
  const evDeed = await h.service.addEvidenceReference({
    principal: h.requesterPrincipal,
    idempotencyKey: 'idem_assess_deed',
    caseId: ddCase.caseId,
    category: 'TITLE_DEED_REFERENCE',
    mediaDocumentRefId: 'media_deed_1',
    sourceType: 'OFFICIAL_REGISTRY_RESPONSE',
    issuingAuthorityOrSource: 'State Deeds Registry',
    documentReferenceNumber: 'DEED-555',
    issueDateIso: '2025-06-01T00:00:00.000Z',
    confidenceClassification: 'AUTHORITATIVE_OFFICIAL',
  });

  await h.service.transitionEvidenceVerificationState({
    principal: h.requesterPrincipal,
    caseId: ddCase.caseId,
    evidenceId: evDeed.evidenceId,
    targetState: 'SUBMITTED',
    verificationMethod: 'UNVERIFIED_SUBMISSION',
    reason: 'Submitted deed',
  });
  await h.service.transitionEvidenceVerificationState({
    principal: h.reviewerPrincipal,
    caseId: ddCase.caseId,
    evidenceId: evDeed.evidenceId,
    targetState: 'PENDING_REVIEW',
    verificationMethod: 'AUTHORIZED_HUMAN_REVIEW',
    reason: 'Under review',
  });
  await h.service.transitionEvidenceVerificationState({
    principal: h.reviewerPrincipal,
    caseId: ddCase.caseId,
    evidenceId: evDeed.evidenceId,
    targetState: 'VERIFIED',
    verificationMethod: 'OFFICIAL_SOURCE_CONFIRMATION',
    reason: 'Confirmed with registry response',
  });

  // Create a HIGH severity finding with SINGLE_SOURCE_UNVERIFIED confidence (separating severity and confidence!)
  const finding = await h.service.createFinding({
    principal: h.requesterPrincipal,
    caseId: ddCase.caseId,
    category: 'FINANCIAL_OBLIGATION',
    supportingEvidenceIds: [],
    sourceReferences: ['tenant_claim_1'],
    severityClassification: 'HIGH',
    confidenceClassification: 'SINGLE_SOURCE_UNVERIFIED',
    explanation: 'Unverified allegation of unpaid municipal renovation levy.',
    recommendedNextVerificationStep: 'Request municipal tax clearance certificate.',
  });

  assert.equal(finding.severityClassification, 'HIGH');
  assert.equal(finding.confidenceClassification, 'SINGLE_SOURCE_UNVERIFIED');
  assert.equal(finding.verificationStatus, 'ALLEGED_UNVERIFIED');

  // Assessment v1 with unresolved HIGH finding -> BLOCKED
  const assessV1 = await h.service.generateCompletionAssessment({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_assess_v1',
    caseId: ddCase.caseId,
  });
  assert.equal(assessV1.versionNumber, 1);
  assert.equal(assessV1.overallState, 'BLOCKED');
  assert.equal(assessV1.highOrCriticalUnresolvedFindingsCount, 1);

  // Resolve the finding with clearance evidence
  const evClearance = await h.service.addEvidenceReference({
    principal: h.requesterPrincipal,
    idempotencyKey: 'idem_ev_clearance',
    caseId: ddCase.caseId,
    category: 'PROPERTY_TAX_EVIDENCE',
    mediaDocumentRefId: 'media_tax_clearance_3',
    sourceType: 'MUNICIPAL_RECORD',
    issuingAuthorityOrSource: 'Tehran Municipality',
    documentReferenceNumber: 'CLR-2026',
    issueDateIso: '2026-03-20T00:00:00.000Z',
    confidenceClassification: 'AUTHORITATIVE_OFFICIAL',
  });

  await h.service.resolveFinding({
    principal: h.reviewerPrincipal,
    caseId: ddCase.caseId,
    findingId: finding.findingId,
    resolutionStatus: 'RESOLVED_WITH_EVIDENCE',
    resolutionEvidenceId: evClearance.evidenceId,
    resolutionNotes: 'Official municipal clearance confirmed zero outstanding levy.',
  });

  // Assessment v2 after resolving finding -> COMPLETED_WITHOUT_IDENTIFIED_FINDINGS
  const assessV2 = await h.service.generateCompletionAssessment({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_assess_v2',
    caseId: ddCase.caseId,
  });
  assert.equal(assessV2.versionNumber, 2);
  assert.equal(assessV2.overallState, 'COMPLETED_WITHOUT_IDENTIFIED_FINDINGS');
  assert.ok(
    assessV2.nonGuaranteeAndNonLegalCertificationDisclaimer.includes(
      'never implies that a property is legally safe',
    ),
  );

  // Paginate assessment history and activity history
  const histPage1 = await h.service.retrieveAssessmentHistory({
    principal: h.requesterPrincipal,
    caseId: ddCase.caseId,
    limit: 1,
  });
  assert.equal(histPage1.items.length, 1);
  assert.equal(histPage1.hasMore, true);
  assert.ok(histPage1.nextCursor);

  const histPage2 = await h.service.retrieveAssessmentHistory({
    principal: h.requesterPrincipal,
    caseId: ddCase.caseId,
    limit: 1,
    cursor: histPage1.nextCursor!,
  });
  assert.equal(histPage2.items.length, 1);
  assert.notEqual(histPage1.items[0]!.assessmentId, histPage2.items[0]!.assessmentId);

  const actHistory = await h.service.retrieveCaseActivityHistory({
    principal: h.requesterPrincipal,
    caseId: ddCase.caseId,
    limit: 50,
  });
  assert.ok(actHistory.totalCount >= 6);

  // Close the completed case
  const closedCase = await h.service.cancelOrCloseCase({
    principal: h.requesterPrincipal,
    caseId: ddCase.caseId,
    targetTerminalState: 'CLOSED',
    reason: 'All required due diligence checks completed.',
  });
  assert.equal(closedCase.workflowState, 'CLOSED');
  assert.equal(PROPERTY_DUE_DILIGENCE_ROUTE_REGISTRATION_SPEC.length, 14);
});
