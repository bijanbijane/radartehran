/** @file server/modules/search/socialFeedIndexRebuilder.ts — RT-SOCIAL-IMPL-007 Paged Derived Feed Index Rebuild & Resume Worker */
import crypto from 'node:crypto';
import {
  CommunityHttpError,
  MAX_COMMUNITY_QUERY_LIMIT,
  SOCIAL_COLLECTIONS,
  type CommunityDatabaseStore,
} from '../community/communityFirestoreAdapter';
import {
  FEED_SCORE_FORMULA_VERSION,
  PROJECTION_SCHEMA_VERSION,
  buildSocialFeedIndexDocument,
  type SocialFeedIndexDocument,
  type SocialFeedIndexJob,
} from './socialFeedProjection';

export interface RebuildDerivedIndexResult {
  rebuilt: boolean;
  jobId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  indexedDocsCount: number;
  scannedCount: number;
  indexedCount: number;
  skippedCount: number;
  deletedOrHiddenCount: number;
  lastCursorDocId: string | null;
  readsCount: number;
  writesCount: number;
  durationMs: number;
  rebuiltBy: string;
  rebuiltAtIso: string;
}

export async function rebuildSocialFeedIndexOp(
  store: CommunityDatabaseStore,
  adminUid: string,
  options?: {
    batchSize?: number;
    resumeJobId?: string;
    maxPages?: number;
  },
): Promise<RebuildDerivedIndexResult> {
  const startMs = Date.now();
  const batchSize = Math.max(
    1,
    Math.min(MAX_COMMUNITY_QUERY_LIMIT, Math.floor(options?.batchSize ?? MAX_COMMUNITY_QUERY_LIMIT)),
  );
  let readsCount = 0;
  let writesCount = 0;

  let job: SocialFeedIndexJob;
  if (options?.resumeJobId) {
    const existingJob = await store.getDoc<SocialFeedIndexJob>(
      SOCIAL_COLLECTIONS.feedIndexJobs,
      options.resumeJobId,
    );
    readsCount += 1;
    if (!existingJob) {
      throw new CommunityHttpError(404, 'REBUILD_JOB_NOT_FOUND', 'کار بازسازی ایندکس موردنظر یافت نشد.');
    }
    job = { ...existingJob, status: 'RUNNING', updatedAtIso: new Date().toISOString() };
    await store.setDoc(SOCIAL_COLLECTIONS.feedIndexJobs, job.id, job);
    writesCount += 1;
  } else {
    const runningPage = await store.queryDocs<SocialFeedIndexJob>(
      SOCIAL_COLLECTIONS.feedIndexJobs,
      {
        filters: [{ field: 'status', op: '==', value: 'RUNNING' }],
        limit: 5,
      },
    );
    readsCount += 1;
    if (runningPage.items.length > 0) {
      throw new CommunityHttpError(
        409,
        'REBUILD_ALREADY_RUNNING',
        'یک فرایند بازسازی ایندکس فید در حال حاضر در حال اجراست.',
      );
    }

    const nowIso = new Date().toISOString();
    const jobId = `feed_rebuild_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    job = {
      id: jobId,
      status: 'RUNNING',
      startedByUid: adminUid,
      startedAtIso: nowIso,
      updatedAtIso: nowIso,
      batchSize,
      scannedCount: 0,
      indexedCount: 0,
      skippedCount: 0,
      deletedOrHiddenCount: 0,
      lastCursorDocId: null,
      formulaVersion: FEED_SCORE_FORMULA_VERSION,
      projectionVersion: PROJECTION_SCHEMA_VERSION,
    };
    await store.setDoc(SOCIAL_COLLECTIONS.feedIndexJobs, job.id, job);
    writesCount += 1;
  }

  let cursorDocId: string | null = job.lastCursorDocId;
  let pagesProcessed = 0;
  const seenPostIds = new Set<string>();
  const fullScanFromStart = cursorDocId === null;

  do {
    const page = await store.queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, {
      orderBy: [{ field: 'createdAtIso', direction: 'desc' }, { field: 'id', direction: 'asc' }],
      limit: batchSize,
      cursorDocId,
    });
    readsCount += page.items.length || 1;

    const nowIso = new Date().toISOString();
    for (const post of page.items) {
      seenPostIds.add(post.id);
      job.scannedCount += 1;

      const existingIndex = await store.getDoc<SocialFeedIndexDocument>(
        SOCIAL_COLLECTIONS.feedIndex,
        post.id,
      );
      readsCount += 1;

      const postUpdatedIso = String(post.updatedAtIso || post.createdAtIso || '');
      if (
        existingIndex &&
        typeof existingIndex.updatedAtIso === 'string' &&
        postUpdatedIso &&
        existingIndex.updatedAtIso > postUpdatedIso
      ) {
        job.skippedCount += 1;
        continue;
      }

      const projection = buildSocialFeedIndexDocument(post, nowIso);
      await store.setDoc(SOCIAL_COLLECTIONS.feedIndex, projection.id, projection);
      writesCount += 1;

      if (projection.visibility === 'discoverable') {
        job.indexedCount += 1;
      } else {
        job.deletedOrHiddenCount += 1;
      }
    }

    cursorDocId = page.nextCursor;
    job.lastCursorDocId = cursorDocId;
    job.updatedAtIso = new Date().toISOString();
    pagesProcessed += 1;

    if (options?.maxPages && pagesProcessed >= options.maxPages && cursorDocId !== null) {
      await store.setDoc(SOCIAL_COLLECTIONS.feedIndexJobs, job.id, job);
      writesCount += 1;
      return {
        rebuilt: false,
        jobId: job.id,
        status: 'RUNNING',
        indexedDocsCount: job.indexedCount,
        scannedCount: job.scannedCount,
        indexedCount: job.indexedCount,
        skippedCount: job.skippedCount,
        deletedOrHiddenCount: job.deletedOrHiddenCount,
        lastCursorDocId: job.lastCursorDocId,
        readsCount,
        writesCount,
        durationMs: Date.now() - startMs,
        rebuiltBy: adminUid,
        rebuiltAtIso: job.updatedAtIso,
      };
    }
  } while (cursorDocId);

  if (fullScanFromStart) {
    let indexCursor: string | null = null;
    do {
      const indexPage = await store.queryDocs<SocialFeedIndexDocument>(
        SOCIAL_COLLECTIONS.feedIndex,
        {
          orderBy: [{ field: 'id', direction: 'asc' }],
          limit: batchSize,
          cursorDocId: indexCursor,
        },
      );
      readsCount += indexPage.items.length || 1;
      for (const idxDoc of indexPage.items) {
        if (!seenPostIds.has(idxDoc.id) && idxDoc.visibility !== 'hidden') {
          const sourceExists = await store.getDoc<Record<string, unknown>>(
            SOCIAL_COLLECTIONS.posts,
            idxDoc.id,
          );
          readsCount += 1;
          if (!sourceExists) {
            await store.setDoc(
              SOCIAL_COLLECTIONS.feedIndex,
              idxDoc.id,
              {
                ...idxDoc,
                visibility: 'hidden',
                moderationStatus: 'removed',
                updatedAtIso: new Date().toISOString(),
                indexedAtIso: new Date().toISOString(),
              },
              true,
            );
            writesCount += 1;
            job.deletedOrHiddenCount += 1;
          }
        }
      }
      indexCursor = indexPage.nextCursor;
    } while (indexCursor);
  }

  const completedAtIso = new Date().toISOString();
  job.status = 'COMPLETED';
  job.updatedAtIso = completedAtIso;
  job.completedAtIso = completedAtIso;
  job.lastCursorDocId = null;
  await store.setDoc(SOCIAL_COLLECTIONS.feedIndexJobs, job.id, job);
  writesCount += 1;

  return {
    rebuilt: true,
    jobId: job.id,
    status: 'COMPLETED',
    indexedDocsCount: job.indexedCount,
    scannedCount: job.scannedCount,
    indexedCount: job.indexedCount,
    skippedCount: job.skippedCount,
    deletedOrHiddenCount: job.deletedOrHiddenCount,
    lastCursorDocId: null,
    readsCount,
    writesCount,
    durationMs: Date.now() - startMs,
    rebuiltBy: adminUid,
    rebuiltAtIso: completedAtIso,
  };
}
