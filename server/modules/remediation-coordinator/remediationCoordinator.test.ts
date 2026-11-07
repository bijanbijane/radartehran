/**
 * Final Remediation Coordinator — Automated Integration & Closure Verification Suite
 * (`server/modules/remediation-coordinator/remediationCoordinator.test.ts`)
 *
 * Verifies:
 *  1. Consolidated audit register completeness across A1..A5 with zero duplicate finding IDs.
 *  2. Strictly non-overlapping employee file assignments and shared-file coordinator exclusivity.
 *  3. Shared fix `FIND-A1-001` (`executePostCommitSideEffectsTransaction` error & success branches).
 *  4. Cross-module integration between Employee 4 (`crowd-data`), Employee 6 (`media`),
 *     Employee 7 (`account-lifecycle`), and Employee 13 (`notifications`).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executePostCommitSideEffectsTransaction } from '../../../src/utils/serverSponsorAndBargainRoutes.ts';
import { createCrowdDataModuleFacade, createDurableCrowdDataStore } from '../crowd-data/index.ts';
import {
  computeSha256Hex,
  createMediaModuleFacade,
  DeterministicByteStorageProvider,
} from '../media/index.ts';
import {
  createAccountLifecycleFacade,
  createEmployee4CrowdClaimsLifecycleAdapter,
  createEmployee6MediaLifecycleAdapters,
  InMemoryOrBackedDomainRepositoryAdapter,
} from '../account-lifecycle/index.ts';
import { createNotificationsModuleFacade } from '../notifications/index.ts';
import {
  CONSOLIDATED_AUDIT_REGISTER,
  validateNonOverlappingRemediationAssignments,
} from './index.ts';

async function runCoordinatorTests(): Promise<void> {
  // 1. Validate Consolidated Audit Register & Non-Overlapping Assignments
  const assignmentCheck = validateNonOverlappingRemediationAssignments(CONSOLIDATED_AUDIT_REGISTER);
  assert.equal(assignmentCheck.valid, true);
  assert.equal(assignmentCheck.overlappingPaths.length, 0);
  assert.equal(assignmentCheck.sharedFileViolations.length, 0);
  assert.equal(assignmentCheck.uniqueFindingCount, 7);

  // Verify all 5 audit dimensions (A1..A5) are represented
  const coveredAudits = new Set(CONSOLIDATED_AUDIT_REGISTER.flatMap((f) => f.auditSources));
  assert.equal(coveredAudits.has('A1_ARCHITECTURE'), true);
  assert.equal(coveredAudits.has('A2_SECURITY'), true);
  assert.equal(coveredAudits.has('A3_DATA_INTEGRITY'), true);
  assert.equal(coveredAudits.has('A4_INTEGRATION'), true);
  assert.equal(coveredAudits.has('A5_PERFORMANCE'), true);

  // 2. Verify Coordinator Shared Fix FIND-A1-001 (`executePostCommitSideEffectsTransaction`)
  const failedCommit = await executePostCommitSideEffectsTransaction({
    runDatabaseCommit: async () => {
      throw new Error('Firestore transaction aborted due to contention');
    },
  });
  assert.equal(failedCommit.ok, false);
  if (!failedCommit.ok) {
    assert.equal(failedCommit.code, 'TRANSACTION_CONFLICT_RETRYABLE');
    assert.ok(failedCommit.messageFa.length > 5);
  }

  const succeededCommit = await executePostCommitSideEffectsTransaction({
    runDatabaseCommit: async () => ({ hoodId: 1, status: 'approved' }),
  });
  assert.equal(succeededCommit.ok, true);

  // 3. Verify End-to-End Cross-Module Integration (Employees 4, 6, 7, and 13)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remediation-coord-e2e-'));
  try {
    const crowdStore = createDurableCrowdDataStore({
      durableFilePath: path.join(tmpDir, 'crowd.json'),
    });
    const crowdMod = createCrowdDataModuleFacade(crowdStore);

    const mediaMod = createMediaModuleFacade({
      durableSnapshotPath: path.join(tmpDir, 'media.json'),
      byteStorage: new DeterministicByteStorageProvider({
        environmentMode: 'production',
        durabilityTier: 'PRODUCTION_OBJECT_STORAGE',
      }),
    });

    const { mediaMetadataExportAdapter, mediaDeletionCoordinator } =
      createEmployee6MediaLifecycleAdapters({
        mediaService: mediaMod.mediaService,
        metadataStore: mediaMod.metadataStore,
      });

    const crowdLifecycleAdapter = createEmployee4CrowdClaimsLifecycleAdapter({
      crowdStore: crowdMod.store,
      trackedNeighborhoodScopes: [{ cityId: 'tehran', hoodId: 1 }],
    });

    const lifecycleMod = createAccountLifecycleFacade({
      durableJournalPath: path.join(tmpDir, 'lifecycle.json'),
      domainAdapters: [
        new InMemoryOrBackedDomainRepositoryAdapter('USER_PROFILE', [
          {
            recordId: 'prof_u1',
            ownerUid: 'user_int_01',
            source: 'USER_PROFILE',
            createdAtIso: new Date().toISOString(),
            payload: { displayName: 'Integration User' },
          },
        ]),
        new InMemoryOrBackedDomainRepositoryAdapter('FAVORITES_AND_WORKSPACES'),
        new InMemoryOrBackedDomainRepositoryAdapter('BUYER_ALERTS'),
        new InMemoryOrBackedDomainRepositoryAdapter('BARGAIN_LISTINGS'),
        new InMemoryOrBackedDomainRepositoryAdapter('SPONSOR_RECORDS'),
        crowdLifecycleAdapter,
        mediaMetadataExportAdapter,
      ],
      mediaAdapter: mediaDeletionCoordinator,
    });

    const notifMod = createNotificationsModuleFacade({
      durableJournalPath: path.join(tmpDir, 'notifications.json'),
    });

    const actor = {
      uid: 'user_int_01',
      email: 'int01@example.com',
      isAdmin: false,
      freshAuthVerified: true,
    };

    // Submit a crowd claim (Employee 4)
    const claim = await crowdMod.crowdClaims.submitClaim(
      { uid: actor.uid, isAdmin: false },
      {
        cityId: 'tehran',
        hoodId: 1,
        streetName: 'خیابان ولیعصر',
        category: 'DEAL_PRICE_REPORT',
        assertedBuyPerSqmMillionToman: 210,
        narrativeFa: 'گزارش معامله واقعی در خیابان ولیعصر برای تست یکپارچگی.',
      },
    );
    assert.equal(claim.state, 'SUBMITTED');

    // Upload a media object (Employee 6)
    const header = Buffer.alloc(12);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(24, 4);
    header.write('WEBP', 8, 'ascii');
    const webp = Buffer.concat([header, Buffer.from('VP8 integration_test', 'ascii')]);
    const grant = await mediaMod.mediaService.authorizeUpload(actor, {
      idempotencyKey: 'idem_coord_media_1',
      cityId: 'tehran',
      hoodId: 1,
      mediaType: 'image',
      mimeType: 'image/webp',
      declaredSizeBytes: webp.length,
      expectedSha256: computeSha256Hex(webp),
      originalFileName: 'test.webp',
    });
    await mediaMod.mediaService.registerUploadedObject(actor, grant.grantId, webp);

    // Export user data (Employee 7) & trigger export-ready notification (Employee 13)
    const exported = await lifecycleMod.exportService.exportUserData(actor, actor.uid);
    assert.equal(exported.completenessStatus, 'COMPLETE');
    assert.equal(exported.recordsBySource.CROWD_CLAIMS.length, 1);
    assert.equal(exported.recordsBySource.MEDIA_METADATA.length, 1);

    await notifMod.engine.ingestEventToOutbox({
      source: 'ACCOUNT_LIFECYCLE',
      eventType: 'ACCOUNT_EXPORT_READY',
      idempotencyKey: `idem_exp_${exported.exportId}`,
      recipientUid: actor.uid,
      requestedChannels: ['IN_APP', 'EMAIL'],
      variables: { exportId: exported.exportId },
    });
    await notifMod.engine.generateNotificationsFromOutbox();
    const dispatched = await notifMod.engine.dispatchDueDeliveryJobs();
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].status, 'PROVIDER_ACCEPTED_AWAITING_RECEIPT');
    assert.equal(dispatched[0].isConfirmedDelivered, false);

    const confirmed = await notifMod.engine.confirmDeliveryReceipt({
      providerId: dispatched[0].providerId!,
      providerMessageId: dispatched[0].providerMessageId!,
      receiptStatus: 'DELIVERED',
    });
    assert.equal(confirmed.status, 'DELIVERED_CONFIRMED');
    assert.equal(confirmed.isConfirmedDelivered, true);

    console.log('ALL FINAL REMEDIATION COORDINATOR INTEGRATION TESTS PASSED');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runCoordinatorTests().catch((err) => {
  console.error('FINAL REMEDIATION COORDINATOR TESTS FAILED:', err);
  process.exit(1);
});
