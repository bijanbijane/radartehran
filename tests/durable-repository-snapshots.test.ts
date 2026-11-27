/**
 * RT-INFRA-008 — durable repository snapshot store & cold-start behavior.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AtomicJsonRepository, setRepositoryBaseDirForTests } from '../server/modules/shared/atomicJsonRepository';
import {
  setRepositorySnapshotBackendForTests,
  type RepositorySnapshotBackendPort,
} from '../server/modules/shared/durableRepositorySnapshotStore';
import {
  ensureSearchIndexRepositoryHydrated,
  getActiveIndexDocuments,
  resetSearchIndexRepositoryForTests,
  saveSearchIndexStateAwait,
} from '../server/modules/search/searchIndexRepository';
import { runRepositorySnapshotMigrationDryRun } from '../server/modules/shared/repositorySnapshotMigration';

function memoryBackend(): RepositorySnapshotBackendPort {
  const store = new Map<string, { body: string; revision: number }>();
  return {
    async verify() {
      return { ok: true as const };
    },
    async load(fileName) {
      return store.get(fileName)?.body ?? null;
    },
    async persist(fileName, jsonUtf8) {
      const revision = (store.get(fileName)?.revision ?? 0) + 1;
      store.set(fileName, { body: jsonUtf8, revision });
    },
  };
}

async function runTests(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(process.cwd(), '.tmp-repo-test-'));
  const prev = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.PREVENT_PROD_FIREBASE_IN_TEST;
    setRepositoryBaseDirForTests(tmp);
    setRepositorySnapshotBackendForTests(memoryBackend());

    // A failed remote snapshot write must be observable but must not poison later retries.
    let failFirstPersist = true;
    let persistedRetrySnapshot: string | null = null;
    setRepositorySnapshotBackendForTests({
      async verify() { return { ok: true as const }; },
      async load() { return persistedRetrySnapshot; },
      async persist(_fileName, jsonUtf8) {
        if (failFirstPersist) {
          failFirstPersist = false;
          throw new Error('transient snapshot failure');
        }
        persistedRetrySnapshot = jsonUtf8;
      },
    });
    const retryRepo = new AtomicJsonRepository<{ revision: number }>('retry-test.json');
    retryRepo.writeImmediate({ revision: 1 });
    await assert.rejects(retryRepo.awaitPendingPersistence(), /transient snapshot failure/);
    retryRepo.writeImmediate({ revision: 2 });
    await retryRepo.awaitPendingPersistence();
    assert.deepEqual(JSON.parse(persistedRetrySnapshot ?? 'null'), { revision: 2 });

    setRepositorySnapshotBackendForTests(memoryBackend());
    resetSearchIndexRepositoryForTests();
    const hydrated = await ensureSearchIndexRepositoryHydrated();
    assert.equal(hydrated.activeIndexVersion, 'v1');

    const state = hydrated;
    state.documentsByVersion[state.activeIndexVersion] = [
      {
        id: 'search-doc-1',
        sourceId: 'fixture',
        sourceVersion: 1,
        indexSchemaVersion: 'v1',
        entityType: 'NEIGHBORHOOD',
        scope: 'NEIGHBORHOODS',
        cityId: 'tehran',
        titleFa: 'تست',
        subtitleFa: 'تست',
        summaryFa: 'تست',
        urlPath: '/tehran/test',
        locationPrecision: 'NEIGHBORHOOD_BOUNDARY',
        visibility: 'PUBLIC',
        verified: true,
        qualityScore: 1,
        popularityScore: 1,
        freshnessTimestamp: new Date().toISOString(),
        tags: ['تست'],
      },
    ];
    await saveSearchIndexStateAwait(state);

    resetSearchIndexRepositoryForTests();
    await ensureSearchIndexRepositoryHydrated();
    assert.equal(getActiveIndexDocuments().length, 1, 'container restart restores search index from remote snapshot');

    const localPath = path.join(tmp, 'search-index-state.json');
    fs.writeFileSync(localPath, JSON.stringify(state, null, 2), 'utf-8');
    const report = await runRepositorySnapshotMigrationDryRun({ dryRun: true });
    assert.ok(report.rows.some((r) => r.fileName === 'search-index-state.json'));

  } finally {
    process.env = prev;
    setRepositorySnapshotBackendForTests(null);
    setRepositoryBaseDirForTests(null);
    resetSearchIndexRepositoryForTests();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('[PASS] durable-repository-snapshots.test.ts');
}

runTests().catch((error) => {
  console.error('[FAIL] durable-repository-snapshots.test.ts', error);
  process.exit(1);
});