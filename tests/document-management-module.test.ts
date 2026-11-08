import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import {
  createDocumentManagementRouter,
  createDocumentManagementService,
  type StorageObjectInspectorAdapter,
  type VerifiedStorageObjectInfo,
} from '../server/modules/document-management';

function createMockStorageAdapter(initialObjects: VerifiedStorageObjectInfo[] = []): {
  adapter: StorageObjectInspectorAdapter;
  objects: Map<string, VerifiedStorageObjectInfo>;
} {
  const objects = new Map<string, VerifiedStorageObjectInfo>();
  for (const obj of initialObjects) {
    objects.set(obj.storageObjectKey, { ...obj });
  }

  const adapter: StorageObjectInspectorAdapter = {
    async inspectObject(storageObjectKey: string) {
      const found = objects.get(storageObjectKey);
      return found ? { ...found } : null;
    },
    async generateSignedDownloadUrl(params) {
      return {
        downloadUrl: `https://storage.tehranradar.local/signed/${encodeURIComponent(params.storageObjectKey)}?ttl=${params.expiresInSeconds}`,
        expiresAtIso: new Date(Date.now() + params.expiresInSeconds * 1000).toISOString(),
        contentDisposition: `attachment; filename="${params.filename}"`,
      };
    },
  };

  return { adapter, objects };
}

describe('Employee 63 — Real Estate Document Management, Digital Records & Contract Lifecycle Backend', () => {
  it('1. validates storage references, blocks path traversal, enforces uploader ownership, MIME rules, and classification defaults', async () => {
    const { adapter } = createMockStorageAdapter([
      {
        storageObjectKey: 'uploads/user_owner_1/2026/deed_scan_01.pdf',
        exists: true,
        quarantined: false,
        validatedMimeType: 'application/pdf',
        sizeBytes: 425000,
        sha256Hex: 'a'.repeat(64),
        uploadedByUid: 'user_owner_1',
      },
      {
        storageObjectKey: 'uploads/user_owner_1/2026/script_payload.exe',
        exists: true,
        quarantined: false,
        validatedMimeType: 'application/x-msdownload',
        sizeBytes: 12000,
        sha256Hex: 'b'.repeat(64),
        uploadedByUid: 'user_owner_1',
      },
      {
        storageObjectKey: 'uploads/user_owner_1/2026/floorplan.png',
        exists: true,
        quarantined: false,
        validatedMimeType: 'image/png',
        sizeBytes: 185000,
        sha256Hex: 'c'.repeat(64),
        uploadedByUid: 'user_owner_1',
      },
    ]);

    const service = createDocumentManagementService({
      storageAdapter: adapter,
      now: () => new Date('2026-11-08T10:00:00.000Z'),
    });

    // Path traversal rejected
    await assert.rejects(
      () =>
        service.registerDocument({
          actorUid: 'user_owner_1',
          category: 'OWNERSHIP_TITLE',
          documentType: 'SINGLE_LEAF_DEED',
          storageObjectKey: '../secrets/passwd',
          originalFilename: 'deed.pdf',
        }),
      /path traversal|Unsafe/i,
    );

    // Non-existent storage object rejected
    await assert.rejects(
      () =>
        service.registerDocument({
          actorUid: 'user_owner_1',
          category: 'OWNERSHIP_TITLE',
          documentType: 'SINGLE_LEAF_DEED',
          storageObjectKey: 'uploads/user_owner_1/2026/missing.pdf',
          originalFilename: 'missing.pdf',
        }),
      /does not exist/i,
    );

    // Actor who did not upload the storage object is rejected
    await assert.rejects(
      () =>
        service.registerDocument({
          actorUid: 'user_attacker_99',
          category: 'OWNERSHIP_TITLE',
          documentType: 'SINGLE_LEAF_DEED',
          storageObjectKey: 'uploads/user_owner_1/2026/deed_scan_01.pdf',
          originalFilename: 'deed.pdf',
        }),
      /does not belong to the uploading actor/i,
    );

    // Disallowed MIME type rejected
    await assert.rejects(
      () =>
        service.registerDocument({
          actorUid: 'user_owner_1',
          category: 'PROPERTY_DOCUMENT',
          documentType: 'OTHER',
          storageObjectKey: 'uploads/user_owner_1/2026/script_payload.exe',
          originalFilename: 'payload.exe',
        }),
      /MIME type .* is not permitted/i,
    );

    // Valid ownership title registration: never automatically VERIFIED on upload, restricted confidentiality preserved
    const titleDoc = await service.registerDocument({
      actorUid: 'user_owner_1',
      documentId: 'doc_title_1',
      category: 'OWNERSHIP_TITLE',
      documentType: 'SINGLE_LEAF_OFFICIAL_DEED',
      storageObjectKey: 'uploads/user_owner_1/2026/deed_scan_01.pdf',
      originalFilename: 'tehran_vanak_deed.pdf',
      relatedEntities: { propertyId: 'prop_vanak_101', transactionId: 'tx_9001' },
      authorizedParticipantUids: ['broker_agent_7'],
      requestedConfidentiality: 'PUBLIC_LISTING_ATTACHMENT', // Attempting to downgrade restricted category as non-admin
    });

    assert.equal(titleDoc.lifecycleState, 'PENDING_REVIEW');
    assert.equal(titleDoc.versions[0].verificationStatus, 'PENDING_REVIEW');
    assert.equal(titleDoc.confidentiality, 'RESTRICTED_LEGAL_IDENTITY');
    assert.equal(titleDoc.relatedEntities.propertyId, 'prop_vanak_101');
    assert.equal(titleDoc.relatedEntities.transactionId, 'tx_9001');
  });

  it('2. enforces version immutability, version-specific verification, and resets verification on replacement upload', async () => {
    const { adapter } = createMockStorageAdapter([
      {
        storageObjectKey: 'uploads/owner_1/contract_v1.pdf',
        exists: true,
        quarantined: false,
        validatedMimeType: 'application/pdf',
        sizeBytes: 310000,
        sha256Hex: '1'.repeat(64),
        uploadedByUid: 'owner_1',
      },
      {
        storageObjectKey: 'uploads/owner_1/contract_v2.pdf',
        exists: true,
        quarantined: false,
        validatedMimeType: 'application/pdf',
        sizeBytes: 345000,
        sha256Hex: '2'.repeat(64),
        uploadedByUid: 'owner_1',
      },
    ]);

    const service = createDocumentManagementService({
      storageAdapter: adapter,
      now: () => new Date('2026-11-08T11:00:00.000Z'),
    });

    const docV1 = await service.registerDocument({
      actorUid: 'owner_1',
      documentId: 'doc_sale_contract_1',
      category: 'SALE_PURCHASE_AGREEMENT',
      documentType: 'MOBAYEENAMEH',
      storageObjectKey: 'uploads/owner_1/contract_v1.pdf',
      originalFilename: 'mobayeenameh_v1.pdf',
      relatedEntities: { transactionId: 'tx_100', propertyId: 'prop_100' },
      authorizedParticipantUids: ['buyer_1', 'broker_1'],
    });
    assert.equal(docV1.currentVersionNumber, 1);
    assert.equal(docV1.lifecycleState, 'PENDING_REVIEW');

    // Ordinary user cannot transition to VERIFIED directly
    assert.throws(
      () =>
        service.transitionDocumentLifecycle({
          actorUid: 'owner_1',
          isAdmin: false,
          documentId: 'doc_sale_contract_1',
          toState: 'VERIFIED',
          reason: 'Self-approve',
        }),
      /explicit verification review|not permitted/i,
    );

    // Admin verifies v1
    const verifiedV1 = service.verifyDocumentVersion({
      reviewerUid: 'admin_reviewer_1',
      isAdminOrAuthorizedVerifier: true,
      documentId: 'doc_sale_contract_1',
      versionNumber: 1,
      decision: 'APPROVE',
      verificationScope: 'LEGAL_COMPLIANCE',
      reason: 'Matched notarized tracking code and signatures.',
    });
    assert.equal(verifiedV1.lifecycleState, 'VERIFIED');
    assert.equal(verifiedV1.versions[0].verificationStatus, 'VERIFIED');

    // Attach machine OCR/classification suggestions: must remain unverifiedMachineSuggestion: true
    const withOcr = service.attachProcessingSuggestions({
      documentId: 'doc_sale_contract_1',
      versionNumber: 1,
      ocrTextSummary: 'Contract tracking code 998877',
      suggestedCategory: 'SALE_PURCHASE_AGREEMENT',
      malwareScanClean: true,
    });
    assert.equal(withOcr.versions[0].machineSuggestions?.unverifiedMachineSuggestion, true);

    // Upload replacement v2: v1 must remain preserved as SUPERSEDED, and v2 MUST NOT inherit VERIFIED status!
    const docV2 = await service.createDocumentVersion({
      actorUid: 'owner_1',
      documentId: 'doc_sale_contract_1',
      storageObjectKey: 'uploads/owner_1/contract_v2.pdf',
      originalFilename: 'mobayeenameh_v2_amended.pdf',
      replacementReason: 'Amended payment schedule clause 4',
    });

    assert.equal(docV2.currentVersionNumber, 2);
    assert.equal(docV2.lifecycleState, 'PENDING_REVIEW');
    assert.equal(docV2.versions.length, 2);
    assert.equal(docV2.versions[0].versionNumber, 1);
    assert.equal(docV2.versions[0].status, 'SUPERSEDED');
    assert.equal(docV2.versions[0].supersededByVersionId, 'doc_sale_contract_1_v2');
    assert.equal(docV2.versions[0].contentSha256, '1'.repeat(64)); // Immutable v1 preserved
    assert.equal(docV2.versions[1].versionNumber, 2);
    assert.equal(docV2.versions[1].status, 'CURRENT');
    assert.equal(docV2.versions[1].verificationStatus, 'PENDING_REVIEW');
  });

  it('3. enforces strict access control (IDOR protection), time-bounded signed URLs, controlled sharing grants, revocation, and blocks onward resharing', async () => {
    const { adapter } = createMockStorageAdapter([
      {
        storageObjectKey: 'uploads/landlord_1/lease_2026.pdf',
        exists: true,
        quarantined: false,
        validatedMimeType: 'application/pdf',
        sizeBytes: 220000,
        sha256Hex: 'e'.repeat(64),
        uploadedByUid: 'landlord_1',
      },
    ]);

    const service = createDocumentManagementService({
      storageAdapter: adapter,
      now: () => new Date('2026-11-08T12:00:00.000Z'),
    });

    await service.registerDocument({
      actorUid: 'landlord_1',
      documentId: 'doc_lease_1',
      category: 'RENTAL_LEASE_AGREEMENT',
      documentType: 'RESIDENTIAL_LEASE',
      storageObjectKey: 'uploads/landlord_1/lease_2026.pdf',
      originalFilename: 'ejarehnameh_2026.pdf',
      relatedEntities: { tenancyId: 'tenancy_55', propertyId: 'prop_55' },
      authorizedParticipantUids: ['tenant_1'],
    });

    // Unauthorized third-party user is blocked (IDOR prevention)
    assert.throws(
      () =>
        service.getDocumentMetadata({
          documentId: 'doc_lease_1',
          actorUid: 'random_stranger_99',
          isAdmin: false,
        }),
      /Access denied|not authorized/i,
    );

    // Public listing endpoint cannot access participant-confidential lease
    assert.throws(
      () =>
        service.getDocumentMetadata({
          documentId: 'doc_lease_1',
          actorUid: 'tenant_1',
          isPublicListingEndpoint: true,
        }),
      /cannot be exposed on public endpoints|Public listing endpoints/i,
    );

    // Authorized participant (tenant_1) can view metadata and request a bounded signed download URL
    const meta = service.getDocumentMetadata({
      documentId: 'doc_lease_1',
      actorUid: 'tenant_1',
    });
    assert.equal(meta.documentId, 'doc_lease_1');

    const signed = await service.generateSignedDownloadUrl({
      documentId: 'doc_lease_1',
      actorUid: 'tenant_1',
      expiresInSeconds: 3600, // Clamped to max 900s
    });
    assert.ok(signed.downloadUrl.includes('ttl=900'));
    assert.ok(signed.contentDisposition.includes('ejarehnameh_2026.pdf'));

    // Landlord grants temporary access to legal_advisor_1 without onward reshare permission
    const grant = service.createSharingGrant({
      actorUid: 'landlord_1',
      documentId: 'doc_lease_1',
      recipientUid: 'legal_advisor_1',
      purpose: 'Contract review',
      canDownload: true,
      canReshare: false,
      expiresInHours: 24,
    });

    const advisorSigned = await service.generateSignedDownloadUrl({
      documentId: 'doc_lease_1',
      actorUid: 'legal_advisor_1',
    });
    assert.ok(advisorSigned.downloadUrl.length > 10);

    // legal_advisor_1 cannot reshare onward
    assert.throws(
      () =>
        service.createSharingGrant({
          actorUid: 'legal_advisor_1',
          documentId: 'doc_lease_1',
          recipientUid: 'external_user_2',
          purpose: 'Unauthorized onward share',
        }),
      /not authorized to share this document onward/i,
    );

    // Revoke sharing grant -> legal_advisor_1 immediately loses download access
    service.revokeSharingGrant({
      actorUid: 'landlord_1',
      grantId: grant.grantId,
    });

    await assert.rejects(
      () =>
        service.generateSignedDownloadUrl({
          documentId: 'doc_lease_1',
          actorUid: 'legal_advisor_1',
        }),
      /Access denied|not authorized/i,
    );
  });

  it('4. enforces retention policies, legal holds blocking deletion, expiration jobs, storage integrity checks, event idempotency, and HTTP routes', async () => {
    let currentNow = new Date('2026-11-08T12:00:00.000Z');
    const { adapter, objects } = createMockStorageAdapter([
      {
        storageObjectKey: 'uploads/broker_1/mandate_2026.pdf',
        exists: true,
        quarantined: false,
        validatedMimeType: 'application/pdf',
        sizeBytes: 150000,
        sha256Hex: 'f'.repeat(64),
        uploadedByUid: 'broker_1',
      },
      {
        storageObjectKey: 'uploads/broker_1/duplicate_mandate.pdf',
        exists: true,
        quarantined: false,
        validatedMimeType: 'application/pdf',
        sizeBytes: 150000,
        sha256Hex: 'f'.repeat(64), // Same SHA-256 content
        uploadedByUid: 'broker_1',
      },
    ]);

    const service = createDocumentManagementService({
      storageAdapter: adapter,
      tokenVerifier: {
        async verifyIdToken(token: string) {
          if (token === 'admin-token') {
            return { uid: 'admin_1', email: 'admin@tehranradar.ir' };
          }
          if (token === 'broker-token') {
            return { uid: 'broker_1', email: 'broker@tehranradar.ir' };
          }
          throw new Error('Invalid token');
        },
      },
      primaryAdminEmails: ['admin@tehranradar.ir'],
      now: () => currentNow,
    });

    await service.registerDocument({
      actorUid: 'broker_1',
      documentId: 'doc_mandate_1',
      category: 'BROKERAGE_AGREEMENT',
      documentType: 'EXCLUSIVE_LISTING_MANDATE',
      storageObjectKey: 'uploads/broker_1/mandate_2026.pdf',
      originalFilename: 'mandate.pdf',
      relatedEntities: { brokerageAgreementId: 'brk_ag_1' },
      expiresAtIso: '2026-12-01T00:00:00.000Z',
    });

    await service.registerDocument({
      actorUid: 'broker_1',
      documentId: 'doc_mandate_dup',
      category: 'BROKERAGE_AGREEMENT',
      documentType: 'EXCLUSIVE_LISTING_MANDATE',
      storageObjectKey: 'uploads/broker_1/duplicate_mandate.pdf',
      originalFilename: 'mandate_copy.pdf',
    });

    // Mandatory retention period blocks deletion before retainUntilIso
    assert.throws(
      () =>
        service.requestDocumentDeletion({
          actorUid: 'broker_1',
          isAdmin: false,
          documentId: 'doc_mandate_1',
          reason: 'Early delete attempt',
        }),
      /Mandatory retention period applies/i,
    );

    // Place legal hold
    service.placeOrReleaseLegalHold({
      actorUid: 'admin_1',
      isAdmin: true,
      documentId: 'doc_mandate_1',
      legalHoldActive: true,
      reason: 'Pending commission dispute arbitration',
    });

    // Advance clock 6 years past mandatory retention; legal hold STILL blocks deletion
    currentNow = new Date('2033-01-01T00:00:00.000Z');
    assert.throws(
      () =>
        service.requestDocumentDeletion({
          actorUid: 'broker_1',
          isAdmin: false,
          documentId: 'doc_mandate_1',
          reason: 'Delete after 6 years',
        }),
      /active legal hold/i,
    );

    // Integrity check detects duplicate content across documents and verifies checksum match
    const integrityOk = await service.verifyDocumentIntegrity({
      documentId: 'doc_mandate_1',
    });
    assert.equal(integrityOk.intact, true);
    assert.ok(integrityOk.duplicateContentDocumentIds.includes('doc_mandate_dup'));

    // Simulate storage tampering (checksum mismatch)
    objects.set('uploads/broker_1/mandate_2026.pdf', {
      ...objects.get('uploads/broker_1/mandate_2026.pdf')!,
      sha256Hex: '0'.repeat(64),
    });
    const integrityFailed = await service.verifyDocumentIntegrity({
      documentId: 'doc_mandate_1',
    });
    assert.equal(integrityFailed.intact, false);
    assert.equal(integrityFailed.checksumMatched, false);

    // Domain event idempotency
    const events = service.listDomainEvents();
    assert.ok(events.length >= 2);
    let handledCount = 0;
    const firstConsume = service.consumeDomainEventIdempotently(events[0].eventId, () => {
      handledCount += 1;
    });
    const secondConsume = service.consumeDomainEventIdempotently(events[0].eventId, () => {
      handledCount += 1;
    });
    assert.equal(firstConsume.processed, true);
    assert.equal(secondConsume.processed, false);
    assert.equal(handledCount, 1);

    // Verify HTTP router admin guard & endpoints
    const app = express();
    app.use(express.json());
    app.use(
      '/api/documents',
      createDocumentManagementRouter(service, {
        storageAdapter: adapter,
        tokenVerifier: {
          async verifyIdToken(token: string) {
            if (token === 'admin-token') return { uid: 'admin_1', email: 'admin@tehranradar.ir' };
            if (token === 'broker-token') return { uid: 'broker_1', email: 'broker@tehranradar.ir' };
            throw new Error('Invalid token');
          },
        },
        primaryAdminEmails: ['admin@tehranradar.ir'],
      }),
    );

    const server = app.listen(0);
    try {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      // Non-admin blocked from admin verify endpoint
      const forbiddenRes = await fetch(
        `http://127.0.0.1:${port}/api/documents/admin/doc_mandate_1/versions/1/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer broker-token',
          },
          body: JSON.stringify({ decision: 'APPROVE', reason: 'Attempt bypass' }),
        },
      );
      assert.equal(forbiddenRes.status, 403);

      // Admin approves version
      const approveRes = await fetch(
        `http://127.0.0.1:${port}/api/documents/admin/doc_mandate_1/versions/1/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer admin-token',
          },
          body: JSON.stringify({
            decision: 'APPROVE',
            verificationScope: 'MANUAL_ADMIN',
            reason: 'Verified brokerage agreement',
          }),
        },
      );
      assert.equal(approveRes.status, 200);
      const approveJson = (await approveRes.json()) as { data: { lifecycleState: string } };
      assert.equal(approveJson.data.lifecycleState, 'VERIFIED');
    } finally {
      server.close();
    }
  });
});
