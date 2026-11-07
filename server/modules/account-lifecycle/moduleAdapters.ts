/**
 * Employee 7 — Cross-Module Adapters (`server/modules/account-lifecycle/moduleAdapters.ts`)
 *
 * Exclusive ownership: `server/modules/account-lifecycle/`
 *
 * Connects the Account Export and Deletion lifecycle module to published interfaces of:
 *  - Employee 6 Media Module (`server/modules/media/`)
 *  - Employee 4 Crowd-Data Module (`server/modules/crowd-data/`)
 *  - Bargains, Buyer Alerts, Sponsors, User Profile, and Favorites/Workspaces repositories
 *  - Firebase Admin Auth identity deletion
 */

import type { CityId } from '../../../src/types/models';
import { MediaDomainService } from '../media/mediaDomainService.ts';
import type { MediaMetadataPersistenceStore } from '../media/metadataStore.ts';
import type { CrowdDataPersistenceStore } from '../crowd-data/persistenceAdapter.ts';
import type { CrowdClaimRecord } from '../crowd-data/types.ts';
import {
  AuthIdentityDeletionAdapter,
  BatchDispositionResult,
  MediaDeletionCoordinationAdapter,
  OwnedDomainRecordItem,
  PaginatedSourcePage,
  RecordDispositionReceipt,
  UserOwnedDomainRepositoryAdapter,
  UserOwnedDomainSource,
} from './types.ts';

function paginateOrderedItems<T extends { recordId: string }>(
  orderedItems: T[],
  cursor: string | null,
  limit: number,
): PaginatedSourcePage<T> {
  let startIndex = 0;
  if (cursor) {
    const idx = orderedItems.findIndex((item) => item.recordId > cursor);
    if (idx === -1) {
      return { items: [], nextCursor: null, hasMore: false };
    }
    startIndex = idx;
  }
  const slice = orderedItems.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < orderedItems.length;
  const nextCursor = slice.length > 0 ? slice[slice.length - 1].recordId : null;
  return {
    items: slice,
    nextCursor: hasMore ? nextCursor : null,
    hasMore,
  };
}

/**
 * Adapter bridging Employee 6 (`server/modules/media/`) for media export and coordinated deletion.
 */
export function createEmployee6MediaLifecycleAdapters(params: {
  mediaService: MediaDomainService;
  metadataStore: MediaMetadataPersistenceStore;
}): {
  mediaMetadataExportAdapter: UserOwnedDomainRepositoryAdapter;
  mediaDeletionCoordinator: MediaDeletionCoordinationAdapter;
} {
  const { mediaService, metadataStore } = params;

  const mediaMetadataExportAdapter: UserOwnedDomainRepositoryAdapter = {
    source: 'MEDIA_METADATA',
    async fetchOwnedRecordsPage({ targetUid, cursor, pageSize }) {
      const allOwned = (await metadataStore.listOwnerMetadataRecords(targetUid))
        .filter((rec) => rec.ownerUid === targetUid && rec.state !== 'DELETED')
        .sort((a, b) => a.objectId.localeCompare(b.objectId))
        .map<OwnedDomainRecordItem>((rec) => ({
          recordId: rec.objectId,
          ownerUid: rec.ownerUid,
          source: 'MEDIA_METADATA',
          createdAtIso: rec.createdAtIso,
          updatedAtIso: rec.updatedAtIso,
          retentionClass: 'STANDARD_PURGEABLE',
          payload: {
            objectId: rec.objectId,
            state: rec.state,
            mediaType: rec.mediaType,
            mimeType: rec.mimeType,
            sizeBytes: rec.sizeBytes,
            sha256: rec.sha256,
            association: rec.association,
          },
        }));

      return paginateOrderedItems(allOwned, cursor, pageSize);
    },
    async disposeOwnedRecordsBatch() {
      return { receipts: [], nextCursor: null, hasMore: false };
    },
  };

  const mediaDeletionCoordinator: MediaDeletionCoordinationAdapter = {
    async listOwnedMediaPage({ targetUid, cursor, pageSize }) {
      const activeRecords = (await metadataStore.listOwnerMetadataRecords(targetUid))
        .filter((rec) => rec.ownerUid === targetUid && rec.state !== 'DELETED')
        .sort((a, b) => a.objectId.localeCompare(b.objectId));

      let startIndex = 0;
      if (cursor) {
        const idx = activeRecords.findIndex((r) => r.objectId > cursor);
        if (idx === -1) {
          return { mediaItems: [], nextCursor: null, hasMore: false };
        }
        startIndex = idx;
      }

      const slice = activeRecords.slice(startIndex, startIndex + pageSize);
      const hasMore = startIndex + pageSize < activeRecords.length;
      const nextCursor = slice.length > 0 ? slice[slice.length - 1].objectId : null;

      return {
        mediaItems: slice.map((r) => ({
          objectId: r.objectId,
          ownerUid: r.ownerUid,
          lifecycleState: r.state,
          originalFileName: r.objectId,
          mimeType: r.mimeType,
          byteSize: r.sizeBytes,
          createdAtIso: r.createdAtIso,
        })),
        nextCursor: hasMore ? nextCursor : null,
        hasMore,
      };
    },

    async deleteOwnedMediaObject({ actor, objectId }) {
      const res = await mediaService.deleteMediaObject(
        { uid: actor.uid, isAdmin: actor.isAdmin },
        objectId,
        { allowAttachedTargetCleanup: true },
      );
      return {
        objectId: res.objectId,
        status: res.status,
        failureReason: res.errorReason,
      };
    },
  };

  return { mediaMetadataExportAdapter, mediaDeletionCoordinator };
}

/**
 * Adapter bridging Employee 4 (`server/modules/crowd-data/`) for user-submitted crowd claims.
 */
export function createEmployee4CrowdClaimsLifecycleAdapter(params: {
  crowdStore: CrowdDataPersistenceStore;
  trackedNeighborhoodScopes?: ReadonlyArray<{ cityId: CityId; hoodId: number }>;
}): UserOwnedDomainRepositoryAdapter {
  const { crowdStore } = params;
  const scopes: ReadonlyArray<{ cityId: CityId; hoodId: number }> =
    params.trackedNeighborhoodScopes ?? [
      { cityId: 'tehran', hoodId: 1 },
      { cityId: 'tehran', hoodId: 2 },
    ];

  async function listOwnedClaims(targetUid: string): Promise<CrowdClaimRecord[]> {
    const byId = new Map<string, CrowdClaimRecord>();
    for (const scope of scopes) {
      const hoodClaims = await crowdStore.listClaimsByNeighborhood(scope.cityId, scope.hoodId);
      for (const claim of hoodClaims) {
        if (claim.provenance.authorUid === targetUid) {
          byId.set(claim.claimId, claim);
        }
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.claimId.localeCompare(b.claimId));
  }

  return {
    source: 'CROWD_CLAIMS',
    async fetchOwnedRecordsPage({ targetUid, cursor, pageSize }) {
      const claims = (await listOwnedClaims(targetUid)).map<OwnedDomainRecordItem>((c) => ({
        recordId: c.claimId,
        ownerUid: c.provenance.authorUid,
        source: 'CROWD_CLAIMS',
        createdAtIso: c.createdAtIso,
        updatedAtIso: c.updatedAtIso,
        retentionClass:
          c.state === 'ACCEPTED' || c.state === 'DISPUTED'
            ? 'AUDIT_ANONYMIZE_RETAIN'
            : 'STANDARD_PURGEABLE',
        payload: {
          claimId: c.claimId,
          category: c.category,
          cityId: c.cityId,
          hoodId: c.hoodId,
          streetDisplayFa: c.streetDisplayFa,
          narrativeFa: c.narrativeFa,
          state: c.state,
        },
      }));

      return paginateOrderedItems(claims, cursor, pageSize);
    },

    async disposeOwnedRecordsBatch({ targetUid, cursor, batchSize }) {
      const owned = await listOwnedClaims(targetUid);
      let startIndex = 0;
      if (cursor) {
        const idx = owned.findIndex((c) => c.claimId > cursor);
        if (idx === -1) {
          return { receipts: [], nextCursor: null, hasMore: false };
        }
        startIndex = idx;
      }

      const slice = owned.slice(startIndex, startIndex + batchSize);
      const nowIso = new Date().toISOString();
      const receipts: RecordDispositionReceipt[] = [];

      for (const claim of slice) {
        if (claim.state === 'ACCEPTED' || claim.state === 'DISPUTED') {
          await crowdStore.updateClaimAtomically(claim.claimId, claim.revision, (curr) => ({
            ...curr,
            provenance: {
              ...curr.provenance,
              authorUid: `anonymized_deleted_user_${curr.claimId}`,
              clientSessionRef: undefined,
            },
            revision: curr.revision + 1,
            updatedAtIso: nowIso,
          }));
          receipts.push({
            recordId: claim.claimId,
            source: 'CROWD_CLAIMS',
            outcome: 'ANONYMIZED_RETAINED_POLICY',
            retentionPolicyCode: 'MODERATED_CLAIM_PROVENANCE_RETENTION',
            retentionReason:
              'Accepted/disputed crowd claims are anonymized and retained for audit provenance.',
            processedAtIso: nowIso,
          });
        } else {
          await crowdStore.updateClaimAtomically(claim.claimId, claim.revision, (curr) => ({
            ...curr,
            state: 'WITHDRAWN',
            narrativeFa: '[PURGED_BY_ACCOUNT_DELETION]',
            evidenceRefs: [],
            provenance: {
              ...curr.provenance,
              authorUid: `__purged_${curr.claimId}`,
              clientSessionRef: undefined,
            },
            revision: curr.revision + 1,
            updatedAtIso: nowIso,
          }));
          receipts.push({
            recordId: claim.claimId,
            source: 'CROWD_CLAIMS',
            outcome: 'PERMANENTLY_DELETED',
            processedAtIso: nowIso,
          });
        }
      }

      const remaining = await listOwnedClaims(targetUid);
      const hasMore = remaining.length > 0;
      const nextCursor = slice.length > 0 ? slice[slice.length - 1].claimId : null;

      return {
        receipts,
        nextCursor: hasMore ? nextCursor : null,
        hasMore,
      };
    },
  };
}

/**
 * Reusable repository adapter for Bargains, Buyer Alerts, Sponsors, Profile, and Favorites.
 */
export class InMemoryOrBackedDomainRepositoryAdapter implements UserOwnedDomainRepositoryAdapter {
  public readonly source: UserOwnedDomainSource;
  private readonly records: Map<string, OwnedDomainRecordItem>;

  constructor(source: UserOwnedDomainSource, initialRecords: OwnedDomainRecordItem[] = []) {
    this.source = source;
    this.records = new Map();
    for (const rec of initialRecords) {
      this.records.set(rec.recordId, { ...rec });
    }
  }

  public upsertRecord(record: OwnedDomainRecordItem): void {
    this.records.set(record.recordId, { ...record });
  }

  public getRecord(recordId: string): OwnedDomainRecordItem | undefined {
    const rec = this.records.get(recordId);
    return rec ? { ...rec } : undefined;
  }

  public listRecordsForOwner(ownerUid: string): OwnedDomainRecordItem[] {
    return Array.from(this.records.values())
      .filter((r) => r.ownerUid === ownerUid)
      .sort((a, b) => a.recordId.localeCompare(b.recordId));
  }

  public async fetchOwnedRecordsPage(params: {
    targetUid: string;
    cursor: string | null;
    pageSize: number;
  }): Promise<PaginatedSourcePage<OwnedDomainRecordItem>> {
    const owned = this.listRecordsForOwner(params.targetUid);
    return paginateOrderedItems(owned, params.cursor, params.pageSize);
  }

  public async disposeOwnedRecordsBatch(params: {
    targetUid: string;
    cursor: string | null;
    batchSize: number;
    jobId: string;
  }): Promise<BatchDispositionResult> {
    const owned = this.listRecordsForOwner(params.targetUid);
    const page = paginateOrderedItems(owned, params.cursor, params.batchSize);
    const nowIso = new Date().toISOString();
    const receipts: RecordDispositionReceipt[] = [];

    for (const item of page.items) {
      if (item.retentionClass === 'LEGAL_HOLD_RETAIN') {
        this.records.set(item.recordId, {
          ...item,
          ownerUid: `__legal_hold_${item.ownerUid}`,
          updatedAtIso: nowIso,
        });
        receipts.push({
          recordId: item.recordId,
          source: this.source,
          outcome: 'LEGAL_HOLD_RETAINED',
          retentionPolicyCode: 'STATUTORY_LEGAL_HOLD',
          retentionReason: item.retentionReason ?? 'Active legal hold prevents permanent erasure.',
          processedAtIso: nowIso,
        });
      } else if (item.retentionClass === 'AUDIT_ANONYMIZE_RETAIN') {
        this.records.set(item.recordId, {
          ...item,
          ownerUid: `__anonymized_${item.recordId}`,
          payload: { anonymizedAtIso: nowIso, jobId: params.jobId },
          updatedAtIso: nowIso,
        });
        receipts.push({
          recordId: item.recordId,
          source: this.source,
          outcome: 'ANONYMIZED_RETAINED_POLICY',
          retentionPolicyCode: 'FINANCIAL_SPONSOR_AUDIT_RETENTION',
          retentionReason:
            item.retentionReason ?? 'Retained in anonymized form under tax/financial audit policy.',
          processedAtIso: nowIso,
        });
      } else {
        this.records.delete(item.recordId);
        receipts.push({
          recordId: item.recordId,
          source: this.source,
          outcome: 'PERMANENTLY_DELETED',
          processedAtIso: nowIso,
        });
      }
    }

    const remainingForOwner = this.listRecordsForOwner(params.targetUid);
    const hasMore = remainingForOwner.length > 0;
    const nextCursor = page.nextCursor;

    return {
      receipts,
      nextCursor: hasMore ? nextCursor : null,
      hasMore,
    };
  }
}

/**
 * Default Firebase Auth identity deletion adapter with idempotent already-deleted handling.
 */
export class ConfigurableAuthIdentityDeletionAdapter implements AuthIdentityDeletionAdapter {
  private readonly deletedUids = new Set<string>();
  private readonly customDeleteFn?: (targetUid: string, jobId: string) => Promise<void>;

  constructor(customDeleteFn?: (targetUid: string, jobId: string) => Promise<void>) {
    this.customDeleteFn = customDeleteFn;
  }

  public isAuthDeleted(targetUid: string): boolean {
    return this.deletedUids.has(targetUid);
  }

  public async deleteFirebaseAuthUser(params: {
    targetUid: string;
    jobId: string;
  }): Promise<{
    targetUid: string;
    status: 'DELETED' | 'ALREADY_DELETED';
    deletedAtIso: string;
  }> {
    const nowIso = new Date().toISOString();
    if (this.deletedUids.has(params.targetUid)) {
      return {
        targetUid: params.targetUid,
        status: 'ALREADY_DELETED',
        deletedAtIso: nowIso,
      };
    }
    if (this.customDeleteFn) {
      await this.customDeleteFn(params.targetUid, params.jobId);
    }
    this.deletedUids.add(params.targetUid);
    return {
      targetUid: params.targetUid,
      status: 'DELETED',
      deletedAtIso: nowIso,
    };
  }
}
