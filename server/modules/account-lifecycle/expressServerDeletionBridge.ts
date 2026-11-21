/**
 * Bridges Express in-memory/disk publisher state to AccountDeletionOrchestrator adapters.
 */

import path from 'node:path';
import { deleteFromRemoteS3Compatible, resolveObjectStorageRuntimeConfig } from '../../../src/utils/objectStorageUpload';
import { ensureBucketLoaded, type StoredObjectRecord } from '../../../src/utils/serverObjectStorageHelpers';
import { deleteStoredObjectWithRetry } from '../../../src/utils/serverObjectStorageCleanup';
import { isValidFirestoreDocId } from '../../../src/utils/security';
import {
  AccountLifecycleActorContext,
  AuthIdentityDeletionAdapter,
  BatchDispositionResult,
  MediaDeletionCoordinationAdapter,
  OwnedDomainRecordItem,
  PaginatedSourcePage,
  RecordDispositionReceipt,
  UserOwnedDomainRepositoryAdapter,
  UserOwnedDomainSource,
} from './types.ts';
import {
  ConfigurableAuthIdentityDeletionAdapter,
  InMemoryOrBackedDomainRepositoryAdapter,
} from './moduleAdapters.ts';
import { FirestoreAndJournalAccountLifecycleStore } from './durableJobStore.ts';
import { AccountDeletionOrchestrator } from './deletionOrchestrator.ts';
import { AccountDataExportService } from './exportService.ts';
import type { AccountLifecycleFacade } from './index.ts';
import type { AccountDeletionBatchReceiptRecorder } from './batchReceiptRecorder.ts';
import { InMemoryAccountDeletionBatchReceiptRecorder } from './batchReceiptRecorder.ts';
import { runLegacyFirestoreDeletionSupplement } from './legacyFirestoreDeletionSteps.ts';

export interface ExpressServerDeletionBridgeInput {
  uid: string;
  rawAuthHeaderOrToken?: string | string[];
  ownedBargainIdsHint?: string[];
  serverPublishedBargains: Map<string, { ownerUid: string }>;
  serverSideBuyerLeads: Array<{ submittedByUid?: string; id?: string; hoodId?: number }>;
  serverDataCorrections: Array<{ id: string; reporterUid: string | null }>;
  saveDiskPersistedCache: () => void;
  objectStoreIndex: StoredObjectRecord[];
  persistObjectStoreIndexNow: () => Promise<void>;
  journalPath?: string;
  customAuthDelete?: (targetUid: string, jobId: string) => Promise<void>;
  batchReceiptRecorder?: AccountDeletionBatchReceiptRecorder;
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
}

function paginateIds(ids: string[], cursor: string | null, pageSize: number): PaginatedSourcePage<{ recordId: string }> {
  const sorted = [...ids].sort();
  let start = 0;
  if (cursor) {
    const idx = sorted.findIndex((id) => id > cursor);
    start = idx === -1 ? sorted.length : idx;
  }
  const slice = sorted.slice(start, start + pageSize);
  const hasMore = start + pageSize < sorted.length;
  return {
    items: slice.map((recordId) => ({ recordId })),
    nextCursor: hasMore && slice.length > 0 ? slice[slice.length - 1].recordId : null,
    hasMore,
  };
}

class ExpressLiveMapDomainAdapter implements UserOwnedDomainRepositoryAdapter {
  public readonly source: UserOwnedDomainSource;

  constructor(
    source: UserOwnedDomainSource,
    private readonly listIds: (targetUid: string) => string[],
    private readonly purgeId: (targetUid: string, recordId: string) => void,
  ) {
    this.source = source;
  }

  async fetchOwnedRecordsPage(params: {
    targetUid: string;
    cursor: string | null;
    pageSize: number;
  }): Promise<PaginatedSourcePage<OwnedDomainRecordItem>> {
    const ids = this.listIds(params.targetUid);
    const page = paginateIds(ids, params.cursor, params.pageSize);
    const nowIso = new Date().toISOString();
    return {
      items: page.items.map((row) => ({
        recordId: row.recordId,
        ownerUid: params.targetUid,
        source: this.source,
        createdAtIso: nowIso,
        retentionClass: 'STANDARD_PURGEABLE',
        payload: { recordId: row.recordId },
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async disposeOwnedRecordsBatch(params: {
    targetUid: string;
    cursor: string | null;
    batchSize: number;
  }): Promise<BatchDispositionResult> {
    const ids = this.listIds(params.targetUid);
    const page = paginateIds(ids, params.cursor, params.batchSize);
    const nowIso = new Date().toISOString();
    const receipts: RecordDispositionReceipt[] = [];
    for (const row of page.items) {
      this.purgeId(params.targetUid, row.recordId);
      receipts.push({
        recordId: row.recordId,
        source: this.source,
        outcome: 'PERMANENTLY_DELETED',
        processedAtIso: nowIso,
      });
    }
    const remaining = this.listIds(params.targetUid).length > 0;
    return {
      receipts,
      nextCursor: page.nextCursor,
      hasMore: remaining,
    };
  }
}

function createExpressMediaAdapter(input: ExpressServerDeletionBridgeInput): MediaDeletionCoordinationAdapter {
  return {
    async listOwnedMediaPage({ targetUid, cursor, pageSize }) {
      const active = input.objectStoreIndex
        .filter((o) => o.ownerUid === targetUid && String(o.deletionState) !== 'deleted')
        .sort((a, b) => a.id.localeCompare(b.id));
      let start = 0;
      if (cursor) {
        const idx = active.findIndex((r) => r.id > cursor);
        start = idx === -1 ? active.length : idx;
      }
      const slice = active.slice(start, start + pageSize);
      const hasMore = start + pageSize < active.length;
      return {
        mediaItems: slice.map((r) => ({
          objectId: r.id,
          ownerUid: r.ownerUid,
          lifecycleState: String(r.deletionState),
          originalFileName: r.id,
          mimeType: r.mimeType,
          byteSize: r.sizeBytes ?? 0,
          createdAtIso: r.createdAtIso ?? new Date().toISOString(),
        })),
        nextCursor: hasMore && slice.length > 0 ? slice[slice.length - 1].id : null,
        hasMore,
      };
    },
    async deleteOwnedMediaObject({ targetUid, objectId }) {
      await ensureBucketLoaded();
      const cfg = resolveObjectStorageRuntimeConfig();
      const record = input.objectStoreIndex.find((o) => o.id === objectId && o.ownerUid === targetUid);
      if (!record) {
        return { objectId, status: 'ALREADY_DELETED' as const };
      }
      const policy = record.bargainId
        ? ({ kind: 'bargain' as const, bargainId: record.bargainId })
        : ({ kind: 'unattached_only' as const });
      const root = path.resolve(process.cwd(), '.object-storage');
      const cleanupRes = await deleteStoredObjectWithRetry(objectId, policy, {
        records: input.objectStoreIndex,
        persistIndex: input.persistObjectStoreIndexNow,
        deleteRemote: async (rec) => deleteFromRemoteS3Compatible(rec.objectKey, cfg),
        deleteLocal: async (rec) => {
          const localPath = path.resolve(root, rec.localFileName);
          const fs = await import('node:fs/promises');
          try {
            await fs.unlink(localPath);
          } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
          }
        },
      });
      if (cleanupRes.status === 'deleted') {
        input.saveDiskPersistedCache();
        return { objectId, status: 'DELETED' as const };
      }
      return { objectId, status: 'PENDING_RETRY' as const, failureReason: cleanupRes.reason };
    },
  };
}

export function createExpressAccountLifecycleFacade(
  input: ExpressServerDeletionBridgeInput,
): AccountLifecycleFacade {
  const bargainAdapter = new ExpressLiveMapDomainAdapter(
    'BARGAIN_LISTINGS',
    (uid) =>
      Array.from(input.serverPublishedBargains.entries())
        .filter(([, rec]) => rec.ownerUid === uid)
        .map(([id]) => id),
    (_uid, recordId) => {
      input.serverPublishedBargains.delete(recordId);
      input.saveDiskPersistedCache();
    },
  );

  const alertsAdapter = new ExpressLiveMapDomainAdapter(
    'BUYER_ALERTS',
    (uid) =>
      input.serverSideBuyerLeads
        .map((l, index) => ({ l, index }))
        .filter(({ l }) => l.submittedByUid === uid)
        .map(({ index }) => `lead_${index}`),
    (uid, recordId) => {
      const index = Number(recordId.replace('lead_', ''));
      if (!Number.isFinite(index)) return;
      const lead = input.serverSideBuyerLeads[index];
      if (lead?.submittedByUid === uid) {
        input.serverSideBuyerLeads.splice(index, 1);
        input.saveDiskPersistedCache();
      }
    },
  );

  const correctionsAdapter = new ExpressLiveMapDomainAdapter(
    'CROWD_CLAIMS',
    (uid) =>
      input.serverDataCorrections
        .filter((c) => c.reporterUid === uid)
        .map((c) => c.id),
    (uid, recordId) => {
      const idx = input.serverDataCorrections.findIndex((c) => c.id === recordId && c.reporterUid === uid);
      if (idx >= 0) {
        input.serverDataCorrections.splice(idx, 1);
        input.saveDiskPersistedCache();
      }
    },
  );

  const emptyDomain = (source: UserOwnedDomainSource) =>
    new InMemoryOrBackedDomainRepositoryAdapter(source, []);

  const journalPath =
    input.journalPath ?? path.resolve(process.cwd(), '.cache', 'account-lifecycle-express-journal.v1.json');

  const domainAdapters = [
    bargainAdapter,
    alertsAdapter,
    correctionsAdapter,
    emptyDomain('SPONSOR_RECORDS'),
    emptyDomain('FAVORITES_AND_WORKSPACES'),
    emptyDomain('USER_PROFILE'),
    emptyDomain('MEDIA_METADATA'),
  ];
  const store = new FirestoreAndJournalAccountLifecycleStore({
    durableJournalPath: journalPath,
    enableFirestoreSync: false,
  });

  const authAdapter: AuthIdentityDeletionAdapter =
    input.customAuthDelete != null
      ? new ConfigurableAuthIdentityDeletionAdapter(input.customAuthDelete)
      : new ConfigurableAuthIdentityDeletionAdapter(async (targetUid, jobId) => {
          const activeJob = await store.getJobById(jobId);
          if (activeJob?.legacyFirestoreSupplement?.result?.authDeletedOnServer) {
            void targetUid;
            return;
          }
          throw new Error('AUTH_DELETE_REQUIRES_ADMIN_OR_CLIENT');
        });
  const exportService = new AccountDataExportService(domainAdapters);
  const deletionOrchestrator = new AccountDeletionOrchestrator({
    store,
    domainAdapters,
    mediaAdapter: createExpressMediaAdapter(input),
    authAdapter,
    batchReceiptRecorder: input.batchReceiptRecorder ?? new InMemoryAccountDeletionBatchReceiptRecorder(),
    legacyFirestoreSupplement: async ({ job }) =>
      runLegacyFirestoreDeletionSupplement({
        uid: job.targetUid,
        rawAuthHeaderOrToken: input.rawAuthHeaderOrToken,
        ownedBargainIdsHint: input.ownedBargainIdsHint,
        env: input.env,
        fetchFn: input.fetchFn,
      }),
  });
  return { store, exportService, deletionOrchestrator, authAdapter };
}

export function buildDeletionActorFromExpress(uid: string): AccountLifecycleActorContext {
  return {
    uid,
    isAdmin: false,
    freshAuthVerified: true,
    primaryBootstrapAdminEmail: process.env.ADMIN_EMAIL || process.env.DEFAULT_BOOTSTRAP_ADMIN_EMAIL,
  };
}

export function collectOwnedBargainIds(
  uid: string,
  map: Map<string, { ownerUid: string }>,
  hints?: string[],
): string[] {
  const ids = new Set<string>();
  for (const [id, rec] of map.entries()) {
    if (rec.ownerUid === uid) ids.add(id);
  }
  for (const hint of hints ?? []) {
    if (typeof hint === 'string' && isValidFirestoreDocId(hint.trim())) ids.add(hint.trim());
  }
  return Array.from(ids);
}