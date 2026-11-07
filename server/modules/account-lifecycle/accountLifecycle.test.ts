/**
 * Employee 7 — Automated Test Suite (`server/modules/account-lifecycle/accountLifecycle.test.ts`)
 *
 * Covers:
 *  1. Complete user data export with bounded pagination across all 7 user-owned sources.
 *  2. Cross-user isolation (actor authorization & strict per-record leak detection).
 *  3. Truthful incomplete export reporting (failed pages & pagination limit bounds).
 *  4. Immediate write blocking upon deletion job creation & idempotent job creation.
 *  5. Interrupted job crash recovery across process restarts using durable journal cursors.
 *  6. Partial failure & idempotent retry handling (domain failure + Employee 6 media failure).
 *  7. Permanent deletion vs. retention-policy anonymization & legal hold distinction.
 *  8. Strict Firebase Auth identity deletion ordering (never called until all dependent data & media succeed).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  computeSha256Hex,
  createMediaModuleFacade,
  DeterministicByteStorageProvider,
  type MediaTargetEntityVerifier,
} from '../media/index.ts';
import {
  createCrowdDataModuleFacade,
  createDurableCrowdDataStore,
} from '../crowd-data/index.ts';
import {
  AccountLifecycleActorContext,
  AccountLifecycleError,
  ConfigurableAuthIdentityDeletionAdapter,
  createAccountLifecycleFacade,
  createEmployee4CrowdClaimsLifecycleAdapter,
  createEmployee6MediaLifecycleAdapters,
  InMemoryOrBackedDomainRepositoryAdapter,
  OwnedDomainRecordItem,
  UserOwnedDomainRepositoryAdapter,
} from './index.ts';

function createValidWebpBuffer(extraTag = 'sample'): Buffer {
  const payload = Buffer.from(`VP8 ${extraTag.padEnd(16, '0')}`, 'ascii');
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(payload.length + 4, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, payload]);
}

async function runTests(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emp7-account-lifecycle-'));
  const journalPath = path.join(tmpDir, 'account-lifecycle-journal.json');
  const mediaJournalPath = path.join(tmpDir, 'media-journal.json');
  const crowdJournalPath = path.join(tmpDir, 'crowd-journal.json');

  try {
    const byteStorage = new DeterministicByteStorageProvider({
      environmentMode: 'production',
      durabilityTier: 'PRODUCTION_OBJECT_STORAGE',
    });
    const mediaModule = createMediaModuleFacade({
      durableSnapshotPath: mediaJournalPath,
      byteStorage,
    });
    const crowdStore = createDurableCrowdDataStore({ durableFilePath: crowdJournalPath });
    const crowdModule = createCrowdDataModuleFacade(crowdStore);

    const userAlice: AccountLifecycleActorContext = {
      uid: 'user_alice_01',
      email: 'alice@example.com',
      isAdmin: false,
      freshAuthVerified: true,
      primaryBootstrapAdminEmail: 'founder-admin@radartehran.ir',
    };
    const userBob: AccountLifecycleActorContext = {
      uid: 'user_bob_02',
      email: 'bob@example.com',
      isAdmin: false,
      freshAuthVerified: true,
    };
    const adminActor: AccountLifecycleActorContext = {
      uid: 'admin_root_01',
      email: 'founder-admin@radartehran.ir',
      isAdmin: true,
      freshAuthVerified: true,
      primaryBootstrapAdminEmail: 'founder-admin@radartehran.ir',
    };

    const targetVerifier: MediaTargetEntityVerifier = {
      async verifyTargetEntity(targetType, targetId) {
        if (targetType === 'BARGAIN' && targetId === 'bargain_alice_1') {
          return { exists: true, ownerUid: userAlice.uid };
        }
        return { exists: false, ownerUid: null };
      },
    };

    // Seed Employee 6 Media objects for Alice (2 images, one attached to a bargain) & Bob (1 image)
    for (let i = 1; i <= 2; i++) {
      const webpBytes = createValidWebpBuffer(`alice_media_${i}`);
      const grant = await mediaModule.mediaService.authorizeUpload(userAlice, {
        idempotencyKey: `idem_alice_media_${i}`,
        cityId: 'tehran',
        hoodId: 1,
        mediaType: 'image',
        mimeType: 'image/webp',
        declaredSizeBytes: webpBytes.length,
        expectedSha256: computeSha256Hex(webpBytes),
        originalFileName: `alice-room-${i}.webp`,
      });
      const reg = await mediaModule.mediaService.registerUploadedObject(userAlice, grant.grantId, webpBytes);
      if (i === 1) {
        await mediaModule.mediaService.attachMediaToTarget(
          userAlice,
          { objectIds: [reg.descriptor.objectId], targetType: 'BARGAIN', targetId: 'bargain_alice_1' },
          targetVerifier,
        );
      }
    }

    const bobBytes = createValidWebpBuffer('bob_media_1');
    const bobGrant = await mediaModule.mediaService.authorizeUpload(userBob, {
      idempotencyKey: 'idem_bob_media_1',
      cityId: 'tehran',
      hoodId: 1,
      mediaType: 'image',
      mimeType: 'image/webp',
      declaredSizeBytes: bobBytes.length,
      expectedSha256: computeSha256Hex(bobBytes),
      originalFileName: 'bob-private.webp',
    });
    await mediaModule.mediaService.registerUploadedObject(userBob, bobGrant.grantId, bobBytes);

    // Seed Employee 4 Crowd Claims for Alice (1 unverified SUBMITTED, 1 moderated ACCEPTED)
    const aliceClaim1 = await crowdModule.crowdClaims.submitClaim(
      { uid: userAlice.uid, isAdmin: false },
      {
        cityId: 'tehran',
        hoodId: 1,
        streetName: 'خیابان فرشته',
        category: 'DEAL_PRICE_REPORT',
        assertedBuyPerSqmMillionToman: 245,
        narrativeFa: 'معامله واحد ۱۱۰ متری در فرشته با قیمت ۲۴۵ میلیون تومان هر متر انجام شد.',
      },
    );
    const aliceClaim2 = await crowdModule.crowdClaims.submitClaim(
      { uid: userAlice.uid, isAdmin: false },
      {
        cityId: 'tehran',
        hoodId: 2,
        streetName: 'بلوار سعادت‌آباد',
        category: 'INFRASTRUCTURE_OR_ZONING_EVENT',
        narrativeFa: 'دسترسی جدید پیاده‌راه مترو در بلوار سعادت‌آباد افتتاح شده است.',
      },
    );
    await crowdModule.crowdClaims.moderateClaim(
      { uid: adminActor.uid, isAdmin: true },
      { claimId: aliceClaim2.claimId, targetState: 'UNDER_REVIEW', reason: 'Starting review of Alice claim 2' },
    );
    await crowdModule.crowdClaims.moderateClaim(
      { uid: adminActor.uid, isAdmin: true },
      { claimId: aliceClaim2.claimId, targetState: 'ACCEPTED', reason: 'Confirmed by municipal bulletin' },
    );

    // Seed Bargains, Buyer Alerts, Sponsors, Profile, and Favorites for Alice & Bob
    const profileAdapter = new InMemoryOrBackedDomainRepositoryAdapter('USER_PROFILE', [
      { recordId: 'profile_alice', ownerUid: userAlice.uid, source: 'USER_PROFILE', createdAtIso: '2026-01-01T00:00:00.000Z', payload: { displayName: 'Alice' } },
      { recordId: 'profile_bob', ownerUid: userBob.uid, source: 'USER_PROFILE', createdAtIso: '2026-01-01T00:00:00.000Z', payload: { displayName: 'Bob' } },
    ]);
    const favoritesAdapter = new InMemoryOrBackedDomainRepositoryAdapter('FAVORITES_AND_WORKSPACES', [
      { recordId: 'fav_alice_1', ownerUid: userAlice.uid, source: 'FAVORITES_AND_WORKSPACES', createdAtIso: '2026-01-02T00:00:00.000Z', payload: { hoodId: 1 } },
      { recordId: 'fav_alice_2', ownerUid: userAlice.uid, source: 'FAVORITES_AND_WORKSPACES', createdAtIso: '2026-01-03T00:00:00.000Z', payload: { hoodId: 2 } },
    ]);
    const aliceBargains: OwnedDomainRecordItem[] = [1, 2, 3, 4, 5].map((n) => ({
      recordId: `bargain_alice_${n}`,
      ownerUid: userAlice.uid,
      source: 'BARGAIN_LISTINGS',
      createdAtIso: `2026-01-0${n}T00:00:00.000Z`,
      payload: { title: `Alice Bargain #${n}`, priceToman: 5_000_000_000 + n },
    }));
    const bargainsAdapter = new InMemoryOrBackedDomainRepositoryAdapter('BARGAIN_LISTINGS', [
      ...aliceBargains,
      { recordId: 'bargain_bob_1', ownerUid: userBob.uid, source: 'BARGAIN_LISTINGS', createdAtIso: '2026-01-05T00:00:00.000Z', payload: { title: 'Bob Bargain #1' } },
    ]);
    const buyerAlertsAdapter = new InMemoryOrBackedDomainRepositoryAdapter('BUYER_ALERTS', [
      { recordId: 'alert_alice_1', ownerUid: userAlice.uid, source: 'BUYER_ALERTS', createdAtIso: '2026-01-04T00:00:00.000Z', payload: { maxPrice: 8_000_000_000 } },
      {
        recordId: 'alert_alice_legal_hold',
        ownerUid: userAlice.uid,
        source: 'BUYER_ALERTS',
        createdAtIso: '2026-01-05T00:00:00.000Z',
        retentionClass: 'LEGAL_HOLD_RETAIN',
        retentionReason: 'Escrow dispute active legal hold case #LH-902',
        payload: { maxPrice: 12_000_000_000 },
      },
    ]);
    const sponsorsAdapter = new InMemoryOrBackedDomainRepositoryAdapter('SPONSOR_RECORDS', [
      { recordId: 'sponsor_alice_draft', ownerUid: userAlice.uid, source: 'SPONSOR_RECORDS', createdAtIso: '2026-01-06T00:00:00.000Z', retentionClass: 'STANDARD_PURGEABLE', payload: { campaign: 'Draft Banner' } },
      {
        recordId: 'sponsor_alice_invoice_paid',
        ownerUid: userAlice.uid,
        source: 'SPONSOR_RECORDS',
        createdAtIso: '2026-01-07T00:00:00.000Z',
        retentionClass: 'AUDIT_ANONYMIZE_RETAIN',
        retentionReason: 'Statutory tax invoice retention (anonymized)',
        payload: { invoiceId: 'INV-2026-77', amountRials: 950_000_000 },
      },
    ]);

    const { mediaMetadataExportAdapter, mediaDeletionCoordinator } = createEmployee6MediaLifecycleAdapters({
      mediaService: mediaModule.mediaService,
      metadataStore: mediaModule.metadataStore,
    });
    const crowdClaimsAdapter = createEmployee4CrowdClaimsLifecycleAdapter({
      crowdStore: crowdModule.store,
      trackedNeighborhoodScopes: [
        { cityId: 'tehran', hoodId: 1 },
        { cityId: 'tehran', hoodId: 2 },
      ],
    });

    const authCallOrderLog: string[] = [];
    const authAdapter = new ConfigurableAuthIdentityDeletionAdapter(async (targetUid, jobId) => {
      authCallOrderLog.push(`AUTH_DELETED:${targetUid}:${jobId}`);
    });

    const allDomainAdapters: UserOwnedDomainRepositoryAdapter[] = [
      profileAdapter,
      favoritesAdapter,
      buyerAlertsAdapter,
      bargainsAdapter,
      sponsorsAdapter,
      crowdClaimsAdapter,
      mediaMetadataExportAdapter,
    ];

    const lifecycle = createAccountLifecycleFacade({
      durableJournalPath: journalPath,
      enableFirestoreSync: false,
      domainAdapters: allDomainAdapters,
      mediaAdapter: mediaDeletionCoordinator,
      authAdapter,
    });

    // TEST 1: Complete User Data Export with Bounded Pagination & Isolation
    const aliceExport = await lifecycle.exportService.exportUserData(userAlice, userAlice.uid, {
      pageSize: 2,
      maxPagesPerSource: 10,
    });
    assert.equal(aliceExport.completenessStatus, 'COMPLETE');
    assert.equal(aliceExport.isComplete, true);
    assert.equal(aliceExport.omittedOrFailedSources.length, 0);
    assert.equal(aliceExport.recordsBySource.USER_PROFILE.length, 1);
    assert.equal(aliceExport.recordsBySource.FAVORITES_AND_WORKSPACES.length, 2);
    assert.equal(aliceExport.recordsBySource.BUYER_ALERTS.length, 2);
    assert.equal(aliceExport.recordsBySource.BARGAIN_LISTINGS.length, 5);
    assert.equal(aliceExport.sourceReports.BARGAIN_LISTINGS.pagesFetched, 3);
    assert.equal(aliceExport.recordsBySource.SPONSOR_RECORDS.length, 2);
    assert.equal(aliceExport.recordsBySource.CROWD_CLAIMS.length, 2);
    assert.equal(aliceExport.recordsBySource.MEDIA_METADATA.length, 2);
    for (const items of Object.values(aliceExport.recordsBySource)) {
      for (const item of items) {
        assert.equal(item.ownerUid, userAlice.uid);
      }
    }

    // TEST 2: Cross-User Export & Deletion Protection + Leak Detection
    await assert.rejects(
      () => lifecycle.exportService.exportUserData(userBob, userAlice.uid),
      (err: unknown) => err instanceof AccountLifecycleError && err.code === 'CROSS_USER_ACCESS_FORBIDDEN',
    );
    await assert.rejects(
      () => lifecycle.deletionOrchestrator.initiateAccountDeletionJob(userBob, { targetUid: userAlice.uid }),
      (err: unknown) => err instanceof AccountLifecycleError && err.code === 'CROSS_USER_ACCESS_FORBIDDEN',
    );

    const leakyExportService = createAccountLifecycleFacade({
      durableJournalPath: path.join(tmpDir, 'leaky.json'),
      domainAdapters: [
        {
          source: 'USER_PROFILE',
          async fetchOwnedRecordsPage() {
            return {
              items: [{ recordId: 'leaked_bob', ownerUid: userBob.uid, source: 'USER_PROFILE', createdAtIso: new Date().toISOString(), payload: {} }],
              nextCursor: null,
              hasMore: false,
            };
          },
          async disposeOwnedRecordsBatch() {
            return { receipts: [], nextCursor: null, hasMore: false };
          },
        },
      ],
      mediaAdapter: mediaDeletionCoordinator,
    }).exportService;
    await assert.rejects(
      () => leakyExportService.exportUserData(userAlice, userAlice.uid, { sources: ['USER_PROFILE'] }),
      (err: unknown) => err instanceof AccountLifecycleError && err.code === 'CROSS_USER_DATA_LEAK_DETECTED',
    );

    // TEST 3: Truthful Incomplete Export Reporting (Failed Page & Pagination Cap)
    const cappedExport = await lifecycle.exportService.exportUserData(userAlice, userAlice.uid, {
      pageSize: 2,
      maxPagesPerSource: 2,
    });
    assert.equal(cappedExport.completenessStatus, 'INCOMPLETE_PARTIAL');
    assert.equal(cappedExport.isComplete, false);
    assert.ok(cappedExport.omittedOrFailedSources.includes('BARGAIN_LISTINGS'));
    assert.equal(cappedExport.sourceReports.BARGAIN_LISTINGS.status, 'PAGINATION_LIMIT_INCOMPLETE');
    assert.equal(cappedExport.recordsBySource.BARGAIN_LISTINGS.length, 4);

    let flakyPageCalls = 0;
    const flakyExportService = createAccountLifecycleFacade({
      durableJournalPath: path.join(tmpDir, 'flaky-export.json'),
      domainAdapters: [
        {
          source: 'BARGAIN_LISTINGS',
          async fetchOwnedRecordsPage({ targetUid, cursor, pageSize }) {
            flakyPageCalls += 1;
            if (flakyPageCalls === 2) throw new Error('Simulated Firestore read timeout on page 2');
            return bargainsAdapter.fetchOwnedRecordsPage({ targetUid, cursor, pageSize });
          },
          async disposeOwnedRecordsBatch(p) {
            return bargainsAdapter.disposeOwnedRecordsBatch(p);
          },
        },
      ],
      mediaAdapter: mediaDeletionCoordinator,
    }).exportService;

    const partialExport = await flakyExportService.exportUserData(userAlice, userAlice.uid, {
      pageSize: 2,
      sources: ['BARGAIN_LISTINGS'],
    });
    assert.equal(partialExport.completenessStatus, 'INCOMPLETE_PARTIAL');
    assert.equal(partialExport.sourceReports.BARGAIN_LISTINGS.status, 'FAILED_INCOMPLETE');
    assert.equal(partialExport.sourceReports.BARGAIN_LISTINGS.failedPageNumber, 2);

    // TEST 4: Fresh Auth & Primary Admin Protection + Immediate Write Blocking
    await assert.rejects(
      () => lifecycle.deletionOrchestrator.initiateAccountDeletionJob({ ...userAlice, freshAuthVerified: false }, { targetUid: userAlice.uid }),
      (err: unknown) => err instanceof AccountLifecycleError && err.code === 'FRESH_AUTH_REQUIRED',
    );
    await assert.rejects(
      () => lifecycle.deletionOrchestrator.initiateAccountDeletionJob(adminActor, { targetUid: adminActor.uid, targetEmail: 'founder-admin@radartehran.ir' }),
      (err: unknown) => err instanceof AccountLifecycleError && err.code === 'PRIMARY_ADMIN_PROTECTION_BLOCK',
    );

    await lifecycle.deletionOrchestrator.assertUserWritePermitted(userAlice.uid);
    const { job: createdJob, createdNew } = await lifecycle.deletionOrchestrator.initiateAccountDeletionJob(userAlice, {
      targetUid: userAlice.uid,
      targetEmail: userAlice.email,
      reason: 'GDPR_ERASURE_REQUEST',
    });
    assert.equal(createdNew, true);
    assert.equal(createdJob.state, 'INITIATED_WRITE_BLOCKED');

    const { job: duplicateJob, createdNew: createdSecond } = await lifecycle.deletionOrchestrator.initiateAccountDeletionJob(userAlice, {
      targetUid: userAlice.uid,
    });
    assert.equal(createdSecond, false);
    assert.equal(duplicateJob.jobId, createdJob.jobId);

    await assert.rejects(
      () => lifecycle.deletionOrchestrator.assertUserWritePermitted(userAlice.uid),
      (err: unknown) => err instanceof AccountLifecycleError && err.code === 'USER_WRITES_BLOCKED_BY_DELETION',
    );
    await lifecycle.deletionOrchestrator.assertUserWritePermitted(userBob.uid);

    // TEST 5: Interrupted Job & Process Restart Recovery (Bounded Pagination)
    const afterTwoBatches = await lifecycle.deletionOrchestrator.executeDeletionJob(userAlice, createdJob.jobId, {
      batchSize: 2,
      maxBatchesPerInvocation: 2,
    });
    assert.equal(afterTwoBatches.domainSteps.BARGAIN_LISTINGS.status, 'IN_PROGRESS');
    assert.equal(afterTwoBatches.domainSteps.BARGAIN_LISTINGS.permanentlyDeletedIds.length, 4);
    assert.equal(authCallOrderLog.length, 0);

    let simulateMediaStorageFailureOnce = true;
    const restartedMediaCoordinator = {
      ...mediaDeletionCoordinator,
      async deleteOwnedMediaObject(params: Parameters<typeof mediaDeletionCoordinator.deleteOwnedMediaObject>[0]) {
        if (simulateMediaStorageFailureOnce) {
          simulateMediaStorageFailureOnce = false;
          return {
            objectId: params.objectId,
            status: 'PENDING_RETRY' as const,
            failureReason: 'Simulated transient object storage timeout during media cleanup',
          };
        }
        return mediaDeletionCoordinator.deleteOwnedMediaObject(params);
      },
    };

    const restartedLifecycle = createAccountLifecycleFacade({
      durableJournalPath: journalPath,
      enableFirestoreSync: false,
      domainAdapters: allDomainAdapters,
      mediaAdapter: restartedMediaCoordinator,
      authAdapter,
    });
    await assert.rejects(
      () => restartedLifecycle.deletionOrchestrator.assertUserWritePermitted(userAlice.uid),
      (err: unknown) => err instanceof AccountLifecycleError && err.code === 'USER_WRITES_BLOCKED_BY_DELETION',
    );

    // TEST 6: Partial Failure During Media Cleanup Blocks Auth Deletion
    const afterMediaFailure = await restartedLifecycle.deletionOrchestrator.executeDeletionJob(userAlice, createdJob.jobId, { batchSize: 2 });
    assert.equal(afterMediaFailure.domainSteps.BARGAIN_LISTINGS.status, 'COMPLETED');
    assert.equal(afterMediaFailure.domainSteps.BARGAIN_LISTINGS.permanentlyDeletedIds.length, 5);
    assert.equal(afterMediaFailure.mediaStep.status, 'FAILED_RETRYABLE');
    assert.equal(afterMediaFailure.state, 'PARTIAL_FAILURE_RETRYABLE');
    assert.equal(afterMediaFailure.authStep.status, 'PENDING');
    assert.equal(authCallOrderLog.length, 0);

    // TEST 7: Idempotent Retry Completes Media, Retention Policies, and Auth Last
    const completedJob = await restartedLifecycle.deletionOrchestrator.executeDeletionJob(userAlice, createdJob.jobId, { batchSize: 2 });
    assert.equal(completedJob.state, 'COMPLETED');
    assert.equal(completedJob.mediaStep.status, 'COMPLETED');
    assert.equal(completedJob.mediaStep.deletedObjectIds.length, 2);

    assert.deepEqual(completedJob.domainSteps.BUYER_ALERTS.permanentlyDeletedIds, ['alert_alice_1']);
    assert.equal(completedJob.domainSteps.BUYER_ALERTS.retainedRecords[0].outcome, 'LEGAL_HOLD_RETAINED');
    assert.deepEqual(completedJob.domainSteps.SPONSOR_RECORDS.permanentlyDeletedIds, ['sponsor_alice_draft']);
    assert.equal(completedJob.domainSteps.SPONSOR_RECORDS.retainedRecords[0].outcome, 'ANONYMIZED_RETAINED_POLICY');
    assert.deepEqual(completedJob.domainSteps.CROWD_CLAIMS.permanentlyDeletedIds, [aliceClaim1.claimId]);
    assert.equal(completedJob.domainSteps.CROWD_CLAIMS.retainedRecords[0].outcome, 'ANONYMIZED_RETAINED_POLICY');

    assert.equal(completedJob.authStep.status, 'COMPLETED');
    assert.equal(authCallOrderLog.length, 1);
    assert.equal(authAdapter.isAuthDeleted(userAlice.uid), true);

    const idempotentRerun = await restartedLifecycle.deletionOrchestrator.executeDeletionJob(userAlice, createdJob.jobId);
    assert.equal(idempotentRerun.state, 'COMPLETED');
    assert.equal(authCallOrderLog.length, 1);

    const bobExport = await restartedLifecycle.exportService.exportUserData(userBob, userBob.uid);
    assert.equal(bobExport.completenessStatus, 'COMPLETE');
    assert.equal(bobExport.recordsBySource.USER_PROFILE.length, 1);
    assert.equal(bobExport.recordsBySource.BARGAIN_LISTINGS.length, 1);
    assert.equal(bobExport.recordsBySource.MEDIA_METADATA.length, 1);

    console.log('ALL EMPLOYEE-7 ACCOUNT EXPORT AND DELETION LIFECYCLE TESTS PASSED');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('EMPLOYEE-7 ACCOUNT LIFECYCLE TESTS FAILED:', err);
  process.exit(1);
});
