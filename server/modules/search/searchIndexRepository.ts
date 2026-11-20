import type { SearchDocument, SearchScope } from '../../../src/features/search/models/search.types';
import { AtomicJsonRepository } from '../shared/atomicJsonRepository';

export type DurableSearchIndexJobStatus =
  | 'PENDING'
  | 'CLAIMED'
  | 'EXTRACTING'
  | 'PROJECTING'
  | 'INDEXING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'RETRYABLE_FAILURE'
  | 'FAILED'
  | 'CANCELLED'
  | 'PARTIAL';

export interface DurableSearchIndexJob {
  jobId: string;
  jobType: 'FULL_REINDEX' | 'SCOPE_REINDEX';
  scope: SearchScope;
  status: DurableSearchIndexJobStatus;
  leaseOwnerId?: string;
  leaseExpiresAtIso?: string;
  sourceWatermarks?: Record<string, string>;
  processedCount: number;
  failedCount: number;
  indexVersion: string;
  startedAtIso: string;
  completedAtIso?: string;
  errorCode?: string;
  correlationId?: string;
  idempotencyKey?: string;
}

export interface SearchIndexVersionRecord {
  versionId: string;
  status: 'BUILD' | 'ACTIVE' | 'RETAINED' | 'DISCARDED';
  documentCount: number;
  createdAtIso: string;
  activatedAtIso?: string;
}

export interface PersistedSearchIndexState {
  activeIndexVersion: string;
  documentsByVersion: Record<string, SearchDocument[]>;
  versions: SearchIndexVersionRecord[];
  jobs: DurableSearchIndexJob[];
  idempotencyIndex: Record<string, string>;
}

const indexRepo = new AtomicJsonRepository<PersistedSearchIndexState>('search-index-state.json');

function defaultState(): PersistedSearchIndexState {
  const initialVersion = 'v1';
  return {
    activeIndexVersion: initialVersion,
    documentsByVersion: { [initialVersion]: [] },
    versions: [{ versionId: initialVersion, status: 'ACTIVE', documentCount: 0, createdAtIso: new Date().toISOString(), activatedAtIso: new Date().toISOString() }],
    jobs: [],
    idempotencyIndex: {},
  };
}

export function loadSearchIndexState(): PersistedSearchIndexState {
  return indexRepo.load(defaultState);
}

export function saveSearchIndexState(next: PersistedSearchIndexState): void {
  indexRepo.writeImmediate(next);
}

export function getActiveIndexDocuments(state = loadSearchIndexState()): SearchDocument[] {
  return state.documentsByVersion[state.activeIndexVersion] ?? [];
}

export function findJobById(jobId: string, state = loadSearchIndexState()): DurableSearchIndexJob | undefined {
  return state.jobs.find((j) => j.jobId === jobId);
}

export function getJobSnapshot(jobId: string): DurableSearchIndexJob | null {
  return findJobById(jobId) ?? null;
}

export function findJobByIdempotencyKey(key: string, state = loadSearchIndexState()): DurableSearchIndexJob | undefined {
  const jobId = state.idempotencyIndex[key];
  if (!jobId) return undefined;
  return findJobById(jobId, state);
}

export function enqueueReindexJob(params: {
  scope: SearchScope;
  idempotencyKey: string;
  correlationId?: string;
}): DurableSearchIndexJob {
  const state = loadSearchIndexState();
  const existing = findJobByIdempotencyKey(params.idempotencyKey, state);
  if (existing) return existing;

  const buildVersion = `build-${Date.now()}`;
  const job: DurableSearchIndexJob = {
    jobId: `idx-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    jobType: params.scope === 'ALL' ? 'FULL_REINDEX' : 'SCOPE_REINDEX',
    scope: params.scope,
    status: 'PENDING',
    processedCount: 0,
    failedCount: 0,
    indexVersion: buildVersion,
    startedAtIso: new Date().toISOString(),
    correlationId: params.correlationId,
    idempotencyKey: params.idempotencyKey,
  };

  state.jobs.unshift(job);
  state.idempotencyIndex[params.idempotencyKey] = job.jobId;
  state.versions.push({
    versionId: buildVersion,
    status: 'BUILD',
    documentCount: 0,
    createdAtIso: new Date().toISOString(),
  });
  state.documentsByVersion[buildVersion] = [];
  saveSearchIndexState(state);
  return job;
}

export function updateSearchIndexJob(
  jobId: string,
  patch: Partial<DurableSearchIndexJob>,
): DurableSearchIndexJob | null {
  const state = loadSearchIndexState();
  const idx = state.jobs.findIndex((j) => j.jobId === jobId);
  if (idx < 0) return null;
  state.jobs[idx] = { ...state.jobs[idx], ...patch };
  saveSearchIndexState(state);
  return state.jobs[idx];
}

export function commitIndexVersion(job: DurableSearchIndexJob, documents: SearchDocument[]): boolean {
  const state = loadSearchIndexState();
  const versionId = job.indexVersion;
  state.documentsByVersion[versionId] = documents;

  for (const v of state.versions) {
    if (v.versionId === state.activeIndexVersion) {
      v.status = 'RETAINED';
    }
  }
  const buildRec = state.versions.find((v) => v.versionId === versionId);
  if (buildRec) {
    buildRec.status = 'ACTIVE';
    buildRec.documentCount = documents.length;
    buildRec.activatedAtIso = new Date().toISOString();
  }
  state.activeIndexVersion = versionId;
  saveSearchIndexState(state);
  return true;
}

export function listRecentJobs(limit = 10): DurableSearchIndexJob[] {
  return loadSearchIndexState().jobs.slice(0, limit);
}

export function resetSearchIndexRepositoryForTests(): void {
  indexRepo.resetInMemoryCacheForTests();
}