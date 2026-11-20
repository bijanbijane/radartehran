import { SearchIndexAndOrchestratorEngine } from '../../../src/features/search/services/searchOrchestratorEngine';
import { getActiveIndexDocuments } from './searchIndexRepository';
import { processPendingSearchReindexJobs } from './searchReindexWorker';
import { SearchWorkspaceFileRepository } from './searchWorkspaceRepository';
import { loadBootstrapDocumentsSync } from './productionSearchDocumentSource';

let canonicalEngine: SearchIndexAndOrchestratorEngine | null = null;
let workspaceRepo: SearchWorkspaceFileRepository | null = null;
let workerTickStarted = false;

export function getCanonicalSearchEngine(): SearchIndexAndOrchestratorEngine {
  if (canonicalEngine) return canonicalEngine;
  const persisted = getActiveIndexDocuments();
  const bootstrapDocs = persisted.length > 0 ? persisted : loadBootstrapDocumentsSync();
  canonicalEngine = new SearchIndexAndOrchestratorEngine(bootstrapDocs);
  startReindexWorkerLoop();
  return canonicalEngine;
}

export function getSearchWorkspaceRepository(): SearchWorkspaceFileRepository {
  if (!workspaceRepo) workspaceRepo = new SearchWorkspaceFileRepository();
  return workspaceRepo;
}

function startReindexWorkerLoop(): void {
  if (workerTickStarted) return;
  workerTickStarted = true;
  const tick = () => {
    const engine = canonicalEngine;
    if (engine) {
      void processPendingSearchReindexJobs(engine);
    }
  };
  tick();
  const timer = setInterval(tick, 5_000);
  timer.unref?.();
}