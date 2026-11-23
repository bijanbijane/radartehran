import type { SearchDocument } from '../../../src/features/search/models/search.types';
import { SearchIndexAndOrchestratorEngine } from '../../../src/features/search/services/searchOrchestratorEngine';
import { ProductionSearchDocumentSource } from './productionSearchDocumentSource';
import { isDocumentEligibleForPublicIndex } from './publicIndexEligibility';
import {
  commitIndexVersionAwait,
  findJobById,
  loadSearchIndexState,
  updateSearchIndexJob,
  type DurableSearchIndexJob,
} from './searchIndexRepository';

const LEASE_MS = 120_000;
const workerOwnerId = `search-worker-${process.pid}`;

export async function processPendingSearchReindexJobs(engine: SearchIndexAndOrchestratorEngine): Promise<void> {
  const state = loadSearchIndexState();
  const pending = state.jobs.find((j) => j.status === 'PENDING' || j.status === 'RETRYABLE_FAILURE');
  if (!pending) return;

  const now = Date.now();
  const claimed = updateSearchIndexJob(pending.jobId, {
    status: 'CLAIMED',
    leaseOwnerId: workerOwnerId,
    leaseExpiresAtIso: new Date(now + LEASE_MS).toISOString(),
  });
  if (!claimed) return;

  await runReindexPipeline(engine, claimed.jobId);
}

async function runReindexPipeline(engine: SearchIndexAndOrchestratorEngine, jobId: string): Promise<void> {
  const source = new ProductionSearchDocumentSource();
  const progress = (status: DurableSearchIndexJob['status'], extra?: { processedCount?: number; errorCode?: string }) => {
    updateSearchIndexJob(jobId, { status, ...extra });
  };

  try {
    progress('EXTRACTING');
    let docs = await source.loadPublishableDocuments();
    const job = findJobById(jobId);
    if (!job) return;

    if (job.scope !== 'ALL') {
      docs = docs.filter((d) => d.scope === job.scope);
    }

    progress('PROJECTING', { processedCount: docs.length });
    const projected = docs.filter((doc) => isDocumentEligibleForPublicIndex(doc));

    progress('INDEXING', { processedCount: projected.length });
    const committed = await commitIndexVersionAwait(job, projected);
    if (!committed) {
      progress('FAILED', { errorCode: 'INDEX_PERSIST_FAILED', processedCount: projected.length });
      return;
    }
    engine.replaceIndexDocuments(projected);

    progress('VERIFYING', { processedCount: projected.length });
    const activeCount = projected.length;
    if (activeCount !== projected.length) {
      progress('FAILED', { errorCode: 'INDEX_VERIFY_COUNT_MISMATCH', processedCount: activeCount });
      return;
    }

    updateSearchIndexJob(jobId, {
      status: 'COMPLETED',
      processedCount: projected.length,
      failedCount: docs.length - projected.length,
      completedAtIso: new Date().toISOString(),
    });
  } catch {
    updateSearchIndexJob(jobId, {
      status: 'RETRYABLE_FAILURE',
      errorCode: 'REINDEX_PIPELINE_ERROR',
      completedAtIso: new Date().toISOString(),
    });
  }
}

export function getJobSnapshot(jobId: string): DurableSearchIndexJob | null {
  return findJobById(jobId) ?? null;
}