import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { SearchWorkspaceFileRepository, resetSearchWorkspaceRepositoryForTests } from '../server/modules/search/searchWorkspaceRepository';
import { setRepositoryBaseDirForTests } from '../server/modules/shared/atomicJsonRepository';
import { getCanonicalSearchEngine } from '../server/modules/search/searchCompositionRoot';

function testWorkspacePersistsAcrossInstances() {
  const tmp = path.join(os.tmpdir(), `rt-ws-${Date.now()}`);
  setRepositoryBaseDirForTests(tmp);
  resetSearchWorkspaceRepositoryForTests();
  process.env.ALLOW_DEMO_SEARCH_DATA = 'true';
  getCanonicalSearchEngine();
  const repoA = new SearchWorkspaceFileRepository();
  repoA.recordSearchHistory({
    userId: 'uid-1',
    rawQuery: 'آپارتمان',
    scope: 'PROPERTIES',
    resultCount: 3,
  });
  const repoB = new SearchWorkspaceFileRepository();
  assert.equal(repoB.listSearchHistory('uid-1').length, 1);
  setRepositoryBaseDirForTests(null);
  delete process.env.ALLOW_DEMO_SEARCH_DATA;
}

testWorkspacePersistsAcrossInstances();
console.log('search-workspace-persistence: ok');